-- Sellquity Listing Prep v1
-- Local-first manual eBay listing workflow while API access is pending.

ALTER TABLE inventory_items
  ADD COLUMN listing_title_draft TEXT;

ALTER TABLE inventory_items
  ADD COLUMN target_list_price_cents INTEGER;

ALTER TABLE inventory_items
  ADD COLUMN listing_photos_ready INTEGER NOT NULL DEFAULT 0;

ALTER TABLE inventory_items
  ADD COLUMN listing_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_workspace_listing_prep
  ON inventory_items(workspace_id, status, created_at);

PRAGMA optimize;
