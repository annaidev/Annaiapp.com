import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crown, MapPinned, Shield, Sparkles } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSubscriptionState } from "@/hooks/use-entitlements";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import {
  getManageSubscriptionUrl,
  isNativeBillingRuntime,
  restoreNativePurchases,
  startNativeSubscriptionPurchase,
  type AnnaiProPlan,
  type PurchaseContext,
} from "@/services/mobileBillingService";

const FALLBACK_PLANS: AnnaiProPlan[] = [
  {
    planId: "monthly",
    label: "Annai Pro Monthly",
    priceUsd: "9.99",
    periodMonths: 1,
    productId: "annai.pro.monthly.9_99",
    appleProductId: "annai.pro.monthly.9_99",
    googleProductId: "annai.pro.monthly.9_99",
  },
  {
    planId: "quarterly",
    label: "Annai Pro Quarterly",
    priceUsd: "24.99",
    periodMonths: 3,
    productId: "annai.pro.quarterly.24_99",
    appleProductId: "annai.pro.quarterly.24_99",
    googleProductId: "annai.pro.quarterly.24_99",
  },
  {
    planId: "yearly",
    label: "Annai Pro Yearly",
    priceUsd: "69.99",
    periodMonths: 12,
    productId: "annai.pro.yearly.69_99",
    appleProductId: "annai.pro.yearly.69_99",
    googleProductId: "annai.pro.yearly.69_99",
  },
];

function formatPlanDuration(periodMonths: number) {
  if (periodMonths === 1) return "1 month";
  if (periodMonths === 12) return "1 year";
  return `${periodMonths} months`;
}

export default function PricingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useSubscriptionState(true);
  const { t } = useI18n();
  const nativeBilling = isNativeBillingRuntime();
  const [selectedPlanId, setSelectedPlanId] = useState<string>("monthly");

  const freeFeatures = [
    t("pricing.freeFeature1"),
    t("pricing.freeFeature2"),
    t("pricing.freeFeature3"),
    t("pricing.freeFeature4"),
  ];

  const proFeatures = [
    t("pricing.proFeature1"),
    t("pricing.proFeature2"),
    t("pricing.proFeature3"),
    t("pricing.proFeature4"),
  ];

  const loadPurchaseContext = async (planId?: string) => {
    const querySuffix = planId ? `?planId=${encodeURIComponent(planId)}` : "";
    const response = await apiRequest("GET", `/api/subscription/purchase-context${querySuffix}`);
    return (await response.json()) as PurchaseContext;
  };

  const purchaseCatalogQuery = useQuery({
    queryKey: ["/api/subscription/purchase-context", "catalog"],
    queryFn: () => loadPurchaseContext(),
    staleTime: 60_000,
  });

  const availablePlans = useMemo(() => {
    if (purchaseCatalogQuery.data?.availablePlans?.length) {
      return purchaseCatalogQuery.data.availablePlans;
    }
    return FALLBACK_PLANS;
  }, [purchaseCatalogQuery.data]);

  useEffect(() => {
    if (!purchaseCatalogQuery.data?.defaultPlanId) return;
    setSelectedPlanId((current) => current || purchaseCatalogQuery.data!.defaultPlanId);
  }, [purchaseCatalogQuery.data?.defaultPlanId]);

  const selectedPlan = useMemo(() => {
    return (
      availablePlans.find((plan) => plan.planId === selectedPlanId) ??
      availablePlans.find((plan) => plan.planId === purchaseCatalogQuery.data?.defaultPlanId) ??
      availablePlans[0]
    );
  }, [availablePlans, purchaseCatalogQuery.data?.defaultPlanId, selectedPlanId]);

  const manageSubscriptionUrl = getManageSubscriptionUrl(data?.subscription ?? null);

  const handleUpgrade = async () => {
    if (!isNativeBillingRuntime()) {
      toast({
        title: "Install the mobile app to subscribe",
        description: "In-app purchase is only available in installed iOS and Android builds.",
      });
      return;
    }

    try {
      const purchaseContext = await loadPurchaseContext(selectedPlan?.planId);
      const result = await startNativeSubscriptionPurchase(purchaseContext, selectedPlan?.planId);
      toast({ title: "Purchase status", description: result.message });
      await queryClient.invalidateQueries({ queryKey: ["/api/subscription/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/entitlements/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/pro/status"] });
    } catch (error) {
      toast({
        title: "Unable to start purchase",
        description: error instanceof Error ? error.message : "Billing context request failed.",
        variant: "destructive",
      });
    }
  };

  const handleRestore = async () => {
    const result = await restoreNativePurchases();
    toast({ title: "Restore status", description: result.message });
    await queryClient.invalidateQueries({ queryKey: ["/api/subscription/me"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/entitlements/me"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/pro/status"] });
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <section className="rounded-[2rem] border bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-8 shadow-sm">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
              <Crown className="mr-2 h-4 w-4" />
              {t("pricing.badge")}
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">{t("pricing.title")}</h1>
            <p className="mt-4 text-lg text-muted-foreground">{t("pricing.subtitle")}</p>
          </div>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="rounded-[2rem] border p-8 shadow-sm">
              <div className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">
                {t("pricing.freeTitle")}
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-foreground">$0</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("pricing.freeBody")}</p>

              <div className="mt-8 space-y-3">
                {freeFeatures.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 rounded-2xl border border-border/60 p-4">
                    <Check className="mt-0.5 h-4 w-4 text-secondary" />
                    <span className="text-sm text-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-[2rem] border border-primary/30 bg-primary/5 p-8 shadow-sm">
              <div className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                {t("pricing.proTitle")}
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-foreground">
                ${selectedPlan?.priceUsd ?? "9.99"} / {formatPlanDuration(selectedPlan?.periodMonths ?? 1)}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("pricing.proBody")}</p>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {availablePlans.map((plan) => (
                  <button
                    key={plan.planId}
                    type="button"
                    className={`rounded-2xl border px-3 py-3 text-left transition ${
                      selectedPlan?.planId === plan.planId
                        ? "border-primary bg-primary/15"
                        : "border-primary/25 bg-background hover:bg-primary/10"
                    }`}
                    onClick={() => setSelectedPlanId(plan.planId)}
                    data-testid={`button-plan-${plan.planId}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {formatPlanDuration(plan.periodMonths)}
                    </p>
                    <p className="mt-1 text-base font-semibold text-foreground">${plan.priceUsd}</p>
                  </button>
                ))}
              </div>

              <div className="mt-8 space-y-3">
                {proFeatures.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-background p-4">
                    <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
                    <span className="text-sm text-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="rounded-[2rem] border p-8 shadow-sm">
            <div className="space-y-4">
              <div className="rounded-2xl bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">{t("pricing.currentPlan")}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {data?.entitlements.plan === "pro" ? t("plan.pro") : t("plan.free")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data?.entitlements.summary.detail ?? "Load your account to see entitlement details."}
                </p>
              </div>

              <div className="rounded-2xl bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Shield className="h-4 w-4 text-primary" />
                  Travel AI and map features
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Pro unlocks the AI assistant, AI destination tools, and premium maps. Free keeps the core planner available without paid integrations.
                </p>
              </div>

              <div className="rounded-2xl bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <MapPinned className="h-4 w-4 text-primary" />
                  {t("pricing.billingState")}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Status: {data?.subscription?.status ?? "inactive"}
                  {data?.subscription?.expiresAt ? `, renews/expires ${new Date(data.subscription.expiresAt).toLocaleDateString()}` : ""}
                </p>
              </div>

              <div className="rounded-2xl bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Crown className="h-4 w-4 text-primary" />
                  Subscription checkout
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {nativeBilling
                    ? "This installed mobile build can start and restore store subscriptions."
                    : "Store subscriptions are completed inside the installed iOS or Android app. The web app shows plan status and support links only."}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  To unsubscribe, use Manage Subscription and cancel in the App Store or Google Play.
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <Button className="h-12 rounded-2xl" onClick={handleUpgrade} data-testid="button-start-subscription">
                {selectedPlan ? `${t("pricing.start")} - $${selectedPlan.priceUsd}` : t("pricing.start")}
              </Button>
              <Button variant="outline" className="h-12 rounded-2xl" onClick={handleRestore} data-testid="button-restore-subscription">
                {t("pricing.restore")}
              </Button>
              {manageSubscriptionUrl && (
                <Button asChild variant="outline" className="h-12 rounded-2xl" data-testid="button-manage-subscription">
                  <a href={manageSubscriptionUrl} target="_blank" rel="noreferrer">
                    Manage Subscription / Unsubscribe
                  </a>
                </Button>
              )}
            </div>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              <a href="/support/index.html" className="font-medium text-primary underline underline-offset-4">
                Support
              </a>
              {" | "}
              <a href="/privacy-policy/index.html" className="font-medium text-primary underline underline-offset-4">
                Privacy Policy
              </a>
              {" | "}
              <a href="/account-deletion/index.html" className="font-medium text-primary underline underline-offset-4">
                Account Deletion
              </a>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
