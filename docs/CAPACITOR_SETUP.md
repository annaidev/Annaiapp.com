# Annai Travel Planner Capacitor Setup

## Commands
- `npm run mobile:doctor`
- `npm run mobile:sync`
- `npm run mobile:android`
- `npm run mobile:ios`
- `npm run mobile:android:build`

## Notes
- `capacitor.config.ts` uses `com.annai.travelplanner`.
- Travel is now the flagship mobile app.
- In-app purchase logic is routed through `client/src/services/mobileBillingService.ts`.
- Billing stays server-authoritative through:
  - `GET /api/subscription/me`
  - `GET /api/subscription/purchase-context`
  - `POST /api/subscription/sync/apple`
  - `POST /api/subscription/sync/google`
  - `POST /api/subscription/webhooks/apple`
  - `POST /api/subscription/webhooks/google`
- Native billing bridge lives in:
  - `android/app/src/main/java/com/annai/travelplanner/billing/BillingBridgePlugin.java`
  - `ios/App/App/AppDelegate.swift`
