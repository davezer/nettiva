-- Nettiva Auth & Tenant Enforcement v2
-- Apply after 0006_accounts_workspaces.sql.
--
-- This migration:
-- 1) adds Better Auth's core database schema,
-- 2) links Nettiva application users to auth identities,
-- 3) removes hidden global uniqueness assumptions from eBay identifiers,
--    making them unique inside a workspace instead.

PRAGMA foreign_keys = OFF;

ALTER TABLE users ADD COLUMN auth_user_id TEXT;

CREATE UNIQUE INDEX idx_users_auth_user_unique
  ON users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Better Auth core schema. Better Auth stores SQLite/D1 Date values as
-- millisecond integer timestamps.
CREATE TABLE "user" (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE "session" (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expiresAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX idx_auth_session_user ON "session"(userId);
CREATE INDEX idx_auth_session_expires ON "session"(expiresAt);

CREATE TABLE "account" (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  idToken TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  UNIQUE (issuer, accountId)
);

CREATE INDEX idx_auth_account_user ON "account"(userId);

CREATE TABLE "verification" (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX idx_auth_verification_identifier ON "verification"(identifier);
CREATE INDEX idx_auth_verification_expires ON "verification"(expiresAt);

CREATE TABLE "rateLimit" (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  lastRequest INTEGER NOT NULL
);

CREATE INDEX idx_auth_rate_limit_last_request ON "rateLimit"(lastRequest);

-- Rebuild eBay-owned tables so external identifiers are unique PER workspace,
-- not globally across every Nettiva customer.
-- Drop named indexes before table renames. SQLite keeps index names attached
-- to renamed legacy tables until those tables are dropped.
DROP INDEX IF EXISTS idx_ebay_accounts_workspace;
DROP INDEX IF EXISTS idx_inventory_status;
DROP INDEX IF EXISTS idx_inventory_category;
DROP INDEX IF EXISTS idx_inventory_intake_batch;
DROP INDEX IF EXISTS idx_inventory_workspace_status;
DROP INDEX IF EXISTS idx_listings_inventory_status;
DROP INDEX IF EXISTS idx_listings_workspace_status;
DROP INDEX IF EXISTS idx_orders_created_at_ebay;
DROP INDEX IF EXISTS idx_orders_workspace_created;
DROP INDEX IF EXISTS idx_order_items_order_id;
DROP INDEX IF EXISTS idx_order_items_inventory_id;
DROP INDEX IF EXISTS idx_order_items_sold_at;
DROP INDEX IF EXISTS idx_order_items_workspace_sold;
DROP INDEX IF EXISTS idx_financial_line_item_id;
DROP INDEX IF EXISTS idx_financial_transaction_date;
DROP INDEX IF EXISTS idx_financial_order_id;
DROP INDEX IF EXISTS idx_financial_category;
DROP INDEX IF EXISTS idx_financial_source;
DROP INDEX IF EXISTS idx_financial_import_batch;
DROP INDEX IF EXISTS idx_financial_expense_category;
DROP INDEX IF EXISTS idx_financial_workspace_date;
DROP INDEX IF EXISTS idx_sku_reservation_workspace_prefix;
DROP INDEX IF EXISTS idx_sku_reservation_workspace_source;
DROP INDEX IF EXISTS idx_sku_reservation_workspace_status;
DROP INDEX IF EXISTS idx_sku_reservation_ebay_item;

ALTER TABLE ebay_accounts RENAME TO ebay_accounts_legacy;
ALTER TABLE inventory_items RENAME TO inventory_items_legacy;
ALTER TABLE listings RENAME TO listings_legacy;
ALTER TABLE orders RENAME TO orders_legacy;
ALTER TABLE order_items RENAME TO order_items_legacy;
ALTER TABLE financial_transactions RENAME TO financial_transactions_legacy;
ALTER TABLE sku_reservations RENAME TO sku_reservations_legacy_v2;

CREATE TABLE ebay_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_expires_at INTEGER NOT NULL,
  refresh_token_expires_at INTEGER,
  scopes TEXT NOT NULL,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default'
);

CREATE UNIQUE INDEX idx_ebay_accounts_workspace_unique
  ON ebay_accounts(workspace_id);

CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  sku TEXT,
  ebay_item_id TEXT,
  condition_name TEXT,
  image_url TEXT,
  purchase_cost_cents INTEGER,
  source TEXT,
  storage_location TEXT,
  purchased_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  inventory_category TEXT NOT NULL DEFAULT 'other',
  intake_batch_id TEXT,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  UNIQUE (workspace_id, ebay_item_id)
);

CREATE INDEX idx_inventory_status ON inventory_items(status);
CREATE INDEX idx_inventory_category ON inventory_items(inventory_category);
CREATE INDEX idx_inventory_intake_batch ON inventory_items(intake_batch_id);
CREATE INDEX idx_inventory_workspace_status ON inventory_items(workspace_id, status);
CREATE INDEX idx_inventory_workspace_sku ON inventory_items(workspace_id, sku);

CREATE TABLE listings (
  id TEXT PRIMARY KEY NOT NULL,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  ebay_listing_id TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  quantity INTEGER NOT NULL DEFAULT 1,
  listed_at TEXT,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  view_item_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  UNIQUE (workspace_id, ebay_listing_id)
);

CREATE INDEX idx_listings_inventory_status ON listings(inventory_item_id, status);
CREATE INDEX idx_listings_workspace_status ON listings(workspace_id, status);

CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  ebay_order_id TEXT NOT NULL,
  created_at_ebay TEXT NOT NULL,
  status TEXT NOT NULL,
  gross_total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  UNIQUE (workspace_id, ebay_order_id)
);

CREATE INDEX idx_orders_created_at_ebay ON orders(created_at_ebay);
CREATE INDEX idx_orders_workspace_created ON orders(workspace_id, created_at_ebay);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  inventory_item_id TEXT REFERENCES inventory_items(id),
  ebay_line_item_id TEXT NOT NULL,
  ebay_item_id TEXT,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  sale_price_cents INTEGER NOT NULL DEFAULT 0,
  shipping_charged_cents INTEGER NOT NULL DEFAULT 0,
  sold_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  UNIQUE (workspace_id, ebay_line_item_id)
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_inventory_id ON order_items(inventory_item_id);
CREATE INDEX idx_order_items_sold_at ON order_items(sold_at);
CREATE INDEX idx_order_items_workspace_sold ON order_items(workspace_id, sold_at);

CREATE TABLE financial_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  ebay_transaction_id TEXT NOT NULL,
  ebay_order_id TEXT,
  ebay_line_item_id TEXT,
  transaction_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  transaction_date TEXT NOT NULL,
  fee_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  booking_entry TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  source TEXT NOT NULL DEFAULT 'ebay_api',
  description TEXT,
  payout_id TEXT,
  reference_id TEXT,
  gross_amount_cents INTEGER,
  item_subtotal_cents INTEGER,
  shipping_charged_cents INTEGER,
  ebay_collected_tax_cents INTEGER,
  import_batch_id TEXT,
  expense_category TEXT,
  memo TEXT,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  UNIQUE (workspace_id, ebay_transaction_id)
);

CREATE INDEX idx_financial_line_item_id ON financial_transactions(ebay_line_item_id);
CREATE INDEX idx_financial_transaction_date ON financial_transactions(transaction_date);
CREATE INDEX idx_financial_order_id ON financial_transactions(ebay_order_id);
CREATE INDEX idx_financial_category ON financial_transactions(category);
CREATE INDEX idx_financial_source ON financial_transactions(source);
CREATE INDEX idx_financial_import_batch ON financial_transactions(import_batch_id);
CREATE INDEX idx_financial_expense_category ON financial_transactions(expense_category);
CREATE INDEX idx_financial_workspace_date ON financial_transactions(workspace_id, transaction_date);
CREATE INDEX idx_financial_workspace_order ON financial_transactions(workspace_id, ebay_order_id);
CREATE INDEX idx_financial_workspace_line ON financial_transactions(workspace_id, ebay_line_item_id);

CREATE TABLE sku_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  sku TEXT NOT NULL COLLATE NOCASE,
  prefix TEXT NOT NULL COLLATE NOCASE,
  sequence_number INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual_bootstrap',
  status TEXT NOT NULL DEFAULT 'reserved',
  title TEXT,
  ebay_item_id TEXT,
  inventory_item_id TEXT REFERENCES inventory_items(id),
  reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, sku)
);

CREATE INDEX idx_sku_reservation_workspace_prefix ON sku_reservations(workspace_id, prefix);
CREATE INDEX idx_sku_reservation_workspace_source ON sku_reservations(workspace_id, source);
CREATE INDEX idx_sku_reservation_workspace_status ON sku_reservations(workspace_id, status);
CREATE INDEX idx_sku_reservation_ebay_item ON sku_reservations(ebay_item_id);

INSERT INTO ebay_accounts (
  id, access_token_encrypted, refresh_token_encrypted,
  access_token_expires_at, refresh_token_expires_at, scopes,
  last_synced_at, created_at, updated_at, workspace_id
)
SELECT
  id, access_token_encrypted, refresh_token_encrypted,
  access_token_expires_at, refresh_token_expires_at, scopes,
  last_synced_at, created_at, updated_at, workspace_id
FROM ebay_accounts_legacy;

INSERT INTO inventory_items (
  id, title, sku, ebay_item_id, condition_name, image_url,
  purchase_cost_cents, source, storage_location, purchased_at,
  status, created_at, updated_at, inventory_category, intake_batch_id, workspace_id
)
SELECT
  id, title, sku, ebay_item_id, condition_name, image_url,
  purchase_cost_cents, source, storage_location, purchased_at,
  status, created_at, updated_at, inventory_category, intake_batch_id, workspace_id
FROM inventory_items_legacy;

INSERT INTO listings (
  id, inventory_item_id, ebay_listing_id, price_cents, currency,
  quantity, listed_at, ended_at, status, view_item_url,
  created_at, updated_at, workspace_id
)
SELECT
  id, inventory_item_id, ebay_listing_id, price_cents, currency,
  quantity, listed_at, ended_at, status, view_item_url,
  created_at, updated_at, workspace_id
FROM listings_legacy;

INSERT INTO orders (
  id, ebay_order_id, created_at_ebay, status, gross_total_cents,
  currency, created_at, updated_at, workspace_id
)
SELECT
  id, ebay_order_id, created_at_ebay, status, gross_total_cents,
  currency, created_at, updated_at, workspace_id
FROM orders_legacy;

INSERT INTO order_items (
  id, order_id, inventory_item_id, ebay_line_item_id, ebay_item_id,
  title, quantity, sale_price_cents, shipping_charged_cents,
  sold_at, created_at, updated_at, workspace_id
)
SELECT
  id, order_id, inventory_item_id, ebay_line_item_id, ebay_item_id,
  title, quantity, sale_price_cents, shipping_charged_cents,
  sold_at, created_at, updated_at, workspace_id
FROM order_items_legacy;

INSERT INTO financial_transactions (
  id, ebay_transaction_id, ebay_order_id, ebay_line_item_id,
  transaction_type, amount_cents, currency, transaction_date, fee_type,
  created_at, updated_at, booking_entry, category, source, description,
  payout_id, reference_id, gross_amount_cents, item_subtotal_cents,
  shipping_charged_cents, ebay_collected_tax_cents, import_batch_id,
  expense_category, memo, workspace_id
)
SELECT
  id, ebay_transaction_id, ebay_order_id, ebay_line_item_id,
  transaction_type, amount_cents, currency, transaction_date, fee_type,
  created_at, updated_at, booking_entry, category, source, description,
  payout_id, reference_id, gross_amount_cents, item_subtotal_cents,
  shipping_charged_cents, ebay_collected_tax_cents, import_batch_id,
  expense_category, memo, workspace_id
FROM financial_transactions_legacy;

INSERT INTO sku_reservations (
  id, workspace_id, sku, prefix, sequence_number, source, status,
  title, ebay_item_id, inventory_item_id, reserved_at, updated_at
)
SELECT
  id, workspace_id, sku, prefix, sequence_number, source, status,
  title, ebay_item_id, inventory_item_id, reserved_at, updated_at
FROM sku_reservations_legacy_v2;

DROP TABLE sku_reservations_legacy_v2;
DROP TABLE financial_transactions_legacy;
DROP TABLE order_items_legacy;
DROP TABLE orders_legacy;
DROP TABLE listings_legacy;
DROP TABLE inventory_items_legacy;
DROP TABLE ebay_accounts_legacy;

PRAGMA foreign_keys = ON;
PRAGMA optimize;
