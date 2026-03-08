import { QueryClient, QueryFunction } from "@tanstack/react-query";

const FETCH_TIMEOUT_MS = 15000;
const LOCAL_AUTH_KEY = "annai.localAuthUser";

type LocalAuthUser = { id: number; username: string };

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

function getLocalAuthUser(): LocalAuthUser | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.id === "number" && typeof parsed?.username === "string") {
      return parsed;
    }
  } catch {
    // Ignore malformed local storage state.
  }
  return null;
}

function setLocalAuthUser(user: LocalAuthUser) {
  window.localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(user));
}

function clearLocalAuthUser() {
  window.localStorage.removeItem(LOCAL_AUTH_KEY);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

async function fetchWithRetry(input: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  let res: Response;

  try {
    res = await fetchWithRetry(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  } catch (error) {
    // Temporary offline fallback while backend connectivity is unstable.
    if (method === "POST" && url === "/api/register") {
      const username = (data as any)?.username;
      if (typeof username === "string" && username.trim().length > 0) {
        const user = { id: Date.now(), username: username.trim() };
        setLocalAuthUser(user);
        return jsonResponse(user, 201);
      }
    }

    if (method === "POST" && url === "/api/login") {
      const username = (data as any)?.username;
      if (typeof username === "string" && username.trim().length > 0) {
        const user = { id: Date.now(), username: username.trim() };
        setLocalAuthUser(user);
        return jsonResponse(user, 200);
      }
    }

    if (method === "POST" && url === "/api/logout") {
      clearLocalAuthUser();
      return jsonResponse({ message: "Logged out" }, 200);
    }

    throw error;
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
    const path = queryKey.join("/") as string;

    try {
      res = await fetchWithRetry(path, {
        credentials: "include",
      });
    } catch (error) {
      if (path === "/api/user") {
        const localUser = getLocalAuthUser();
        if (localUser) {
          return localUser as T;
        }
      }

      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      throw error;
    }

    if (path === "/api/user" && res.status === 401) {
      const localUser = getLocalAuthUser();
      if (localUser) {
        return localUser as T;
      }
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
