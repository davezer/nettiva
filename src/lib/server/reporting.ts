import type {
  ExpenseCategory,
  FinanceCategory,
  InventoryCategory,
  InventoryCategoryDefinition,
  InventoryRow,
  MarketplaceProvider
} from '$lib/types';
import {
  loadBuiltInInventoryCategories,
  loadCustomInventoryCategories
} from '$lib/server/inventory-categories';

export type ReportPeriod = 'month' | '30d' | '90d' | 'ytd' | 'all';

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  from: number;
  to: number;
};

type SaleDbRow = {
  id: string;
  inventoryItemId: string | null;
  marketplaceProvider: string;
  ebayOrderId: string | null;
  ebayLineItemId: string | null;
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
  imageUrl: string | null;
  sku: string | null;
  category: string | null;
  source: string | null;
};

export type PagedSaleRow = {
  id: string;
  inventoryItemId: string | null;
  marketplaceProvider: MarketplaceProvider;
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
  costsAndFeesCents: number;
  netProfitCents: number;
  margin: number;
  roi: number | null;
  imageUrl: string | null;
  sku: string | null;
  category: string | null;
  source: string | null;
};

type InventoryDbRow = Omit<InventoryRow, 'ageDays'>;

type InventorySummaryRow = {
  inventoryBasisCents: number | null;
  activeValueCents: number | null;
  staleCount: number | null;
  staleCapitalCents: number | null;
};

type HomeSummaryRow = {
  grossCents: number | null;
  pnlAdjustmentsCents: number | null;
  knownCogsCents: number | null;
  inventoryBasisCents: number | null;
  activeValueCents: number | null;
  staleCount: number | null;
  firstSaleAt: string | null;
  latestSaleAt: string | null;
};

type SalesSummaryRow = {
  totalSales: number | null;
  grossCents: number | null;
  missingCosts: number | null;
  unmatched: number | null;
  completeSales: number | null;
  completeGrossCents: number | null;
  completeProfitCents: number | null;
};

type MoneySummaryRow = {
  salesCount: number | null;
  grossCents: number | null;
  knownCogsCents: number | null;
  missingCosts: number | null;
  sellingFeesCents: number | null;
  shippingLabelsCents: number | null;
  refundsCents: number | null;
  businessExpensesCents: number | null;
  otherAdjustmentsCents: number | null;
  pnlAdjustmentsCents: number | null;
};

type ManualExpenseRow = {
  id: string;
  transactionDate: string;
  description: string | null;
  expenseCategory: ExpenseCategory | null;
  memo: string | null;
  amountCents: number;
};

type TransactionDbRow = {
  id: string;
  marketplaceProvider: string;
  transactionDate: string;
  category: FinanceCategory;
  transactionType: string;
  amountCents: number;
  currency: string;
  ebayOrderId: string | null;
  ebayLineItemId: string | null;
  feeType: string | null;
  description: string | null;
  source: string;
  payoutId: string | null;
  referenceId: string | null;
  expenseCategory: ExpenseCategory | null;
  memo: string | null;
};

type InsightSummaryRow = {
  sales: number | null;
  grossCents: number | null;
  profitCents: number | null;
  missingCosts: number | null;
  fullyCostedSales: number | null;
  fullyCostedProfitCents: number | null;
  fullyCostedCogsCents: number | null;
};

type InsightGroupRow = {
  key: string;
  sales: number;
  grossCents: number;
  cogsCents: number;
  profitCents: number;
  missingCosts: number;
};

type AgeSummaryRow = {
  count0to30: number | null;
  cost0to30: number | null;
  count31to60: number | null;
  cost31to60: number | null;
  count61to90: number | null;
  cost61to90: number | null;
  count91plus: number | null;
  cost91plus: number | null;
};

const PNL_CATEGORIES = `
  'selling_fee', 'shipping_label', 'refund', 'dispute',
  'other_fee', 'adjustment', 'withheld_tax', 'purchase',
  'business_expense'
`;

const SALE_ROWS_CTE = `
  WITH line_counts AS (
    SELECT order_id, COUNT(*) AS line_count
    FROM order_items
    WHERE workspace_id = ?
    GROUP BY order_id
  ),
  sale_rows AS (
    SELECT
      oi.id,
      oi.inventory_item_id AS inventoryItemId,
      oi.marketplace_provider AS marketplaceProvider,
      COALESCE(o.external_order_id, o.ebay_order_id, o.id) AS ebayOrderId,
      COALESCE(oi.external_line_item_id, oi.ebay_line_item_id, oi.id) AS ebayLineItemId,
      COALESCE(oi.external_item_id, oi.ebay_item_id) AS ebayItemId,
      oi.title,
      oi.sold_at AS soldAt,
      oi.sale_price_cents AS salePriceCents,
      oi.shipping_charged_cents AS shippingChargedCents,
      i.purchase_cost_cents AS cogsCents,
      i.image_url AS imageUrl,
      i.sku,
      i.inventory_category AS category,
      i.source,
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
    WHERE oi.workspace_id = ?
    GROUP BY oi.id
  )
`;

function num(value: number | null | undefined) {
  return Number(value ?? 0);
}

function clampPage(value: string | null | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function pagination(page: number, pageSize: number, total: number): Pagination {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(total, safePage * pageSize);
  return { page: safePage, pageSize, total, pageCount, from, to };
}

function mapSale(row: SaleDbRow): PagedSaleRow {
  const salePriceCents = num(row.salePriceCents);
  const shippingChargedCents = num(row.shippingChargedCents);
  const gross = salePriceCents + shippingChargedCents;
  const cogsCents = row.cogsCents == null ? null : num(row.cogsCents);
  const pnlAdjustmentsCents = num(row.pnlAdjustmentsCents);
  const netProfitCents = gross + pnlAdjustmentsCents - (cogsCents ?? 0);

  return {
    ...row,
    marketplaceProvider: row.marketplaceProvider === 'whatnot' ? 'whatnot' : 'ebay',
    ebayOrderId: row.ebayOrderId ?? row.id,
    ebayLineItemId: row.ebayLineItemId ?? row.id,
    salePriceCents,
    shippingChargedCents,
    cogsCents,
    sellingFeesCents: num(row.sellingFeesCents),
    shippingLabelCents: num(row.shippingLabelCents),
    refundsCents: num(row.refundsCents),
    disputesCents: num(row.disputesCents),
    otherAdjustmentsCents: num(row.otherAdjustmentsCents),
    pnlAdjustmentsCents,
    costsAndFeesCents: Math.max(0, -pnlAdjustmentsCents),
    netProfitCents,
    margin: gross ? (netProfitCents / gross) * 100 : 0,
    roi: cogsCents && cogsCents > 0 ? (netProfitCents / cogsCents) * 100 : null
  };
}

function mapInventory(row: InventoryDbRow): InventoryRow {
  const listedAt = row.listedAt ?? null;
  const parsed = listedAt ? Date.parse(listedAt) : Number.NaN;
  const ageDays = Number.isFinite(parsed)
    ? Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000))
    : 0;

  return {
    ...row,
    category: row.category as InventoryCategory,
    costCents: row.costCents == null ? null : num(row.costCents),
    listPriceCents: row.listPriceCents == null ? null : num(row.listPriceCents),
    ageDays
  };
}

export function normalizePeriod(value: string | null, fallback: ReportPeriod): ReportPeriod {
  return value === 'month' || value === '30d' || value === '90d' || value === 'ytd' || value === 'all'
    ? value
    : fallback;
}

export function periodStartIso(period: ReportPeriod) {
  if (period === 'all') return null;
  const now = new Date();
  if (period === '30d') return new Date(now.getTime() - 30 * 86_400_000).toISOString();
  if (period === '90d') return new Date(now.getTime() - 90 * 86_400_000).toISOString();
  if (period === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
}

export async function loadHomeOverview(db: D1Database, workspaceId: string) {
  const [summary, recentResult] = await Promise.all([
    db.prepare(`
      SELECT
        (SELECT COALESCE(SUM(sale_price_cents + shipping_charged_cents), 0)
           FROM order_items WHERE workspace_id = ?1) AS grossCents,
        (SELECT COALESCE(SUM(amount_cents), 0)
           FROM financial_transactions
          WHERE workspace_id = ?1 AND category IN (${PNL_CATEGORIES})) AS pnlAdjustmentsCents,
        (SELECT COALESCE(SUM(i.purchase_cost_cents), 0)
           FROM order_items oi
           LEFT JOIN inventory_items i
             ON i.id = oi.inventory_item_id AND i.workspace_id = oi.workspace_id
          WHERE oi.workspace_id = ?1) AS knownCogsCents,
        (SELECT COALESCE(SUM(purchase_cost_cents), 0)
           FROM inventory_items
          WHERE workspace_id = ?1 AND status <> 'sold') AS inventoryBasisCents,
        (SELECT COALESCE(SUM(price_cents), 0)
           FROM listings
          WHERE workspace_id = ?1 AND status = 'active') AS activeValueCents,
        (SELECT COUNT(DISTINCT i.id)
           FROM inventory_items i
           JOIN listings l
             ON l.inventory_item_id = i.id
            AND l.workspace_id = i.workspace_id
            AND l.status = 'active'
          WHERE i.workspace_id = ?1
            AND i.status = 'active'
            AND l.listed_at IS NOT NULL
            AND julianday(l.listed_at) <= julianday('now', '-91 days')) AS staleCount,
        (SELECT MIN(sold_at) FROM order_items WHERE workspace_id = ?1) AS firstSaleAt,
        (SELECT MAX(sold_at) FROM order_items WHERE workspace_id = ?1) AS latestSaleAt
    `).bind(workspaceId).first<HomeSummaryRow>(),
    db.prepare(`${SALE_ROWS_CTE}
      SELECT * FROM sale_rows
      ORDER BY soldAt DESC, id DESC
      LIMIT 7
    `).bind(workspaceId, workspaceId).all<SaleDbRow>()
  ]);

  const grossCents = num(summary?.grossCents);
  const pnlAdjustmentsCents = num(summary?.pnlAdjustmentsCents);
  const knownCogsCents = num(summary?.knownCogsCents);
  const profitCents = grossCents + pnlAdjustmentsCents - knownCogsCents;

  return {
    grossCents,
    pnlAdjustmentsCents,
    knownCogsCents,
    profitCents,
    margin: grossCents ? (profitCents / grossCents) * 100 : 0,
    inventoryBasisCents: num(summary?.inventoryBasisCents),
    activeValueCents: num(summary?.activeValueCents),
    staleCount: num(summary?.staleCount),
    firstSaleAt: summary?.firstSaleAt ?? null,
    latestSaleAt: summary?.latestSaleAt ?? null,
    recentSales: recentResult.results.map(mapSale)
  };
}

export async function loadInventoryPageData(
  db: D1Database,
  workspaceId: string,
  searchParams: URLSearchParams
) {
  const page = clampPage(searchParams.get('page'));
  const pageSize = 75;
  const statusValue = searchParams.get('status');
  const status = statusValue === 'unlisted' || statusValue === 'scheduled' || statusValue === 'active'
    ? statusValue
    : 'all';
  const quality = searchParams.get('quality') === 'missing' ? 'missing' : 'all';
  const age = searchParams.get('age') === 'stale' ? 'stale' : 'all';
  const query = (searchParams.get('q') ?? '').trim().slice(0, 160);

  const clauses = [`i.workspace_id = ?`, `i.status <> 'sold'`];
  const bindings: Array<string | number> = [workspaceId];

  if (status !== 'all') {
    clauses.push(`i.status = ?`);
    bindings.push(status);
  }

  if (quality === 'missing') {
    clauses.push(`(
      i.purchase_cost_cents IS NULL
      OR i.source IS NULL OR TRIM(i.source) = ''
      OR i.storage_location IS NULL OR TRIM(i.storage_location) = ''
    )`);
  }

  if (age === 'stale') {
    clauses.push(`EXISTS (
      SELECT 1 FROM listings stale_listing
      WHERE stale_listing.workspace_id = i.workspace_id
        AND stale_listing.inventory_item_id = i.id
        AND stale_listing.status = 'active'
        AND stale_listing.listed_at IS NOT NULL
        AND julianday(stale_listing.listed_at) <= julianday('now', '-91 days')
    )`);
  }

  if (query) {
    clauses.push(`LOWER(
      COALESCE(i.title, '') || ' ' ||
      COALESCE(i.sku, '') || ' ' ||
      COALESCE(i.ebay_item_id, '') || ' ' ||
      COALESCE(i.source, '') || ' ' ||
      COALESCE(i.storage_location, '') || ' ' ||
      COALESCE(i.condition_name, '')
    ) LIKE ?`);
    bindings.push(`%${query.toLowerCase()}%`);
  }

  const where = clauses.join(' AND ');

  const [countResult, summary, builtIns, customCategories] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM inventory_items i WHERE ${where}`)
      .bind(...bindings).first<{ count: number }>(),
    db.prepare(`
      WITH active_inventory AS (
        SELECT
          i.id,
          i.purchase_cost_cents AS costCents,
          MIN(l.listed_at) AS listedAt
        FROM inventory_items i
        LEFT JOIN listings l
          ON l.workspace_id = i.workspace_id
         AND l.inventory_item_id = i.id
         AND l.status = 'active'
        WHERE i.workspace_id = ?1 AND i.status = 'active'
        GROUP BY i.id
      )
      SELECT
        (SELECT COALESCE(SUM(purchase_cost_cents), 0)
           FROM inventory_items
          WHERE workspace_id = ?1 AND status <> 'sold') AS inventoryBasisCents,
        (SELECT COALESCE(SUM(price_cents), 0)
           FROM listings
          WHERE workspace_id = ?1 AND status = 'active') AS activeValueCents,
        (SELECT COUNT(*) FROM active_inventory
          WHERE listedAt IS NOT NULL AND julianday(listedAt) <= julianday('now', '-91 days')) AS staleCount,
        (SELECT COALESCE(SUM(costCents), 0) FROM active_inventory
          WHERE listedAt IS NOT NULL AND julianday(listedAt) <= julianday('now', '-91 days')) AS staleCapitalCents
    `).bind(workspaceId).first<InventorySummaryRow>(),
    loadBuiltInInventoryCategories(db, workspaceId),
    loadCustomInventoryCategories(db, workspaceId)
  ]);

  const total = num(countResult?.count);
  const meta = pagination(page, pageSize, total);
  const offset = (meta.page - 1) * pageSize;

  const rowsResult = await db.prepare(`
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
      (
        SELECT l.price_cents
        FROM listings l
        WHERE l.workspace_id = i.workspace_id
          AND l.inventory_item_id = i.id
          AND l.status IN ('active', 'scheduled')
        ORDER BY CASE l.status WHEN 'active' THEN 0 ELSE 1 END,
                 COALESCE(l.listed_at, l.created_at) DESC
        LIMIT 1
      ) AS listPriceCents,
      (
        SELECT l.listed_at
        FROM listings l
        WHERE l.workspace_id = i.workspace_id
          AND l.inventory_item_id = i.id
          AND l.status IN ('active', 'scheduled')
        ORDER BY CASE l.status WHEN 'active' THEN 0 ELSE 1 END,
                 COALESCE(l.listed_at, l.created_at) DESC
        LIMIT 1
      ) AS listedAt
    FROM inventory_items i
    WHERE ${where}
    ORDER BY
      CASE i.status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'unlisted' THEN 2 ELSE 3 END,
      COALESCE(i.updated_at, i.created_at) DESC,
      i.id DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, pageSize, offset).all<InventoryDbRow>();

  return {
    items: rowsResult.results.map(mapInventory),
    categories: [...builtIns, ...customCategories].filter((category: InventoryCategoryDefinition) => category.enabled !== false),
    filters: { status, quality, age, query },
    pagination: meta,
    summary: {
      inventoryBasisCents: num(summary?.inventoryBasisCents),
      activeValueCents: num(summary?.activeValueCents),
      staleCount: num(summary?.staleCount),
      staleCapitalCents: num(summary?.staleCapitalCents)
    }
  };
}

export async function loadSalesPageData(
  db: D1Database,
  workspaceId: string,
  searchParams: URLSearchParams
) {
  const page = clampPage(searchParams.get('page'));
  const pageSize = 75;
  const qualityValue = searchParams.get('quality');
  const quality = qualityValue === 'complete' || qualityValue === 'missing-cogs' || qualityValue === 'unmatched'
    ? qualityValue
    : 'all';
  const query = (searchParams.get('q') ?? '').trim().slice(0, 160);

  const clauses: string[] = [];
  const filterBindings: Array<string | number> = [];

  if (quality === 'complete') clauses.push(`cogsCents IS NOT NULL AND inventoryItemId IS NOT NULL`);
  if (quality === 'missing-cogs') clauses.push(`cogsCents IS NULL`);
  if (quality === 'unmatched') clauses.push(`inventoryItemId IS NULL`);
  if (query) {
    clauses.push(`LOWER(
      COALESCE(title, '') || ' ' ||
      COALESCE(ebayOrderId, '') || ' ' ||
      COALESCE(ebayItemId, '') || ' ' ||
      COALESCE(sku, '')
    ) LIKE ?`);
    filterBindings.push(`%${query.toLowerCase()}%`);
  }

  const filteredWhere = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [countResult, summary] = await Promise.all([
    db.prepare(`${SALE_ROWS_CTE}
      SELECT COUNT(*) AS count FROM sale_rows ${filteredWhere}
    `).bind(workspaceId, workspaceId, ...filterBindings).first<{ count: number }>(),
    db.prepare(`${SALE_ROWS_CTE}
      SELECT
        COUNT(*) AS totalSales,
        COALESCE(SUM(salePriceCents + shippingChargedCents), 0) AS grossCents,
        SUM(CASE WHEN cogsCents IS NULL THEN 1 ELSE 0 END) AS missingCosts,
        SUM(CASE WHEN inventoryItemId IS NULL THEN 1 ELSE 0 END) AS unmatched,
        SUM(CASE WHEN cogsCents IS NOT NULL AND inventoryItemId IS NOT NULL THEN 1 ELSE 0 END) AS completeSales,
        COALESCE(SUM(CASE
          WHEN cogsCents IS NOT NULL AND inventoryItemId IS NOT NULL
          THEN salePriceCents + shippingChargedCents ELSE 0 END), 0) AS completeGrossCents,
        COALESCE(SUM(CASE
          WHEN cogsCents IS NOT NULL AND inventoryItemId IS NOT NULL
          THEN salePriceCents + shippingChargedCents + pnlAdjustmentsCents - cogsCents
          ELSE 0 END), 0) AS completeProfitCents
      FROM sale_rows
    `).bind(workspaceId, workspaceId).first<SalesSummaryRow>()
  ]);

  const total = num(countResult?.count);
  const meta = pagination(page, pageSize, total);
  const offset = (meta.page - 1) * pageSize;

  const rowsResult = await db.prepare(`${SALE_ROWS_CTE}
    SELECT * FROM sale_rows
    ${filteredWhere}
    ORDER BY soldAt DESC, id DESC
    LIMIT ? OFFSET ?
  `).bind(workspaceId, workspaceId, ...filterBindings, pageSize, offset).all<SaleDbRow>();

  return {
    sales: rowsResult.results.map(mapSale),
    filters: { quality, query },
    pagination: meta,
    summary: {
      totalSales: num(summary?.totalSales),
      grossCents: num(summary?.grossCents),
      missingCosts: num(summary?.missingCosts),
      unmatched: num(summary?.unmatched),
      completeSales: num(summary?.completeSales),
      completeGrossCents: num(summary?.completeGrossCents),
      completeProfitCents: num(summary?.completeProfitCents)
    }
  };
}

export async function loadMoneyReport(
  db: D1Database,
  workspaceId: string,
  period: ReportPeriod
) {
  const start = periodStartIso(period);
  const saleDateClause = start ? `AND oi.sold_at >= ?` : '';
  const transactionDateClause = start ? `AND transaction_date >= ?` : '';
  const saleBindings = start ? [workspaceId, start] : [workspaceId];
  const transactionBindings = start ? [workspaceId, start] : [workspaceId];

  const [salesSummary, transactionSummary, expenseResult] = await Promise.all([
    db.prepare(`
      SELECT
        COUNT(*) AS salesCount,
        COALESCE(SUM(oi.sale_price_cents + oi.shipping_charged_cents), 0) AS grossCents,
        COALESCE(SUM(i.purchase_cost_cents), 0) AS knownCogsCents,
        SUM(CASE WHEN i.purchase_cost_cents IS NULL THEN 1 ELSE 0 END) AS missingCosts
      FROM order_items oi
      LEFT JOIN inventory_items i
        ON i.id = oi.inventory_item_id
       AND i.workspace_id = oi.workspace_id
      WHERE oi.workspace_id = ? ${saleDateClause}
    `).bind(...saleBindings).first<Pick<MoneySummaryRow, 'salesCount' | 'grossCents' | 'knownCogsCents' | 'missingCosts'>>(),
    db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN category = 'selling_fee' AND amount_cents < 0 THEN -amount_cents ELSE 0 END), 0) AS sellingFeesCents,
        COALESCE(SUM(CASE WHEN category = 'shipping_label' AND amount_cents < 0 THEN -amount_cents ELSE 0 END), 0) AS shippingLabelsCents,
        COALESCE(SUM(CASE WHEN category IN ('refund', 'dispute') AND amount_cents < 0 THEN -amount_cents ELSE 0 END), 0) AS refundsCents,
        COALESCE(SUM(CASE WHEN category = 'business_expense' AND amount_cents < 0 THEN -amount_cents ELSE 0 END), 0) AS businessExpensesCents,
        COALESCE(SUM(CASE WHEN category IN ('other_fee', 'adjustment', 'withheld_tax', 'purchase') THEN amount_cents ELSE 0 END), 0) AS otherAdjustmentsCents,
        COALESCE(SUM(CASE WHEN category IN (${PNL_CATEGORIES}) THEN amount_cents ELSE 0 END), 0) AS pnlAdjustmentsCents
      FROM financial_transactions
      WHERE workspace_id = ? ${transactionDateClause}
    `).bind(...transactionBindings).first<Pick<MoneySummaryRow,
      'sellingFeesCents' | 'shippingLabelsCents' | 'refundsCents' | 'businessExpensesCents' | 'otherAdjustmentsCents' | 'pnlAdjustmentsCents'
    >>(),
    db.prepare(`
      SELECT
        id,
        transaction_date AS transactionDate,
        description,
        expense_category AS expenseCategory,
        memo,
        amount_cents AS amountCents
      FROM financial_transactions
      WHERE workspace_id = ?
        AND category = 'business_expense'
        AND source = 'manual'
        ${start ? `AND transaction_date >= ?` : ''}
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT 10
    `).bind(...transactionBindings).all<ManualExpenseRow>()
  ]);

  const grossCents = num(salesSummary?.grossCents);
  const knownCogsCents = num(salesSummary?.knownCogsCents);
  const pnlAdjustmentsCents = num(transactionSummary?.pnlAdjustmentsCents);
  const profitCents = grossCents + pnlAdjustmentsCents - knownCogsCents;

  return {
    period,
    salesCount: num(salesSummary?.salesCount),
    grossCents,
    knownCogsCents,
    missingCosts: num(salesSummary?.missingCosts),
    sellingFeesCents: num(transactionSummary?.sellingFeesCents),
    shippingLabelsCents: num(transactionSummary?.shippingLabelsCents),
    refundsCents: num(transactionSummary?.refundsCents),
    businessExpensesCents: num(transactionSummary?.businessExpensesCents),
    otherAdjustmentsCents: num(transactionSummary?.otherAdjustmentsCents),
    pnlAdjustmentsCents,
    profitCents,
    margin: grossCents ? (profitCents / grossCents) * 100 : 0,
    manualExpenses: expenseResult.results.map((row) => ({
      ...row,
      amountCents: num(row.amountCents)
    }))
  };
}

export async function loadTransactionPageData(
  db: D1Database,
  workspaceId: string,
  searchParams: URLSearchParams
) {
  const page = clampPage(searchParams.get('page'));
  const pageSize = 100;
  const query = (searchParams.get('q') ?? '').trim().slice(0, 160);
  const category = (searchParams.get('category') ?? 'all').trim().slice(0, 60) || 'all';

  const clauses = [`workspace_id = ?`];
  const bindings: Array<string | number> = [workspaceId];

  if (category !== 'all') {
    clauses.push(`category = ?`);
    bindings.push(category);
  }

  if (query) {
    clauses.push(`LOWER(
      COALESCE(description, '') || ' ' ||
      COALESCE(transaction_type, '') || ' ' ||
      COALESCE(external_order_id, '') || ' ' ||
      COALESCE(fee_type, '') || ' ' ||
      COALESCE(memo, '')
    ) LIKE ?`);
    bindings.push(`%${query.toLowerCase()}%`);
  }

  const where = clauses.join(' AND ');

  const [countResult, categoriesResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM financial_transactions WHERE ${where}`)
      .bind(...bindings).first<{ count: number }>(),
    db.prepare(`
      SELECT DISTINCT category
      FROM financial_transactions
      WHERE workspace_id = ?
      ORDER BY category
    `).bind(workspaceId).all<{ category: FinanceCategory }>()
  ]);

  const total = num(countResult?.count);
  const meta = pagination(page, pageSize, total);
  const offset = (meta.page - 1) * pageSize;

  const rowsResult = await db.prepare(`
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
    WHERE ${where}
    ORDER BY transaction_date DESC, created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, pageSize, offset).all<TransactionDbRow>();

  return {
    transactions: rowsResult.results.map((row) => ({
      ...row,
      amountCents: num(row.amountCents),
      marketplaceProvider:
        row.marketplaceProvider === 'whatnot'
          ? 'whatnot'
          : row.marketplaceProvider === 'manual'
            ? 'manual'
            : row.marketplaceProvider === 'ebay'
              ? 'ebay'
              : 'other'
    })),
    categories: categoriesResult.results.map((row) => row.category),
    filters: { query, category },
    pagination: meta
  };
}

export async function loadInsightsReport(
  db: D1Database,
  workspaceId: string,
  period: ReportPeriod
) {
  const start = periodStartIso(period);
  const dateWhere = start ? `WHERE soldAt >= ?` : '';
  const periodBindings = start ? [workspaceId, workspaceId, start] : [workspaceId, workspaceId];

  const [summary, categoryResult, sourceResult, bestResult, lowestResult, ageSummary] = await Promise.all([
    db.prepare(`${SALE_ROWS_CTE}
      SELECT
        COUNT(*) AS sales,
        COALESCE(SUM(salePriceCents + shippingChargedCents), 0) AS grossCents,
        COALESCE(SUM(salePriceCents + shippingChargedCents + pnlAdjustmentsCents - COALESCE(cogsCents, 0)), 0) AS profitCents,
        SUM(CASE WHEN cogsCents IS NULL THEN 1 ELSE 0 END) AS missingCosts,
        SUM(CASE WHEN cogsCents IS NOT NULL THEN 1 ELSE 0 END) AS fullyCostedSales,
        COALESCE(SUM(CASE WHEN cogsCents IS NOT NULL THEN salePriceCents + shippingChargedCents + pnlAdjustmentsCents - cogsCents ELSE 0 END), 0) AS fullyCostedProfitCents,
        COALESCE(SUM(CASE WHEN cogsCents IS NOT NULL THEN cogsCents ELSE 0 END), 0) AS fullyCostedCogsCents
      FROM sale_rows ${dateWhere}
    `).bind(...periodBindings).first<InsightSummaryRow>(),
    db.prepare(`${SALE_ROWS_CTE}
      SELECT
        COALESCE(NULLIF(REPLACE(category, '_', ' '), ''), 'Uncategorized') AS key,
        COUNT(*) AS sales,
        COALESCE(SUM(salePriceCents + shippingChargedCents), 0) AS grossCents,
        COALESCE(SUM(CASE WHEN cogsCents IS NOT NULL THEN cogsCents ELSE 0 END), 0) AS cogsCents,
        COALESCE(SUM(salePriceCents + shippingChargedCents + pnlAdjustmentsCents - COALESCE(cogsCents, 0)), 0) AS profitCents,
        SUM(CASE WHEN cogsCents IS NULL THEN 1 ELSE 0 END) AS missingCosts
      FROM sale_rows ${dateWhere}
      GROUP BY key
      ORDER BY profitCents DESC, sales DESC
      LIMIT 8
    `).bind(...periodBindings).all<InsightGroupRow>(),
    db.prepare(`${SALE_ROWS_CTE}
      SELECT
        COALESCE(NULLIF(TRIM(source), ''), 'Source not set') AS key,
        COUNT(*) AS sales,
        COALESCE(SUM(salePriceCents + shippingChargedCents), 0) AS grossCents,
        COALESCE(SUM(CASE WHEN cogsCents IS NOT NULL THEN cogsCents ELSE 0 END), 0) AS cogsCents,
        COALESCE(SUM(salePriceCents + shippingChargedCents + pnlAdjustmentsCents - COALESCE(cogsCents, 0)), 0) AS profitCents,
        SUM(CASE WHEN cogsCents IS NULL THEN 1 ELSE 0 END) AS missingCosts
      FROM sale_rows ${dateWhere}
      GROUP BY key
      ORDER BY profitCents DESC, sales DESC
      LIMIT 8
    `).bind(...periodBindings).all<InsightGroupRow>(),
    db.prepare(`${SALE_ROWS_CTE}
      SELECT * FROM sale_rows
      ${start ? `WHERE soldAt >= ? AND cogsCents IS NOT NULL` : `WHERE cogsCents IS NOT NULL`}
      ORDER BY (salePriceCents + shippingChargedCents + pnlAdjustmentsCents - cogsCents) DESC
      LIMIT 5
    `).bind(...periodBindings).all<SaleDbRow>(),
    db.prepare(`${SALE_ROWS_CTE}
      SELECT * FROM sale_rows
      ${start ? `WHERE soldAt >= ? AND cogsCents IS NOT NULL` : `WHERE cogsCents IS NOT NULL`}
      ORDER BY (salePriceCents + shippingChargedCents + pnlAdjustmentsCents - cogsCents) ASC
      LIMIT 5
    `).bind(...periodBindings).all<SaleDbRow>(),
    db.prepare(`
      WITH active_inventory AS (
        SELECT
          i.id,
          i.purchase_cost_cents AS costCents,
          MIN(l.listed_at) AS listedAt,
          CAST(
            julianday('now') - julianday(COALESCE(MIN(l.listed_at), datetime('now')))
            AS INTEGER
          ) AS ageDays
        FROM inventory_items i
        LEFT JOIN listings l
          ON l.workspace_id = i.workspace_id
         AND l.inventory_item_id = i.id
         AND l.status = 'active'
        WHERE i.workspace_id = ?
          AND i.status = 'active'
        GROUP BY i.id
      )
      SELECT
        SUM(CASE WHEN ageDays <= 30 THEN 1 ELSE 0 END) AS count0to30,
        COALESCE(SUM(CASE WHEN ageDays <= 30 THEN costCents ELSE 0 END), 0) AS cost0to30,
        SUM(CASE WHEN ageDays BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS count31to60,
        COALESCE(SUM(CASE WHEN ageDays BETWEEN 31 AND 60 THEN costCents ELSE 0 END), 0) AS cost31to60,
        SUM(CASE WHEN ageDays BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS count61to90,
        COALESCE(SUM(CASE WHEN ageDays BETWEEN 61 AND 90 THEN costCents ELSE 0 END), 0) AS cost61to90,
        SUM(CASE WHEN ageDays >= 91 THEN 1 ELSE 0 END) AS count91plus,
        COALESCE(SUM(CASE WHEN ageDays >= 91 THEN costCents ELSE 0 END), 0) AS cost91plus
      FROM active_inventory
    `).bind(workspaceId).first<AgeSummaryRow>()
  ]);

  const fullyCostedSales = num(summary?.fullyCostedSales);
  const fullyCostedProfitCents = num(summary?.fullyCostedProfitCents);
  const fullyCostedCogsCents = num(summary?.fullyCostedCogsCents);

  const mapGroup = (row: InsightGroupRow) => {
    const grossCents = num(row.grossCents);
    const profitCents = num(row.profitCents);
    const cogsCents = num(row.cogsCents);
    const missingCosts = num(row.missingCosts);
    return {
      key: row.key,
      sales: num(row.sales),
      grossCents,
      cogsCents,
      profitCents,
      missingCosts,
      margin: grossCents ? (profitCents / grossCents) * 100 : 0,
      roi: missingCosts === 0 && cogsCents > 0 ? (profitCents / cogsCents) * 100 : null
    };
  };

  return {
    period,
    summary: {
      sales: num(summary?.sales),
      grossCents: num(summary?.grossCents),
      profitCents: num(summary?.profitCents),
      missingCosts: num(summary?.missingCosts),
      fullyCostedSales,
      avgProfitCents: fullyCostedSales ? fullyCostedProfitCents / fullyCostedSales : 0,
      roi: fullyCostedCogsCents > 0 ? (fullyCostedProfitCents / fullyCostedCogsCents) * 100 : null
    },
    byCategory: categoryResult.results.map(mapGroup),
    bySource: sourceResult.results.map(mapGroup),
    bestSales: bestResult.results.map(mapSale),
    lowestSales: lowestResult.results.map(mapSale),
    ageBuckets: [
      { label: '0–30 days', count: num(ageSummary?.count0to30), costCents: num(ageSummary?.cost0to30) },
      { label: '31–60 days', count: num(ageSummary?.count31to60), costCents: num(ageSummary?.cost31to60) },
      { label: '61–90 days', count: num(ageSummary?.count61to90), costCents: num(ageSummary?.cost61to90) },
      { label: '91+ days', count: num(ageSummary?.count91plus), costCents: num(ageSummary?.cost91plus) }
    ]
  };
}

export async function loadIntegrityReport(db: D1Database, workspaceId: string) {
  type Row = {
    orphanListings: number | null;
    crossWorkspaceListings: number | null;
    orphanOrderItems: number | null;
    crossWorkspaceOrders: number | null;
    crossWorkspaceInventoryLinks: number | null;
    crossWorkspacePurchaseLots: number | null;
    crossWorkspaceSkuReservations: number | null;
    duplicateSkus: number | null;
    unmatchedSales: number | null;
    missingSaleCosts: number | null;
  };

  const row = await db.prepare(`
    SELECT
      (SELECT COUNT(*)
         FROM listings l
         LEFT JOIN inventory_items i ON i.id = l.inventory_item_id
        WHERE l.workspace_id = ?1 AND i.id IS NULL) AS orphanListings,
      (SELECT COUNT(*)
         FROM listings l
         JOIN inventory_items i ON i.id = l.inventory_item_id
        WHERE l.workspace_id = ?1 AND i.workspace_id <> l.workspace_id) AS crossWorkspaceListings,
      (SELECT COUNT(*)
         FROM order_items oi
         LEFT JOIN orders o ON o.id = oi.order_id
        WHERE oi.workspace_id = ?1 AND o.id IS NULL) AS orphanOrderItems,
      (SELECT COUNT(*)
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.workspace_id = ?1 AND o.workspace_id <> oi.workspace_id) AS crossWorkspaceOrders,
      (SELECT COUNT(*)
         FROM order_items oi
         JOIN inventory_items i ON i.id = oi.inventory_item_id
        WHERE oi.workspace_id = ?1
          AND oi.inventory_item_id IS NOT NULL
          AND i.workspace_id <> oi.workspace_id) AS crossWorkspaceInventoryLinks,
      (SELECT COUNT(*)
         FROM inventory_items i
         JOIN purchase_lots p ON p.id = i.purchase_lot_id
        WHERE i.workspace_id = ?1
          AND i.purchase_lot_id IS NOT NULL
          AND p.workspace_id <> i.workspace_id) AS crossWorkspacePurchaseLots,
      (SELECT COUNT(*)
         FROM sku_reservations s
         JOIN inventory_items i ON i.id = s.inventory_item_id
        WHERE s.workspace_id = ?1
          AND s.inventory_item_id IS NOT NULL
          AND i.workspace_id <> s.workspace_id) AS crossWorkspaceSkuReservations,
      (SELECT COUNT(*) FROM (
         SELECT LOWER(TRIM(sku)) AS normalizedSku
         FROM inventory_items
         WHERE workspace_id = ?1 AND sku IS NOT NULL AND TRIM(sku) <> ''
         GROUP BY LOWER(TRIM(sku))
         HAVING COUNT(*) > 1
      )) AS duplicateSkus,
      (SELECT COUNT(*) FROM order_items
        WHERE workspace_id = ?1 AND inventory_item_id IS NULL) AS unmatchedSales,
      (SELECT COUNT(*)
         FROM order_items oi
         LEFT JOIN inventory_items i
           ON i.id = oi.inventory_item_id AND i.workspace_id = oi.workspace_id
        WHERE oi.workspace_id = ?1
          AND (oi.inventory_item_id IS NULL OR i.purchase_cost_cents IS NULL)) AS missingSaleCosts
  `).bind(workspaceId).first<Row>();

  const structural = {
    orphanListings: num(row?.orphanListings),
    crossWorkspaceListings: num(row?.crossWorkspaceListings),
    orphanOrderItems: num(row?.orphanOrderItems),
    crossWorkspaceOrders: num(row?.crossWorkspaceOrders),
    crossWorkspaceInventoryLinks: num(row?.crossWorkspaceInventoryLinks),
    crossWorkspacePurchaseLots: num(row?.crossWorkspacePurchaseLots),
    crossWorkspaceSkuReservations: num(row?.crossWorkspaceSkuReservations),
    duplicateSkus: num(row?.duplicateSkus)
  };

  return {
    structural,
    structuralIssues: Object.values(structural).reduce((sum, value) => sum + value, 0),
    cleanup: {
      unmatchedSales: num(row?.unmatchedSales),
      missingSaleCosts: num(row?.missingSaleCosts)
    },
    checkedAt: new Date().toISOString()
  };
}
