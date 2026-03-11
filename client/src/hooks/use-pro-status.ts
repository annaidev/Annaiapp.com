import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export type ProStatus = {
  plan: "free" | "pro";
  hasProAccess: boolean;
  source: string;
  enabledFeatures: string[];
  enabledModules: string[];
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
  apps: Array<{
    slug: "travel" | "camping" | "cruises";
    name: string;
    url: string | null;
    enabled: boolean;
    visible: boolean;
    status: "live" | "beta" | "coming_soon" | "disabled";
    access: "included" | "pro" | "hidden";
    description: string;
  }>;
};

export function useProStatus(enabled = true) {
  return useQuery<ProStatus | null>({
    queryKey: ["/api/pro/status"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
    staleTime: 60 * 1000,
    retry: false,
  });
}
