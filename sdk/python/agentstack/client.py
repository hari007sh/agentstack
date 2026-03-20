"""
AgentStack HTTP Client

Handles communication with the AgentStack API server.
Supports batched event sending, retry logic, and async compatibility.
"""

import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import requests

from agentstack.batch import BatchSender

logger = logging.getLogger("agentstack.client")

# Retry configuration
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 0.5  # seconds
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}

DEFAULT_ENDPOINT = "http://localhost:8080"
DEFAULT_TIMEOUT = 30  # seconds


class AgentStackClient:
    """
    HTTP client for the AgentStack API server.

    Provides methods to send events (spans, sessions, healing events)
    to the API. Uses a BatchSender for high-throughput event ingestion
    and includes retry logic for transient failures.

    Usage:
        client = AgentStackClient(api_key="as_sk_...", endpoint="http://localhost:8080")
        client.send_event({"type": "session_start", ...})
        client.shutdown()
    """

    def __init__(
        self,
        api_key: str,
        endpoint: str = DEFAULT_ENDPOINT,
        batch_size: int = 50,
        flush_interval: float = 5.0,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        """
        Args:
            api_key: AgentStack API key (format: as_sk_...).
            endpoint: Base URL of the AgentStack API server.
            batch_size: Number of events per batch flush.
            flush_interval: Seconds between batch flushes.
            timeout: HTTP request timeout in seconds.
        """
        if not api_key:
            raise ValueError("api_key is required. Get one at https://agentstack.dev")

        self._api_key = api_key
        self._endpoint = endpoint.rstrip("/")
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "agentstack-python/0.1.0",
        })

        self._batch_sender = BatchSender(
            send_fn=self._send_batch,
            batch_size=batch_size,
            flush_interval=flush_interval,
        )
        self._batch_sender.start()
        self._lock = threading.Lock()

    @property
    def endpoint(self) -> str:
        """The base URL of the API server."""
        return self._endpoint

    def send_event(self, event: Dict[str, Any]) -> None:
        """
        Queue an event for batched sending.

        Args:
            event: Event dict to send to the API.
        """
        self._batch_sender.add(event)

    def send_immediate(self, path: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Send a request immediately (not batched).

        Used for operations that need a synchronous response,
        such as session creation or guard checks.

        Args:
            path: API path (e.g., "/v1/ingest/sessions").
            data: Request body as a dict.

        Returns:
            Response JSON dict, or None on failure.
        """
        url = urljoin(self._endpoint + "/", path.lstrip("/"))
        return self._request_with_retry("POST", url, json_data=data)

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """
        Send a GET request.

        Args:
            path: API path.
            params: Query parameters.

        Returns:
            Response JSON dict, or None on failure.
        """
        url = urljoin(self._endpoint + "/", path.lstrip("/"))
        return self._request_with_retry("GET", url, params=params)

    def flush(self) -> None:
        """Force flush all pending events."""
        self._batch_sender.flush()

    def shutdown(self) -> None:
        """Gracefully shut down the client, flushing remaining events."""
        self._batch_sender.shutdown()
        self._session.close()
        logger.debug("AgentStackClient shut down.")

    def _send_batch(self, events: List[Dict[str, Any]]) -> None:
        """
        Send a batch of events to the ingest endpoint.

        Args:
            events: List of event dicts.
        """
        url = f"{self._endpoint}/v1/ingest/batch"
        self._request_with_retry("POST", url, json_data={"events": events})

    def _request_with_retry(
        self,
        method: str,
        url: str,
        json_data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Execute an HTTP request with retry logic.

        Retries on transient failures (429, 5xx) with exponential backoff.

        Args:
            method: HTTP method (GET, POST, etc.).
            url: Full URL.
            json_data: JSON body for POST requests.
            params: Query parameters for GET requests.

        Returns:
            Parsed JSON response, or None on failure.
        """
        last_exception: Optional[Exception] = None

        for attempt in range(MAX_RETRIES):
            try:
                response = self._session.request(
                    method=method,
                    url=url,
                    json=json_data,
                    params=params,
                    timeout=self._timeout,
                )

                if response.status_code < 300:
                    try:
                        return response.json()
                    except (json.JSONDecodeError, ValueError):
                        return None

                if response.status_code in RETRY_STATUS_CODES:
                    wait_time = RETRY_BACKOFF_BASE * (2 ** attempt)
                    # Respect Retry-After header if present
                    retry_after = response.headers.get("Retry-After")
                    if retry_after:
                        try:
                            wait_time = float(retry_after)
                        except ValueError:
                            pass
                    logger.warning(
                        "Request to %s returned %d, retrying in %.1fs (attempt %d/%d)",
                        url, response.status_code, wait_time, attempt + 1, MAX_RETRIES,
                    )
                    time.sleep(wait_time)
                    continue

                # Non-retryable error
                logger.error(
                    "Request to %s failed with status %d: %s",
                    url, response.status_code, response.text[:200],
                )
                return None

            except requests.exceptions.Timeout:
                last_exception = requests.exceptions.Timeout(
                    f"Request to {url} timed out"
                )
                wait_time = RETRY_BACKOFF_BASE * (2 ** attempt)
                logger.warning(
                    "Request to %s timed out, retrying in %.1fs (attempt %d/%d)",
                    url, wait_time, attempt + 1, MAX_RETRIES,
                )
                time.sleep(wait_time)

            except requests.exceptions.ConnectionError as e:
                last_exception = e
                wait_time = RETRY_BACKOFF_BASE * (2 ** attempt)
                logger.warning(
                    "Connection to %s failed, retrying in %.1fs (attempt %d/%d)",
                    url, wait_time, attempt + 1, MAX_RETRIES,
                )
                time.sleep(wait_time)

            except Exception as e:
                logger.exception("Unexpected error during request to %s", url)
                return None

        if last_exception:
            logger.error(
                "Request to %s failed after %d retries: %s",
                url, MAX_RETRIES, last_exception,
            )
        return None
