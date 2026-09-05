-- Sellquity Category Manager Polish v1
-- LOCAL ONLY until validated.
--
-- Built-in category identities stay stable in code.
-- Workspaces can override:
--   1) whether a built-in is available for NEW inventory assignments
--   2) the default SKU prefix used for NEW inventory
--
-- Existing inventory categories and existing SKUs are never rewritten.

CREATE TABLE inventory_category_preferences (
  workspace_id TEXT NOT NULL,
  category_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sku_prefix TEXT NOT NULL COLLATE NOCASE,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, category_key)
);

CREATE UNIQUE INDEX idx_inventory_category_preferences_prefix
  ON inventory_category_preferences(workspace_id, sku_prefix);

CREATE INDEX idx_inventory_category_preferences_workspace
  ON inventory_category_preferences(workspace_id, category_key);

PRAGMA optimize;
