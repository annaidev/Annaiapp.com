import { Link } from "wouter";
import { Compass, Crown, Globe, Map, Tent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NavBar } from "@/components/NavBar";
import { useProStatus } from "@/hooks/use-pro-status";
import { useCampingHandoff } from "@/hooks/use-camping-handoff";
import { useToast } from "@/hooks/use-toast";

export default function AnnaiHub() {
  const { data: proStatus } = useProStatus();
  const campingHandoff = useCampingHandoff("/");
  const { toast } = useToast();
  const campingApp = proStatus?.apps.find((app) => app.slug === "camping");

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <section className="rounded-[2rem] border bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-8 sm:p-10 shadow-sm">
          <div className="max-w-3xl">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant={proStatus?.hasProAccess ? "default" : "secondary"} className="rounded-full px-3 py-1">
                <Crown className="mr-1 h-3.5 w-3.5" />
                {proStatus?.hasProAccess ? "Annai Pro" : "Annai Free"}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                <Globe className="mr-1 h-3.5 w-3.5" />
                Single Sign-On
              </Badge>
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
              One Annai account.
              <br />
              All your travel worlds.
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              Sign in once, then choose where you want to go. Annai Travel is live now, and Annai Camping
              connects through the same Annai identity.
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-2">
          <Card className="rounded-[2rem] border shadow-sm">
            <CardContent className="p-8">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3">
                  <Map className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-semibold">Annai Travel</h2>
                    <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px] uppercase">
                      Live
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Trips, documents, budgets, packing, itineraries, and travel AI features.
                  </p>
                </div>
              </div>

              <Button asChild size="lg" className="rounded-2xl" data-testid="button-open-travel">
                <Link href="/travel">
                  <Compass className="mr-2 h-4 w-4" />
                  Open Annai Travel
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border shadow-sm">
            <CardContent className="p-8">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-2xl bg-secondary/20 p-3">
                  <Tent className="h-6 w-6 text-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-semibold">Annai Camping</h2>
                    <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px] uppercase">
                      {campingApp?.enabled ? "Connected" : "Preview"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Campground planning, rig-aware routing, checklists, and Annai Pro camping features.
                  </p>
                </div>
              </div>

              <Button
                size="lg"
                className="rounded-2xl"
                disabled={campingHandoff.isPending || !campingApp?.url}
                onClick={() =>
                  campingHandoff.mutate(undefined, {
                    onError: (error) => {
                      toast({
                        title: "Unable to open Annai Camping",
                        description: error instanceof Error ? error.message : "SSO handoff failed.",
                        variant: "destructive",
                      });
                    },
                  })
                }
                data-testid="button-open-camping"
              >
                <Tent className="mr-2 h-4 w-4" />
                {campingHandoff.isPending ? "Opening Camping..." : "Open Annai Camping"}
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
