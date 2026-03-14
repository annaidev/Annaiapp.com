import UIKit
import Capacitor
import StoreKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

@objc(BillingBridgePlugin)
public class BillingBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BillingBridgePlugin"
    public let jsName = "BillingBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchaseSubscription", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
    ]

    @objc func purchaseSubscription(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.reject("StoreKit subscription purchases require iOS 15 or later.")
            return
        }

        guard let productId = call.getString("productId"), !productId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("A subscription productId is required.")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Apple did not return a subscription product for \(productId).")
                    return
                }

                var options: Set<Product.PurchaseOption> = []
                if let token = call.getString("appAccountToken"), let uuid = UUID(uuidString: token) {
                    options.insert(.appAccountToken(uuid))
                }

                let purchaseResult = try await product.purchase(options: options)
                switch purchaseResult {
                case .success(let verificationResult):
                    let transaction = try self.verifiedTransaction(from: verificationResult)
                    await transaction.finish()
                    call.resolve([
                        "state": transaction.revocationDate == nil ? "completed" : "failed",
                        "message": transaction.revocationDate == nil ? "Purchase completed." : "Purchase was revoked.",
                        "transactionId": String(transaction.originalID),
                        "signedTransactionInfo": transaction.jwsRepresentation,
                        "productId": transaction.productID,
                    ])
                case .pending:
                    call.resolve([
                        "state": "pending",
                        "message": "Purchase is pending confirmation in the App Store.",
                        "productId": productId,
                    ])
                case .userCancelled:
                    call.resolve([
                        "state": "failed",
                        "message": "Purchase canceled.",
                        "productId": productId,
                    ])
                @unknown default:
                    call.reject("Apple returned an unknown purchase state.")
                }
            } catch {
                call.reject("Apple subscription purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.reject("StoreKit restore requires iOS 15 or later.")
            return
        }

        Task {
            do {
                try await AppStore.sync()

                for await entitlement in Transaction.currentEntitlements {
                    do {
                        let transaction = try self.verifiedTransaction(from: entitlement)
                        guard transaction.productType == .autoRenewable else {
                            continue
                        }

                        call.resolve([
                            "restored": true,
                            "message": "App Store purchase restored.",
                            "transactionId": String(transaction.originalID),
                            "signedTransactionInfo": transaction.jwsRepresentation,
                            "productId": transaction.productID,
                        ])
                        return
                    } catch {
                        continue
                    }
                }

                call.resolve([
                    "restored": false,
                    "message": "No App Store subscriptions were found to restore.",
                ])
            } catch {
                call.reject("Unable to restore App Store purchases: \(error.localizedDescription)")
            }
        }
    }

    @available(iOS 15.0, *)
    private func verifiedTransaction(from result: VerificationResult<Transaction>) throws -> Transaction {
        switch result {
        case .verified(let transaction):
            return transaction
        case .unverified:
            throw NSError(domain: "BillingBridge", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "The App Store transaction could not be verified."
            ])
        }
    }
}
