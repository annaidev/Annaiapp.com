# Annai Travel Planner App Store Blueprint

Last updated: March 13, 2026

## Objective

Ship a commercially viable `Annai Travel Planner` app to the Apple App Store and Google Play by April 1, 2026.

## Launch Scope

This launch is `Travel only`.

Included:
- account creation, login, logout, password reset, account deletion
- trip creation and editing
- itinerary
- packing list
- budget tracking
- document vault
- destination info tools
- Ask Annai
- Customs & Entry
- free vs Pro entitlement gating
- coupon redemption if it does not confuse store review

Excluded from store-facing v1:
- Camping as a visible module
- Cruises as a visible module
- experimental or partially working admin tooling
- any premium feature that cannot be restored and verified cleanly

## Commercial Viability Standard

The launch is commercially viable only if:
- free users get strong core planning without paid API leakage
- Pro billing works end-to-end
- account deletion is available in-app and through a public web flow
- privacy, terms, and support URLs are live
- the app is stable on real iPhone and Android devices
- reviewer testing does not hit broken flows, missing content, or dead-end paywalls

## Critical Workstreams

### 1. Compliance
- Keep privacy policy live at `/privacy-policy/`
- Keep terms live at `/terms-of-service/`
- Keep support page live at `/support/`
- Keep external account deletion page live at `/account-deletion/`
- Ensure the in-app account deletion flow remains functional
- Prepare Google Play Data safety answers
- Prepare App Store privacy disclosures

### 2. Billing
- Ship one monthly `Annai Pro` subscription
- Finish Apple purchase, restore, and server verification flow
- Finish Google Play purchase, acknowledge, and server verification flow
- Keep AI and Google-backed features behind Pro only
- Ensure paid entitlements survive reinstall and device changes

### 3. Mobile Readiness
- Finalize Capacitor mobile packaging
- Set production bundle IDs and signing
- Verify deep links, auth, and routing on mobile
- Remove any desktop-only or debug-first UX

### 4. Performance and Reliability
- Reduce avoidable auth/bootstrap round trips
- Keep backend cold-start impact as low as possible
- Fix startup blockers before adding more scope
- Log failures without exposing sensitive payloads

### 5. Security
- Keep secure production session settings
- Rate limit login and password reset flows
- Keep account deletion destructive and deliberate
- Replace the security-question reset flow after launch with email or one-time-code recovery

## Timeline

### March 13 to March 16
- Freeze scope
- Create canonical launch blueprint
- Finish support, legal, and deletion URLs
- Tighten auth/session security

### March 17 to March 20
- Finish Apple/Google billing implementation
- Validate restore purchases
- Validate server-side entitlement updates

### March 21 to March 23
- Finalize app metadata
- Finalize screenshots, icon set, support URL, and review notes
- Confirm Google Play target API compliance

### March 24 to March 27
- Run device QA on at least one recent iPhone and one recent Android phone
- Fix launch-blocking bugs only

### March 27 to March 29
- Submit to Apple and Google
- Respond to review feedback immediately

### March 30 to April 1
- Release manually after approval
- Monitor auth, billing, and deletion flows in production

## Launch Checklist

### Must pass before submission
- `npm run check`
- `npm run build`
- Android build succeeds
- iOS build/archive path verified on macOS
- login works
- registration works
- password reset works
- account deletion works
- trip CRUD works
- Pro purchase works
- restore purchase works
- free users cannot trigger paid API calls

### Must be live on the public site
- `/privacy-policy/`
- `/terms-of-service/`
- `/support/`
- `/account-deletion/`

## Immediate Next Build Order

1. Support page and external account deletion page
2. Billing completion
3. Store metadata and submission assets
4. Mobile QA and bug fixing
5. Submission

## Go/No-Go Rule

Do not submit if any of these are still broken:
- purchase or restore flow
- account deletion
- login and session persistence
- public support or legal URLs
- major mobile navigation issues
