import { demoData } from '$lib/demo';
import { currentWorkspaceId, getWorkspaceContext } from '$lib/server/workspace';
import type {
  AccountingTransactionRow,
  InventoryRow,
  SaleRow,
  WorkspaceSummary
} from '$lib/types';

type AccountRow = {
  lastSyncedAt: string | null;
  displayName: string | null;
  status: string | null;
};

type InventoryDbRow = Omit<InventoryRow, 'ageDays'>;

type SaleDbRow = {
  id: string;
  inventoryItemId: string | null;
  marketplaceProvider: string;
  ebayOrderId: string;
  ebayLineItemId: string;
  ebayItemId: string | null;
  title: string;
  soldAt: string;
  salePriceCents: number;
  shippingChargedCents: number;
  cogsCents: number | null;
  sellingFeesCents: number;
  shippingLabelCents: number;
  refundsCents: number;
  disputesCents: number;
  otherAdjustmentsCents: number;
  pnlAdjustmentsCents: number;
};

type TransactionDbRow = Omit<AccountingTransactionRow, 'marketplaceProvider'> & {
  marketplaceProvider: string;
};

type CoverageRow = {
  firstSaleAt: string | null;
  lastSaleAt: string | null;
  firstTransactionAt: string | null;
  lastTransactionAt: string | null;
};

type HealthRow = {
  marketplaceFinancialCount: number;
  unallocatedNetCents: number;
  pnlAdjustmentsCents: number;
};

export type OrganizedShellCounts = {
  inventoryAll: number;
  inventoryUnlisted: number;
  inventoryScheduled: number;
  inventoryActive: number;
  inventoryMissing: number;
  soldAll: number;
  soldMissingCogs: number;
  soldUnmatched: number;
};

export type OrganizedShellData = {
  workspace: WorkspaceSummary;
  connected: boolean;
  lastSyncedAt: string | null;
  ebayConnection: { displayName: string; status: string } | null;
  counts: OrganizedShellCounts;
};

type ShellStatsRow = OrganizedShellCounts & {
  connected: number;
  lastSyncedAt: string | null;
  ebayDisplayName: string | null;
  ebayStatus: string | null;
};

export type OrganizedDashboardData = {
  currentUser: { name: string; email: string } | null;
  workspace: WorkspaceSummary;
  connected: boolean;
  financialsComplete: boolean;
  lastSyncedAt: string | null;
  ebayConnection: { displayName: string; status: string } | null;
  inventory: InventoryRow[];
  sales: SaleRow[];
  transactions: AccountingTransactionRow[];
  unallocatedNetCents: number;
  pnlAdjustmentsCents: number;
  dataCoverage: CoverageRow;
};

export type OrganizedLoadOptions = {
  includeInventory?: boolean;
  includeSales?: boolean;
  includeTransactions?: boolean;
  includeCoverage?: boolean;
  includeHealth?: boolean;
};

function mapTransactionRow(row: TransactionDbRow): AccountingTransactionRow {
  return {
    ...row,
    marketplaceProvider:
      row.marketplaceProvider === 'whatnot'
        ? 'whatnot'
        : row.marketplaceProvider === 'manual'
          ? 'manual'
          : row.marketplaceProvider === 'ebay'
            ? 'ebay'
            : 'other',
    amountCents: Number(row.amountCents ?? 0)
  };
}

function mapInventoryRows(rows: InventoryDbRow[]) {
  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    status: row.status as InventoryRow['status'],
    costCents: row.costCents == null ? null : Number(row.costCents),
    listPriceCents: row.listPriceCents == null ? null : Number(row.listPriceCents),
    ageDays: row.listedAt
      ? Math.max(0, Math.floor((now - Date.parse(row.listedAt)) / 86_400_000))
      : 0
  }));
}

function mapSaleRows(rows: SaleDbRow[]): SaleRow[] {
  return rows.map((row) => {
    const gross = Number(row.salePriceCents) + Number(row.shippingChargedCents);
    const pnlAdjustmentsCents = Number(row.pnlAdjustmentsCents ?? 0);
    const cogs = row.cogsCents == null ? null : Number(row.cogsCents);
    const netProfitCents = gross + pnlAdjustmentsCents - (cogs ?? 0);

    return {
      ...row,
      marketplaceProvider: row.marketplaceProvider === 'whatnot' ? 'whatnot' : 'ebay',
      salePriceCents: Number(row.salePriceCents),
      shippingChargedCents: Number(row.shippingChargedCents),
      sellingFeesCents: Number(row.sellingFeesCents ?? 0),
      shippingLabelCents: Number(row.shippingLabelCents ?? 0),
      refundsCents: Number(row.refundsCents ?? 0),
      disputesCents: Number(row.disputesCents ?? 0),
      otherAdjustmentsCents: Number(row.otherAdjustmentsCents ?? 0),
      pnlAdjustmentsCents,
      costsAndFeesCents: Math.max(0, -pnlAdjustmentsCents),
      cogsCents: cogs,
      netProfitCents,
      margin: gross ? (netProfitCents / gross) * 100 : 0,
      roi: cogs && cogs > 0 ? (netProfitCents / cogs) * 100 : null
    };
  });
}

async function loadAccount(db: D1Database, workspaceId: string) {
  return db.prepare(`
    SELECT
      ea.last_synced_at AS lastSyncedAt,
      ma.display_name AS displayName,
      ma.status AS status
    FROM ebay_accounts ea
    LEFT JOIN marketplace_accounts ma
      ON ma.workspace_id = ea.workspace_id
     AND ma.provider = 'ebay'
     AND ma.external_account_id = 'primary'
    WHERE ea.workspace_id = ?
    ORDER BY ea.created_at
    LIMIT 1
  `).bind(workspaceId).first<AccountRow>();
}

async function loadHealth(db: D1Database, workspaceId: string) {
  return db.prepare(`
    SELECT
      (
        SELECT COUNT(*)
        FROM financial_transactions
        WHERE workspace_id = ?
          AND source <> 'manual'
          AND category IN (
            'selling_fee', 'shipping_label', 'refund', 'dispute',
            'other_fee', 'adjustment', 'withheld_tax', 'purchase',
            'business_expense'
          )
      ) AS marketplaceFinancialCount,
      COALESCE((
        SELECT SUM(amount_cents)
        FROM financial_transactions
        WHERE workspace_id = ?
          AND external_order_id IS NULL
          AND category IN (
            'selling_fee', 'shipping_label', 'refund', 'dispute',
            'other_fee', 'adjustment', 'withheld_tax', 'purchase'
          )
      ), 0) AS unallocatedNetCents,
      COALESCE((
        SELECT SUM(amount_cents)
        FROM financial_transactions
        WHERE workspace_id = ?
          AND category IN (
            'selling_fee', 'shipping_label', 'refund', 'dispute',
            'other_fee', 'adjustment', 'withheld_tax', 'purchase',
            'business_expense'
          )
      ), 0) AS pnlAdjustmentsCents
  `).bind(workspaceId, workspaceId, workspaceId).first<HealthRow>();
}

async function loadInventoryRows(
  db: D1Database,
  workspaceId: string,
  itemId: string | null = null
) {
  const itemFilter = itemId ? ' AND i.id = ?' : '';
  const statement = db.prepare(`
    SELECT
      i.id,
      i.title,
      i.sku,
      i.ebay_item_id AS ebayItemId,
      i.image_url AS imageUrl,
      i.condition_name AS conditionName,
      i.purchased_at AS purchasedAt,
      i.inventory_category AS category,
      i.purchase_cost_cents AS costCents,
      i.purchase_lot_id AS purchaseLotId,
      i.source,
      i.storage_location AS location,
      i.status,
      l.price_cents AS listPriceCents,
      l.listed_at AS listedAt
    FROM inventory_items i
    LEFT JOIN listings l
      ON l.inventory_item_id = i.id
     AND l.workspace_id = ?
     AND l.status IN ('active', 'scheduled')
    WHERE i.workspace_id = ?${itemFilter}
    ORDER BY
      CASE i.status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'unlisted' THEN 2 ELSE 3 END,
      COALESCE(l.listed_at, i.created_at) DESC
    LIMIT ${itemId ? 1 : 2000}
  `);

  const result = itemId
    ? await statement.bind(workspaceId, workspaceId, itemId).all<InventoryDbRow>()
    : await statement.bind(workspaceId, workspaceId).all<InventoryDbRow>();

  return result.results;
}

async function loadSaleRows(
  db: D1Database,
  workspaceId: string,
  filter: { saleId?: string; inventoryItemId?: string } = {}
) {
  const clauses: string[] = [];
  const extraBindings: string[] = [];

  if (filter.saleId) {
    clauses.push('oi.id = ?');
    extraBindings.push(filter.saleId);
  }
  if (filter.inventoryItemId) {
    clauses.push('oi.inventory_item_id = ?');
    extraBindings.push(filter.inventoryItemId);
  }

  const extraWhere = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  const limit = clauses.length ? 1 : 2000;

  const result = await db.prepare(`
    WITH line_counts AS (
      SELECT order_id, COUNT(*) AS line_count
      FROM order_items
      WHERE workspace_id = ?
      GROUP BY order_id
    )
    SELECT
      oi.id,
      oi.inventory_item_id AS inventoryItemId,
      oi.marketplace_provider AS marketplaceProvider,
      o.external_order_id AS ebayOrderId,
      oi.external_line_item_id AS ebayLineItemId,
      oi.external_item_id AS ebayItemId,
      oi.title,
      oi.sold_at AS soldAt,
      oi.sale_price_cents AS salePriceCents,
      oi.shipping_charged_cents AS shippingChargedCents,
      i.purchase_cost_cents AS cogsCents,
      COALESCE(SUM(CASE
        WHEN ft.category = 'selling_fee' AND ft.amount_cents < 0
        THEN -ft.amount_cents ELSE 0 END), 0) AS sellingFeesCents,
      COALESCE(SUM(CASE
        WHEN ft.category = 'shipping_label' AND ft.amount_cents < 0
        THEN -ft.amount_cents ELSE 0 END), 0) AS shippingLabelCents,
      COALESCE(SUM(CASE
        WHEN ft.category = 'refund' AND ft.amount_cents < 0
        THEN -ft.amount_cents ELSE 0 END), 0) AS refundsCents,
      COALESCE(SUM(CASE
        WHEN ft.category = 'dispute' AND ft.amount_cents < 0
        THEN -ft.amount_cents ELSE 0 END), 0) AS disputesCents,
      COALESCE(SUM(CASE
        WHEN ft.category IN ('other_fee', 'adjustment', 'withheld_tax', 'purchase')
        THEN ft.amount_cents ELSE 0 END), 0) AS otherAdjustmentsCents,
      COALESCE(SUM(CASE
        WHEN ft.category IN (
          'selling_fee', 'shipping_label', 'refund', 'dispute',
          'other_fee', 'adjustment', 'withheld_tax', 'purchase'
        )
        THEN ft.amount_cents ELSE 0 END), 0) AS pnlAdjustmentsCents
    FROM order_items oi
    JOIN orders o
      ON o.id = oi.order_id
     AND o.workspace_id = oi.workspace_id
    LEFT JOIN inventory_items i
      ON i.id = oi.inventory_item_id
     AND i.workspace_id = oi.workspace_id
    LEFT JOIN line_counts lc
      ON lc.order_id = oi.order_id
    LEFT JOIN financial_transactions ft
      ON ft.workspace_id = oi.workspace_id
     AND ft.marketplace_provider = oi.marketplace_provider
     AND (
       ft.external_line_item_id = oi.external_line_item_id
       OR (
         ft.external_line_item_id IS NULL
         AND ft.external_order_id = o.external_order_id
         AND lc.line_count = 1
       )
     )
    WHERE oi.workspace_id = ?${extraWhere}
    GROUP BY oi.id
    ORDER BY oi.sold_at DESC
    LIMIT ${limit}
  `).bind(workspaceId, workspaceId, ...extraBindings).all<SaleDbRow>();

  return result.results;
}

async function loadTransactionRows(db: D1Database, workspaceId: string) {
  const result = await db.prepare(`
    SELECT
      id,
      marketplace_provider AS marketplaceProvider,
      transaction_date AS transactionDate,
      category,
      transaction_type AS transactionType,
      amount_cents AS amountCents,
      currency,
      external_order_id AS ebayOrderId,
      external_line_item_id AS ebayLineItemId,
      fee_type AS feeType,
      description,
      source,
      payout_id AS payoutId,
      reference_id AS referenceId,
      expense_category AS expenseCategory,
      memo
    FROM financial_transactions
    WHERE workspace_id = ?
    ORDER BY transaction_date DESC
    LIMIT 5000
  `).bind(workspaceId).all<TransactionDbRow>();

  return result.results;
}

async function loadCoverage(db: D1Database, workspaceId: string) {
  return db.prepare(`
    SELECT
      (SELECT MIN(sold_at) FROM order_items WHERE workspace_id = ?) AS firstSaleAt,
      (SELECT MAX(sold_at) FROM order_items WHERE workspace_id = ?) AS lastSaleAt,
      (SELECT MIN(transaction_date) FROM financial_transactions WHERE workspace_id = ? AND marketplace_provider = 'ebay') AS firstTransactionAt,
      (SELECT MAX(transaction_date) FROM financial_transactions WHERE workspace_id = ? AND marketplace_provider = 'ebay') AS lastTransactionAt
  `).bind(workspaceId, workspaceId, workspaceId, workspaceId).first<CoverageRow>();
}

export async function loadOrganizedShell(
  platform: App.Platform | undefined,
  locals: App.Locals
): Promise<OrganizedShellData | null> {
  if (!locals.authUserId) return null;

  const db = platform?.env.DB;
  if (!db) {
    const fallback = demoData as unknown as OrganizedDashboardData;
    return {
      workspace: fallback.workspace,
      connected: Boolean(fallback.connected),
      lastSyncedAt: fallback.lastSyncedAt ?? null,
      ebayConnection: fallback.connected ? { displayName: 'eBay', status: 'connected' } : null,
      counts: {
        inventoryAll: fallback.inventory.filter((item) => item.status !== 'sold').length,
        inventoryUnlisted: fallback.inventory.filter((item) => item.status === 'unlisted').length,
        inventoryScheduled: fallback.inventory.filter((item) => item.status === 'scheduled').length,
        inventoryActive: fallback.inventory.filter((item) => item.status === 'active').length,
        inventoryMissing: fallback.inventory.filter((item) => item.status !== 'sold' && (item.costCents == null || !item.source?.trim() || !item.location?.trim())).length,
        soldAll: fallback.sales.length,
        soldMissingCogs: fallback.sales.filter((sale) => sale.cogsCents == null).length,
        soldUnmatched: fallback.sales.filter((sale) => !sale.inventoryItemId).length
      }
    };
  }

  const workspaceId = currentWorkspaceId(locals);
  const [workspace, stats] = await Promise.all([
    getWorkspaceContext(db, locals),
    db.prepare(`
      SELECT
        EXISTS(SELECT 1 FROM ebay_accounts WHERE workspace_id = ? LIMIT 1) AS connected,
        (SELECT last_synced_at FROM ebay_accounts WHERE workspace_id = ? ORDER BY created_at LIMIT 1) AS lastSyncedAt,
        (SELECT display_name FROM marketplace_accounts WHERE workspace_id = ? AND provider = 'ebay' AND external_account_id = 'primary' LIMIT 1) AS ebayDisplayName,
        (SELECT status FROM marketplace_accounts WHERE workspace_id = ? AND provider = 'ebay' AND external_account_id = 'primary' LIMIT 1) AS ebayStatus,
        (SELECT COUNT(*) FROM inventory_items WHERE workspace_id = ? AND status <> 'sold') AS inventoryAll,
        (SELECT COUNT(*) FROM inventory_items WHERE workspace_id = ? AND status = 'unlisted') AS inventoryUnlisted,
        (SELECT COUNT(*) FROM inventory_items WHERE workspace_id = ? AND status = 'scheduled') AS inventoryScheduled,
        (SELECT COUNT(*) FROM inventory_items WHERE workspace_id = ? AND status = 'active') AS inventoryActive,
        (
          SELECT COUNT(*)
          FROM inventory_items
          WHERE workspace_id = ?
            AND status <> 'sold'
            AND (
              purchase_cost_cents IS NULL
              OR source IS NULL OR TRIM(source) = ''
              OR storage_location IS NULL OR TRIM(storage_location) = ''
            )
        ) AS inventoryMissing,
        (SELECT COUNT(*) FROM order_items WHERE workspace_id = ?) AS soldAll,
        (
          SELECT COUNT(*)
          FROM order_items oi
          LEFT JOIN inventory_items i
            ON i.id = oi.inventory_item_id
           AND i.workspace_id = oi.workspace_id
          WHERE oi.workspace_id = ?
            AND (oi.inventory_item_id IS NULL OR i.purchase_cost_cents IS NULL)
        ) AS soldMissingCogs,
        (SELECT COUNT(*) FROM order_items WHERE workspace_id = ? AND inventory_item_id IS NULL) AS soldUnmatched
    `).bind(
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId
    ).first<ShellStatsRow>()
  ]);

  if (!workspace) return null;

  return {
    workspace,
    connected: Boolean(stats?.connected),
    lastSyncedAt: stats?.lastSyncedAt ?? null,
    ebayConnection: Boolean(stats?.connected)
      ? {
          displayName: stats?.ebayDisplayName ?? 'eBay',
          status: stats?.ebayStatus ?? 'connected'
        }
      : null,
    counts: {
      inventoryAll: Number(stats?.inventoryAll ?? 0),
      inventoryUnlisted: Number(stats?.inventoryUnlisted ?? 0),
      inventoryScheduled: Number(stats?.inventoryScheduled ?? 0),
      inventoryActive: Number(stats?.inventoryActive ?? 0),
      inventoryMissing: Number(stats?.inventoryMissing ?? 0),
      soldAll: Number(stats?.soldAll ?? 0),
      soldMissingCogs: Number(stats?.soldMissingCogs ?? 0),
      soldUnmatched: Number(stats?.soldUnmatched ?? 0)
    }
  };
}

export async function loadOrganizedDashboard(
  platform: App.Platform | undefined,
  locals: App.Locals,
  options: OrganizedLoadOptions = {},
  shellContext: OrganizedShellData | null = null
): Promise<OrganizedDashboardData> {
  const db = platform?.env.DB;

  if (!db) {
    const fallback = demoData as unknown as OrganizedDashboardData;
    return {
      ...fallback,
      ebayConnection: null,
      pnlAdjustmentsCents: fallback.transactions.reduce((sum, row) => sum + Number(row.amountCents ?? 0), 0),
      dataCoverage: {
        firstSaleAt: fallback.sales.at(-1)?.soldAt ?? null,
        lastSaleAt: fallback.sales[0]?.soldAt ?? null,
        firstTransactionAt: fallback.transactions.at(-1)?.transactionDate ?? null,
        lastTransactionAt: fallback.transactions[0]?.transactionDate ?? null
      }
    };
  }

  const workspaceId = currentWorkspaceId(locals);
  const workspace = shellContext?.workspace ?? await getWorkspaceContext(db, locals);
  if (!workspace) throw new Error('Workspace context is unavailable.');

  const includeInventory = options.includeInventory ?? true;
  const includeSales = options.includeSales ?? true;
  const includeTransactions = options.includeTransactions ?? true;
  const includeCoverage = options.includeCoverage ?? true;
  const includeHealth = options.includeHealth ?? true;

  const shellAccount: AccountRow | null = shellContext?.connected
    ? {
        lastSyncedAt: shellContext.lastSyncedAt,
        displayName: shellContext.ebayConnection?.displayName ?? 'eBay',
        status: shellContext.ebayConnection?.status ?? 'connected'
      }
    : null;

  const [account, health, inventoryRows, saleRows, transactionRows, coverage] = await Promise.all([
    shellContext ? Promise.resolve(shellAccount) : loadAccount(db, workspaceId),
    includeHealth ? loadHealth(db, workspaceId) : Promise.resolve<HealthRow | null>(null),
    includeInventory ? loadInventoryRows(db, workspaceId) : Promise.resolve([] as InventoryDbRow[]),
    includeSales ? loadSaleRows(db, workspaceId) : Promise.resolve([] as SaleDbRow[]),
    includeTransactions ? loadTransactionRows(db, workspaceId) : Promise.resolve([] as TransactionDbRow[]),
    includeCoverage ? loadCoverage(db, workspaceId) : Promise.resolve<CoverageRow | null>(null)
  ]);

  return {
    currentUser: locals.authUserId
      ? {
          name: locals.authName ?? locals.authEmail ?? 'Sellquity user',
          email: locals.authEmail ?? ''
        }
      : null,
    workspace,
    connected: Boolean(account),
    financialsComplete: Number(health?.marketplaceFinancialCount ?? 0) > 0,
    lastSyncedAt: account?.lastSyncedAt ?? null,
    ebayConnection: account
      ? {
          displayName: account.displayName ?? 'eBay',
          status: account.status ?? 'connected'
        }
      : null,
    inventory: mapInventoryRows(inventoryRows),
    sales: mapSaleRows(saleRows),
    transactions: transactionRows.map(mapTransactionRow),
    unallocatedNetCents: Number(health?.unallocatedNetCents ?? 0),
    pnlAdjustmentsCents: Number(health?.pnlAdjustmentsCents ?? 0),
    dataCoverage: coverage ?? {
      firstSaleAt: null,
      lastSaleAt: null,
      firstTransactionAt: null,
      lastTransactionAt: null
    }
  };
}

export async function loadInventoryDetail(
  platform: App.Platform | undefined,
  locals: App.Locals,
  itemId: string,
  shellContext: OrganizedShellData | null = null
) {
  const dashboard = await loadOrganizedDashboard(platform, locals, {
    includeInventory: false,
    includeSales: false,
    includeTransactions: false,
    includeCoverage: false,
    includeHealth: false
  }, shellContext);

  const db = platform?.env.DB;
  if (!db) {
    const item = (demoData.inventory as InventoryRow[]).find((candidate) => candidate.id === itemId) ?? null;
    const sale = item
      ? (demoData.sales as SaleRow[]).find((candidate) => candidate.inventoryItemId === item.id) ?? null
      : null;
    return { dashboard, item, sale };
  }

  const workspaceId = currentWorkspaceId(locals);
  const [itemRows, saleRows] = await Promise.all([
    loadInventoryRows(db, workspaceId, itemId),
    loadSaleRows(db, workspaceId, { inventoryItemId: itemId })
  ]);

  return {
    dashboard,
    item: mapInventoryRows(itemRows)[0] ?? null,
    sale: mapSaleRows(saleRows)[0] ?? null
  };
}

export async function loadSoldDetail(
  platform: App.Platform | undefined,
  locals: App.Locals,
  saleId: string,
  shellContext: OrganizedShellData | null = null
) {
  const dashboard = await loadOrganizedDashboard(platform, locals, {
    includeInventory: false,
    includeSales: false,
    includeTransactions: false,
    includeCoverage: false,
    includeHealth: false
  }, shellContext);

  const db = platform?.env.DB;
  if (!db) {
    const sale = (demoData.sales as SaleRow[]).find((candidate) => candidate.id === saleId) ?? null;
    const item = sale?.inventoryItemId
      ? (demoData.inventory as InventoryRow[]).find((candidate) => candidate.id === sale.inventoryItemId) ?? null
      : null;
    const transactions = sale ? await loadSaleTransactions(platform, locals, sale) : [];
    return { dashboard, sale, item, transactions };
  }

  const workspaceId = currentWorkspaceId(locals);
  const saleRows = await loadSaleRows(db, workspaceId, { saleId });
  const sale = mapSaleRows(saleRows)[0] ?? null;
  if (!sale) return { dashboard, sale: null, item: null, transactions: [] as AccountingTransactionRow[] };

  const [itemRows, transactions] = await Promise.all([
    sale.inventoryItemId
      ? loadInventoryRows(db, workspaceId, sale.inventoryItemId)
      : Promise.resolve([] as InventoryDbRow[]),
    loadSaleTransactions(platform, locals, sale)
  ]);

  return {
    dashboard,
    sale,
    item: mapInventoryRows(itemRows)[0] ?? null,
    transactions
  };
}

export async function loadSaleTransactions(
  platform: App.Platform | undefined,
  locals: App.Locals,
  sale: Pick<SaleRow, 'marketplaceProvider' | 'ebayOrderId' | 'ebayLineItemId'>
): Promise<AccountingTransactionRow[]> {
  const db = platform?.env.DB;
  if (!db) return [];

  const workspaceId = currentWorkspaceId(locals);
  const provider = sale.marketplaceProvider ?? 'ebay';

  const result = await db.prepare(`
    SELECT
      id,
      marketplace_provider AS marketplaceProvider,
      transaction_date AS transactionDate,
      category,
      transaction_type AS transactionType,
      amount_cents AS amountCents,
      currency,
      external_order_id AS ebayOrderId,
      external_line_item_id AS ebayLineItemId,
      fee_type AS feeType,
      description,
      source,
      payout_id AS payoutId,
      reference_id AS referenceId,
      expense_category AS expenseCategory,
      memo
    FROM financial_transactions
    WHERE workspace_id = ?
      AND marketplace_provider = ?
      AND (
        external_line_item_id = ?
        OR external_order_id = ?
      )
    ORDER BY transaction_date DESC
    LIMIT 250
  `).bind(
    workspaceId,
    provider,
    sale.ebayLineItemId,
    sale.ebayOrderId
  ).all<TransactionDbRow>();

  return result.results.map(mapTransactionRow);
}
