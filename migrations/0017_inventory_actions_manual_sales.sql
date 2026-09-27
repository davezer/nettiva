-- Sellquity Inventory Actions + Manual Sales v1
-- Apply after 0016_scale_integrity.sql.

CREATE TABLE inventory_dispositions (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL,
  disposition_type TEXT NOT NULL CHECK (disposition_type IN ('donated', 'damaged')),
  occurred_at TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_dispositions_workspace_item
  ON inventory_dispositions(workspace_id, inventory_item_id, occurred_at DESC);

CREATE TABLE inventory_cost_adjustments (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('expense', 'credit')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  occurred_at TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_cost_adjustments_workspace_item
  ON inventory_cost_adjustments(workspace_id, inventory_item_id, occurred_at DESC);

CREATE TABLE manual_sale_metadata (
  order_item_id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  channel_label TEXT NOT NULL,
  tracking_number TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_manual_sale_metadata_workspace_channel
  ON manual_sale_metadata(workspace_id, channel_label, created_at DESC);

PRAGMA optimize;
