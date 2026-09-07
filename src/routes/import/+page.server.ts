import type { PageServerLoad } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

type ImportBatchDbRow = {
  id: string;
  source: string;
  filename: string | null;
  rowsSeen: number | null;
  rowsImported: number | null;
  ordersImported: number | null;
  transactionsImported: number | null;
  importedAt: string;
  dataFrom: string | null;
  dataThrough: string | null;
};

type CountRow = {
  count: number | null;
};

type ThroughRow = {
  dataThrough: string | null;
};

export const load: PageServerLoad = async ({ platform, locals }) => {
  const db = platform?.env.DB;

  if (!db) {
    return {
      sync: {
        activeListingsCount: 0,
        transactionDataThrough: null as string | null,
        latestActiveImport: null,
        latestTransactionImport: null,
        history: [] as ImportBatchDbRow[]
      }
    };
  }

  const workspaceId = currentWorkspaceId(locals);

  try {
    const [historyResult, activeCountResult, transactionThroughResult] = await db.batch([
      db.prepare(`
        SELECT
          b.id,
          b.source,
          b.filename,
          b.rows_seen AS rowsSeen,
          b.rows_imported AS rowsImported,
          b.orders_imported AS ordersImported,
          b.transactions_imported AS transactionsImported,
          b.imported_at AS importedAt,
          MIN(ft.transaction_date) AS dataFrom,
          MAX(ft.transaction_date) AS dataThrough
        FROM import_batches b
        LEFT JOIN financial_transactions ft
          ON ft.workspace_id = b.workspace_id
          AND ft.import_batch_id = b.id
        WHERE b.workspace_id = ?
          AND b.source IN ('ebay_csv', 'ebay_active_csv')
        GROUP BY
          b.id,
          b.source,
          b.filename,
          b.rows_seen,
          b.rows_imported,
          b.orders_imported,
          b.transactions_imported,
          b.imported_at
        ORDER BY b.imported_at DESC
        LIMIT 16
      `).bind(workspaceId),
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM listings
        WHERE workspace_id = ?
          AND marketplace_provider = 'ebay'
          AND status = 'active'
      `).bind(workspaceId),
      db.prepare(`
        SELECT MAX(transaction_date) AS dataThrough
        FROM financial_transactions
        WHERE workspace_id = ?
          AND source = 'ebay_csv'
      `).bind(workspaceId)
    ]);

    const history = (historyResult.results as unknown as ImportBatchDbRow[]).map((row) => ({
      ...row,
      rowsSeen: Number(row.rowsSeen ?? 0),
      rowsImported: Number(row.rowsImported ?? 0),
      ordersImported: Number(row.ordersImported ?? 0),
      transactionsImported: Number(row.transactionsImported ?? 0)
    }));

    const latestActiveImport =
      history.find((row) => row.source === 'ebay_active_csv') ?? null;
    const latestTransactionImport =
      history.find((row) => row.source === 'ebay_csv') ?? null;

    const activeListingsCount = Number(
      (activeCountResult.results as unknown as CountRow[])[0]?.count ?? 0
    );

    const transactionDataThrough =
      (transactionThroughResult.results as unknown as ThroughRow[])[0]?.dataThrough ?? null;

    return {
      sync: {
        activeListingsCount,
        transactionDataThrough,
        latestActiveImport,
        latestTransactionImport,
        history
      }
    };
  } catch (error) {
    console.error('Could not load eBay data-sync status', error);

    return {
      sync: {
        activeListingsCount: 0,
        transactionDataThrough: null as string | null,
        latestActiveImport: null,
        latestTransactionImport: null,
        history: [] as ImportBatchDbRow[]
      }
    };
  }
};
