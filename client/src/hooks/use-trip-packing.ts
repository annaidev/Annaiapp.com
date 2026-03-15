import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";

type PackingItem = Awaited<ReturnType<typeof api.packing.listByTrip.responses[200]["parse"]>>[number];
export type PackingCategory = PackingItem["category"];

function normalizePackingItem(raw: any): PackingItem {
  return {
    id: Number(raw?.id),
    tripId: Number(raw?.tripId),
    name: String(raw?.name ?? raw?.item ?? ""),
    completed: Boolean(raw?.completed ?? raw?.isPacked),
    category: raw?.category === "arrival" ? "arrival" : "home",
    createdAt: raw?.createdAt ? new Date(raw.createdAt) : new Date(),
  };
}

export function useTripPackingItems(tripId: number) {
  return useQuery({
    queryKey: [api.packing.listByTrip.path, tripId],
    queryFn: async () => {
      const nextUrl = buildUrl(api.packing.listByTrip.path, { tripId });
      const nextRes = await fetch(nextUrl, { credentials: "include" });

      if (nextRes.ok) {
        const nextPayload = await nextRes.json();
        try {
          return api.packing.listByTrip.responses[200].parse(nextPayload);
        } catch {
          if (Array.isArray(nextPayload)) {
            return nextPayload.map((item) => normalizePackingItem(item));
          }
        }
      }

      const legacyUrl = buildUrl(api.packingLists.listByTrip.path, { tripId });
      const legacyRes = await fetch(legacyUrl, { credentials: "include" });
      if (!legacyRes.ok) {
        throw new Error("Failed to fetch packing items");
      }

      const legacyPayload = await legacyRes.json();
      if (!Array.isArray(legacyPayload)) {
        return [];
      }
      return legacyPayload.map((item) => normalizePackingItem(item));
    },
    enabled: tripId > 0,
  });
}

export function useCreateTripPackingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tripId,
      name,
      category,
    }: {
      tripId: number;
      name: string;
      category: PackingCategory;
    }) => {
      try {
        const url = buildUrl(api.packing.create.path, { tripId });
        const res = await apiRequest(api.packing.create.method, url, { name, category });
        return api.packing.create.responses[201].parse(await res.json());
      } catch {
        const legacyUrl = buildUrl(api.packingLists.create.path, { tripId });
        const legacyRes = await apiRequest(api.packingLists.create.method, legacyUrl, {
          item: name,
          isPacked: false,
          category,
        });
        const legacyPayload = await legacyRes.json();
        return normalizePackingItem(legacyPayload);
      }
    },
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: [api.packing.listByTrip.path, variables.tripId] });
      await queryClient.invalidateQueries({ queryKey: [api.packingLists.listByTrip.path, variables.tripId] });
    },
  });
}

export function useUpdateTripPackingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      tripId,
      updates,
    }: {
      id: number;
      tripId: number;
      updates: {
        name?: string;
        completed?: boolean;
        category?: PackingCategory;
      };
    }) => {
      try {
        const url = buildUrl(api.packing.update.path, { id });
        const res = await apiRequest(api.packing.update.method, url, updates);
        return api.packing.update.responses[200].parse(await res.json());
      } catch {
        const legacyUrl = buildUrl(api.packingLists.update.path, { id });
        const legacyRes = await apiRequest(api.packingLists.update.method, legacyUrl, {
          item: updates.name,
          isPacked: updates.completed,
          category: updates.category,
        });
        const legacyPayload = await legacyRes.json();
        return normalizePackingItem(legacyPayload);
      }
    },
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: [api.packing.listByTrip.path, variables.tripId] });
      await queryClient.invalidateQueries({ queryKey: [api.packingLists.listByTrip.path, variables.tripId] });
    },
  });
}

export function useDeleteTripPackingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, tripId }: { id: number; tripId: number }) => {
      try {
        const url = buildUrl(api.packing.delete.path, { id });
        await apiRequest(api.packing.delete.method, url);
      } catch {
        const legacyUrl = buildUrl(api.packingLists.delete.path, { id });
        await apiRequest(api.packingLists.delete.method, legacyUrl);
      }
      return { tripId };
    },
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: [api.packing.listByTrip.path, variables.tripId] });
      await queryClient.invalidateQueries({ queryKey: [api.packingLists.listByTrip.path, variables.tripId] });
    },
  });
}
