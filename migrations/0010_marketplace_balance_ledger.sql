-- Nettiva Whatnot Ledger Reconciliation v1
-- Apply after 0009_marketplace_foundation.sql.
--
-- The Whatnot Weekly Orders Report is the P&L source.
-- The Whatnot Ledger export is the marketplace account-balance source.
-- Keeping these separate prevents sales earnings from being counted twice.

CREATE TABLE marketplace_balance_entries (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_key TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at_external TEXT NOT NULL,
  completed_at_external TEXT,
  external_order_id TEXT,
  external_listing_id TEXT,
  description TEXT,
  import_batch_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, provider, external_key)
);

CREATE INDEX idx_marketplace_balance_workspace_provider_date
  ON marketplace_balance_entries(
    workspace_id,
    provider,
    completed_at_external,
    created_at_external
  );

CREATE INDEX idx_marketplace_balance_workspace_order
  ON marketplace_balance_entries(
    workspace_id,
    provider,
    external_order_id
  );

CREATE INDEX idx_marketplace_balance_workspace_type
  ON marketplace_balance_entries(
    workspace_id,
    provider,
    transaction_type,
    status
  );
