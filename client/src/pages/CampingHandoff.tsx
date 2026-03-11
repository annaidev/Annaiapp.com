import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Tent } from "lucide-react";
import { useCampingHandoff } from "@/hooks/use-camping-handoff";

export default function CampingHandoff() {
  const startedRef = useRef(false);
  const handoff = useCampingHandoff("/");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    handoff.mutate();
  }, [handoff]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <Card className="w-full max-w-lg p-8 rounded-3xl shadow-xl border border-border/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <Tent className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Opening Annai Camping</h1>
            <p className="text-sm text-muted-foreground">
              {handoff.isError
                ? handoff.error instanceof Error
                  ? handoff.error.message
                  : "Annai SSO handoff failed."
                : "Signing you into Annai Camping with your Annai account..."}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
