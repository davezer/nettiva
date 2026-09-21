-- Sellquity launch-readiness foundation.
-- Adds a lightweight support-request inbox without coupling it to auth/workspace
-- foreign keys, so locked-out users can still ask for help.

CREATE TABLE support_requests (
  id TEXT PRIMARY KEY NOT NULL,
  auth_user_id TEXT,
  app_user_id TEXT,
  workspace_id TEXT,
  email TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_support_requests_status_created
  ON support_requests(status, created_at);

CREATE INDEX idx_support_requests_workspace
  ON support_requests(workspace_id, created_at);

CREATE INDEX idx_support_requests_email
  ON support_requests(email, created_at);

PRAGMA optimize;
