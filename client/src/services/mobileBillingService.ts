import { Capacitor, registerPlugin } from "@capacitor/core";
import { apiRequest } from "@/lib/queryClient";

export const ANNAI_PRO_MONTHLY_PRODUCT_ID = "annai.pro.monthly.9_99";
export const GOOGLE_PLAY_PACKAGE_NAME = "com.annai.travelplanner";

export type AnnaiProPlan = {
  planId: string;
  label: string;
  priceUsd: string;
  periodMonths: number;
  productId: string;
  appleProductId: string;
  googleProductId: string;
};

export type PurchaseContext = {
  defaultPlanId: string;
  availablePlans: AnnaiProPlan[];
  productId: string;
  apple: {
    appAccountToken: string;
    productId: string;
  };
  google: {
    obfuscatedExternalAccountId: string;
    obfuscatedExternalProfileId: string;
    productId: string;
  };
};

type NativeBillingPurchaseOptions = {
  productId: string;
  appAccountToken?: string;
  obfuscatedExternalAccountId?: string;
  obfuscatedExternalProfileId?: string;
};

type NativeBillingPurchaseResult = {
  state: "completed" | "pending" | "failed";
  message?: string;
  transactionId?: string;
  signedTransactionInfo?: string;
  purchaseToken?: string;
  productId?: string;
};

type NativeBillingRestoreResult = {
  restored: boolean;
  message?: string;
  signedTransactionInfo?: string;
  purchaseToken?: string;
  productId?: string;
};

interface BillingBridgePlugin {
  purchaseSubscription(options: NativeBillingPurchaseOptions): Promise<NativeBillingPurchaseResult>;
  restorePurchases(): Promise<NativeBillingRestoreResult>;
}

const BillingBridge = registerPlugin<BillingBridgePlugin>("BillingBridge");

export type BillingRuntime = "ios" | "android" | "web";

export function getBillingRuntime(): BillingRuntime {
  if (!Capacitor.isNativePlatform()) return "web";
  return Capacitor.getPlatform() === "ios" ? "ios" : "android";
}

export function isNativeBillingRuntime(): boolean {
  return getBillingRuntime() !== "web";
}

function selectPlanFromContext(purchaseContext: PurchaseContext, selectedPlanId?: string) {
  if (!purchaseContext.availablePlans.length) return null;
  return (
    purchaseContext.availablePlans.find((plan) => plan.planId === selectedPlanId) ??
    purchaseContext.availablePlans.find((plan) => plan.planId === purchaseContext.defaultPlanId) ??
    purchaseContext.availablePlans[0]
  );
}

export function getManageSubscriptionUrl(subscription?: { platform?: string | null; productId?: string | null } | null): string | null {
  if (!subscription?.platform) {
    return null;
  }

  if (subscription.platform === "ios") {
    return "https://apps.apple.com/account/subscriptions";
  }

  if (subscription.platform === "android") {
    if (subscription.productId) {
      return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(subscription.productId)}&package=${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}`;
    }
    return "https://play.google.com/store/account/subscriptions";
  }

  return null;
}

export async function startNativeSubscriptionPurchase(purchaseContext: PurchaseContext, selectedPlanId?: string) {
  const runtime = getBillingRuntime();
  if (runtime === "web") {
    return {
      runtime,
      state: "unsupported" as const,
      message: "Native billing is available only in installed iOS/Android builds.",
    };
  }

  const selectedPlan = selectPlanFromContext(purchaseContext, selectedPlanId);

  try {
    const result =
      runtime === "ios"
        ? await BillingBridge.purchaseSubscription({
            productId:
              selectedPlan?.appleProductId ||
              purchaseContext.apple.productId ||
              selectedPlan?.productId ||
              purchaseContext.productId ||
              ANNAI_PRO_MONTHLY_PRODUCT_ID,
            appAccountToken: purchaseContext.apple.appAccountToken,
          })
        : await BillingBridge.purchaseSubscription({
            productId:
              selectedPlan?.googleProductId ||
              purchaseContext.google.productId ||
              selectedPlan?.productId ||
              purchaseContext.productId ||
              ANNAI_PRO_MONTHLY_PRODUCT_ID,
            obfuscatedExternalAccountId: purchaseContext.google.obfuscatedExternalAccountId,
            obfuscatedExternalProfileId: purchaseContext.google.obfuscatedExternalProfileId,
        });

    if (result.state === "completed") {
      await syncSubscriptionWithServer(runtime, result);
    }

    return {
      runtime,
      state: result.state,
      message: result.message || "Purchase submitted. Waiting for server entitlement confirmation.",
      transactionId: result.transactionId,
    };
  } catch (error) {
    return {
      runtime,
      state: "failed" as const,
      message: error instanceof Error ? error.message : "Native billing bridge is unavailable.",
    };
  }
}

export async function restoreNativePurchases() {
  const runtime = getBillingRuntime();
  if (runtime === "web") {
    return {
      runtime,
      restored: false,
      message: "Restore is available only in installed iOS/Android builds.",
    };
  }

  try {
    const result = await BillingBridge.restorePurchases();
    if (result.restored) {
      await syncSubscriptionWithServer(runtime, result);
    }
    return {
      runtime,
      restored: result.restored,
      message: result.message || (result.restored ? "Restore submitted." : "No purchases were restored."),
    };
  } catch (error) {
    return {
      runtime,
      restored: false,
      message: error instanceof Error ? error.message : "Native restore bridge is unavailable.",
    };
  }
}

async function syncSubscriptionWithServer(
  runtime: Exclude<BillingRuntime, "web">,
  result: Pick<NativeBillingPurchaseResult & NativeBillingRestoreResult, "signedTransactionInfo" | "purchaseToken" | "productId">,
) {
  if (runtime === "ios") {
    if (!result.signedTransactionInfo) {
      throw new Error("Apple purchase completed but no signed transaction info was returned.");
    }
    await apiRequest("POST", "/api/subscription/sync/apple", {
      signedTransactionInfo: result.signedTransactionInfo,
    });
    return;
  }

  if (!result.purchaseToken || !result.productId) {
    throw new Error("Google Play purchase completed but no purchase token was returned.");
  }

  await apiRequest("POST", "/api/subscription/sync/google", {
    purchaseToken: result.purchaseToken,
    productId: result.productId,
  });
}
