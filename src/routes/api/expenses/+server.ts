import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ExpenseCategory } from '$lib/types';
import { currentWorkspaceId } from '$lib/server/workspace';

const EXPENSE_CATEGORIES = new Set<ExpenseCategory>([
  'shipping_supplies', 'packaging', 'inventory_supplies', 'software',
  'marketplace_fees', 'equipment', 'advertising', 'office_supplies', 'travel', 'other'
]);

type ExpenseInput = {
  date?: unknown;
  description?: unknown;
  category?: unknown;
  amountCents?: unknown;
  memo?: unknown;
};

function clean(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export const POST: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  const workspaceId = currentWorkspaceId(locals);

  const body = await request.json().catch(() => null) as ExpenseInput | null;
  if (!body) return json({ error: 'Expense details are required.' }, { status: 400 });

  const date = clean(body.date, 10);
  const description = clean(body.description, 160);
  const category = clean(body.category, 40) as ExpenseCategory | null;
  const memo = clean(body.memo, 500);
  const amountCents = Number(body.amountCents);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'Choose a valid expense date.' }, { status: 400 });
  if (!description) return json({ error: 'Enter an expense description.' }, { status: 400 });
  if (!category || !EXPENSE_CATEGORIES.has(category)) return json({ error: 'Choose a valid expense category.' }, { status: 400 });
  if (!Number.isInteger(amountCents) || amountCents <= 0) return json({ error: 'Enter an expense amount greater than $0.' }, { status: 400 });

  const id = crypto.randomUUID();
  const financeId = `finance:manual:${id}`;
  const externalId = `manual:${id}`;
  const transactionDate = `${date}T12:00:00.000Z`;
  const now = new Date().toISOString();

  await platform.env.DB.prepare(`
    INSERT INTO financial_transactions (
      workspace_id, id, ebay_transaction_id, ebay_order_id, ebay_line_item_id,
      transaction_type, amount_cents, currency, transaction_date, fee_type,
      booking_entry, category, source, description, expense_category, memo, updated_at
    )
    VALUES (?, ?, ?, NULL, NULL, 'MANUAL_EXPENSE', ?, 'USD', ?, NULL,
      'DEBIT', 'business_expense', 'manual', ?, ?, ?, ?)
  `).bind(
    workspaceId, financeId, externalId, -Math.abs(amountCents), transactionDate,
    description, category, memo, now
  ).run();

  return json({ ok: true, id: financeId, transactionDate, amountCents: -Math.abs(amountCents) });
};
