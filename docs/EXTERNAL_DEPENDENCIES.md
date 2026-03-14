# Annai External Dependencies Handoff

Last updated: March 13, 2026

This file tracks work that cannot be completed locally in the repo and requires your external accounts, devices, or manual setup.

## Apple Developer / App Store Connect

Status: pending

Required actions:
- confirm Apple Developer membership is active
- create the `Annai Travel Planner` app in App Store Connect
- create the subscription group for `Annai Pro`
- create the monthly subscription product
- verify the product ID exactly matches `annai.pro.monthly.9_99`
- generate screenshots and upload store metadata
- use `docs/APP_STORE_METADATA.md` for the metadata draft
- use `docs/REVIEW_NOTES_TEMPLATE.md` for the review-note draft
- test StoreKit purchase and restore on a real iPhone

Why this is blocked locally:
- requires App Store Connect access
- requires Xcode/macOS device testing

## Google Play Console

Status: pending

Required actions:
- create or confirm the `Annai Travel Planner` app in Play Console
- create the subscription product `annai.pro.monthly.9_99`
- activate the base plan
- complete Data safety, content rating, and app access forms
- use `docs/GOOGLE_PLAY_METADATA.md` for the listing draft
- use `docs/PRIVACY_DISCLOSURES_DRAFT.md` for the data-safety draft
- use `docs/MANUAL_QA_MATRIX.md` as the device test checklist
- test purchase and restore on a real Android device signed into Play

Why this is blocked locally:
- requires Play Console access
- requires production billing product configuration

## Render production secrets

Status: partially complete

Required actions:
- confirm `SESSION_SECRET`
- confirm `SUBSCRIPTION_WEBHOOK_SECRET`
- confirm `GOOGLE_PLAY_PACKAGE_NAME`
- set `GOOGLE_PUBSUB_AUDIENCE`
- set `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL`
- set `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL`
- set `GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY`
- set `APPLE_ROOT_CA_PEM`
- confirm `OPENAI_API_KEY`

Why this is blocked locally:
- production secrets must be set in Render

## Netlify production verification

Status: partially complete

Required actions:
- verify these URLs are live:
  - `/privacy-policy/`
  - `/terms-of-service/`
  - `/support/`
  - `/account-deletion/`
- confirm only the real `annaiapp.com` Netlify project remains

Why this is blocked locally:
- requires Netlify dashboard verification

## Real device QA

Status: pending

Required actions:
- test on at least one recent iPhone
- test on at least one recent Android phone
- verify auth, purchases, restore, trip CRUD, and deletion
- use `docs/MANUAL_QA_MATRIX.md`

Why this is blocked locally:
- requires physical devices and store accounts

## Known local-only limitation

- The iOS billing bridge is implemented in `ios/App/App/AppDelegate.swift`, but it has not been compiled or runtime-tested on macOS yet.
