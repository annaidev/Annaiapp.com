import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";

export type TravelerProfile = {
  id: number;
  username: string;
  preferredLanguage: "en" | "es" | "zh" | "ja" | "ko";
  homeCurrency: string;
  citizenship: string | null;
  travelWithKids: boolean;
  travelWithPets: boolean;
  travelForWork: boolean;
  needsAccessibility: boolean;
};

export type ProfilePackingItem = {
  id: number;
  userId: number;
  item: string;
  createdAt: string | Date;
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
    mutationFn: async (
      payload: Partial<
        Pick<
          TravelerProfile,
          | "preferredLanguage"
          | "homeCurrency"
          | "citizenship"
          | "travelWithKids"
          | "travelWithPets"
          | "travelForWork"
          | "needsAccessibility"
        >
      >,
    ) => {
      const res = await apiRequest(api.profile.update.method, api.profile.update.path, payload);
      return (await res.json()) as TravelerProfile;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData([api.profile.me.path], profile);
      queryClient.invalidateQueries({ queryKey: [api.profile.me.path] });
    },
  });
}

export function useProfilePackingItems(enabled = true) {
  return useQuery<ProfilePackingItem[]>({
    queryKey: [api.profilePacking.list.path],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled,
    staleTime: 30 * 1000,
    retry: false,
  });
}

export function useCreateProfilePackingItem() {
  return useMutation({
    mutationFn: async (item: string) => {
      const res = await apiRequest(api.profilePacking.create.method, api.profilePacking.create.path, { item });
      return (await res.json()) as ProfilePackingItem;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [api.profilePacking.list.path] });
    },
  });
}

export function useDeleteProfilePackingItem() {
  return useMutation({
    mutationFn: async (id: number) => {
      const path = api.profilePacking.delete.path.replace(":id", String(id));
      await apiRequest(api.profilePacking.delete.method, path);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [api.profilePacking.list.path] });
    },
  });
}
