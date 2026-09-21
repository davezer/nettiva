-- Sellquity Scale & Integrity v1
-- Apply after 0015_launch_readiness.sql.
--
-- Adds indexes for the paged/reporting queries introduced in Pass 5 and
-- fail-closed tenant guards for internal ID relationships.

-- ---------------------------------------------------------------------------
-- Query indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_inventory_workspace_status_updated
  ON inventory_items(workspace_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_workspace_purchase_lot_v2
  ON inventory_items(workspace_id, purchase_lot_id);

CREATE INDEX IF NOT EXISTS idx_listings_workspace_inventory_state
  ON listings(workspace_id, inventory_item_id, status, listed_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_workspace_inventory_sold_v2
  ON order_items(workspace_id, inventory_item_id, sold_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_workspace_order_sold
  ON order_items(workspace_id, order_id, sold_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_workspace_category_date_v2
  ON financial_transactions(workspace_id, category, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_financial_workspace_source_date
  ON financial_transactions(workspace_id, source, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_lots_workspace_purchased_v2
  ON purchase_lots(workspace_id, purchased_at DESC, created_at DESC);

-- ---------------------------------------------------------------------------
-- Tenant-integrity guards
--
-- IDs remain globally unique in practice, but the application is multi-tenant.
-- These triggers make the workspace relationship explicit so a bug in an
-- importer or future API cannot attach one seller's child row to another
-- seller's parent row.
-- ---------------------------------------------------------------------------

CREATE TRIGGER IF NOT EXISTS trg_integrity_listings_inventory_insert
BEFORE INSERT ON listings
WHEN NOT EXISTS (
  SELECT 1
  FROM inventory_items i
  WHERE i.id = NEW.inventory_item_id
    AND i.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'listing inventory workspace mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_integrity_listings_inventory_update
BEFORE UPDATE OF inventory_item_id, workspace_id ON listings
WHEN NOT EXISTS (
  SELECT 1
  FROM inventory_items i
  WHERE i.id = NEW.inventory_item_id
    AND i.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'listing inventory workspace mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_integrity_order_items_order_insert
BEFORE INSERT ON order_items
WHEN NOT EXISTS (
  SELECT 1
  FROM orders o
  WHERE o.id = NEW.order_id
    AND o.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'sale order workspace mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_integrity_order_items_order_update
BEFORE UPDATE OF order_id, workspace_id ON order_items
WHEN NOT EXISTS (
  SELECT 1
  FROM orders o
  WHERE o.id = NEW.order_id
    AND o.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'sale order workspace mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_integrity_order_items_inventory_insert
BEFORE INSERT ON order_items
WHEN NEW.inventory_item_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1
  FROM inventory_items i
  WHERE i.id = NEW.inventory_item_id
    AND i.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'sale inventory workspace mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_integrity_order_items_inventory_update
BEFORE UPDATE OF inventory_item_id, workspace_id ON order_items
WHEN NEW.inventory_item_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1
  FROM inventory_items i
  WHERE i.id = NEW.inventory_item_id
    AND i.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'sale inventory workspace mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_integrity_inventory_purchase_lot_insert
BEFORE INSERT ON inventory_items
WHEN NEW.purchase_lot_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1
  FROM purchase_lots p
  WHERE p.id = NEW.purchase_lot_id
    AND p.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'inventory purchase workspace mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_integrity_inventory_purchase_lot_update
BEFORE UPDATE OF purchase_lot_id, workspace_id ON inventory_items
WHEN NEW.purchase_lot_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1
  FROM purchase_lots p
  WHERE p.id = NEW.purchase_lot_id
    AND p.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'inventory purchase workspace mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_integrity_sku_inventory_insert
BEFORE INSERT ON sku_reservations
WHEN NEW.inventory_item_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1
  FROM inventory_items i
  WHERE i.id = NEW.inventory_item_id
    AND i.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'SKU inventory workspace mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_integrity_sku_inventory_update
BEFORE UPDATE OF inventory_item_id, workspace_id ON sku_reservations
WHEN NEW.inventory_item_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1
  FROM inventory_items i
  WHERE i.id = NEW.inventory_item_id
    AND i.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'SKU inventory workspace mismatch');
END;

PRAGMA optimize;
