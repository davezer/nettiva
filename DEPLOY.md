# Deploy Nettiva

This is the shortest path from the downloaded project to a private, live
Cloudflare Worker. Run every command from the Nettiva project directory.

## 1. Install and sign in

```bash
npm install
npm run cf:login
```

The login command opens Cloudflare in your browser. Nettiva never receives your
Cloudflare password.

## 2. Create the database

```bash
npm run cf:create-db
npm run cf:migrate
```

The first command creates the `nettiva` D1 database and writes its real ID into
`wrangler.jsonc`. The second command creates Nettiva's tables.

## 3. Protect the app

Set a username and a strong password. Wrangler prompts for each value without
putting it in the repository.

```bash
npm run cf:secret:username
npm run cf:secret:password
```

Every deployed page and API route is locked until both secrets exist.

## 4. Deploy the demo-backed shell

```bash
npm run deploy
```

Wrangler prints a URL similar to:

```text
https://nettiva.YOUR_SUBDOMAIN.workers.dev
```

Open it and enter the username and password from step 3. At this stage the app
is live and private, but eBay is not connected yet.

You can already replace the demo data: open **Data & eBay**, upload an eBay
Orders or All Active Listings CSV, review the detected row counts, and confirm.
Re-importing the same report updates existing rows without duplicating them.

## 5. Register the eBay application

1. Create an account at [eBay Developers Program](https://developer.ebay.com/).
2. Create a **Production** keyset.
3. In the production OAuth settings, create a Redirect URL name (RuName).
4. Set its accepted redirect URL to your live callback URL:

```text
https://nettiva.YOUR_SUBDOMAIN.workers.dev/api/ebay/callback
```

The hostname must exactly match the URL Wrangler gave you.

## 6. Add the eBay secrets

Run these commands and enter the production values when prompted:

```bash
npm run cf:secret:ebay-client-id
npm run cf:secret:ebay-client-secret
npm run cf:secret:ebay-redirect-uri
```

For `EBAY_REDIRECT_URI`, enter the **RuName**, not the callback URL.

Generate a 32-byte encryption key:

```bash
openssl rand -base64 32
```

Copy its output, then store it:

```bash
npm run cf:secret:token-key
```

Keep that encryption key in your password manager. Changing or losing it after
eBay is connected makes the stored OAuth tokens unreadable.

## 7. Connect and sync

1. Reload the live Nettiva URL.
2. Select **Connect eBay** and approve the requested read-only scopes.
3. Return to Nettiva and select **Sync eBay**.

The first sync imports active listings, recent orders, and recent financial
transactions. Nettiva remains read-only and cannot revise a live eBay listing.

## Updating later

After replacing files with a newer Nettiva release, deploy again:

```bash
npm install
npm run deploy
```

D1 data and Cloudflare secrets survive code deployments.
