<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { AlertTriangle, ArrowLeft, Check, FileSpreadsheet, PackageCheck, ReceiptText, RefreshCw, Upload } from '@lucide/svelte';
  import type { PageData } from './$types';

  type WhatnotMode = 'orders' | 'ledger';

  type EbayImportResult = {
    batchId: string;
    rowsSeen: number;
    rowsImported: number;
    ordersImported: number;
    transactionsImported: number;
    sellingFeesImported: number;
    shippingLabelsImported: number;
    payoutsImported: number;
    unallocatedTransactions: number;
    inventoryMatched: number;
    inventoryCreated: number;
    listingsEnded: number;
    cogsPreserved: number;
  };

  type EbayActiveListingsImportResult = {
    batchId: string;
    rowsSeen: number;
    listingsImported: number;
    inventoryCreated: number;
    inventoryMatched: number;
    skusObserved: number;
    categoriesInferred: number;
    otherCategoryCount: number;
    ageTrackingStartedNow: number;
    multiQuantityListings: number;
  };

  type WhatnotImportResult = {
    batchIds: string[];
    filesImported: number;
    rowsSeen: number;
    rowsImported: number;
    ordersImported: number;
    transactionsImported: number;
    feesImported: number;
    sellerShippingImported: number;
    inventoryMatched: number;
    inventoryCreated: number;
    skuConflicts: number;
    giveaways: number;
    unreconciledRows: number;
  };

  type WhatnotLedgerResult = {
    batchIds: string[];
    filesImported: number;
    rowsSeen: number;
    rowsImported: number;
    completedRows: number;
    pendingRows: number;
    salesEntries: number;
    tipEntries: number;
    payoutEntries: number;
    salesEarningsCents: number;
    tipIncomeCents: number;
    payoutCents: number;
    netBalanceChangeCents: number;
  };

  let { data }: { data: PageData } = $props();

  let transactionFile = $state<File | null>(null);
  let transactionImporting = $state(false);
  let transactionError = $state<string | null>(null);
  let transactionResult = $state<EbayImportResult | null>(null);

  let activeFile = $state<File | null>(null);
  let activeImporting = $state(false);
  let activeError = $state<string | null>(null);
  let activeResult = $state<EbayActiveListingsImportResult | null>(null);

  let whatnotMode = $state<WhatnotMode>('orders');
  let whatnotFiles = $state<File[]>([]);
  let whatnotImporting = $state(false);
  let whatnotError = $state<string | null>(null);
  let whatnotResult = $state<WhatnotImportResult | null>(null);
  let ledgerResult = $state<WhatnotLedgerResult | null>(null);

  function money(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }

  function shortDate(value: string | null | undefined) {
    if (!value) return 'Not yet';
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return value;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(parsed));
  }

  function chooseCsv(selected: File[]) {
    return selected.find((file) => file.name.toLowerCase().endsWith('.csv')) ?? null;
  }

  function takeTransactionFile(selected: File[]) {
    transactionFile = chooseCsv(selected);
    transactionError = selected.length && !transactionFile ? 'Choose a CSV report.' : null;
    transactionResult = null;
  }

  function takeActiveFile(selected: File[]) {
    activeFile = chooseCsv(selected);
    activeError = selected.length && !activeFile ? 'Choose a CSV report.' : null;
    activeResult = null;
  }

  function takeWhatnotFiles(selected: File[]) {
    whatnotFiles = selected.filter((file) => file.name.toLowerCase().endsWith('.csv'));
    whatnotError = selected.length && !whatnotFiles.length ? 'Choose CSV exports.' : null;
    whatnotResult = null;
    ledgerResult = null;
  }

  async function submitTransactions(event: SubmitEvent) {
    event.preventDefault();
    if (!transactionFile || transactionImporting) return;
    transactionImporting = true;
    transactionError = null;
    transactionResult = null;
    const form = new FormData();
    form.append('file', transactionFile);

    try {
      const response = await fetch('/api/ebay/import-transactions', { method: 'POST', body: form });
      const payload = await response.json() as (EbayImportResult & { error?: string }) | { error?: string };
      if (!response.ok || !('rowsImported' in payload)) {
        transactionError = payload.error ?? 'Transaction report import failed.';
        return;
      }
      transactionResult = payload as EbayImportResult;
      await invalidateAll();
    } catch {
      transactionError = 'Sellquity could not upload this Transaction report.';
    } finally {
      transactionImporting = false;
    }
  }

  async function submitActive(event: SubmitEvent) {
    event.preventDefault();
    if (!activeFile || activeImporting) return;
    activeImporting = true;
    activeError = null;
    activeResult = null;
    const form = new FormData();
    form.append('file', activeFile);

    try {
      const response = await fetch('/api/ebay/import-active-listings', { method: 'POST', body: form });
      const payload = await response.json() as (EbayActiveListingsImportResult & { error?: string }) | { error?: string };
      if (!response.ok || !('listingsImported' in payload)) {
        activeError = payload.error ?? 'Active inventory import failed.';
        return;
      }
      activeResult = payload as EbayActiveListingsImportResult;
      await invalidateAll();
    } catch {
      activeError = 'Sellquity could not upload this active listings report.';
    } finally {
      activeImporting = false;
    }
  }

  async function submitWhatnot(event: SubmitEvent) {
    event.preventDefault();
    if (!whatnotFiles.length || whatnotImporting) return;
    whatnotImporting = true;
    whatnotError = null;
    whatnotResult = null;
    ledgerResult = null;
    const form = new FormData();
    for (const file of whatnotFiles) form.append('file', file);
    const endpoint = whatnotMode === 'ledger' ? '/api/whatnot/import-ledger' : '/api/whatnot/import-orders';

    try {
      const response = await fetch(endpoint, { method: 'POST', body: form });
      const payload = await response.json() as (WhatnotImportResult & { error?: string }) | (WhatnotLedgerResult & { error?: string });
      if (!response.ok) {
        whatnotError = payload.error ?? 'Whatnot import failed.';
        return;
      }
      if (whatnotMode === 'ledger') ledgerResult = payload as WhatnotLedgerResult;
      else whatnotResult = payload as WhatnotImportResult;
    } catch {
      whatnotError = 'Sellquity could not upload these Whatnot reports.';
    } finally {
      whatnotImporting = false;
    }
  }
</script>

<svelte:head><title>Imports · Sellquity</title></svelte:head>

<div class="import-shell">
  <header class="topbar">
    <a href="/manage"><ArrowLeft size={16} /> Settings</a>
    <span><FileSpreadsheet size={14} /> IMPORTS</span>
  </header>

  <main>
    <section class="hero">
      <span class="eyebrow">DATA & BACKFILL</span>
      <h1>Imports</h1>
      <p>Use imports to bring older data into Sellquity, recover a gap, or use a marketplace that does not have a live connection yet. If eBay sync is connected and healthy, you should not need this page every day.</p>
    </section>

    <section class="status-card">
      <div>
        <span class="eyebrow">EBAY IMPORT STATUS</span>
        <strong>Transactions through {shortDate(data.sync.transactionDataThrough)}</strong>
        <small>{data.sync.latestTransactionImport ? `Last transaction import ${shortDate(data.sync.latestTransactionImport.importedAt)}` : 'No transaction report imported yet'}</small>
      </div>
      <div>
        <span class="eyebrow">ACTIVE LISTINGS</span>
        <strong>{data.sync.activeListingsCount} tracked active listing{data.sync.activeListingsCount === 1 ? '' : 's'}</strong>
        <small>{data.sync.latestActiveImport ? `Last snapshot ${shortDate(data.sync.latestActiveImport.importedAt)}` : 'No active-listing snapshot imported yet'}</small>
      </div>
    </section>

    <section class="section-head">
      <div><span class="eyebrow">EBAY</span><h2>Manual eBay imports</h2><p>For backfills, recovery, and accounts that are not connected to live sync yet.</p></div>
      <a href="/integrations/ebay">Manage eBay connection →</a>
    </section>

    <section class="import-grid">
      <article class="import-card">
        <div class="card-head"><ReceiptText size={20} /><div><span class="eyebrow">SALES + MONEY</span><h3>Transaction report</h3></div></div>
        <p>Seller Hub → Payments → Reports → Transaction report. This updates sales, fees, shipping labels, payouts, and sold inventory.</p>
        <form onsubmit={submitTransactions}>
          <label class="file-picker">
            <input type="file" accept=".csv,text/csv" onchange={(event) => takeTransactionFile([...(event.currentTarget.files ?? [])])} />
            <Upload size={18} />
            <span>{transactionFile ? transactionFile.name : 'Choose Transaction report CSV'}</span>
          </label>
          <button class="primary" disabled={!transactionFile || transactionImporting}>{#if transactionImporting}<RefreshCw class="spin" size={16} />{:else}<ReceiptText size={16} />{/if}{transactionImporting ? 'Importing…' : 'Import transactions'}</button>
        </form>
        {#if transactionError}<div class="message bad"><AlertTriangle size={15} /> {transactionError}</div>{/if}
        {#if transactionResult}
          <div class="result"><Check size={17} /><div><strong>Import complete</strong><small>{transactionResult.rowsImported} rows · {transactionResult.ordersImported} orders · {transactionResult.inventoryMatched} inventory matches</small>{#if transactionResult.unallocatedTransactions}<em>{transactionResult.unallocatedTransactions} account-level adjustment{transactionResult.unallocatedTransactions === 1 ? '' : 's'} kept for accounting.</em>{/if}</div></div>
        {/if}
      </article>

      <article class="import-card">
        <div class="card-head"><PackageCheck size={20} /><div><span class="eyebrow">WHAT IS LIVE</span><h3>Active listings snapshot</h3></div></div>
        <p>Seller Hub → Reports → Downloads → Listings → All active listings. This refreshes active inventory and asking prices.</p>
        <form onsubmit={submitActive}>
          <label class="file-picker">
            <input type="file" accept=".csv,text/csv" onchange={(event) => takeActiveFile([...(event.currentTarget.files ?? [])])} />
            <Upload size={18} />
            <span>{activeFile ? activeFile.name : 'Choose active listings CSV'}</span>
          </label>
          <button class="secondary" disabled={!activeFile || activeImporting}>{#if activeImporting}<RefreshCw class="spin" size={16} />{:else}<PackageCheck size={16} />{/if}{activeImporting ? 'Importing…' : 'Import active listings'}</button>
        </form>
        {#if activeError}<div class="message bad"><AlertTriangle size={15} /> {activeError}</div>{/if}
        {#if activeResult}
          <div class="result"><Check size={17} /><div><strong>Snapshot complete</strong><small>{activeResult.listingsImported} listings · {activeResult.inventoryMatched} matched · {activeResult.inventoryCreated} created</small>{#if activeResult.otherCategoryCount || activeResult.multiQuantityListings}<em>Review {activeResult.otherCategoryCount + activeResult.multiQuantityListings} listing{activeResult.otherCategoryCount + activeResult.multiQuantityListings === 1 ? '' : 's'} that may need attention.</em>{/if}</div></div>
        {/if}
      </article>
    </section>

    <section id="whatnot" class="whatnot-card">
      <div class="whatnot-head">
        <div><span class="eyebrow">WHATNOT</span><h2>Whatnot imports</h2><p>Whatnot is import-based today. Orders feed sales and profit. Ledger exports help reconcile balance movement and payouts.</p></div>
        <div class="segments">
          <button type="button" class:active={whatnotMode === 'orders'} onclick={() => whatnotMode = 'orders'}>Orders</button>
          <button type="button" class:active={whatnotMode === 'ledger'} onclick={() => whatnotMode = 'ledger'}>Ledger</button>
        </div>
      </div>

      <form class="whatnot-form" onsubmit={submitWhatnot}>
        <label class="file-picker wide">
          <input type="file" multiple accept=".csv,text/csv" onchange={(event) => takeWhatnotFiles([...(event.currentTarget.files ?? [])])} />
          <Upload size={18} />
          <span>{whatnotFiles.length ? `${whatnotFiles.length} CSV file${whatnotFiles.length === 1 ? '' : 's'} selected` : `Choose Whatnot ${whatnotMode === 'orders' ? 'Orders Report' : 'Ledger'} CSV files`}</span>
        </label>
        <button class="primary" disabled={!whatnotFiles.length || whatnotImporting}>{#if whatnotImporting}<RefreshCw class="spin" size={16} />{:else}<FileSpreadsheet size={16} />{/if}{whatnotImporting ? 'Importing…' : `Import ${whatnotMode}`}</button>
      </form>

      {#if whatnotError}<div class="message bad"><AlertTriangle size={15} /> {whatnotError}</div>{/if}
      {#if whatnotResult}
        <div class="result"><Check size={17} /><div><strong>Whatnot orders imported</strong><small>{whatnotResult.filesImported} files · {whatnotResult.ordersImported} orders · {whatnotResult.inventoryMatched} inventory matches</small>{#if whatnotResult.skuConflicts || whatnotResult.unreconciledRows}<em>{whatnotResult.skuConflicts} SKU conflict{whatnotResult.skuConflicts === 1 ? '' : 's'} · {whatnotResult.unreconciledRows} row{whatnotResult.unreconciledRows === 1 ? '' : 's'} need review</em>{/if}</div></div>
      {/if}
      {#if ledgerResult}
        <div class="result"><Check size={17} /><div><strong>Whatnot ledger imported</strong><small>{ledgerResult.filesImported} files · {ledgerResult.rowsImported} rows · {ledgerResult.payoutEntries} payouts</small><em>Net balance change {money(ledgerResult.netBalanceChangeCents)}</em></div></div>
      {/if}
    </section>

    {#if data.sync.history.length}
      <section class="history-card">
        <div class="section-head compact"><div><span class="eyebrow">RECENT EBAY IMPORTS</span><h2>Import history</h2></div></div>
        <div class="history-list">
          {#each data.sync.history.slice(0, 8) as row}
            <div><span><strong>{row.filename ?? (row.source === 'ebay_active_csv' ? 'Active listings' : 'Transaction report')}</strong><small>{shortDate(row.importedAt)}</small></span><span>{row.rowsImported} rows</span></div>
          {/each}
        </div>
      </section>
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #080d12; }
  * { box-sizing: border-box; }
  .import-shell { min-height: 100vh; color: #e8eee9; background: #080d12; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .topbar { height: 62px; display: flex; align-items: center; justify-content: space-between; padding: 0 max(24px, calc((100vw - 1120px) / 2)); border-bottom: 1px solid #202a33; background: #0b1117; }
  .topbar a, .topbar > span { display: inline-flex; align-items: center; gap: 7px; }
  .topbar a { color: #9aa8b3; text-decoration: none; font-size: .78rem; font-weight: 800; }
  .topbar > span { color: #01d4a5; font: 800 .63rem Consolas, monospace; letter-spacing: .12em; }
  main { width: min(1120px, calc(100% - 40px)); margin: 0 auto; padding: 48px 0 80px; }
  .hero { max-width: 760px; margin-bottom: 22px; }
  .eyebrow { color: #01d4a5; font: 800 .64rem Consolas, monospace; letter-spacing: .12em; }
  h1 { margin: 7px 0 9px; font-size: clamp(2.4rem, 6vw, 4rem); letter-spacing: -.05em; }
  h2, h3 { margin: 4px 0 0; }
  .hero p, .section-head p, .import-card > p, .whatnot-head p { margin: 0; color: #7e8a95; font-size: .78rem; line-height: 1.6; }
  .status-card { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin-bottom: 26px; border: 1px solid #29343e; border-radius: 13px; overflow: hidden; background: #29343e; }
  .status-card > div { display: flex; flex-direction: column; gap: 4px; padding: 16px; background: #0e151c; }
  .status-card strong { font-size: .78rem; }
  .status-card small { color: #687580; font-size: .64rem; }
  .section-head { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin: 26px 0 12px; }
  .section-head a { color: #67bbc7; text-decoration: none; font-size: .69rem; font-weight: 800; }
  .section-head.compact { margin: 0 0 12px; }
  .import-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .import-card, .whatnot-card, .history-card { border: 1px solid #29343e; border-radius: 14px; padding: 20px; background: #0e151c; }
  .card-head { display: flex; align-items: center; gap: 9px; }
  .card-head > :global(svg) { color: #01d4a5; }
  .import-card > p { min-height: 58px; margin: 14px 0; }
  form { display: grid; gap: 9px; }
  .file-picker { min-height: 48px; display: flex; align-items: center; gap: 9px; border: 1px dashed #3b4a56; border-radius: 9px; padding: 10px 12px; color: #9aa7b0; background: #0a1117; cursor: pointer; font-size: .7rem; font-weight: 750; }
  .file-picker input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .file-picker :global(svg) { flex: 0 0 auto; color: #01d4a5; }
  button { min-height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 8px; padding: 0 12px; font: inherit; font-size: .7rem; font-weight: 850; cursor: pointer; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button.primary { border: 0; color: #03131a; background: #01d4a5; }
  button.secondary { border: 1px solid #35424d; color: #dce5df; background: #151e25; }
  .message { display: flex; align-items: center; gap: 7px; margin-top: 10px; border-radius: 8px; padding: 9px 10px; font-size: .68rem; }
  .message.bad { border: 1px solid #60343b; color: #efa1a8; background: #281519; }
  .result { display: flex; align-items: flex-start; gap: 9px; margin-top: 10px; border: 1px solid #265344; border-radius: 9px; padding: 10px; color: #79dec5; background: #0c1e18; }
  .result > div { display: flex; flex-direction: column; gap: 3px; }
  .result strong { color: #dceae4; font-size: .72rem; }
  .result small, .result em { color: #719488; font-size: .63rem; line-height: 1.4; font-style: normal; }
  .whatnot-card { margin-top: 14px; }
  .whatnot-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .whatnot-head p { max-width: 700px; margin-top: 5px; }
  .segments { display: flex; gap: 3px; border: 1px solid #2c3842; border-radius: 9px; padding: 3px; background: #0a1117; }
  .segments button { min-height: 31px; border: 0; color: #7e8b95; background: transparent; font-size: .65rem; }
  .segments button.active { color: #03131a; background: #01d4a5; }
  .whatnot-form { grid-template-columns: minmax(0,1fr) auto; align-items: stretch; margin-top: 15px; }
  .file-picker.wide { min-width: 0; }
  .history-card { margin-top: 14px; }
  .history-list { display: grid; }
  .history-list > div { display: flex; align-items: center; justify-content: space-between; gap: 15px; border-top: 1px solid #25313a; padding: 10px 0; color: #8b989f; font-size: .68rem; }
  .history-list > div:first-child { border-top: 0; }
  .history-list span:first-child { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .history-list strong { overflow: hidden; color: #c8d1d6; text-overflow: ellipsis; white-space: nowrap; }
  .history-list small { color: #65727c; }
  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) { main { width: min(100% - 24px,1120px); padding-top: 30px; } .topbar { padding: 0 13px; } .status-card, .import-grid { grid-template-columns: 1fr; } .section-head, .whatnot-head { align-items: flex-start; flex-direction: column; } .whatnot-form { grid-template-columns: 1fr; } .segments { width: 100%; } .segments button { flex: 1; } }
</style>
