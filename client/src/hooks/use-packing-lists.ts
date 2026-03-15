import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertPackingList, type UpdatePackingListRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function usePackingLists(tripId: number) {
  return useQuery({
    queryKey: [api.packingLists.listByTrip.path, tripId],
    queryFn: async () => {
      const url = buildUrl(api.packingLists.listByTrip.path, { tripId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch packing list");
      return api.packingLists.listByTrip.responses[200].parse(await res.json());
    },
    enabled: !!tripId,
  });
}

export function useCreatePackingListItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ tripId, item }: { tripId: number; item: string }) => {
      const url = buildUrl(api.packingLists.create.path, { tripId });
      const res = await apiRequest(api.packingLists.create.method, url, { item });
      return api.packingLists.create.responses[201].parse(await res.json());
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: [api.packingLists.listByTrip.path, variables.tripId] });
    },
  });
}

export function useUpdatePackingListItem() {
  const queryClient = useQueryClient();
  type PackingListItem = Awaited<ReturnType<typeof api.packingLists.listByTrip.responses[200]["parse"]>>[number];

  return useMutation({
    mutationFn: async ({ id, tripId, ...updates }: { id: number; tripId: number } & UpdatePackingListRequest) => {
      const url = buildUrl(api.packingLists.update.path, { id });
      const res = await apiRequest(api.packingLists.update.method, url, updates);
      return api.packingLists.update.responses[200].parse(await res.json());
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: [api.packingLists.listByTrip.path, variables.tripId] });
      const queryKey = [api.packingLists.listByTrip.path, variables.tripId] as const;
      const previousItems = queryClient.getQueryData<PackingListItem[]>(queryKey);
      queryClient.setQueryData<PackingListItem[]>(
        queryKey,
        (currentItems) =>
          (currentItems ?? []).map((item) =>
            item.id === variables.id ? { ...item, ...variables } : item,
          ),
      );
      return { previousItems, queryKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousItems && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousItems);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.packingLists.listByTrip.path, variables.tripId] });
    },
  });
}

export function useDeletePackingListItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, tripId }: { id: number; tripId: number }) => {
      const url = buildUrl(api.packingLists.delete.path, { id });
      await apiRequest(api.packingLists.delete.method, url);
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: [api.packingLists.listByTrip.path, variables.tripId] });
    },
  });
}
