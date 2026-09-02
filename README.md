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
- Previewed, idempotent import of Seller Hub Orders and Active Listings CSV reports
- OAuth tokens encrypted at rest with AES-GCM
- Password protection for every deployed page and API route
- Automatic access-token refresh and sync audit records
- Read-only eBay access — this MVP cannot modify a live listing
- Clearly labeled demo data until eBay is connected

## Run locally

```bash
npm install
npm run dev
```

The UI will use demo data until a D1 binding and eBay credentials are available.
After D1 is configured, CSV reports can replace the demo data even before eBay
developer access is approved. Open **Data & eBay**, choose a report, preview it,
and confirm the import. Orders CSVs do not contain seller fees, so Nettiva labels
their profit as estimated until the Finances API syncs.

For the shortest path from a fresh download to a live app, follow
[`DEPLOY.md`](./DEPLOY.md).

## Cloudflare setup

Create the database:

```bash
npm run cf:create-db
```

Wrangler replaces the all-zero database ID in `wrangler.jsonc` automatically.
Apply the migration:

```bash
npx wrangler d1 migrations apply nettiva --local
npm run cf:migrate
```

Add these secrets in Cloudflare:

```bash
npx wrangler secret put NETTIVA_USERNAME
npx wrangler secret put NETTIVA_PASSWORD
npx wrangler secret put EBAY_CLIENT_ID
npx wrangler secret put EBAY_CLIENT_SECRET
npx wrangler secret put EBAY_REDIRECT_URI
npx wrangler secret put EBAY_TOKEN_ENCRYPTION_KEY
```

Generate the encryption key with:

```bash
openssl rand -base64 32
```

`NETTIVA_USERNAME` and `NETTIVA_PASSWORD` protect the entire deployed app with
browser Basic Authentication. Deployed requests return `503` until both values
exist, so your inventory and profit data cannot accidentally launch publicly.

`EBAY_REDIRECT_URI` is eBay's Redirect URL name (RuName), not the callback URL itself. Point that RuName's accepted URL to:

```text
https://YOUR_NETTIVA_DOMAIN/api/ebay/callback
```

## Build and deploy

```bash
npm run deploy
```

For Cloudflare's Git integration, use `npm run build` as the build command. The Cloudflare adapter produces the Worker in `.svelte-kit/cloudflare`.

## MVP boundaries

- Sync searches the latest 90 days for orders and financial transactions.
- The active-listing import is capped at 5,000 listings per sync.
- Profit equals item revenue plus buyer-paid shipping, minus imported negative eBay transactions and entered COGS.
- Bulk-lot allocation, returns workflow, notifications, and listing mutations belong in the next release.
