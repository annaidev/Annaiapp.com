import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function useGeneratePackingList() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ destination, days }: { destination: string; days?: number }) => {
      const res = await apiRequest(api.ai.generatePackingList.method, api.ai.generatePackingList.path, { destination, days });
      const parsed = await res.json();
      return api.ai.generatePackingList.responses[200].parse(parsed);
    },
    onError: (error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useTripPlan() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      destination,
      days = 5,
      planDepth = "quick",
      travelStyle = "balanced",
    }: {
      destination: string;
      days?: number;
      planDepth?: "quick" | "detailed";
      travelStyle?: "balanced" | "food" | "culture" | "family" | "relaxed";
    }) => {
      const res = await apiRequest(api.ai.tripPlan.method, api.ai.tripPlan.path, { destination, days, planDepth, travelStyle });
      const responseBody = await res.json();
      const parsed = api.ai.tripPlan.responses[200].parse(responseBody);
      const cacheHeader = res.headers.get("X-Annai-Cache");
      const cacheKey = res.headers.get("X-Annai-Cache-Key");
      return {
        ...parsed,
        _cacheStatus: cacheHeader === "HIT" ? "hit" : cacheHeader === "MISS" ? "miss" : null,
        _seedFingerprint: cacheKey,
      };
    },
    onError: (error) => {
      toast({ title: "Failed to generate trip plan", description: error.message, variant: "destructive" });
    },
  });
}

export function useCulturalTips() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (destination: string) => {
      const res = await apiRequest(api.ai.culturalTips.method, api.ai.culturalTips.path, { destination });
      const parsed = await res.json();
      return api.ai.culturalTips.responses[200].parse(parsed);
    },
    onError: (error) => {
      toast({ title: "Failed to get tips", description: error.message, variant: "destructive" });
    },
  });
}

export function useSafetyMap() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (destination: string) => {
      const res = await apiRequest(api.ai.safetyMap.method, api.ai.safetyMap.path, { destination });
      const parsed = await res.json();
      return api.ai.safetyMap.responses[200].parse(parsed);
    },
    onError: (error) => {
      toast({ title: "Failed to load safety map", description: error.message, variant: "destructive" });
    },
  });
}

export function useSafetyAdvice() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ destination, citizenship }: { destination: string, citizenship?: string }) => {
      const res = await apiRequest(api.ai.safetyAdvice.method, api.ai.safetyAdvice.path, { destination, citizenship });
      const parsed = await res.json();
      return api.ai.safetyAdvice.responses[200].parse(parsed);
    },
    onError: (error) => {
      toast({ title: "Failed to get safety advice", description: error.message, variant: "destructive" });
    },
  });
}

export function usePhrases() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (destination: string) => {
      const res = await apiRequest(api.ai.phrases.method, api.ai.phrases.path, { destination });
      const parsed = await res.json();
      return api.ai.phrases.responses[200].parse(parsed);
    },
    onError: (error) => {
      toast({ title: "Failed to get phrases", description: error.message, variant: "destructive" });
    },
  });
}

export function useWeather() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ destination, startDate, endDate }: { destination: string, startDate?: string, endDate?: string }) => {
      const res = await apiRequest(api.ai.weather.method, api.ai.weather.path, { destination, startDate, endDate });
      const parsed = await res.json();
      return api.ai.weather.responses[200].parse(parsed);
    },
    onError: (error) => {
      toast({ title: "Failed to get weather", description: error.message, variant: "destructive" });
    },
  });
}

export function useCustomsEntry() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (tripId: number) => {
      const res = await apiRequest(api.ai.customsEntry.method, api.ai.customsEntry.path, { tripId });
      const parsed = await res.json();
      return api.ai.customsEntry.responses[200].parse(parsed);
    },
    onError: (error) => {
      toast({ title: "Customs guidance unavailable", description: error.message, variant: "destructive" });
    },
  });
}

export function useTravelAssistant() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      tripId,
      question,
      messages,
      activeSuggestions,
    }: {
      tripId: number;
      question: string;
      messages?: Array<{ role: "user" | "assistant"; content: string }>;
      activeSuggestions?: Array<{
        title: string;
        summary: string;
        category: "activity" | "meal" | "transport" | "sightseeing";
        googleSearchUrl?: string | null;
        googleMapsUrl?: string | null;
      }>;
    }) => {
      const res = await apiRequest(api.ai.assistant.method, api.ai.assistant.path, {
        tripId,
        question,
        messages,
        activeSuggestions,
      });
      const parsed = await res.json();
      return api.ai.assistant.responses[200].parse(parsed);
    },
    onError: (error) => {
      toast({ title: "Assistant unavailable", description: error.message, variant: "destructive" });
    },
  });
}
