import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  types: path.join(root, 'src/lib/types.ts'),
  pageServer: path.join(root, 'src/routes/+page.server.ts'),
  page: path.join(root, 'src/routes/+page.svelte'),
  syncEndpoint: path.join(root, 'src/routes/api/ebay/sync/+server.ts'),
  wrangler: path.join(root, 'wrangler.jsonc'),
  theme: path.join(root, 'src/sellquity-theme.css'),
  worker: path.join(root, 'worker.js')
};

for (const required of [files.types, files.pageServer, files.page, files.syncEndpoint, files.wrangler, files.theme]) {
  if (!fs.existsSync(required)) {
    console.error(`Missing expected Sellquity file: ${path.relative(root, required)}`);
    process.exit(1);
  }
}

const original = {
  types: fs.readFileSync(files.types, 'utf8'),
  pageServer: fs.readFileSync(files.pageServer, 'utf8'),
  page: fs.readFileSync(files.page, 'utf8'),
  syncEndpoint: fs.readFileSync(files.syncEndpoint, 'utf8'),
  wrangler: fs.readFileSync(files.wrangler, 'utf8'),
  theme: fs.readFileSync(files.theme, 'utf8'),
  worker: fs.existsSync(files.worker) ? fs.readFileSync(files.worker, 'utf8') : null
};

function replaceRequired(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}. Your repo may have moved past the version this patch targets.`);
  }
  return source.replace(search, replacement);
}

function insertBeforeLast(source, needle, insertion, label) {
  const index = source.lastIndexOf(needle);
  if (index < 0) throw new Error(`${label}: could not find ${needle}`);
  return source.slice(0, index) + insertion + source.slice(index);
}

let types = original.types;
let pageServer = original.pageServer;
let page = original.page;
let wrangler = original.wrangler;
let theme = original.theme;

try {
  // -------------------------------------------------------------------------
  // 1) Dashboard data: expose the connected eBay account display name/status.
  // -------------------------------------------------------------------------
  types = replaceRequired(
    types,
    `  lastSyncedAt: string | null;\n  unallocatedNetCents: number;`,
    `  lastSyncedAt: string | null;\n  ebayConnection?: {\n    displayName: string;\n    status: string;\n  } | null;\n  unallocatedNetCents: number;`,
    'types.ts eBay connection shape'
  );

  pageServer = replaceRequired(
    pageServer,
    `type AccountRow = { lastSyncedAt: string | null };`,
    `type AccountRow = {\n  lastSyncedAt: string | null;\n  displayName: string | null;\n  status: string | null;\n};`,
    '+page.server.ts AccountRow'
  );

  pageServer = replaceRequired(
    pageServer,
    `    const account = await db.prepare(\n      'SELECT last_synced_at AS lastSyncedAt FROM ebay_accounts WHERE workspace_id = ? ORDER BY created_at LIMIT 1'\n    ).bind(workspaceId).first<AccountRow>();`,
    `    const account = await db.prepare(\`\n      SELECT\n        ea.last_synced_at AS lastSyncedAt,\n        ma.display_name AS displayName,\n        ma.status AS status\n      FROM ebay_accounts ea\n      LEFT JOIN marketplace_accounts ma\n        ON ma.workspace_id = ea.workspace_id\n       AND ma.provider = 'ebay'\n       AND ma.external_account_id = 'primary'\n      WHERE ea.workspace_id = ?\n      ORDER BY ea.created_at\n      LIMIT 1\n    \`).bind(workspaceId).first<AccountRow>();`,
    '+page.server.ts account query'
  );

  pageServer = replaceRequired(
    pageServer,
    `      lastSyncedAt: account?.lastSyncedAt ?? null,\n      inventory,`,
    `      lastSyncedAt: account?.lastSyncedAt ?? null,\n      ebayConnection: account ? {\n        displayName: account.displayName ?? 'eBay',\n        status: account.status ?? 'connected'\n      } : null,\n      inventory,`,
    '+page.server.ts dashboard connection payload'
  );

  // -------------------------------------------------------------------------
  // 2) Dashboard: API-first health, sync feedback, and transparent profit math.
  // -------------------------------------------------------------------------
  page = replaceRequired(
    page,
    `    | 'missing-source'\n    | 'active-import'\n    | 'transaction-import';`,
    `    | 'missing-source'\n    | 'ebay-sync'\n    | 'active-import'\n    | 'transaction-import';`,
    '+page.svelte ActionId'
  );

  page = replaceRequired(
    page,
    `  let syncing = $state(false);\n  let editing = $state<InventoryRow | null>(null);`,
    `  let syncing = $state(false);\n  let syncMessage = $state<string | null>(null);\n  let editing = $state<InventoryRow | null>(null);`,
    '+page.svelte sync state'
  );

  const oldDashboardMetrics = `  const dashboardMetrics = $derived.by(() => {\n    const gross = dashboardSales.reduce(\n      (sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents,\n      0\n    );\n    const cogs = dashboardSales.reduce((sum, sale) => sum + (sale.cogsCents ?? 0), 0);\n    const missingCogs = dashboardSales.filter((sale) => sale.cogsCents == null).length;\n    const pnlAdjustments = dashboardTransactions.reduce(\n      (sum, transaction) => sum + (\n        PNL_CATEGORIES.has(transaction.category) ? transaction.amountCents : 0\n      ),\n      0\n    );\n    const profit = gross + pnlAdjustments - cogs;\n    return {\n      gross,\n      cogs,\n      missingCogs,\n      pnlAdjustments,\n      profit,\n      margin: gross ? (profit / gross) * 100 : 0\n    };\n  });`;

  const newDashboardMetrics = `  const dashboardMetrics = $derived.by(() => {\n    const gross = dashboardSales.reduce(\n      (sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents,\n      0\n    );\n    const cogs = dashboardSales.reduce((sum, sale) => sum + (sale.cogsCents ?? 0), 0);\n    const missingCogs = dashboardSales.filter((sale) => sale.cogsCents == null).length;\n    const pnlAdjustments = dashboardTransactions.reduce(\n      (sum, transaction) => sum + (\n        PNL_CATEGORIES.has(transaction.category) ? transaction.amountCents : 0\n      ),\n      0\n    );\n    const sellingFees = dashboardTransactions.reduce(\n      (sum, transaction) => sum + (\n        transaction.category === 'selling_fee' && transaction.amountCents < 0\n          ? -transaction.amountCents : 0\n      ),\n      0\n    );\n    const shippingLabels = dashboardTransactions.reduce(\n      (sum, transaction) => sum + (\n        transaction.category === 'shipping_label' && transaction.amountCents < 0\n          ? -transaction.amountCents : 0\n      ),\n      0\n    );\n    const refundsDisputes = dashboardTransactions.reduce(\n      (sum, transaction) => sum + (\n        (transaction.category === 'refund' || transaction.category === 'dispute') && transaction.amountCents < 0\n          ? -transaction.amountCents : 0\n      ),\n      0\n    );\n    const otherAdjustments = dashboardTransactions.reduce(\n      (sum, transaction) => sum + (\n        ['other_fee', 'adjustment', 'withheld_tax', 'purchase'].includes(transaction.category)\n          ? transaction.amountCents : 0\n      ),\n      0\n    );\n    const profit = gross + pnlAdjustments - cogs;\n    return {\n      gross,\n      cogs,\n      missingCogs,\n      pnlAdjustments,\n      sellingFees,\n      shippingLabels,\n      refundsDisputes,\n      otherAdjustments,\n      profit,\n      margin: gross ? (profit / gross) * 100 : 0\n    };\n  });`;

  page = replaceRequired(page, oldDashboardMetrics, newDashboardMetrics, '+page.svelte dashboard metrics');

  page = replaceRequired(
    page,
    `      if (transactionProvider(transaction) !== 'ebay' || transaction.source !== 'ebay_csv') continue;`,
    `      if (transactionProvider(transaction) !== 'ebay') continue;\n      if (transaction.source !== 'ebay_api' && transaction.source !== 'ebay_csv') continue;`,
    '+page.svelte latest eBay transaction source'
  );

  page = replaceRequired(
    page,
    `  function daysSince(value?: string | null) {\n    if (!value) return null;\n    const timestamp = Date.parse(value);\n    if (!Number.isFinite(timestamp)) return null;\n    return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));\n  }`,
    `  function daysSince(value?: string | null) {\n    if (!value) return null;\n    const timestamp = Date.parse(value);\n    if (!Number.isFinite(timestamp)) return null;\n    return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));\n  }\n\n  function shortDateTime(value?: string | null) {\n    if (!value) return 'Never';\n    const date = new Date(value);\n    if (!Number.isFinite(date.getTime())) return 'Never';\n    return new Intl.DateTimeFormat('en-US', {\n      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'\n    }).format(date);\n  }`,
    '+page.svelte date/time helper'
  );

  const importFreshnessBlockEnd = `  const importFreshness = $derived.by(() => {\n    const active = data.importFreshness?.activeListings ?? {\n      importedAt: null,\n      rowsImported: 0,\n      filename: null\n    };\n    const transactions = data.importFreshness?.transactions ?? {\n      importedAt: null,\n      dataThrough: latestEbayDataAt,\n      rowsImported: 0,\n      filename: null\n    };\n\n    const activeAgeDays = daysSince(active.importedAt);\n    const transactionAgeDays = daysSince(transactions.dataThrough ?? latestEbayDataAt);\n\n    return {\n      active: {\n        ...active,\n        ageDays: activeAgeDays,\n        state: freshnessState(activeAgeDays, 7, 14)\n      },\n      transactions: {\n        ...transactions,\n        dataThrough: transactions.dataThrough ?? latestEbayDataAt,\n        ageDays: transactionAgeDays,\n        state: freshnessState(transactionAgeDays, 3, 7)\n      }\n    };\n  });`;

  const liveFreshnessAppend = `${importFreshnessBlockEnd}\n\n  const latestEbayOrderAt = $derived.by(() => {\n    let latest: string | null = null;\n    let latestTimestamp = -Infinity;\n    for (const sale of data.sales) {\n      if (saleProvider(sale) !== 'ebay') continue;\n      const timestamp = Date.parse(sale.soldAt);\n      if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {\n        latestTimestamp = timestamp;\n        latest = sale.soldAt;\n      }\n    }\n    return latest;\n  });\n\n  const liveEbayFreshness = $derived.by(() => {\n    const syncedTimestamp = data.lastSyncedAt ? Date.parse(data.lastSyncedAt) : NaN;\n    const ageMinutes = Number.isFinite(syncedTimestamp)\n      ? Math.max(0, Math.floor((Date.now() - syncedTimestamp) / 60_000))\n      : null;\n\n    const state: 'current' | 'due' | 'stale' | 'missing' =\n      !data.connected || ageMinutes == null\n        ? 'missing'\n        : ageMinutes <= 60\n          ? 'current'\n          : ageMinutes <= 360\n            ? 'due'\n            : 'stale';\n\n    return {\n      state,\n      ageMinutes,\n      syncedAt: data.lastSyncedAt,\n      ordersThrough: latestEbayOrderAt,\n      financesThrough: latestEbayDataAt\n    };\n  });`;

  page = replaceRequired(page, importFreshnessBlockEnd, liveFreshnessAppend, '+page.svelte live eBay freshness');

  const oldImportActions = `    if (importFreshness.active.state !== 'current') {\n      items.push({\n        id: 'active-import',\n        bucket: 'import',\n        severity: importFreshness.active.state === 'stale' || importFreshness.active.state === 'missing'\n          ? 'warning'\n          : 'info',\n        count: 1,\n        title: importFreshness.active.state === 'missing'\n          ? 'Active inventory snapshot not imported'\n          : 'Active inventory snapshot getting old',\n        detail: importFreshness.active.ageDays == null\n          ? 'Import Seller Hub → Listings → All active listings.'\n          : \`Last active snapshot was \${importFreshness.active.ageDays} day\${importFreshness.active.ageDays === 1 ? '' : 's'} ago.\`\n      });\n    }\n\n    if (importFreshness.transactions.state !== 'current') {\n      items.push({\n        id: 'transaction-import',\n        bucket: 'import',\n        severity: importFreshness.transactions.state === 'stale' || importFreshness.transactions.state === 'missing'\n          ? 'warning'\n          : 'info',\n        count: 1,\n        title: importFreshness.transactions.state === 'missing'\n          ? 'Transaction history not imported'\n          : 'Transaction report is due',\n        detail: importFreshness.transactions.ageDays == null\n          ? 'Import the eBay Payments Transaction report.'\n          : \`Financial data is through \${importFreshness.transactions.dataThrough ? shortDate(importFreshness.transactions.dataThrough) : 'an unknown date'}.\`\n      });\n    }`;

  const newImportActions = `    if (data.connected) {\n      if (liveEbayFreshness.state !== 'current') {\n        items.push({\n          id: 'ebay-sync',\n          bucket: 'import',\n          severity: liveEbayFreshness.state === 'stale' || liveEbayFreshness.state === 'missing'\n            ? 'warning'\n            : 'info',\n          count: 1,\n          title: liveEbayFreshness.state === 'missing'\n            ? 'Live eBay sync has not run yet'\n            : 'Live eBay sync is due',\n          detail: liveEbayFreshness.ageMinutes == null\n            ? 'Run Sync eBay to pull listings, orders, and finances from the live APIs.'\n            : \`Last successful API sync was \${liveEbayFreshness.ageMinutes} minute\${liveEbayFreshness.ageMinutes === 1 ? '' : 's'} ago.\`\n        });\n      }\n    } else {\n      if (importFreshness.active.state !== 'current') {\n        items.push({\n          id: 'active-import',\n          bucket: 'import',\n          severity: importFreshness.active.state === 'stale' || importFreshness.active.state === 'missing'\n            ? 'warning'\n            : 'info',\n          count: 1,\n          title: importFreshness.active.state === 'missing'\n            ? 'Active inventory snapshot not imported'\n            : 'Active inventory snapshot getting old',\n          detail: importFreshness.active.ageDays == null\n            ? 'Import Seller Hub → Listings → All active listings.'\n            : \`Last active snapshot was \${importFreshness.active.ageDays} day\${importFreshness.active.ageDays === 1 ? '' : 's'} ago.\`\n        });\n      }\n\n      if (importFreshness.transactions.state !== 'current') {\n        items.push({\n          id: 'transaction-import',\n          bucket: 'import',\n          severity: importFreshness.transactions.state === 'stale' || importFreshness.transactions.state === 'missing'\n            ? 'warning'\n            : 'info',\n          count: 1,\n          title: importFreshness.transactions.state === 'missing'\n            ? 'Transaction history not imported'\n            : 'Transaction report is due',\n          detail: importFreshness.transactions.ageDays == null\n            ? 'Import the eBay Payments Transaction report.'\n            : \`Financial data is through \${importFreshness.transactions.dataThrough ? shortDate(importFreshness.transactions.dataThrough) : 'an unknown date'}.\`\n        });\n      }\n    }`;

  page = replaceRequired(page, oldImportActions, newImportActions, '+page.svelte API-first action queue');

  const oldHealth = `  const actionHealth = $derived.by(() => {\n    const checks = [\n      allMissingSaleCosts.length === 0,\n      unmatchedSales.length === 0,\n      unsoldMissingCost.length === 0,\n      unsoldOtherCategory.length === 0,\n      unsoldMissingLocation.length === 0,\n      unsoldMissingSource.length === 0,\n      importFreshness.active.state === 'current',\n      importFreshness.transactions.state === 'current'\n    ];\n    const clear = checks.filter(Boolean).length;\n\n    return {\n      clear,\n      total: checks.length,\n      score: Math.round((clear / checks.length) * 100)\n    };\n  });`;

  const newHealth = `  const actionHealth = $derived.by(() => {\n    const eBayDataChecks = data.connected\n      ? [data.connected, liveEbayFreshness.state === 'current']\n      : [\n          importFreshness.active.state === 'current',\n          importFreshness.transactions.state === 'current'\n        ];\n\n    const checks = [\n      allMissingSaleCosts.length === 0,\n      unmatchedSales.length === 0,\n      unsoldMissingCost.length === 0,\n      unsoldOtherCategory.length === 0,\n      unsoldMissingLocation.length === 0,\n      unsoldMissingSource.length === 0,\n      ...eBayDataChecks\n    ];\n    const clear = checks.filter(Boolean).length;\n\n    return {\n      clear,\n      total: checks.length,\n      score: Math.round((clear / checks.length) * 100)\n    };\n  });`;

  page = replaceRequired(page, oldHealth, newHealth, '+page.svelte data health');

  page = replaceRequired(
    page,
    `    if (action === 'active-import' || action === 'transaction-import') {\n      window.location.assign('/import');\n    }`,
    `    if (action === 'ebay-sync') {\n      void syncNow();\n      return;\n    }\n\n    if (action === 'active-import' || action === 'transaction-import') {\n      window.location.assign('/import');\n    }`,
    '+page.svelte runAction live sync'
  );

  const oldSyncNow = `  async function syncNow() {\n    syncing = true;\n    const response = await fetch('/api/ebay/sync', { method: 'POST' });\n    if (response.redirected) window.location.href = response.url;\n    else {\n      syncing = false;\n      await invalidateAll();\n    }\n  }`;

  const newSyncNow = `  async function syncNow() {\n    syncing = true;\n    syncMessage = null;\n\n    try {\n      const response = await fetch('/api/ebay/sync', { method: 'POST' });\n      const result = await response.json().catch(() => null) as {\n        listings?: number;\n        scheduled?: number;\n        orders?: number;\n        transactions?: number;\n        error?: string;\n      } | null;\n\n      if (!response.ok) {\n        syncMessage = \`Sync failed — \${result?.error ?? 'eBay did not complete the sync.'}\`;\n        return;\n      }\n\n      syncMessage =\n        \`Live sync complete — \${result?.listings ?? 0} active, \` +\n        \`\${result?.scheduled ?? 0} scheduled, \${result?.orders ?? 0} orders, \` +\n        \`\${result?.transactions ?? 0} finance transactions.\`;\n      await invalidateAll();\n    } catch {\n      syncMessage = 'Sync failed — Sellquity could not reach the eBay sync endpoint.';\n    } finally {\n      syncing = false;\n    }\n  }`;

  page = replaceRequired(page, oldSyncNow, newSyncNow, '+page.svelte syncNow JSON flow');

  page = replaceRequired(
    page,
    `    </header>\n\n    {#if view === 'dashboard' || view === 'sales' || view === 'accounting' || view === 'reports'}`,
    `    </header>\n\n    {#if syncMessage}\n      <div class:bad={syncMessage.startsWith('Sync failed')} class="sync-banner">\n        {#if syncMessage.startsWith('Sync failed')}<AlertTriangle size={15} />{:else}<Check size={15} />{/if}\n        <span>{syncMessage}</span>\n      </div>\n    {/if}\n\n    {#if view === 'dashboard' || view === 'sales' || view === 'accounting' || view === 'reports'}`,
    '+page.svelte sync banner'
  );

  page = replaceRequired(
    page,
    `        </section>\n\n        <section class:compact={actionQueue.length === 0} class="panel action-center-panel">`,
    `        </section>\n\n        <section class="panel profit-bridge" aria-label="eBay profit reconciliation">\n          <div class="profit-bridge-head">\n            <div><span class="kicker">LIVE P&L CHECK</span><h2>Where net profit comes from</h2></div>\n            <span class:pending={!dashboardProfitIsFinal} class="profit-bridge-state">\n              {dashboardProfitIsFinal ? 'RECONCILED' : dashboardMetrics.missingCogs ? \`\${dashboardMetrics.missingCogs} COGS MISSING\` : 'FINANCES PENDING'}\n            </span>\n          </div>\n          <div class="profit-bridge-grid">\n            <span><small>Gross sales</small><strong>{money(dashboardMetrics.gross)}</strong></span>\n            <span><small>eBay fees</small><strong class="negative">−{money(dashboardMetrics.sellingFees)}</strong></span>\n            <span><small>Shipping labels</small><strong class="negative">−{money(dashboardMetrics.shippingLabels)}</strong></span>\n            <span><small>Refunds / disputes</small><strong class="negative">−{money(dashboardMetrics.refundsDisputes)}</strong></span>\n            <span><small>Other adjustments</small><strong>{formatSigned(dashboardMetrics.otherAdjustments)}</strong></span>\n            <span><small>COGS</small><strong class="negative">−{money(dashboardMetrics.cogs)}</strong></span>\n            <span class="profit-bridge-total"><small>Net profit</small><strong>{money(dashboardMetrics.profit)}</strong></span>\n          </div>\n        </section>\n\n        <section class:compact={actionQueue.length === 0} class="panel action-center-panel">`,
    '+page.svelte profit reconciliation strip'
  );

  const oldFeed = `              <aside class="action-feed-summary">\n                <div class="action-feed-head">\n                  <span><FileSpreadsheet size={15} /> eBay data</span>\n                  <a href="/import">Import <ChevronRight size={13} /></a>\n                </div>\n                <div class={\`feed-status \${importFreshness.active.state}\`}>\n                  <span>\n                    <small>Inventory snapshot</small>\n                    <strong>{importFreshness.active.importedAt ? shortDate(importFreshness.active.importedAt) : 'Not imported'}</strong>\n                  </span>\n                  <b>{importFreshness.active.state}</b>\n                </div>\n                <div class={\`feed-status \${importFreshness.transactions.state}\`}>\n                  <span>\n                    <small>Transactions through</small>\n                    <strong>{importFreshness.transactions.dataThrough ? shortDate(importFreshness.transactions.dataThrough) : 'Not imported'}</strong>\n                  </span>\n                  <b>{importFreshness.transactions.state}</b>\n                </div>\n              </aside>`;

  const newFeed = `              <aside class="action-feed-summary">\n                {#if data.connected}\n                  <div class="action-feed-head">\n                    <span><PlugZap size={15} /> eBay live data</span>\n                    <a href="/integrations/ebay">Manage <ChevronRight size={13} /></a>\n                  </div>\n                  <div class="feed-status current">\n                    <span><small>Connection</small><strong>{data.ebayConnection?.displayName ?? 'eBay'}</strong></span>\n                    <b>live</b>\n                  </div>\n                  <div class="feed-status current">\n                    <span><small>Listings</small><strong>{activeItems.length} active</strong></span>\n                    <b>synced</b>\n                  </div>\n                  <div class={\`feed-status \${liveEbayFreshness.state}\`}>\n                    <span><small>Orders through</small><strong>{liveEbayFreshness.ordersThrough ? shortDate(liveEbayFreshness.ordersThrough) : 'No recent orders'}</strong></span>\n                    <b>{liveEbayFreshness.ordersThrough ? 'current' : 'ready'}</b>\n                  </div>\n                  <div class={\`feed-status \${liveEbayFreshness.state}\`}>\n                    <span><small>Finances through</small><strong>{liveEbayFreshness.financesThrough ? shortDate(liveEbayFreshness.financesThrough) : 'No recent transactions'}</strong></span>\n                    <b>{liveEbayFreshness.financesThrough ? 'current' : 'ready'}</b>\n                  </div>\n                  <div class={\`feed-status \${liveEbayFreshness.state}\`}>\n                    <span><small>Last API sync</small><strong>{shortDateTime(liveEbayFreshness.syncedAt)}</strong></span>\n                    <b>{liveEbayFreshness.state}</b>\n                  </div>\n                {:else}\n                  <div class="action-feed-head">\n                    <span><FileSpreadsheet size={15} /> eBay data</span>\n                    <a href="/import">Import <ChevronRight size={13} /></a>\n                  </div>\n                  <div class={\`feed-status \${importFreshness.active.state}\`}>\n                    <span>\n                      <small>Inventory snapshot</small>\n                      <strong>{importFreshness.active.importedAt ? shortDate(importFreshness.active.importedAt) : 'Not imported'}</strong>\n                    </span>\n                    <b>{importFreshness.active.state}</b>\n                  </div>\n                  <div class={\`feed-status \${importFreshness.transactions.state}\`}>\n                    <span>\n                      <small>Transactions through</small>\n                      <strong>{importFreshness.transactions.dataThrough ? shortDate(importFreshness.transactions.dataThrough) : 'Not imported'}</strong>\n                    </span>\n                    <b>{importFreshness.transactions.state}</b>\n                  </div>\n                {/if}\n              </aside>`;

  page = replaceRequired(page, oldFeed, newFeed, '+page.svelte live eBay feed summary');

  const oldClear = `            <div class="action-clear-row">\n              <span class="action-clear-icon"><Check size={19} /></span>\n              <span class="action-clear-copy">\n                <strong>Nothing needs cleanup right now.</strong>\n                <small>Inventory data is complete and both eBay feeds are current.</small>\n              </span>\n              <span class={\`feed-chip \${importFreshness.active.state}\`}>\n                Inventory · {importFreshness.active.importedAt ? shortDate(importFreshness.active.importedAt) : 'not imported'}\n              </span>\n              <span class={\`feed-chip \${importFreshness.transactions.state}\`}>\n                Transactions · {importFreshness.transactions.dataThrough ? shortDate(importFreshness.transactions.dataThrough) : 'not imported'}\n              </span>\n              <a class="action-clear-link" href="/import">Import data <ChevronRight size={14} /></a>\n            </div>`;

  const newClear = `            <div class="action-clear-row">\n              <span class="action-clear-icon"><Check size={19} /></span>\n              <span class="action-clear-copy">\n                <strong>Nothing needs cleanup right now.</strong>\n                <small>{data.connected ? 'Inventory is clean and the live eBay API sync is current.' : 'Inventory data is complete and both manual eBay feeds are current.'}</small>\n              </span>\n              {#if data.connected}\n                <span class={\`feed-chip \${liveEbayFreshness.state}\`}>API sync · {shortDateTime(liveEbayFreshness.syncedAt)}</span>\n                <span class="feed-chip current">Listings · {activeItems.length} active</span>\n                <a class="action-clear-link" href="/integrations/ebay">Manage eBay <ChevronRight size={14} /></a>\n              {:else}\n                <span class={\`feed-chip \${importFreshness.active.state}\`}>\n                  Inventory · {importFreshness.active.importedAt ? shortDate(importFreshness.active.importedAt) : 'not imported'}\n                </span>\n                <span class={\`feed-chip \${importFreshness.transactions.state}\`}>\n                  Transactions · {importFreshness.transactions.dataThrough ? shortDate(importFreshness.transactions.dataThrough) : 'not imported'}\n                </span>\n                <a class="action-clear-link" href="/import">Import data <ChevronRight size={14} /></a>\n              {/if}\n            </div>`;

  page = replaceRequired(page, oldClear, newClear, '+page.svelte caught-up state');

  const extraCss = `\n\n  /* Live eBay API phase 2 ------------------------------------------------ */\n  .sync-banner{display:flex;align-items:center;gap:8px;margin:0 0 12px;border:1px solid #175c54;border-radius:10px;padding:10px 12px;background:#08231f;color:#73dfce;font-size:.74rem;font-weight:750}.sync-banner.bad{border-color:#663840;background:#281419;color:#efa1a8}.profit-bridge{padding:17px 19px}.profit-bridge-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:13px}.profit-bridge-head h2{margin:3px 0 0;font-size:1rem}.profit-bridge-state{border:1px solid #176051;border-radius:999px;padding:5px 8px;background:#09231f;color:#67dec8;font:850 .54rem ui-monospace,monospace;letter-spacing:.05em}.profit-bridge-state.pending{border-color:#685025;background:#241d0e;color:#e7b653}.profit-bridge-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}.profit-bridge-grid>span{display:flex;min-width:0;flex-direction:column;gap:3px;border:1px solid #18364b;border-radius:8px;padding:9px 10px;background:#07131e}.profit-bridge-grid small{overflow:hidden;color:#68869a;font-size:.58rem;text-overflow:ellipsis;white-space:nowrap}.profit-bridge-grid strong{font-size:.76rem}.profit-bridge-grid strong.negative{color:#dba1a6}.profit-bridge-total{border-color:#176051!important;background:#08231f!important}.profit-bridge-total strong{color:#68e3d1;font-size:.88rem}.action-feed-summary .feed-status{min-height:48px}@media(max-width:1180px){.profit-bridge-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:760px){.profit-bridge-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.profit-bridge-head{align-items:flex-start;flex-direction:column}}\n`;

  // The dashboard intentionally keeps its styling in the global Sellquity theme
  // (src/routes/+layout.svelte imports src/sellquity-theme.css). Do not expect
  // a component-local <style> block in +page.svelte.
  if (!theme.includes('/* Live eBay API phase 2 ------------------------------------------------ */')) {
    theme = `${theme.trimEnd()}${extraCss}\n`;
  }

  // -------------------------------------------------------------------------
  // 3) Manual sync endpoint returns structured JSON for both dashboard UIs.
  // -------------------------------------------------------------------------
  const syncEndpoint = `import { json } from '@sveltejs/kit';\nimport type { RequestHandler } from './$types';\nimport { syncEbay } from '$lib/server/ebay-sync';\nimport { currentWorkspaceId } from '$lib/server/workspace';\n\nexport const POST: RequestHandler = async ({ platform, locals }) => {\n  if (!platform) {\n    return json({ error: 'Cloudflare runtime unavailable.' }, { status: 500 });\n  }\n\n  if (locals.workspaceRole === 'member') {\n    return json({ error: 'You do not have permission to run an eBay sync.' }, { status: 403 });\n  }\n\n  const workspaceId = currentWorkspaceId(locals);\n\n  try {\n    const result = await syncEbay(platform.env, workspaceId);\n    return json({ ok: true, ...result });\n  } catch (error) {\n    console.error('Sellquity eBay sync failed', error);\n    return json(\n      { error: error instanceof Error ? error.message : 'eBay sync failed.' },\n      { status: 500 }\n    );\n  }\n};\n`;

  // -------------------------------------------------------------------------
  // 4) Cloudflare cron: every 30 minutes, sync every connected eBay workspace.
  // -------------------------------------------------------------------------
  wrangler = replaceRequired(
    wrangler,
    `  "main": ".svelte-kit/cloudflare/_worker.js",`,
    `  "main": "worker.js",`,
    'wrangler main entry'
  );

  wrangler = replaceRequired(
    wrangler,
    `  "d1_databases": [`,
    `  "triggers": {\n    "crons": ["*/30 * * * *"]\n  },\n  "d1_databases": [`,
    'wrangler cron trigger'
  );

  const worker = `import svelteWorker from './.svelte-kit/cloudflare/_worker.js';\nimport { syncEbay } from './src/lib/server/ebay-sync.ts';\n\nasync function syncConnectedEbayWorkspaces(env) {\n  const accounts = await env.DB.prepare(\`\n    SELECT DISTINCT workspace_id AS workspaceId\n    FROM ebay_accounts\n    ORDER BY workspace_id\n  \`).all();\n\n  const failures = [];\n  let completed = 0;\n\n  for (const row of accounts.results ?? []) {\n    const workspaceId = row.workspaceId;\n    if (!workspaceId) continue;\n\n    try {\n      const result = await syncEbay(env, workspaceId);\n      completed += 1;\n      console.log('Sellquity scheduled eBay sync complete', { workspaceId, ...result });\n    } catch (error) {\n      const message = error instanceof Error ? error.message : 'Unknown scheduled sync error';\n      failures.push(\`\${workspaceId}: \${message}\`);\n      console.error('Sellquity scheduled eBay sync failed', { workspaceId, error });\n    }\n  }\n\n  if (failures.length) {\n    throw new Error(\`Scheduled eBay sync failed for \${failures.length} workspace(s): \${failures.join(' | ')}\`);\n  }\n\n  return completed;\n}\n\nexport default {\n  fetch(request, env, ctx) {\n    return svelteWorker.fetch(request, env, ctx);\n  },\n\n  async scheduled(controller, env) {\n    console.log('Sellquity scheduled eBay sync started', {\n      cron: controller.cron,\n      scheduledTime: controller.scheduledTime\n    });\n    await syncConnectedEbayWorkspaces(env);\n  }\n};\n`;

  // Validate every transformation before touching the project.
  const outputs = [types, pageServer, page, syncEndpoint, wrangler, theme, worker];
  if (outputs.some((value) => !value || typeof value !== 'string')) {
    throw new Error('Patch produced an invalid output. No files were written.');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(root, `.sellquity-live-api-backup-${stamp}`);
  fs.mkdirSync(path.join(backupRoot, 'src/lib'), { recursive: true });
  fs.mkdirSync(path.join(backupRoot, 'src/routes/api/ebay/sync'), { recursive: true });
  fs.mkdirSync(path.join(backupRoot, 'src/routes'), { recursive: true });

  fs.writeFileSync(path.join(backupRoot, 'src/lib/types.ts'), original.types);
  fs.writeFileSync(path.join(backupRoot, 'src/routes/+page.server.ts'), original.pageServer);
  fs.writeFileSync(path.join(backupRoot, 'src/routes/+page.svelte'), original.page);
  fs.writeFileSync(path.join(backupRoot, 'src/routes/api/ebay/sync/+server.ts'), original.syncEndpoint);
  fs.writeFileSync(path.join(backupRoot, 'wrangler.jsonc'), original.wrangler);
  fs.writeFileSync(path.join(backupRoot, 'src/sellquity-theme.css'), original.theme);
  if (original.worker != null) fs.writeFileSync(path.join(backupRoot, 'worker.js'), original.worker);

  fs.writeFileSync(files.types, types);
  fs.writeFileSync(files.pageServer, pageServer);
  fs.writeFileSync(files.page, page);
  fs.writeFileSync(files.syncEndpoint, syncEndpoint);
  fs.writeFileSync(files.wrangler, wrangler);
  fs.writeFileSync(files.theme, theme);
  fs.writeFileSync(files.worker, worker);

  console.log('\n✅ Sellquity Live API Phase 2 applied.');
  console.log(`🛟 Backup: ${path.relative(root, backupRoot)}`);
  console.log('\nNext:');
  console.log('  npm run check');
  console.log('  npm run build');
  console.log('  npm run deploy');
  console.log('\nCloudflare cron: every 30 minutes (UTC-based trigger).');
} catch (error) {
  console.error('\n❌ Patch aborted before writing files.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
