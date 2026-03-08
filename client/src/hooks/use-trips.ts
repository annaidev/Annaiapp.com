import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertTrip, type UpdateTripRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { TripsListResponse } from "@shared/schema";

export function useTrips() {
  return useQuery({
    queryKey: [api.trips.list.path],
  });
}

export function useTrip(id: number) {
  return useQuery({
    queryKey: ['/api/trips', id],
    enabled: !!id,
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertTrip) => {
      const res = await fetch(api.trips.create.path, {
        method: api.trips.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create trip");
      return api.trips.create.responses[201].parse(await res.json());
    },
    onSuccess: (createdTrip) => {
      queryClient.setQueryData<TripsListResponse | undefined>(
        [api.trips.list.path],
        (currentTrips) => {
          if (!currentTrips) {
            return [createdTrip];
          }

          const alreadyExists = currentTrips.some((trip) => trip.id === createdTrip.id);
          if (alreadyExists) {
            return currentTrips;
          }

          return [createdTrip, ...currentTrips];
        },
      );
      queryClient.invalidateQueries({ queryKey: [api.trips.list.path] });
      toast({ title: "Trip created", description: "Your new adventure awaits!" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateTripRequest) => {
      const url = buildUrl(api.trips.update.path, { id });
      const res = await fetch(url, {
        method: api.trips.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update trip");
      return api.trips.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.trips.list.path] });
      queryClient.invalidateQueries({ queryKey: ['/api/trips', variables.id] });
      toast({ title: "Trip updated", description: "Your changes have been saved." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.trips.delete.path, { id });
      const res = await fetch(url, {
        method: api.trips.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete trip");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.trips.list.path] });
      toast({ title: "Trip deleted", description: "The trip has been removed." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
