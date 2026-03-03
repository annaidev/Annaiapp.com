import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertTravelDocument } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useDocuments(tripId: number) {
  return useQuery({
    queryKey: [api.travelDocuments.listByTrip.path, tripId],
    queryFn: async () => {
      const url = buildUrl(api.travelDocuments.listByTrip.path, { tripId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!tripId,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertTravelDocument) => {
      const url = buildUrl(api.travelDocuments.create.path, { tripId: data.tripId });
      const { tripId, ...body } = data;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create document");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.travelDocuments.listByTrip.path, variables.tripId] });
      toast({ title: "Document added", description: "Your document has been saved." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, tripId, ...updates }: { id: number; tripId: number } & Partial<InsertTravelDocument>) => {
      const url = buildUrl(api.travelDocuments.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update document");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.travelDocuments.listByTrip.path, variables.tripId] });
      toast({ title: "Document updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, tripId }: { id: number; tripId: number }) => {
      const url = buildUrl(api.travelDocuments.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete document");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.travelDocuments.listByTrip.path, variables.tripId] });
      toast({ title: "Document deleted", description: "The document has been removed." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
