# Nettiva MVP

Nettiva is a read-only eBay inventory and profit dashboard built with **SvelteKit 2**, **Svelte 5**, Cloudflare Workers, and D1.

## What is included

- Dashboard with gross sales, net profit, true margin, inventory value, and listing age
- Searchable inventory with active, unlisted, and sold filters
- Durable cost, source, and storage-location editing
- Sold-item profit, margin, and ROI calculations
- Active listing import through eBay's Trading API
- Recent order import through eBay's Fulfillment API
- Actual eBay financial transaction import through the Finances API
- OAuth tokens encrypted at rest with AES-GCM
- Automatic access-token refresh and sync audit records
- Read-only eBay access — this MVP cannot modify a live listing
- Clearly labeled demo data until eBay is connected

## Run locally

```bash
npm install
npm run dev
```

The UI will use demo data until a D1 binding and eBay credentials are available.

## Cloudflare setup

Create the database:

```bash
npx wrangler d1 create nettiva
```

Copy the returned database ID into `wrangler.jsonc`, replacing the all-zero placeholder. Apply the migration:

```bash
npx wrangler d1 migrations apply nettiva --local
npx wrangler d1 migrations apply nettiva --remote
```

Add these secrets in Cloudflare:

```bash
npx wrangler secret put EBAY_CLIENT_ID
npx wrangler secret put EBAY_CLIENT_SECRET
npx wrangler secret put EBAY_REDIRECT_URI
npx wrangler secret put EBAY_TOKEN_ENCRYPTION_KEY
```

Generate the encryption key with:

```bash
openssl rand -base64 32
```

`EBAY_REDIRECT_URI` is eBay's Redirect URL name (RuName), not the callback URL itself. Point that RuName's accepted URL to:

```text
https://YOUR_NETTIVA_DOMAIN/api/ebay/callback
```

## Build and deploy

```bash
npm run check
npm run build
npx wrangler deploy
```

For Cloudflare's Git integration, use `npm run build` as the build command. The Cloudflare adapter produces the Worker in `.svelte-kit/cloudflare`.

## MVP boundaries

- Sync searches the latest 90 days for orders and financial transactions.
- The active-listing import is capped at 5,000 listings per sync.
- Profit equals item revenue plus buyer-paid shipping, minus imported negative eBay transactions and entered COGS.
- CSV history import, bulk-lot allocation, returns workflow, notifications, and listing mutations belong in the next release.
