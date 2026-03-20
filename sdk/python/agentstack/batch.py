"""
AgentStack Batch Event Sender

Collects events in memory and flushes them to the API server
when the batch size or time interval threshold is reached.
Thread-safe with graceful shutdown support.
"""

import threading
import time
import logging
import queue
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("agentstack.batch")

# Defaults
DEFAULT_BATCH_SIZE = 50
DEFAULT_FLUSH_INTERVAL_SECONDS = 5.0
DEFAULT_MAX_QUEUE_SIZE = 10_000


class BatchSender:
    """
    Thread-safe batch event sender.

    Collects events in an internal queue and flushes them to a
    provided send function when either the batch size threshold
    or the time interval is reached.

    Usage:
        def send_fn(events):
            requests.post(url, json={"events": events})

        sender = BatchSender(send_fn=send_fn, batch_size=50, flush_interval=5.0)
        sender.start()
        sender.add({"type": "span", "data": {...}})
        # ... later ...
        sender.shutdown()
    """

    def __init__(
        self,
        send_fn: Callable[[List[Dict[str, Any]]], None],
        batch_size: int = DEFAULT_BATCH_SIZE,
        flush_interval: float = DEFAULT_FLUSH_INTERVAL_SECONDS,
        max_queue_size: int = DEFAULT_MAX_QUEUE_SIZE,
    ):
        """
        Args:
            send_fn: Callable that receives a list of event dicts and sends
                      them to the server. Must handle its own errors.
            batch_size: Number of events that triggers an immediate flush.
            flush_interval: Maximum seconds between flushes.
            max_queue_size: Maximum number of events to buffer. Events beyond
                            this limit are dropped with a warning.
        """
        self._send_fn = send_fn
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._max_queue_size = max_queue_size

        self._queue: queue.Queue = queue.Queue(maxsize=max_queue_size)
        self._buffer: List[Dict[str, Any]] = []
        self._buffer_lock = threading.Lock()
        self._flush_thread: Optional[threading.Thread] = None
        self._shutdown_event = threading.Event()
        self._started = False

    def start(self) -> None:
        """Start the background flush thread."""
        if self._started:
            return
        self._started = True
        self._shutdown_event.clear()
        self._flush_thread = threading.Thread(
            target=self._flush_loop,
            name="agentstack-batch-sender",
            daemon=True,
        )
        self._flush_thread.start()
        logger.debug("BatchSender started (batch_size=%d, interval=%.1fs)",
                      self._batch_size, self._flush_interval)

    def add(self, event: Dict[str, Any]) -> bool:
        """
        Add an event to the batch queue.

        Args:
            event: The event dict to queue.

        Returns:
            True if the event was queued, False if the queue is full.
        """
        if not self._started:
            self.start()

        try:
            self._queue.put_nowait(event)
        except queue.Full:
            logger.warning(
                "BatchSender queue is full (%d events). Event dropped.",
                self._max_queue_size,
            )
            return False

        # Check if we should trigger an immediate flush
        if self._queue.qsize() >= self._batch_size:
            self._drain_and_flush()

        return True

    def flush(self) -> None:
        """Force an immediate flush of all buffered events."""
        self._drain_and_flush()

    def shutdown(self, timeout: float = 10.0) -> None:
        """
        Gracefully shut down the batch sender.

        Flushes any remaining events and stops the background thread.

        Args:
            timeout: Maximum seconds to wait for the flush thread to finish.
        """
        if not self._started:
            return

        logger.debug("BatchSender shutting down...")
        self._shutdown_event.set()

        # Final flush
        self._drain_and_flush()

        if self._flush_thread and self._flush_thread.is_alive():
            self._flush_thread.join(timeout=timeout)

        self._started = False
        logger.debug("BatchSender shut down.")

    def _flush_loop(self) -> None:
        """Background loop that flushes events at regular intervals."""
        while not self._shutdown_event.is_set():
            self._shutdown_event.wait(timeout=self._flush_interval)
            self._drain_and_flush()

    def _drain_and_flush(self) -> None:
        """Drain the queue into the buffer and send if non-empty."""
        # Drain the queue
        events: List[Dict[str, Any]] = []
        while True:
            try:
                event = self._queue.get_nowait()
                events.append(event)
            except queue.Empty:
                break

        if not events:
            return

        with self._buffer_lock:
            self._buffer.extend(events)
            to_send = list(self._buffer)
            self._buffer.clear()

        if not to_send:
            return

        # Send in chunks of batch_size
        for i in range(0, len(to_send), self._batch_size):
            chunk = to_send[i : i + self._batch_size]
            try:
                self._send_fn(chunk)
                logger.debug("Flushed %d events", len(chunk))
            except Exception:
                logger.exception("Failed to flush %d events", len(chunk))
                # Re-queue failed events (best effort)
                with self._buffer_lock:
                    self._buffer.extend(chunk)

    @property
    def pending_count(self) -> int:
        """Return the approximate number of events waiting to be sent."""
        return self._queue.qsize() + len(self._buffer)
