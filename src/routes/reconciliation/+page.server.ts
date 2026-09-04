import type { PageServerLoad } from './$types';
import { currentWorkspaceId, getWorkspaceContext } from '$lib/server/workspace';

type BalanceRow = {
  id: string;
  externalKey: string;
  transactionType: string;
  status: string;
  amountCents: number;
  currency: string;
  createdAtExternal: string;
  completedAtExternal: string | null;
  externalOrderId: string | null;
  externalListingId: string | null;
  description: string | null;
  matchedOrderReport: number;
};

export const load: PageServerLoad = async ({ platform, locals }) => {
  if (!platform) {
    return {
      workspace: null,
      entries: []
    };
  }

  const db = platform.env.DB;
  const workspaceId = currentWorkspaceId(locals);
  const workspace = await getWorkspaceContext(db, locals);

  const result = await db.prepare(`
    SELECT
      mbe.id,
      mbe.external_key AS externalKey,
      mbe.transaction_type AS transactionType,
      mbe.status,
      mbe.amount_cents AS amountCents,
      mbe.currency,
      mbe.created_at_external AS createdAtExternal,
      mbe.completed_at_external AS completedAtExternal,
      mbe.external_order_id AS externalOrderId,
      mbe.external_listing_id AS externalListingId,
      mbe.description,
      CASE
        WHEN mbe.transaction_type = 'SALES'
          AND mbe.external_order_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM financial_transactions ft
            WHERE ft.workspace_id = mbe.workspace_id
              AND ft.marketplace_provider = 'whatnot'
              AND ft.category = 'sale'
              AND ft.source = 'whatnot_weekly_csv'
              AND ft.external_order_id = mbe.external_order_id
          )
        THEN 1
        ELSE 0
      END AS matchedOrderReport
    FROM marketplace_balance_entries mbe
    WHERE mbe.workspace_id = ?
      AND mbe.provider = 'whatnot'
    ORDER BY
      COALESCE(mbe.completed_at_external, mbe.created_at_external) DESC,
      mbe.id DESC
    LIMIT 2500
  `).bind(workspaceId).all<BalanceRow>();

  return {
    workspace,
    entries: result.results.map((row) => ({
      ...row,
      amountCents: Number(row.amountCents ?? 0),
      matchedOrderReport: Boolean(row.matchedOrderReport)
    }))
  };
};
