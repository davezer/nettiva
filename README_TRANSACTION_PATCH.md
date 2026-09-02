# Nettiva Transaction Layer Patch

This patch bootstraps Nettiva's accounting data from an eBay Seller Hub **Transaction report CSV** while keeping the same normalized ledger that the eBay API will use later.

## What this adds

- Signed financial transactions: credits positive, debits negative.
- Normalized categories for sales, selling fees, shipping labels, refunds, disputes, payouts, adjustments, etc.
- CSV imports that are safe to repeat without blindly duplicating rows.
- Real orders and sold inventory created from the CSV.
- Item-level selling fees and order-linked shipping labels included in true-profit math.
- Payouts stored for reconciliation but excluded from profit.
- Unallocated account-level adjustments retained instead of being falsely assigned to an order.
- API-sync reconciliation hooks so CSV-created rows can be upgraded when eBay API access is approved.
- `/import` page for uploading Seller Hub transaction CSVs.

## Files

### New
- `migrations/0002_transaction_normalization.sql`
- `src/lib/server/finance-normalize.ts`
- `src/lib/server/ebay-csv-import.ts`
- `src/routes/api/ebay/import-transactions/+server.ts`
- `src/routes/import/+page.svelte`
- `scripts/apply-transaction-ui-patch.mjs`
- `scripts/verify-transaction-import.sql`

### Replace
- `src/lib/server/ebay-sync.ts`
- `src/lib/types.ts`
- `src/routes/+page.server.ts`

The UI patch script makes four small changes to the existing `src/routes/+page.svelte` without replacing the whole file.

## Install

From the Nettiva project root, copy the patch contents over the matching folders.

Then run:

```powershell
node .\scripts\apply-transaction-ui-patch.mjs
npx wrangler d1 migrations apply nettiva --local
npm run check
npm run dev
```

Open:

```text
http://localhost:5173/import
```

Upload the eBay Transaction report CSV.

After the local import looks correct, apply the migration to production:

```powershell
npx wrangler d1 migrations apply nettiva --remote
```

If your existing `npm run cf:migrate` script already wraps that remote command, using it is fine instead.

## Expected result for the Sep 2 sample CSV

The provided sample contains:

- 16 report rows
- 7 orders
- 14 itemized selling-fee rows
- 5 shipping-label transactions
- 3 payout transactions
- 2 account-level P&L adjustments that cannot be tied to a specific order:
  - `-$16.96` bulk USPS label purchase
  - `+$2.00` payout-fee credit

Accounting check before inventory COGS:

- Gross customer sales + buyer-paid shipping: **$1,180.67**
- eBay selling fees: **-$170.64**
- Order-linked shipping labels: **-$29.99**
- Sale-level proceeds before COGS: **$980.04**
- Net unallocated account adjustment: **-$14.96**
- Business proceeds before COGS: **$965.08**

Payout transactions are deliberately excluded from P&L because they only move money between eBay and the bank.

## Verify with D1

After importing locally:

```powershell
npx wrangler d1 execute nettiva --local --file .\scripts\verify-transaction-import.sql
```

For production, change `--local` to `--remote`.

## Notes

- Do not subtract selling fees from eBay's `Net amount` a second time. Nettiva stores the sale net for reconciliation, but calculates sale profit from gross order value minus separate fee/label rows.
- Shipping-label rows with an order number are attached to that sale.
- Transactions with no order reference remain account-level adjustments.
- API `bookingEntry=DEBIT` is stored as a negative amount; `CREDIT` is positive.
