import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertTrip, type UpdateTripRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { TripResponse, TripsListResponse } from "@shared/schema";

export function useTrips() {
  return useQuery<TripsListResponse>({
    queryKey: [api.trips.list.path],
  });
}

export function useTrip(id: number) {
  return useQuery<TripResponse | null>({
    queryKey: ['/api/trips', id],
    enabled: !!id,
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertTrip) => {
      const res = await apiRequest(api.trips.create.method, api.trips.create.path, data);
      return api.trips.create.responses[201].parse(await res.json());
    },
    onMutate: async (draftTrip) => {
      await queryClient.cancelQueries({ queryKey: [api.trips.list.path] });

      const previousTrips = queryClient.getQueryData<TripsListResponse>([api.trips.list.path]);
      const optimisticTrip: TripResponse = {
        id: -Date.now(),
        userId: null,
        origin: draftTrip.origin ?? null,
        destination: draftTrip.destination,
        tripType: draftTrip.tripType ?? "one_way",
        budgetTargetCents: draftTrip.budgetTargetCents ?? null,
        startDate: draftTrip.startDate ?? null,
        endDate: draftTrip.endDate ?? null,
        notes: draftTrip.notes ?? null,
        citizenship: draftTrip.citizenship ?? null,
        createdAt: new Date(),
      };

      queryClient.setQueryData<TripsListResponse>(
        [api.trips.list.path],
        (currentTrips) => {
          return currentTrips ? [optimisticTrip, ...currentTrips] : [optimisticTrip];
        },
      );

      return { previousTrips, optimisticTripId: optimisticTrip.id };
    },
    onSuccess: async (createdTrip, _variables, context) => {
      queryClient.setQueryData<TripsListResponse | undefined>(
        [api.trips.list.path],
        (currentTrips) => {
          const withoutOptimistic = (currentTrips ?? []).filter(
            (trip) => trip.id !== context?.optimisticTripId,
          );
          const alreadyExists = withoutOptimistic.some((trip) => trip.id === createdTrip.id);
          return alreadyExists ? withoutOptimistic : [createdTrip, ...withoutOptimistic];
        },
      );
      await queryClient.refetchQueries({ queryKey: [api.trips.list.path], type: "active" });
      toast({ title: "Trip created", description: "Your new adventure awaits!" });
    },
    onError: (error, _variables, context) => {
      if (context?.previousTrips) {
        queryClient.setQueryData([api.trips.list.path], context.previousTrips);
      } else {
        queryClient.removeQueries({ queryKey: [api.trips.list.path], exact: true });
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [api.trips.list.path] });
    },
  });
}

export function useUpdateTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateTripRequest) => {
      const url = buildUrl(api.trips.update.path, { id });
      const res = await apiRequest(api.trips.update.method, url, updates);
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
      await apiRequest(api.trips.delete.method, url);
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [api.trips.list.path] });
      const previousTrips = queryClient.getQueryData<TripsListResponse>([api.trips.list.path]);
      queryClient.setQueryData<TripsListResponse>(
        [api.trips.list.path],
        (currentTrips) => (currentTrips ?? []).filter((trip) => trip.id !== id),
      );
      return { previousTrips };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [api.trips.list.path] });
      toast({ title: "Trip deleted", description: "The trip has been removed." });
    },
    onError: (error, _id, context) => {
      if (context?.previousTrips) {
        queryClient.setQueryData([api.trips.list.path], context.previousTrips);
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
