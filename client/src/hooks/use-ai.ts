import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

async function parseJsonResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  const rawText = await res.text();

  if (!res.ok) {
    if (contentType.includes("application/json")) {
      let parsed: { message?: string } | null = null;
      try {
        parsed = JSON.parse(rawText) as { message?: string };
      } catch {
        parsed = null;
      }
      throw new Error(parsed?.message || fallbackMessage);
    }

    throw new Error(fallbackMessage);
  }

  if (!contentType.includes("application/json")) {
    throw new Error("The server returned an unexpected response. Refresh and try again.");
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error("The server returned invalid data. Refresh and try again.");
  }
}

export function useGeneratePackingList() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ destination, days }: { destination: string; days?: number }) => {
      const res = await fetch(api.ai.generatePackingList.path, {
        method: api.ai.generatePackingList.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, days }),
        credentials: "include",
      });
      const parsed = await parseJsonResponse<unknown>(res, "Failed to generate packing list");
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
      const res = await fetch(api.ai.tripPlan.path, {
        method: api.ai.tripPlan.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, days, planDepth, travelStyle }),
        credentials: "include",
      });
      const responseBody = await parseJsonResponse<unknown>(res, "Failed to generate trip plan");
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
      const res = await fetch(api.ai.culturalTips.path, {
        method: api.ai.culturalTips.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
        credentials: "include",
      });
      const parsed = await parseJsonResponse<unknown>(res, "Failed to generate cultural tips");
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
      const res = await fetch(api.ai.safetyMap.path, {
        method: api.ai.safetyMap.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
        credentials: "include",
      });
      const parsed = await parseJsonResponse<unknown>(res, "Failed to generate safety map");
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
      const res = await fetch(api.ai.safetyAdvice.path, {
        method: api.ai.safetyAdvice.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, citizenship }),
        credentials: "include",
      });
      const parsed = await parseJsonResponse<unknown>(res, "Failed to generate safety advice");
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
      const res = await fetch(api.ai.phrases.path, {
        method: api.ai.phrases.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
        credentials: "include",
      });
      const parsed = await parseJsonResponse<unknown>(res, "Failed to generate phrases");
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
      const res = await fetch(api.ai.weather.path, {
        method: api.ai.weather.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, startDate, endDate }),
        credentials: "include",
      });
      const parsed = await parseJsonResponse<unknown>(res, "Failed to generate weather forecast");
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
      const res = await fetch(api.ai.customsEntry.path, {
        method: api.ai.customsEntry.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
        credentials: "include",
      });
      const parsed = await parseJsonResponse<unknown>(res, "Failed to get customs and entry guidance");
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
    mutationFn: async ({ tripId, question }: { tripId: number; question: string }) => {
      const res = await fetch(api.ai.assistant.path, {
        method: api.ai.assistant.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, question }),
        credentials: "include",
      });
      const parsed = await parseJsonResponse<unknown>(res, "Failed to get assistant response");
      return api.ai.assistant.responses[200].parse(parsed);
    },
    onError: (error) => {
      toast({ title: "Assistant unavailable", description: error.message, variant: "destructive" });
    },
  });
}
