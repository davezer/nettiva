CREATE TABLE ebay_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_expires_at INTEGER NOT NULL,
  refresh_token_expires_at INTEGER,
  scopes TEXT NOT NULL,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  sku TEXT,
  ebay_item_id TEXT UNIQUE,
  condition_name TEXT,
  image_url TEXT,
  purchase_cost_cents INTEGER,
  source TEXT,
  storage_location TEXT,
  purchased_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_status ON inventory_items(status);

CREATE TABLE listings (
  id TEXT PRIMARY KEY NOT NULL,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  ebay_listing_id TEXT NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  quantity INTEGER NOT NULL DEFAULT 1,
  listed_at TEXT,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  view_item_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_listings_inventory_status ON listings(inventory_item_id, status);

CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  ebay_order_id TEXT NOT NULL UNIQUE,
  created_at_ebay TEXT NOT NULL,
  status TEXT NOT NULL,
  gross_total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_created_at_ebay ON orders(created_at_ebay);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  inventory_item_id TEXT REFERENCES inventory_items(id),
  ebay_line_item_id TEXT NOT NULL UNIQUE,
  ebay_item_id TEXT,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  sale_price_cents INTEGER NOT NULL DEFAULT 0,
  shipping_charged_cents INTEGER NOT NULL DEFAULT 0,
  sold_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_inventory_id ON order_items(inventory_item_id);
CREATE INDEX idx_order_items_sold_at ON order_items(sold_at);

CREATE TABLE financial_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  ebay_transaction_id TEXT NOT NULL UNIQUE,
  ebay_order_id TEXT,
  ebay_line_item_id TEXT,
  transaction_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  transaction_date TEXT NOT NULL,
  fee_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_financial_line_item_id ON financial_transactions(ebay_line_item_id);
CREATE INDEX idx_financial_transaction_date ON financial_transactions(transaction_date);

CREATE TABLE sync_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  records_processed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

PRAGMA optimize;
