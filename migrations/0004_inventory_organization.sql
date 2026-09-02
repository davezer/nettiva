-- Nettiva inventory organization + batch intake
-- Apply after 0003_manual_expenses.sql

ALTER TABLE inventory_items ADD COLUMN inventory_category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE inventory_items ADD COLUMN intake_batch_id TEXT;

CREATE INDEX idx_inventory_category ON inventory_items(inventory_category);
CREATE INDEX idx_inventory_intake_batch ON inventory_items(intake_batch_id);

-- Preserve the first category-prefix convention already in use where possible.
UPDATE inventory_items
SET inventory_category = CASE
  WHEN UPPER(sku) LIKE 'AFG-%' THEN 'action_figures'
  WHEN UPPER(sku) LIKE 'BSC-%' THEN 'baseball_cards'
  WHEN UPPER(sku) LIKE 'BBC-%' THEN 'baseball_cards'
  WHEN UPPER(sku) LIKE 'ELE-%' THEN 'electronics'
  WHEN UPPER(sku) LIKE 'MOV-%' THEN 'movies'
  WHEN UPPER(sku) LIKE 'VGM-%' THEN 'video_games'
  WHEN UPPER(sku) LIKE 'TCG-%' THEN 'trading_cards'
  WHEN UPPER(sku) LIKE 'COL-%' THEN 'collectibles'
  ELSE inventory_category
END
WHERE sku IS NOT NULL;

PRAGMA optimize;
