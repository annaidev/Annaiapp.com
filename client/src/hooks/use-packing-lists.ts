import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertPackingList, type UpdatePackingListRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

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
      const res = await fetch(url, {
        method: api.packingLists.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add item");
      return api.packingLists.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.packingLists.listByTrip.path, variables.tripId] });
    },
  });
}

export function useUpdatePackingListItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, tripId, ...updates }: { id: number; tripId: number } & UpdatePackingListRequest) => {
      const url = buildUrl(api.packingLists.update.path, { id });
      const res = await fetch(url, {
        method: api.packingLists.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update item");
      return api.packingLists.update.responses[200].parse(await res.json());
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
      const res = await fetch(url, {
        method: api.packingLists.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete item");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.packingLists.listByTrip.path, variables.tripId] });
    },
  });
}
