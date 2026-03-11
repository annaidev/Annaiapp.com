import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type HandoffResponse = {
  handoffUrl: string;
};

export function useCampingHandoff(nextPath = "/") {
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ecosystem/handoff/camping", {
        nextPath,
      });
      return (await res.json()) as HandoffResponse;
    },
    onSuccess: ({ handoffUrl }) => {
      window.location.href = handoffUrl;
    },
  });
}
