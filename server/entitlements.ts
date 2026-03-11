import type { Response } from "express";
import type { IStorage } from "./storage";
import type { FeatureKey, ModuleSlug, PlanTier, Subscription, User } from "@shared/schema";

type ModuleContract = {
  slug: ModuleSlug;
  name: string;
  enabled: boolean;
  visible: boolean;
  access: "included" | "pro" | "hidden";
  status: "live" | "beta" | "coming_soon" | "disabled";
  description: string;
};

type SubscriptionSummary = {
  status: string;
  platform: string | null;
  productId: string | null;
  expiresAt: string | null;
  isActive: boolean;
  isSandbox?: boolean;
} | null;

export type Entitlements = {
  plan: PlanTier;
  hasProAccess: boolean;
  source: string;
  enabledFeatures: FeatureKey[];
  enabledModules: ModuleSlug[];
  subscription: SubscriptionSummary;
  summary: {
    headline: string;
    detail: string;
  };
};

const FREE_FEATURES: FeatureKey[] = ["trip_core"];
const PRO_FEATURES: FeatureKey[] = [
  ...FREE_FEATURES,
  "ai_packing",
  "ai_itinerary",
  "ai_safety",
  "ai_phrases",
  "ai_weather",
  "google_maps",
  "camping_access",
];

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseUsernameSet(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isSubscriptionActive(status: string | null | undefined, expiresAt?: Date | null): boolean {
  if (!status) return false;
  if (!["active", "trialing", "pro"].includes(status.toLowerCase())) return false;
  if (!expiresAt) return true;
  return expiresAt.getTime() > Date.now();
}

export function getModulesConfig(hasProAccess: boolean): ModuleContract[] {
  const campingEnabled = parseBooleanEnv(process.env.ANNAI_ENABLE_CAMPING);
  const cruisesEnabled = parseBooleanEnv(process.env.ANNAI_ENABLE_CRUISES);

  return [
    {
      slug: "travel",
      name: "Travel Planner",
      enabled: true,
      visible: true,
      access: "included",
      status: "live",
      description: "Trips, itineraries, packing lists, budgets, and document vault in one flagship app.",
    },
    {
      slug: "camping",
      name: "Camping",
      enabled: campingEnabled,
      visible: campingEnabled,
      access: "pro",
      status: campingEnabled ? "beta" : "disabled",
      description: "Rig-aware and campsite planning stays behind a feature flag until after the Travel launch.",
    },
    {
      slug: "cruises",
      name: "Cruises",
      enabled: cruisesEnabled,
      visible: cruisesEnabled,
      access: "pro",
      status: cruisesEnabled ? "coming_soon" : "disabled",
      description: "Cruises stays hidden until a later release.",
    },
  ];
}

function toSubscriptionSummary(subscription: Subscription | undefined): SubscriptionSummary {
  if (!subscription) return null;

  return {
    status: subscription.status,
    platform: subscription.platform ?? null,
    productId: subscription.productId ?? null,
    expiresAt: subscription.expiresAt ? subscription.expiresAt.toISOString() : null,
    isActive: isSubscriptionActive(subscription.status, subscription.expiresAt),
    isSandbox: subscription.isSandbox,
  };
}

export async function getEntitlements(storage: IStorage, user: User): Promise<Entitlements> {
  const subscription = await storage.getSubscription(user.id);
  const giftedEntitlement = await storage.getActiveGiftedEntitlement(user.id);
  const subscriptionSummary = toSubscriptionSummary(subscription);
  const proFreeUsernames = parseUsernameSet(process.env.PRO_FREE_USERNAMES);

  let hasProAccess = false;
  let source = "none";

  if (parseBooleanEnv(process.env.PRO_TEST_MODE)) {
    hasProAccess = true;
    source = "global_test_mode";
  } else if (subscriptionSummary?.isActive || isSubscriptionActive(user.subscriptionStatus)) {
    hasProAccess = true;
    source = subscriptionSummary ? "active_subscription" : "legacy_subscription_status";
  } else if (giftedEntitlement?.planTier === "pro") {
    hasProAccess = true;
    source = giftedEntitlement.expiresAt ? "gifted_pro_timed" : "gifted_pro";
  } else if (user.proAccess) {
    hasProAccess = true;
    source = "manual_grant";
  } else if (proFreeUsernames.has(user.username.toLowerCase())) {
    hasProAccess = true;
    source = "free_username_allowlist";
  }

  const modules = getModulesConfig(hasProAccess);
  const enabledModules = modules
    .filter((module) => module.slug === "travel" || (module.enabled && (module.access === "included" || hasProAccess)))
    .map((module) => module.slug);
  const enabledFeatures = hasProAccess ? PRO_FEATURES : FREE_FEATURES;
  const plan: PlanTier = hasProAccess ? "pro" : "free";

  return {
    plan,
    hasProAccess,
    source,
    enabledFeatures,
    enabledModules,
    subscription: subscriptionSummary,
    summary: hasProAccess
      ? {
          headline: "Annai Pro is active",
          detail:
            source === "gifted_pro_timed"
              ? `Gifted Annai Pro is active until ${giftedEntitlement?.expiresAt?.toLocaleDateString()}.`
              : source === "gifted_pro"
                ? "Gifted Annai Pro is active."
                : "AI planning, premium map features, and future modules unlock only after the paid entitlement is confirmed.",
        }
      : {
          headline: "You are on Annai Free",
          detail: "Core trip planning stays free. AI and API-costing features are locked until Annai Pro is active.",
        },
  };
}

export function requireFeature(res: Response, entitlements: Entitlements, feature: FeatureKey): boolean {
  if (entitlements.enabledFeatures.includes(feature)) {
    return true;
  }

  res.status(403).json({
    message: "Upgrade to Annai Pro to use this feature.",
    code: "UPGRADE_REQUIRED",
    feature,
    plan: entitlements.plan,
  });
  return false;
}
