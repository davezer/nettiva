-- Sellquity LOCAL business-data reset.
-- This file is intentionally executed only by scripts/reset-business-data.mjs
-- with `wrangler d1 execute nettiva --local`.
--
-- PRESERVED:
--   Better Auth tables, users, workspaces, memberships, account lifecycle data,
--   eBay OAuth credentials / account row, schema, migrations.
--
-- DELETED:
--   inventory, listings, orders, transactions, imports, marketplace ledgers,
--   purchase lots, SKU state, custom categories, Whatnot connection metadata.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

DELETE FROM marketplace_balance_entries;
DELETE FROM financial_transactions;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM listings;
DELETE FROM sku_reservations;
DELETE FROM sku_sequences;
DELETE FROM purchase_lots;
DELETE FROM inventory_items;
DELETE FROM import_batches;
DELETE FROM sync_jobs;
DELETE FROM custom_inventory_categories;

-- Keep a real/pending eBay connection if one exists, but remove parked/test
-- marketplace providers from the clean personal-eBay workspace.
DELETE FROM marketplace_accounts
WHERE provider <> 'ebay';

-- The business dataset is fresh, so old API sync timestamps should not pretend
-- the new dataset was synced on those dates. Credentials remain untouched.
UPDATE ebay_accounts
SET last_synced_at = NULL,
    updated_at = CURRENT_TIMESTAMP;

UPDATE marketplace_accounts
SET last_synced_at = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE provider = 'ebay';

COMMIT;

PRAGMA foreign_keys = ON;
PRAGMA optimize;
