import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn, invalidateCsrfToken } from "@/lib/queryClient";
import type { User } from "@shared/schema";

function resetUserScopedClientState(user: Pick<User, "id" | "username">) {
  queryClient.clear();
  queryClient.setQueryData(["/api/user"], user);
}

async function recoverUserAfterTimeout(): Promise<Pick<User, "id" | "username"> | null> {
  try {
    const response = await fetch("/api/user", {
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as Pick<User, "id" | "username">;
  } catch {
    return null;
  }
}

export function useUser() {
  return useQuery<Pick<User, "id" | "username"> | null>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: Infinity,
    retry: false,
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      try {
        const res = await apiRequest("POST", "/api/login", data);
        return res.json();
      } catch (error) {
        if (error instanceof Error && error.message.includes("Request timed out")) {
          const recoveredUser = await recoverUserAfterTimeout();
          if (recoveredUser) {
            return recoveredUser;
          }
        }
        throw error;
      }
    },
    onSuccess: (user: Pick<User, "id" | "username">) => {
      invalidateCsrfToken();
      resetUserScopedClientState(user);
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (data: { username: string; password: string; securityQuestion: string; securityAnswer: string }) => {
      try {
        const res = await apiRequest("POST", "/api/register", data);
        return res.json();
      } catch (error) {
        if (error instanceof Error && error.message.includes("Request timed out")) {
          const recoveredUser = await recoverUserAfterTimeout();
          if (recoveredUser) {
            return recoveredUser;
          }
        }
        throw error;
      }
    },
    onSuccess: (user: Pick<User, "id" | "username">) => {
      invalidateCsrfToken();
      resetUserScopedClientState(user);
    },
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      invalidateCsrfToken();
      queryClient.clear();
      window.location.href = "/";
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/account");
    },
    onSuccess: () => {
      invalidateCsrfToken();
      queryClient.clear();
      window.location.href = "/";
    },
  });
}
