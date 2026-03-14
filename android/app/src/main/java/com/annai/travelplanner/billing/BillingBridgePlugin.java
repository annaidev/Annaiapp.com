package com.annai.travelplanner.billing;

import android.app.Activity;
import android.util.Log;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "BillingBridge")
public class BillingBridgePlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String TAG = "BillingBridge";
    private BillingClient billingClient;
    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        super.load();
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enablePrepaidPlans().build()
            )
            .build();
    }

    @PluginMethod
    public void purchaseSubscription(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.trim().isEmpty()) {
          call.reject("A subscription productId is required.");
          return;
        }

        ensureBillingReady(new BillingReadyAction() {
            @Override
            public void run() {
                queryAndLaunchPurchase(call, productId.trim());
            }
        }, call);
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        ensureBillingReady(new BillingReadyAction() {
            @Override
            public void run() {
                billingClient.queryPurchasesAsync(
                    QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                    (billingResult, purchases) -> {
                        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            call.reject("Unable to restore purchases: " + billingResult.getDebugMessage());
                            return;
                        }

                        Purchase restoredPurchase = null;
                        for (Purchase purchase : purchases) {
                            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                                restoredPurchase = purchase;
                                break;
                            }
                            if (restoredPurchase == null) {
                                restoredPurchase = purchase;
                            }
                        }

                        if (restoredPurchase == null) {
                            JSObject result = new JSObject();
                            result.put("restored", false);
                            result.put("message", "No Google Play subscriptions were found to restore.");
                            call.resolve(result);
                            return;
                        }

                        acknowledgeIfNeeded(restoredPurchase);
                        JSObject result = buildPurchaseResult(restoredPurchase);
                        result.put("restored", true);
                        result.put("message", "Google Play purchase restored.");
                        call.resolve(result);
                    }
                );
            }
        }, call);
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, List<Purchase> purchases) {
        if (pendingPurchaseCall == null) {
            return;
        }

        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;

        int responseCode = billingResult.getResponseCode();
        if (responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject result = new JSObject();
            result.put("state", "failed");
            result.put("message", "Purchase canceled.");
            call.resolve(result);
            return;
        }

        if (responseCode != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject("Google Play purchase failed: " + billingResult.getDebugMessage());
            return;
        }

        Purchase purchase = purchases.get(0);
        acknowledgeIfNeeded(purchase);
        JSObject result = buildPurchaseResult(purchase);
        result.put(
            "message",
            purchase.getPurchaseState() == Purchase.PurchaseState.PENDING
                ? "Purchase is pending confirmation in Google Play."
                : "Purchase completed."
        );
        call.resolve(result);
    }

    private void queryAndLaunchPurchase(PluginCall call, String productId) {
        QueryProductDetailsParams.Product product =
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build();

        QueryProductDetailsParams params =
            QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject("Unable to load Google Play subscription details: " + billingResult.getDebugMessage());
                return;
            }

            if (productDetailsList == null || productDetailsList.isEmpty()) {
                call.reject("Google Play did not return product details for " + productId + ".");
                return;
            }

            ProductDetails productDetails = productDetailsList.get(0);
            List<ProductDetails.SubscriptionOfferDetails> offers = productDetails.getSubscriptionOfferDetails();
            if (offers == null || offers.isEmpty()) {
                call.reject("Google Play did not return a subscription offer for " + productId + ".");
                return;
            }

            Activity activity = getActivity();
            if (activity == null) {
                call.reject("Billing requires an active Android activity.");
                return;
            }

            BillingFlowParams.ProductDetailsParams.Builder productParamsBuilder =
                BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(productDetails)
                    .setOfferToken(offers.get(0).getOfferToken());

            BillingFlowParams.Builder flowBuilder =
                BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(productParamsBuilder.build()));

            String obfuscatedAccountId = call.getString("obfuscatedExternalAccountId");
            if (obfuscatedAccountId != null && !obfuscatedAccountId.trim().isEmpty()) {
                flowBuilder.setObfuscatedAccountId(obfuscatedAccountId.trim());
            }

            String obfuscatedProfileId = call.getString("obfuscatedExternalProfileId");
            if (obfuscatedProfileId != null && !obfuscatedProfileId.trim().isEmpty()) {
                flowBuilder.setObfuscatedProfileId(obfuscatedProfileId.trim());
            }

            pendingPurchaseCall = call;
            BillingResult launchResult = billingClient.launchBillingFlow(activity, flowBuilder.build());
            if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                pendingPurchaseCall = null;
                call.reject("Unable to start Google Play purchase: " + launchResult.getDebugMessage());
            }
        });
    }

    private JSObject buildPurchaseResult(Purchase purchase) {
        JSObject result = new JSObject();
        String state =
            purchase.getPurchaseState() == Purchase.PurchaseState.PENDING ? "pending" : "completed";
        result.put("state", state);
        result.put("transactionId", purchase.getOrderId());
        result.put("purchaseToken", purchase.getPurchaseToken());
        List<String> products = purchase.getProducts();
        result.put("productId", products != null && !products.isEmpty() ? products.get(0) : null);
        return result;
    }

    private void acknowledgeIfNeeded(Purchase purchase) {
        if (purchase.isAcknowledged() || purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
            return;
        }

        AcknowledgePurchaseParams params =
            AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.getPurchaseToken())
                .build();
        billingClient.acknowledgePurchase(params, billingResult -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                Log.w(TAG, "Google Play acknowledge failed: " + billingResult.getDebugMessage());
            }
        });
    }

    private void ensureBillingReady(BillingReadyAction onReady, PluginCall call) {
        if (billingClient == null) {
            call.reject("Google Play Billing is unavailable.");
            return;
        }

        if (billingClient.isReady()) {
            onReady.run();
            return;
        }

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    onReady.run();
                } else {
                    call.reject("Unable to connect to Google Play Billing: " + billingResult.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // The next call will reconnect as needed.
            }
        });
    }

    private interface BillingReadyAction {
        void run();
    }
}
