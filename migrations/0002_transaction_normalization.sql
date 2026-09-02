-- Nettiva transaction normalization + CSV import support
-- Apply after 0001_initial.sql

ALTER TABLE financial_transactions ADD COLUMN booking_entry TEXT;
ALTER TABLE financial_transactions ADD COLUMN category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE financial_transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'ebay_api';
ALTER TABLE financial_transactions ADD COLUMN description TEXT;
ALTER TABLE financial_transactions ADD COLUMN payout_id TEXT;
ALTER TABLE financial_transactions ADD COLUMN reference_id TEXT;
ALTER TABLE financial_transactions ADD COLUMN gross_amount_cents INTEGER;
ALTER TABLE financial_transactions ADD COLUMN item_subtotal_cents INTEGER;
ALTER TABLE financial_transactions ADD COLUMN shipping_charged_cents INTEGER;
ALTER TABLE financial_transactions ADD COLUMN ebay_collected_tax_cents INTEGER;
ALTER TABLE financial_transactions ADD COLUMN import_batch_id TEXT;

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  filename TEXT,
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  orders_imported INTEGER NOT NULL DEFAULT 0,
  transactions_imported INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_financial_order_id ON financial_transactions(ebay_order_id);
CREATE INDEX idx_financial_category ON financial_transactions(category);
CREATE INDEX idx_financial_source ON financial_transactions(source);
CREATE INDEX idx_financial_import_batch ON financial_transactions(import_batch_id);

PRAGMA optimize;
