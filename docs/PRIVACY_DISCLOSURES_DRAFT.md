# Privacy and Data Safety Draft

Last updated: March 13, 2026

This is a working draft for App Store privacy disclosures and Google Play Data safety answers based on the current codebase and public policies. Review before final submission.

## Data Categories Present in the App

### Account data
- username
- password hash
- security question and security answer hash

### User profile data
- preferred language
- home currency
- citizenship

### User content
- trip origin and destination
- trip dates and notes
- itinerary items
- packing list items
- budget items
- travel documents
- booking-import text provided by the user
- Ask Annai prompts and AI request content

### Purchase and entitlement data
- subscription status
- product ID
- expiry dates
- store verification identifiers
- app account token / obfuscated billing identifiers

### Technical and security data
- session cookies
- IP address
- request timing/logging metadata

## Apple App Privacy Draft

Likely categories to disclose:
- Contact Info: no direct required collection in-app at launch, unless support email collection is later added
- Identifiers: yes
- Purchases: yes
- User Content: yes
- Usage Data: limited operational use
- Diagnostics: limited server-side operational logging

Likely linked to user:
- account data
- trip content
- subscription state
- profile data

Likely not used for tracking:
- current app behavior appears not to include third-party advertising or cross-app tracking

## Google Play Data Safety Draft

### Data collected
Likely yes:
- personal info or user identifiers
- financial info related to purchases/subscription state
- app activity and user-generated content

### Data shared
Likely yes, with service providers:
- AI provider for AI requests
- Apple / Google billing ecosystems for purchase validation
- hosting/database providers for service operation

### Purpose examples
- app functionality
- account management
- fraud prevention and security
- subscriptions and purchase validation

### Optional vs required
- core account and trip data are required for app functionality
- AI request content is optional and feature-driven

## Current Evidence in Code

Relevant files:
- `server/auth.ts`
- `server/routes.ts`
- `server/entitlements.ts`
- `shared/schema.ts`
- `client/public/privacy-policy/index.html`

## Manual Review Needed Before Submission

These items still need human confirmation before final store form submission:
- exact Apple privacy questionnaire category mapping
- exact Google Play Data safety form answers
- whether any crash/analytics SDK is added before launch
- whether support flows begin collecting email addresses directly in-app

## External Dependency Note

Final store-form submission must be done manually in:
- App Store Connect
- Google Play Console

If product behavior changes before launch, update this file and the live privacy policy together.
