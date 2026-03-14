# Annai Security Hardening Blueprint

## Goal
Lock down account and trip data paths before pentesting by removing high-impact access control gaps, tightening privileged operations, and improving auth abuse resistance.

## Scope
- Backend API security controls only.
- No feature/product behavior changes outside security requirements.
- Keep compatibility with current web/mobile clients.

## Phase 1: Access Control (Critical)
- Enforce ownership checks on all trip child resources:
  - packing lists
  - budget items
  - travel documents
  - itinerary items
- Ensure list/create endpoints with `tripId` verify `trip.userId === req.user.id` before data access.
- Ensure update/delete endpoints with item `id` verify the item's parent trip ownership before mutation.
- Return `404` for unauthorized/nonexistent records to avoid object existence leakage.

### Acceptance
- Authenticated user cannot read, edit, or delete another user's trip child resources by changing IDs.
- All affected endpoints return `404` for cross-user IDs.

## Phase 2: Privileged Operations (Critical)
- Lock `/api/subscription/mock-update`:
  - disabled in production unless explicit env override is enabled
  - restricted to owner account (`OWNER_USERNAME`)
  - optional secondary secret check (`OWNER_API_SECRET` via `x-owner-secret`)

### Acceptance
- Non-owner requests are rejected.
- Production rejects endpoint by default without explicit override.

## Phase 3: Auth + Recovery Hardening (High)
- Increase minimum password length from `6` to `10` for registration and reset.
- Reduce account enumeration in forgot-password question flow by using a generic response.
- Keep reset failure responses generic.

### Acceptance
- Registration/reset reject passwords shorter than 10.
- Forgot-password question endpoint does not reveal account existence via status/message.

## Phase 4: Abuse Controls (High/Medium)
- Add rate limiting to:
  - coupon redemption
  - AI endpoints (packing, trip plan, safety, assistant, etc.)
- Use per-user/IP keys where available.

### Acceptance
- Excessive request bursts return `429` with `Retry-After`.
- Limits apply consistently across all protected routes.

## Phase 5: Session and Headers (Medium)
- Destroy session store on logout and clear session cookie.
- Add CSP response header in production with a practical policy baseline.

### Acceptance
- Logout invalidates the server session and cookie.
- Production responses include CSP.

## Phase 6: Dependency Hygiene (Medium)
- Run `npm audit fix` and retest.
- If unresolved advisories remain, document and pin mitigation plan.

### Acceptance
- Audit report reduced and residual risk documented.

## Environment Variables
- `OWNER_USERNAME` (required for owner-protected ops)
- `OWNER_API_SECRET` (optional secondary owner gate)
- `ALLOW_MOCK_SUBSCRIPTION_UPDATES` (`true` to enable in production)

## Verification Checklist
- `npm run check`
- `npm run build`
- Manual API tests:
  - cross-account ID probes for all trip child resource endpoints
  - mock update endpoint access as owner vs non-owner
  - forgot-password question behavior
  - rate limit behavior (`429`, `Retry-After`)
  - logout invalidates session
