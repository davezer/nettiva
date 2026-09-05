import type { PageServerLoad } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

type ImportBatchRow = {
  id: string;
  filename: string | null;
  rowsSeen: number;
  rowsImported: number;
  ordersImported: number;
  transactionsImported: number;
  importedAt: string;
};

export const load: PageServerLoad = async ({ platform, locals }) => {
  const db = platform?.env.DB;
  if (!db) return { recentEbayImports: [] as ImportBatchRow[] };

  const workspaceId = currentWorkspaceId(locals);

  try {
    const result = await db.prepare(`
      SELECT
        id,
        filename,
        rows_seen AS rowsSeen,
        rows_imported AS rowsImported,
        orders_imported AS ordersImported,
        transactions_imported AS transactionsImported,
        imported_at AS importedAt
      FROM import_batches
      WHERE workspace_id = ?
        AND source = 'ebay_csv'
      ORDER BY imported_at DESC
      LIMIT 8
    `).bind(workspaceId).all();

    const recentEbayImports = (result.results as unknown as ImportBatchRow[]).map((row) => ({
      ...row,
      rowsSeen: Number(row.rowsSeen ?? 0),
      rowsImported: Number(row.rowsImported ?? 0),
      ordersImported: Number(row.ordersImported ?? 0),
      transactionsImported: Number(row.transactionsImported ?? 0)
    }));

    return { recentEbayImports };
  } catch (error) {
    console.error('Could not load eBay import history', error);
    return { recentEbayImports: [] as ImportBatchRow[] };
  }
};
