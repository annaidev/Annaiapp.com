import { Capacitor, registerPlugin } from "@capacitor/core";

export const ANNAI_PRO_MONTHLY_PRODUCT_ID = "annai.pro.monthly.9_99";

export type PurchaseContext = {
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
};

type NativeBillingRestoreResult = {
  restored: boolean;
  message?: string;
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

export async function startNativeSubscriptionPurchase(purchaseContext: PurchaseContext) {
  const runtime = getBillingRuntime();
  if (runtime === "web") {
    return {
      runtime,
      state: "unsupported" as const,
      message: "Native billing is available only in installed iOS/Android builds.",
    };
  }

  try {
    const result =
      runtime === "ios"
        ? await BillingBridge.purchaseSubscription({
            productId: purchaseContext.apple.productId || purchaseContext.productId || ANNAI_PRO_MONTHLY_PRODUCT_ID,
            appAccountToken: purchaseContext.apple.appAccountToken,
          })
        : await BillingBridge.purchaseSubscription({
            productId: purchaseContext.google.productId || purchaseContext.productId || ANNAI_PRO_MONTHLY_PRODUCT_ID,
            obfuscatedExternalAccountId: purchaseContext.google.obfuscatedExternalAccountId,
            obfuscatedExternalProfileId: purchaseContext.google.obfuscatedExternalProfileId,
          });

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
