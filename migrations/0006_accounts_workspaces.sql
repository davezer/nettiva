-- Nettiva Accounts & Workspaces v1
-- Tenant foundation. Existing single-seller data is preserved in workspace_default.
-- Apply after 0005_sku_control.sql.

PRAGMA foreign_keys = OFF;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_users_email_unique
  ON users(LOWER(email))
  WHERE email IS NOT NULL;

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'founder',
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

INSERT OR IGNORE INTO users (id, display_name, status)
VALUES ('user_local_owner', 'Owner', 'active');

INSERT OR IGNORE INTO workspaces (
  id, name, slug, plan, status, created_by_user_id
) VALUES (
  'workspace_default', 'Primary Workspace', 'primary-workspace', 'founder', 'active', 'user_local_owner'
);

INSERT OR IGNORE INTO workspace_members (
  workspace_id, user_id, role, status
) VALUES (
  'workspace_default', 'user_local_owner', 'owner', 'active'
);

-- Add tenant ownership to every existing business-data table. The DEFAULT is
-- intentional: legacy code paths stay attached to the founder workspace until
-- they are explicitly made multi-workspace aware.
ALTER TABLE ebay_accounts ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'workspace_default';
ALTER TABLE inventory_items ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'workspace_default';
ALTER TABLE listings ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'workspace_default';
ALTER TABLE orders ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'workspace_default';
ALTER TABLE order_items ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'workspace_default';
ALTER TABLE financial_transactions ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'workspace_default';
ALTER TABLE sync_jobs ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'workspace_default';
ALTER TABLE import_batches ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'workspace_default';

CREATE INDEX idx_ebay_accounts_workspace ON ebay_accounts(workspace_id);
CREATE INDEX idx_inventory_workspace_status ON inventory_items(workspace_id, status);
CREATE INDEX idx_listings_workspace_status ON listings(workspace_id, status);
CREATE INDEX idx_orders_workspace_created ON orders(workspace_id, created_at_ebay);
CREATE INDEX idx_order_items_workspace_sold ON order_items(workspace_id, sold_at);
CREATE INDEX idx_financial_workspace_date ON financial_transactions(workspace_id, transaction_date);
CREATE INDEX idx_sync_jobs_workspace_started ON sync_jobs(workspace_id, started_at);
CREATE INDEX idx_import_batches_workspace_imported ON import_batches(workspace_id, imported_at);

-- SKU identity must be isolated by workspace. Different sellers are allowed to
-- use the same AFG-0001 / MOV-0001 labels without colliding with each other.
ALTER TABLE sku_sequences RENAME TO sku_sequences_legacy;
CREATE TABLE sku_sequences (
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  prefix TEXT NOT NULL COLLATE NOCASE,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, prefix)
);
INSERT INTO sku_sequences (workspace_id, prefix, last_number, updated_at)
SELECT 'workspace_default', prefix, last_number, updated_at
FROM sku_sequences_legacy;
DROP TABLE sku_sequences_legacy;

ALTER TABLE sku_reservations RENAME TO sku_reservations_legacy;
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
INSERT INTO sku_reservations (
  id, workspace_id, sku, prefix, sequence_number, source, status,
  title, ebay_item_id, inventory_item_id, reserved_at, updated_at
)
SELECT
  id, 'workspace_default', sku, prefix, sequence_number, source, status,
  title, ebay_item_id, inventory_item_id, reserved_at, updated_at
FROM sku_reservations_legacy;
DROP TABLE sku_reservations_legacy;

CREATE INDEX idx_sku_sequence_workspace ON sku_sequences(workspace_id, prefix);
CREATE INDEX idx_sku_reservation_workspace_prefix ON sku_reservations(workspace_id, prefix);
CREATE INDEX idx_sku_reservation_workspace_source ON sku_reservations(workspace_id, source);
CREATE INDEX idx_sku_reservation_workspace_status ON sku_reservations(workspace_id, status);
CREATE INDEX idx_sku_reservation_ebay_item ON sku_reservations(ebay_item_id);

PRAGMA foreign_keys = ON;
PRAGMA optimize;
