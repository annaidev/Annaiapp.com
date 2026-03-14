# Annai Travel Planner Store Submission Checklist

Last updated: March 13, 2026

## Public URLs

Use these in store metadata:
- Website: `https://annaiapp.com`
- Privacy Policy: `https://annaiapp.com/privacy-policy/`
- Terms of Service: `https://annaiapp.com/terms-of-service/`
- Support: `https://annaiapp.com/support/`
- Account Deletion: `https://annaiapp.com/account-deletion/`

## Product Summary

- App name: `Annai Travel Planner`
- Bundle/package ID: `com.annai.travelplanner`
- Primary paid product: `Annai Pro`
- Subscription cadence: monthly
- Store product ID: `annai.pro.monthly.9_99`

## App Store Connect

### App metadata
- App name
- Subtitle
- Promotional text
- Description
- Keywords
- Support URL
- Marketing URL if used
- Privacy Policy URL

### Screenshots
- iPhone 6.9"
- iPhone 6.5"
- Optional iPad if you support it

Suggested screenshot set:
1. Trip dashboard
2. Itinerary builder
3. Budget tracker
4. Document vault
5. Destination Info / Ask Annai
6. Pricing / Annai Pro

### App Review notes
- Explain that `Annai Pro` is the single monthly subscription.
- Explain where the pricing screen is found.
- Provide a test account if review needs login.
- Mention in-app account deletion exists on the Account page.

### Subscription setup
- Create one subscription group
- Create `Annai Pro Monthly`
- Product ID: `annai.pro.monthly.9_99`
- Add review screenshot for the subscription
- Make sure restore purchases is available in app

## Google Play Console

### Store listing
- App name
- Short description
- Full description
- Support email
- Privacy Policy URL

### Screenshots
- Android phone screenshots
- Feature graphic
- App icon

### App content forms
- Data safety
- App access if review needs login
- Ads declaration
- Content rating
- Target audience
- News declaration if applicable

### Subscription setup
- Create one subscription: `Annai Pro Monthly`
- Product ID: `annai.pro.monthly.9_99`
- Confirm base plan is active
- Confirm billing country availability

## Functional QA Before Submission

- Sign up
- Login
- Logout
- Password reset
- Account deletion
- Trip create/edit/delete
- Packing list CRUD
- Budget CRUD
- Document CRUD
- Itinerary CRUD
- Destination Info tools
- Ask Annai
- Customs & Entry
- Gift code redemption
- Free gates block paid APIs
- Pro purchase works
- Restore purchases works

## Release Readiness

- `npm run check`
- `npm run build`
- `npm run release:check`
- `npm run mobile:android:build`
- iOS build/archive verified on macOS
- Render production env vars configured
- Netlify production URLs confirmed live
- Store billing products created and active
