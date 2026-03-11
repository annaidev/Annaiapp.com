import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";

export type TravelerProfile = {
  id: number;
  username: string;
  preferredLanguage: "en" | "es" | "zh" | "ja" | "ko";
  homeCurrency: string;
};

export function useProfile(enabled = true) {
  return useQuery<TravelerProfile | null>({
    queryKey: [api.profile.me.path],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: async (payload: Partial<Pick<TravelerProfile, "preferredLanguage" | "homeCurrency">>) => {
      const res = await apiRequest(api.profile.update.method, api.profile.update.path, payload);
      return (await res.json()) as TravelerProfile;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData([api.profile.me.path], profile);
      queryClient.invalidateQueries({ queryKey: [api.profile.me.path] });
    },
  });
}
