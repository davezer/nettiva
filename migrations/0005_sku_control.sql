-- Nettiva SKU Control Center + scheduled listing awareness
-- Apply after 0004_inventory_organization.sql

CREATE TABLE sku_sequences (
  prefix TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sku_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  sku TEXT NOT NULL COLLATE NOCASE UNIQUE,
  prefix TEXT NOT NULL COLLATE NOCASE,
  sequence_number INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual_bootstrap',
  status TEXT NOT NULL DEFAULT 'reserved',
  title TEXT,
  ebay_item_id TEXT,
  inventory_item_id TEXT REFERENCES inventory_items(id),
  reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sku_reservation_prefix ON sku_reservations(prefix);
CREATE INDEX idx_sku_reservation_source ON sku_reservations(source);
CREATE INDEX idx_sku_reservation_status ON sku_reservations(status);
CREATE INDEX idx_sku_reservation_ebay_item ON sku_reservations(ebay_item_id);

UPDATE inventory_items
SET inventory_category = 'electronics'
WHERE UPPER(sku) LIKE 'ELC-%';

PRAGMA optimize;
