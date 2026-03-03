import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

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
      if (!res.ok) throw new Error("Failed to generate packing list");
      return api.ai.generatePackingList.responses[200].parse(await res.json());
    },
    onError: (error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
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
      if (!res.ok) throw new Error("Failed to generate cultural tips");
      return api.ai.culturalTips.responses[200].parse(await res.json());
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
      if (!res.ok) throw new Error("Failed to generate safety map");
      return api.ai.safetyMap.responses[200].parse(await res.json());
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
      if (!res.ok) throw new Error("Failed to generate safety advice");
      return api.ai.safetyAdvice.responses[200].parse(await res.json());
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
      if (!res.ok) throw new Error("Failed to generate phrases");
      return api.ai.phrases.responses[200].parse(await res.json());
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
      if (!res.ok) throw new Error("Failed to generate weather forecast");
      return api.ai.weather.responses[200].parse(await res.json());
    },
    onError: (error) => {
      toast({ title: "Failed to get weather", description: error.message, variant: "destructive" });
    },
  });
}
