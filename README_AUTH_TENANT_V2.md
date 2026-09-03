# Nettiva Auth & Tenant Enforcement v2

LOCAL-ONLY rollout. Do not apply migration 0007 remotely and do not deploy this release yet.

## What this release changes

- Replaces Nettiva's shared HTTP Basic gate with Better Auth email/password authentication.
- Uses Better Auth's official SvelteKit handler.
- Uses Cloudflare D1 directly as the Better Auth database.
- Secure database-backed sessions and HttpOnly auth cookies.
- D1-backed auth rate limiting.
- Resolves every protected request through:
  Better Auth user -> Nettiva user -> workspace membership -> workspace.
- Fails closed when an authenticated user has no active workspace membership.
- First founder account claims the existing `user_local_owner` and `workspace_default`, preserving local business data.
- Future open signups provision a fresh isolated trial workspace automatically.
- eBay OAuth state is tied to the authenticated workspace.
- eBay token lookup/refresh, sync, and transaction CSV import are workspace-scoped.
- eBay external identifiers become unique per workspace instead of globally.
- New non-founder eBay-backed internal row IDs are workspace-namespaced.
- Data & eBay gains Account & Security + Sign out.

## Signup modes

`NETTIVA_SIGNUP_MODE`:

- `closed` - no new Better Auth accounts can be created.
- `founder` - only the first Better Auth account can be created.
- `open` - new accounts can be created and receive isolated trial workspaces.

Production should stay `closed` until onboarding, verification/reset email, billing, support, abuse controls, and legal flows are ready.

## Local install

### 1. Extract

```powershell
Expand-Archive -Path .\nettiva-auth-tenant-v2.zip -DestinationPath . -Force
```

### 2. Install Better Auth

```powershell
npm install better-auth@1.7.2
```

This updates `package-lock.json` locally.

### 3. Back up local D1 before the structural migration

```powershell
npx wrangler d1 export nettiva --local --output=.\nettiva-local-before-auth-v2.sql
```

### 4. Generate a high-entropy auth secret

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 5. Add these values to `.dev.vars`

Preserve anything already in `.dev.vars`; add:

```dotenv
BETTER_AUTH_SECRET="PASTE_GENERATED_SECRET_HERE"
BETTER_AUTH_URL="http://localhost:5173"
NETTIVA_SIGNUP_MODE="founder"
```

Optional founder email lock:

```dotenv
NETTIVA_FOUNDER_EMAIL="YOUR_EMAIL_ADDRESS"
```

If you set `NETTIVA_FOUNDER_EMAIL`, the first signup must use exactly that email.

### 6. Apply ONLY to local D1

```powershell
npx wrangler d1 migrations apply nettiva --local
```

DO NOT use `--remote` for 0007 yet.

### 7. Check

```powershell
npm run check
```

### 8. Start

```powershell
npm run dev
```

## Expected first run

1. Visiting `/` redirects to `/login`.
2. In founder mode, with zero Better Auth users, login shows founder account creation.
3. Create the account.
4. Better Auth creates the auth identity/session.
5. The first authenticated Nettiva request links that auth user to `user_local_owner`.
6. The existing `workspace_default` membership is retained.
7. Existing inventory, COGS, expenses, reports, and SKU high-water marks remain intact.
8. Data & eBay -> Account & Security displays the signed-in account.
9. Sign out returns to `/login`.
10. Sign back in restores the same workspace and data.

## Local acceptance tests

- Existing Inventory rows are unchanged.
- Existing sales/accounting totals are unchanged.
- SKU manager retains the expected next SKU.
- Add/edit/delete a test unlisted inventory item.
- Add/delete a test business expense.
- Rename workspace and refresh.
- Sign out.
- Direct visit to `/` redirects to `/login`.
- Sign in again.
- Direct unauthenticated API access returns 401.
- Authenticated API access cannot operate without active workspace membership.

## Migration validation performed before packaging

A representative post-0006 SQLite database was migrated through 0007 with existing inventory + COGS and SKU state.

Results:
- `PRAGMA integrity_check` = ok
- `PRAGMA foreign_key_check` = clean
- existing inventory preserved
- SKU high-water mark preserved
- Better Auth core tables created
- D1 rate-limit table created
- duplicate eBay external IDs are allowed across different workspaces

## Deliberately not included yet

- Production signup
- Email verification
- Password-reset email delivery
- Multi-workspace switcher UI
- Team invitations
- Stripe subscriptions
- Production auth deployment/secrets

Those come after this local auth/tenant-isolation pass is proven.
