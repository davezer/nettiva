-- Sellquity Category Expansion v1
-- LOCAL ONLY until validated.

CREATE TABLE custom_inventory_categories (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  label TEXT NOT NULL COLLATE NOCASE,
  sku_prefix TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, label),
  UNIQUE (workspace_id, sku_prefix)
);

CREATE INDEX idx_custom_inventory_categories_workspace
  ON custom_inventory_categories(workspace_id, created_at);

PRAGMA optimize;
