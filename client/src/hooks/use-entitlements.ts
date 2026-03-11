import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export type Entitlements = {
  plan: "free" | "pro";
  hasProAccess: boolean;
  source: string;
  enabledFeatures: Array<
    | "trip_core"
    | "ai_packing"
    | "ai_itinerary"
    | "ai_safety"
    | "ai_phrases"
    | "ai_weather"
    | "google_maps"
    | "camping_access"
  >;
  enabledModules: Array<"travel" | "camping" | "cruises">;
  subscription: {
    status: string;
    platform: string | null;
    productId: string | null;
    expiresAt: string | null;
    isActive: boolean;
    isSandbox?: boolean;
  } | null;
  summary: {
    headline: string;
    detail: string;
  };
};

export function useEntitlements(enabled = true) {
  return useQuery<Entitlements | null>({
    queryKey: ["/api/entitlements/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function useSubscriptionState(enabled = true) {
  return useQuery<{
    subscription: Entitlements["subscription"];
    entitlements: Entitlements;
  } | null>({
    queryKey: ["/api/subscription/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
    staleTime: 60 * 1000,
    retry: false,
  });
}
