# Nettiva Account Recovery & Onboarding v3

LOCAL-ONLY acceptance release. Do not apply migration 0008 remotely and do not deploy this release yet.

## What this adds

### Account lifecycle
- Better Auth email verification wiring.
- Forgot-password request flow.
- Secure password-reset page.
- Password reset revokes existing sessions.
- Change password with current-password verification.
- Change login email using Better Auth's verification flow.
- Profile/name update.
- Account & Security page at `/account`.
- Non-destructive seven-day account-deletion request/cancel groundwork.
- Main Data & eBay account card now links to Account & Security.

### Transactional email abstraction
- Local D1 auth outbox for development.
- Local mailbox UI at `/dev/mailbox`.
- Mailbox route is only available on localhost / 127.0.0.1 / ::1.
- Optional Resend delivery mode for future production without adding another npm dependency.
- Production does NOT silently fall back to the local outbox.

### Onboarding
- Workspace onboarding state machine.
- Existing workspaces are grandfathered as complete, so this migration does not lock Dave out.
- New future workspaces default to onboarding step 1.
- Step 1: business/workspace identity + country/currency.
- Step 2: eBay connection or "do this later".
- Step 3: inventory/SKU identity review.
- Incomplete new workspaces are routed to `/onboarding` before business screens/APIs.
- eBay OAuth connect/callback remains allowed during onboarding.
- Account page can restart onboarding for testing.

### Tenant/account hardening
- Better Auth name/email changes are synchronized into Nettiva's application user record on authenticated requests.
- Email-verification enforcement can be switched on with an environment flag.
- When verification enforcement is enabled, unverified sessions can reach Account & Security but not seller data APIs.

## Local install

### 1. Extract

```powershell
Expand-Archive -Path .\nettiva-account-lifecycle-v3.zip -DestinationPath . -Force
```

### 2. Back up local D1

```powershell
npx wrangler d1 export nettiva --local --output=.\nettiva-local-before-account-v3.sql
```

### 3. Add local email settings to `.dev.vars`

Keep your existing values and add:

```dotenv
NETTIVA_AUTH_EMAIL_MODE="outbox"
NETTIVA_REQUIRE_EMAIL_VERIFICATION="false"
```

`outbox` means Nettiva captures verification/reset links in local D1 instead of sending real email.

Keep verification enforcement false for the first test. Your existing founder auth user was created before email verification existed and may currently be unverified.

### 4. Apply migration 0008 LOCAL ONLY

```powershell
npx wrangler d1 migrations apply nettiva --local
```

DO NOT use `--remote` yet.

### 5. Check

```powershell
npm run check
```

### 6. Start

```powershell
npm run dev
```

## Acceptance test

### A. Verify the current account
1. Open Nettiva and go to Data & eBay.
2. Click **Manage account**.
3. The account page should show the current email as unverified if it has never been verified.
4. Click **Send verification**.
5. Open `/dev/mailbox`.
6. Open the newest verification action link.
7. Return to `/account` and confirm the email is now verified.

### B. Password recovery
1. Sign out.
2. Open `/forgot-password`.
3. Enter the current Nettiva login email.
4. Open `/dev/mailbox` and click the password-reset action.
5. Set a new 12+ character password.
6. Sign in with the new password.
7. Confirm old sessions were revoked.

### C. Account settings
1. Change the display name and reload.
2. Change password using the current password.
3. Do not change the real login email unless you intentionally want to test that flow; it requires completing security email steps.

### D. Onboarding
1. Open `/account`.
2. Click **Run onboarding again**.
3. Step 1 should prefill the existing workspace name.
4. Continue to eBay.
5. Because API approval is still pending, choose **Do this later**.
6. Review the inventory/SKU identity step.
7. Finish onboarding.
8. Nettiva should return to the existing dashboard with all inventory/accounting/SKU data intact.

### E. Deletion groundwork
1. On `/account`, type `DELETE` and request deletion.
2. Confirm the UI reports a seven-day hold date and explicitly says no data is auto-deleted in v3.
3. Cancel the request.

## Optional verification-enforcement test

Only after the current email is verified, change `.dev.vars` to:

```dotenv
NETTIVA_REQUIRE_EMAIL_VERIFICATION="true"
```

Restart `npm run dev`. Verified accounts should work normally. An unverified account/session should be blocked from business data and directed to Account & Security.

## Future production email configuration

The server already supports Resend mode via its HTTP API. Do not configure this yet unless we intentionally move auth email toward production.

```dotenv
NETTIVA_AUTH_EMAIL_MODE="resend"
NETTIVA_AUTH_EMAIL_FROM="Nettiva <account@your-domain.com>"
RESEND_API_KEY="..."
NETTIVA_REQUIRE_EMAIL_VERIFICATION="true"
```

Production signup should remain `NETTIVA_SIGNUP_MODE="closed"` until billing, support, legal/retention, and production eBay onboarding are ready.

## Deliberately not destructive yet

`account_deletion_requests` is groundwork, not an automatic purge worker. That is intentional. Before real account deletion exists we need to define:
- export-before-delete behavior,
- owned workspace handling,
- tax/accounting retention rules,
- Stripe cancellation/refunds,
- eBay OAuth revocation,
- backup purge timing,
- support/admin recovery window.

## Validation performed before packaging

- Migration 0008 executed against a representative post-0007 SQLite schema.
- Existing workspace -> onboarding `complete`.
- Newly created workspace -> onboarding `workspace`.
- `PRAGMA integrity_check` -> `ok`.
- Local outbox and deletion-request tables created.
- TypeScript portions of every `.ts` file and every Svelte `<script>` block passed syntax transpilation.

The user's real local `npm run check` remains the authoritative Svelte/Better Auth type gate.
