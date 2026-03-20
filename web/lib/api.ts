const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ---------------------------------------------------------------------------
// Request ID generation (timestamp + random suffix, no crypto dependency)
// ---------------------------------------------------------------------------
function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `req_${ts}_${rand}`;
}

// ---------------------------------------------------------------------------
// ApiError — typed error thrown on 4xx / 5xx responses
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor(status: number, code: string, message: string, requestId: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

// ---------------------------------------------------------------------------
// Request ID store — keeps the last request ID for debugging display
// ---------------------------------------------------------------------------
type RequestIdListener = (id: string) => void;

const requestIdStore = {
  _lastId: "" as string,
  _listeners: [] as RequestIdListener[],

  get lastId(): string {
    return this._lastId;
  },

  set(id: string): void {
    this._lastId = id;
    for (const fn of this._listeners) {
      fn(id);
    }
  },

  subscribe(fn: RequestIdListener): () => void {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn);
    };
  },
};

export { requestIdStore };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
interface APIErrorBody {
  error: {
    code: string;
    message: string;
  };
}

const isDev = process.env.NODE_ENV === "development";

function logRequest(method: string, path: string, requestId: string): void {
  if (isDev) {
    console.log(`[API] ${method} ${path}  (${requestId})`);
  }
}

function logResponse(method: string, path: string, status: number, durationMs: number, requestId: string): void {
  if (isDev) {
    console.log(`[API] ${method} ${path} → ${status} (${durationMs}ms)  [${requestId}]`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// APIClient
// ---------------------------------------------------------------------------
class APIClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retriesLeft = 1
  ): Promise<T> {
    const requestId = generateRequestId();
    requestIdStore.set(requestId);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    logRequest(method, path, requestId);
    const start = performance.now();

    let res: Response;
    try {
      res = await fetch(`${this.baseURL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkError) {
      const elapsed = Math.round(performance.now() - start);
      if (isDev) {
        console.error(`[API] ${method} ${path} → NETWORK ERROR (${elapsed}ms)  [${requestId}]`);
      }
      throw new ApiError(0, "NETWORK_ERROR", networkError instanceof Error ? networkError.message : "Network request failed", requestId);
    }

    const elapsed = Math.round(performance.now() - start);
    logResponse(method, path, res.status, elapsed, requestId);

    // Retry once on 5xx
    if (res.status >= 500 && retriesLeft > 0) {
      if (isDev) {
        console.warn(`[API] Retrying ${method} ${path} after 5xx (${retriesLeft} retries left)  [${requestId}]`);
      }
      await sleep(1000);
      return this.request<T>(method, path, body, retriesLeft - 1);
    }

    if (!res.ok) {
      const errorBody: APIErrorBody = await res.json().catch(() => ({
        error: { code: "UNKNOWN", message: res.statusText },
      }));
      throw new ApiError(res.status, errorBody.error.code, errorBody.error.message, requestId);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return res.json();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}

export const api = new APIClient(API_URL);
