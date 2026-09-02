-- Nettiva manual business expenses
-- Apply after 0002_transaction_normalization.sql

ALTER TABLE financial_transactions ADD COLUMN expense_category TEXT;
ALTER TABLE financial_transactions ADD COLUMN memo TEXT;

CREATE INDEX idx_financial_expense_category
  ON financial_transactions(expense_category);

PRAGMA optimize;
