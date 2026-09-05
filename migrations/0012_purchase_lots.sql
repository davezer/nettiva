-- Sellquity Purchase Lots / Intake Sessions v1
-- LOCAL ONLY until validated.
-- Apply after 0011_listing_prep.sql.

CREATE TABLE purchase_lots (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  label TEXT NOT NULL,
  source TEXT,
  purchased_at TEXT,
  purchase_price_cents INTEGER NOT NULL DEFAULT 0,
  tax_fees_cents INTEGER NOT NULL DEFAULT 0,
  inbound_shipping_cents INTEGER NOT NULL DEFAULT 0,
  total_cost_cents INTEGER NOT NULL DEFAULT 0,
  default_location TEXT,
  notes TEXT,
  allocation_mode TEXT NOT NULL DEFAULT 'equal',
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_purchase_lots_workspace_date
  ON purchase_lots(workspace_id, purchased_at);

CREATE INDEX idx_purchase_lots_workspace_created
  ON purchase_lots(workspace_id, created_at);

ALTER TABLE inventory_items ADD COLUMN purchase_lot_id TEXT;

CREATE INDEX idx_inventory_purchase_lot
  ON inventory_items(workspace_id, purchase_lot_id);

PRAGMA optimize;
