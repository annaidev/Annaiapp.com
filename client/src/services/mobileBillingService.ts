import { Capacitor, registerPlugin } from "@capacitor/core";
import { apiRequest } from "@/lib/queryClient";

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
