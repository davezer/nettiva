-- Nettiva Marketplace Foundation v1
-- Apply after 0008_account_lifecycle_onboarding.sql.
--
-- Goal:
--   Move Nettiva from an eBay-specific storage model toward a provider-neutral
--   reseller operating system WITHOUT breaking the proven eBay paths.
--
-- Existing eBay columns remain as compatibility aliases for now.
-- New marketplace_* / external_* fields are canonical for future adapters.

-- Cloudflare D1 runs migrations inside an implicit transaction.
-- PRAGMA foreign_keys=OFF cannot disable FK enforcement there.
-- Defer validation until this table-rebuild migration reaches its final schema.
PRAGMA defer_foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Generic marketplace connections
-- ---------------------------------------------------------------------------

CREATE TABLE marketplace_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_account_id TEXT NOT NULL DEFAULT 'primary',
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'connected',
  connection_method TEXT,
  connected_at TEXT,
  last_synced_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, provider, external_account_id)
);

CREATE INDEX idx_marketplace_accounts_workspace
  ON marketplace_accounts(workspace_id, provider, status);

-- Backfill any existing eBay OAuth connection.
INSERT OR IGNORE INTO marketplace_accounts (
  id,
  workspace_id,
  provider,
  external_account_id,
  display_name,
  status,
  connection_method,
  connected_at,
  last_synced_at,
  created_at,
  updated_at
)
SELECT
  workspace_id || ':marketplace:ebay:primary',
  workspace_id,
  'ebay',
  'primary',
  'eBay',
  'connected',
  'oauth',
  created_at,
  last_synced_at,
  created_at,
  updated_at
FROM ebay_accounts;

-- Mirror future eBay OAuth inserts/refreshes into the generic connection table.
CREATE TRIGGER trg_ebay_accounts_marketplace_insert
AFTER INSERT ON ebay_accounts
BEGIN
  INSERT OR IGNORE INTO marketplace_accounts (
    id, workspace_id, provider, external_account_id, display_name,
    status, connection_method, connected_at, last_synced_at, created_at, updated_at
  )
  VALUES (
    NEW.workspace_id || ':marketplace:ebay:primary',
    NEW.workspace_id,
    'ebay',
    'primary',
    'eBay',
    'connected',
    'oauth',
    NEW.created_at,
    NEW.last_synced_at,
    NEW.created_at,
    NEW.updated_at
  );

  UPDATE marketplace_accounts
  SET
    status = 'connected',
    last_synced_at = NEW.last_synced_at,
    updated_at = NEW.updated_at
  WHERE workspace_id = NEW.workspace_id
    AND provider = 'ebay'
    AND external_account_id = 'primary';
END;

CREATE TRIGGER trg_ebay_accounts_marketplace_update
AFTER UPDATE ON ebay_accounts
BEGIN
  INSERT OR IGNORE INTO marketplace_accounts (
    id, workspace_id, provider, external_account_id, display_name,
    status, connection_method, connected_at, last_synced_at, created_at, updated_at
  )
  VALUES (
    NEW.workspace_id || ':marketplace:ebay:primary',
    NEW.workspace_id,
    'ebay',
    'primary',
    'eBay',
    'connected',
    'oauth',
    NEW.created_at,
    NEW.last_synced_at,
    NEW.created_at,
    NEW.updated_at
  );

  UPDATE marketplace_accounts
  SET
    status = 'connected',
    last_synced_at = NEW.last_synced_at,
    updated_at = NEW.updated_at
  WHERE workspace_id = NEW.workspace_id
    AND provider = 'ebay'
    AND external_account_id = 'primary';
END;

-- ---------------------------------------------------------------------------
-- Rebuild listings with provider-neutral identity.
-- ebay_listing_id remains nullable compatibility data.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_listings_inventory_status;
DROP INDEX IF EXISTS idx_listings_workspace_status;

ALTER TABLE listings RENAME TO listings_pre_marketplace;

CREATE TABLE listings (
  id TEXT PRIMARY KEY NOT NULL,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  ebay_listing_id TEXT,
  marketplace_provider TEXT NOT NULL DEFAULT 'ebay',
  external_listing_id TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  quantity INTEGER NOT NULL DEFAULT 1,
  listed_at TEXT,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  view_item_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default'
);

INSERT INTO listings (
  id, inventory_item_id, ebay_listing_id,
  marketplace_provider, external_listing_id,
  price_cents, currency, quantity, listed_at, ended_at, status,
  view_item_url, created_at, updated_at, workspace_id
)
SELECT
  id, inventory_item_id, ebay_listing_id,
  'ebay', ebay_listing_id,
  price_cents, currency, quantity, listed_at, ended_at, status,
  view_item_url, created_at, updated_at, workspace_id
FROM listings_pre_marketplace;

DROP TABLE listings_pre_marketplace;

CREATE INDEX idx_listings_inventory_status
  ON listings(inventory_item_id, status);

CREATE INDEX idx_listings_workspace_status
  ON listings(workspace_id, status);

CREATE INDEX idx_listings_workspace_provider
  ON listings(workspace_id, marketplace_provider, status);

CREATE UNIQUE INDEX idx_listings_workspace_ebay_unique
  ON listings(workspace_id, ebay_listing_id)
  WHERE ebay_listing_id IS NOT NULL;

CREATE UNIQUE INDEX idx_listings_workspace_external_unique
  ON listings(workspace_id, marketplace_provider, external_listing_id)
  WHERE external_listing_id IS NOT NULL;

-- Existing eBay sync code can continue writing only ebay_listing_id.
CREATE TRIGGER trg_listings_legacy_identity_insert
AFTER INSERT ON listings
WHEN NEW.external_listing_id IS NULL AND NEW.ebay_listing_id IS NOT NULL
BEGIN
  UPDATE listings
  SET
    marketplace_provider = 'ebay',
    external_listing_id = NEW.ebay_listing_id
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_listings_legacy_identity_update
AFTER UPDATE OF ebay_listing_id ON listings
WHEN NEW.ebay_listing_id IS NOT NULL
  AND (NEW.external_listing_id IS NULL OR NEW.marketplace_provider = 'ebay')
BEGIN
  UPDATE listings
  SET
    marketplace_provider = 'ebay',
    external_listing_id = NEW.ebay_listing_id
  WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------------------
-- Rebuild orders with provider-neutral identity.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_orders_created_at_ebay;
DROP INDEX IF EXISTS idx_orders_workspace_created;

ALTER TABLE orders RENAME TO orders_pre_marketplace;

CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  ebay_order_id TEXT,
  marketplace_provider TEXT NOT NULL DEFAULT 'ebay',
  external_order_id TEXT,
  created_at_ebay TEXT NOT NULL,
  status TEXT NOT NULL,
  gross_total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default'
);

INSERT INTO orders (
  id, ebay_order_id, marketplace_provider, external_order_id,
  created_at_ebay, status, gross_total_cents, currency,
  created_at, updated_at, workspace_id
)
SELECT
  id, ebay_order_id, 'ebay', ebay_order_id,
  created_at_ebay, status, gross_total_cents, currency,
  created_at, updated_at, workspace_id
FROM orders_pre_marketplace;

DROP TABLE orders_pre_marketplace;

CREATE INDEX idx_orders_created_at_ebay
  ON orders(created_at_ebay);

CREATE INDEX idx_orders_workspace_created
  ON orders(workspace_id, created_at_ebay);

CREATE INDEX idx_orders_workspace_provider_created
  ON orders(workspace_id, marketplace_provider, created_at_ebay);

CREATE UNIQUE INDEX idx_orders_workspace_ebay_unique
  ON orders(workspace_id, ebay_order_id)
  WHERE ebay_order_id IS NOT NULL;

CREATE UNIQUE INDEX idx_orders_workspace_external_unique
  ON orders(workspace_id, marketplace_provider, external_order_id)
  WHERE external_order_id IS NOT NULL;

CREATE TRIGGER trg_orders_legacy_identity_insert
AFTER INSERT ON orders
WHEN NEW.external_order_id IS NULL AND NEW.ebay_order_id IS NOT NULL
BEGIN
  UPDATE orders
  SET
    marketplace_provider = 'ebay',
    external_order_id = NEW.ebay_order_id
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_orders_legacy_identity_update
AFTER UPDATE OF ebay_order_id ON orders
WHEN NEW.ebay_order_id IS NOT NULL
  AND (NEW.external_order_id IS NULL OR NEW.marketplace_provider = 'ebay')
BEGIN
  UPDATE orders
  SET
    marketplace_provider = 'ebay',
    external_order_id = NEW.ebay_order_id
  WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------------------
-- Rebuild order items with provider-neutral identity.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_order_items_order_id;
DROP INDEX IF EXISTS idx_order_items_inventory_id;
DROP INDEX IF EXISTS idx_order_items_sold_at;
DROP INDEX IF EXISTS idx_order_items_workspace_sold;

ALTER TABLE order_items RENAME TO order_items_pre_marketplace;

CREATE TABLE order_items (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  inventory_item_id TEXT REFERENCES inventory_items(id),
  ebay_line_item_id TEXT,
  ebay_item_id TEXT,
  marketplace_provider TEXT NOT NULL DEFAULT 'ebay',
  external_line_item_id TEXT,
  external_item_id TEXT,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  sale_price_cents INTEGER NOT NULL DEFAULT 0,
  shipping_charged_cents INTEGER NOT NULL DEFAULT 0,
  sold_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default'
);

INSERT INTO order_items (
  id, order_id, inventory_item_id,
  ebay_line_item_id, ebay_item_id,
  marketplace_provider, external_line_item_id, external_item_id,
  title, quantity, sale_price_cents, shipping_charged_cents,
  sold_at, created_at, updated_at, workspace_id
)
SELECT
  id, order_id, inventory_item_id,
  ebay_line_item_id, ebay_item_id,
  'ebay', ebay_line_item_id, ebay_item_id,
  title, quantity, sale_price_cents, shipping_charged_cents,
  sold_at, created_at, updated_at, workspace_id
FROM order_items_pre_marketplace;

DROP TABLE order_items_pre_marketplace;

CREATE INDEX idx_order_items_order_id
  ON order_items(order_id);

CREATE INDEX idx_order_items_inventory_id
  ON order_items(inventory_item_id);

CREATE INDEX idx_order_items_sold_at
  ON order_items(sold_at);

CREATE INDEX idx_order_items_workspace_sold
  ON order_items(workspace_id, sold_at);

CREATE INDEX idx_order_items_workspace_provider_sold
  ON order_items(workspace_id, marketplace_provider, sold_at);

CREATE UNIQUE INDEX idx_order_items_workspace_ebay_unique
  ON order_items(workspace_id, ebay_line_item_id)
  WHERE ebay_line_item_id IS NOT NULL;

CREATE UNIQUE INDEX idx_order_items_workspace_external_unique
  ON order_items(workspace_id, marketplace_provider, external_line_item_id)
  WHERE external_line_item_id IS NOT NULL;

CREATE TRIGGER trg_order_items_legacy_identity_insert
AFTER INSERT ON order_items
WHEN NEW.external_line_item_id IS NULL AND NEW.ebay_line_item_id IS NOT NULL
BEGIN
  UPDATE order_items
  SET
    marketplace_provider = 'ebay',
    external_line_item_id = NEW.ebay_line_item_id,
    external_item_id = COALESCE(NEW.external_item_id, NEW.ebay_item_id)
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_order_items_legacy_identity_update
AFTER UPDATE OF ebay_line_item_id, ebay_item_id ON order_items
WHEN NEW.ebay_line_item_id IS NOT NULL
  AND (NEW.external_line_item_id IS NULL OR NEW.marketplace_provider = 'ebay')
BEGIN
  UPDATE order_items
  SET
    marketplace_provider = 'ebay',
    external_line_item_id = NEW.ebay_line_item_id,
    external_item_id = COALESCE(NEW.ebay_item_id, external_item_id)
  WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------------------
-- Rebuild financial transactions with provider-neutral identity.
-- Manual business expenses are deliberately provider=manual.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_financial_line_item_id;
DROP INDEX IF EXISTS idx_financial_transaction_date;
DROP INDEX IF EXISTS idx_financial_order_id;
DROP INDEX IF EXISTS idx_financial_category;
DROP INDEX IF EXISTS idx_financial_source;
DROP INDEX IF EXISTS idx_financial_import_batch;
DROP INDEX IF EXISTS idx_financial_expense_category;
DROP INDEX IF EXISTS idx_financial_workspace_date;
DROP INDEX IF EXISTS idx_financial_workspace_order;
DROP INDEX IF EXISTS idx_financial_workspace_line;

ALTER TABLE financial_transactions RENAME TO financial_transactions_pre_marketplace;

CREATE TABLE financial_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  ebay_transaction_id TEXT,
  ebay_order_id TEXT,
  ebay_line_item_id TEXT,

  marketplace_provider TEXT NOT NULL DEFAULT 'ebay',
  external_transaction_id TEXT,
  external_order_id TEXT,
  external_line_item_id TEXT,

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
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default'
);

INSERT INTO financial_transactions (
  id,
  ebay_transaction_id, ebay_order_id, ebay_line_item_id,
  marketplace_provider,
  external_transaction_id, external_order_id, external_line_item_id,
  transaction_type, amount_cents, currency, transaction_date, fee_type,
  created_at, updated_at, booking_entry, category, source, description,
  payout_id, reference_id, gross_amount_cents, item_subtotal_cents,
  shipping_charged_cents, ebay_collected_tax_cents, import_batch_id,
  expense_category, memo, workspace_id
)
SELECT
  id,
  ebay_transaction_id, ebay_order_id, ebay_line_item_id,
  CASE WHEN source = 'manual' THEN 'manual' ELSE 'ebay' END,
  ebay_transaction_id, ebay_order_id, ebay_line_item_id,
  transaction_type, amount_cents, currency, transaction_date, fee_type,
  created_at, updated_at, booking_entry, category, source, description,
  payout_id, reference_id, gross_amount_cents, item_subtotal_cents,
  shipping_charged_cents, ebay_collected_tax_cents, import_batch_id,
  expense_category, memo, workspace_id
FROM financial_transactions_pre_marketplace;

DROP TABLE financial_transactions_pre_marketplace;

CREATE INDEX idx_financial_line_item_id
  ON financial_transactions(ebay_line_item_id);

CREATE INDEX idx_financial_transaction_date
  ON financial_transactions(transaction_date);

CREATE INDEX idx_financial_order_id
  ON financial_transactions(ebay_order_id);

CREATE INDEX idx_financial_category
  ON financial_transactions(category);

CREATE INDEX idx_financial_source
  ON financial_transactions(source);

CREATE INDEX idx_financial_import_batch
  ON financial_transactions(import_batch_id);

CREATE INDEX idx_financial_expense_category
  ON financial_transactions(expense_category);

CREATE INDEX idx_financial_workspace_date
  ON financial_transactions(workspace_id, transaction_date);

CREATE INDEX idx_financial_workspace_order
  ON financial_transactions(workspace_id, ebay_order_id);

CREATE INDEX idx_financial_workspace_line
  ON financial_transactions(workspace_id, ebay_line_item_id);

CREATE INDEX idx_financial_workspace_provider_date
  ON financial_transactions(workspace_id, marketplace_provider, transaction_date);

CREATE INDEX idx_financial_workspace_external_order
  ON financial_transactions(workspace_id, marketplace_provider, external_order_id);

CREATE INDEX idx_financial_workspace_external_line
  ON financial_transactions(workspace_id, marketplace_provider, external_line_item_id);

CREATE UNIQUE INDEX idx_financial_workspace_ebay_unique
  ON financial_transactions(workspace_id, ebay_transaction_id)
  WHERE ebay_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX idx_financial_workspace_external_unique
  ON financial_transactions(workspace_id, marketplace_provider, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

CREATE TRIGGER trg_financial_legacy_identity_insert
AFTER INSERT ON financial_transactions
WHEN NEW.external_transaction_id IS NULL
  AND NEW.ebay_transaction_id IS NOT NULL
BEGIN
  UPDATE financial_transactions
  SET
    marketplace_provider = CASE
      WHEN NEW.source = 'manual' THEN 'manual'
      ELSE 'ebay'
    END,
    external_transaction_id = NEW.ebay_transaction_id,
    external_order_id = COALESCE(NEW.external_order_id, NEW.ebay_order_id),
    external_line_item_id = COALESCE(NEW.external_line_item_id, NEW.ebay_line_item_id)
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_financial_legacy_identity_update
AFTER UPDATE OF ebay_transaction_id, ebay_order_id, ebay_line_item_id, source
ON financial_transactions
WHEN NEW.ebay_transaction_id IS NOT NULL
  AND (
    NEW.external_transaction_id IS NULL
    OR NEW.marketplace_provider IN ('ebay', 'manual')
  )
BEGIN
  UPDATE financial_transactions
  SET
    marketplace_provider = CASE
      WHEN NEW.source = 'manual' THEN 'manual'
      ELSE 'ebay'
    END,
    external_transaction_id = NEW.ebay_transaction_id,
    external_order_id = COALESCE(NEW.ebay_order_id, external_order_id),
    external_line_item_id = COALESCE(NEW.ebay_line_item_id, external_line_item_id)
  WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------------------
-- Provider-tag import/sync jobs.
-- Existing rows are eBay. Future Whatnot adapter writes provider=whatnot.
-- ---------------------------------------------------------------------------

ALTER TABLE import_batches
  ADD COLUMN marketplace_provider TEXT NOT NULL DEFAULT 'ebay';

ALTER TABLE sync_jobs
  ADD COLUMN marketplace_provider TEXT NOT NULL DEFAULT 'ebay';

CREATE INDEX idx_import_batches_workspace_provider
  ON import_batches(workspace_id, marketplace_provider, imported_at);

CREATE INDEX idx_sync_jobs_workspace_provider
  ON sync_jobs(workspace_id, marketplace_provider, started_at);

-- Force validation now that all parent/child tables point at their final names.
PRAGMA defer_foreign_keys = OFF;
PRAGMA optimize;
