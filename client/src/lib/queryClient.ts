import { QueryClient, QueryFunction } from "@tanstack/react-query";

const FETCH_TIMEOUT_MS = 65000;
let csrfTokenPromise: Promise<string> | null = null;

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith("/") ? path : `/${path}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function isRetriableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  const message = err.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("aborted")
  );
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  attempts = 3,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(apiUrl(input), { ...init, signal: controller.signal });
    } catch (err) {
      lastError = err;
      if (!isRetriableNetworkError(err) || attempt === attempts) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Request timed out while waiting for the backend.");
        }
        throw err;
      }
      // Render free instances can take a few seconds to wake from cold start.
      await new Promise((resolve) => setTimeout(resolve, 2500));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

async function getCsrfToken(): Promise<string> {
  if (!csrfTokenPromise) {
    csrfTokenPromise = (async () => {
      const response = await fetchWithRetry("/api/csrf-token", {
        credentials: "include",
      });
      await throwIfResNotOk(response);
      const data = (await response.json()) as { csrfToken?: string };
      if (!data.csrfToken) {
        throw new Error("CSRF token response was missing a token.");
      }
      return data.csrfToken;
    })();
  }

  return csrfTokenPromise;
}

export function invalidateCsrfToken() {
  csrfTokenPromise = null;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const normalizedMethod = method.toUpperCase();
  const isSafeMethod = ["GET", "HEAD", "OPTIONS"].includes(normalizedMethod);
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};

  if (!isSafeMethod) {
    headers["X-CSRF-Token"] = await getCsrfToken();
  }

  let res = await fetchWithRetry(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  }, isSafeMethod ? 3 : 1);

  if (
    !isSafeMethod &&
    res.status === 403
  ) {
    const text = await res.text();
    if (text.includes("CSRF")) {
      invalidateCsrfToken();
      headers["X-CSRF-Token"] = await getCsrfToken();
      res = await fetchWithRetry(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });
    } else {
      throw new Error(`${res.status}: ${text || res.statusText}`);
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let res: Response;

    try {
      res = await fetchWithRetry(queryKey.join("/") as string, {
        credentials: "include",
      });
    } catch (error) {
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      throw error;
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    try {
      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
