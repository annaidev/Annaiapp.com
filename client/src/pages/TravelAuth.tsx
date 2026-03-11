import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Globe } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

type TravelAuthResponse = {
  id: number;
  username: string;
};

export default function TravelAuthPage() {
  const [, setLocation] = useLocation();
  const hasStarted = useRef(false);

  const exchangeMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await apiRequest("POST", "/api/auth/annai/exchange", { token });
      return (await res.json()) as TravelAuthResponse;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/user"], user);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      const nextPath = new URLSearchParams(window.location.search).get("next");
      const safeNextPath = nextPath && nextPath.startsWith("/") ? nextPath : "/travel";
      window.history.replaceState({}, document.title, safeNextPath);
      setLocation(safeNextPath);
    },
  });

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const handoffToken = window.location.hash.replace(/^#token=/, "").trim();
    if (!handoffToken) {
      setLocation("/");
      return;
    }

    exchangeMutation.mutate(handoffToken);
  }, [exchangeMutation, setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <Card className="w-full max-w-lg">
        <CardContent className="p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 rounded-2xl">
              <Globe className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Opening Annai Travel</h1>
              <p className="text-sm text-muted-foreground">
                {exchangeMutation.isError
                  ? exchangeMutation.error instanceof Error
                    ? exchangeMutation.error.message
                    : "Annai sign-in failed."
                  : "Signing you into Annai Travel with your Annai account..."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
