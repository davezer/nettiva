-- Nettiva Account Recovery & Onboarding v3
-- Apply after 0007_auth_tenant_enforcement.sql.
-- LOCAL-ONLY until the full lifecycle is accepted.

ALTER TABLE workspaces ADD COLUMN onboarding_step TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE workspaces ADD COLUMN onboarding_started_at TEXT;
ALTER TABLE workspaces ADD COLUMN onboarding_completed_at TEXT;
ALTER TABLE workspaces ADD COLUMN country_code TEXT NOT NULL DEFAULT 'US';
ALTER TABLE workspaces ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE workspaces ADD COLUMN ebay_connect_deferred INTEGER NOT NULL DEFAULT 0;

-- Existing workspaces predate the wizard and must not suddenly be blocked.
UPDATE workspaces
SET onboarding_step = 'complete',
    onboarding_completed_at = COALESCE(onboarding_completed_at, CURRENT_TIMESTAMP)
WHERE status = 'active';

-- Local development mailbox. It intentionally stores action URLs so recovery
-- and verification flows can be tested without a third-party email provider.
-- Production should use resend mode; the dev mailbox UI is localhost-only.
CREATE TABLE auth_email_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  auth_user_id TEXT,
  recipient TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  action_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_email_outbox_recipient
  ON auth_email_outbox(recipient, created_at);
CREATE INDEX idx_auth_email_outbox_kind
  ON auth_email_outbox(kind, created_at);

-- Deletion is deliberately a request/hold workflow for now. We do NOT hard
-- delete auth identities or seller data until retention/billing/export rules
-- are finalized.
CREATE TABLE account_deletion_requests (
  id TEXT PRIMARY KEY NOT NULL,
  auth_user_id TEXT NOT NULL,
  app_user_id TEXT NOT NULL,
  requested_workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_at TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  canceled_at TEXT,
  completed_at TEXT,
  reason TEXT
);

CREATE UNIQUE INDEX idx_account_deletion_active
  ON account_deletion_requests(auth_user_id)
  WHERE status = 'requested';

CREATE INDEX idx_account_deletion_status
  ON account_deletion_requests(status, scheduled_for);

PRAGMA optimize;
