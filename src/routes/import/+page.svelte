<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    AlertTriangle,
    ArrowLeft,
    Check,
    ChevronDown,
    ChevronRight,
    CloudUpload,
    FileSpreadsheet,
    PackageCheck,
    ReceiptText,
    RefreshCw,
    ShoppingBag,
    Tag,
    WalletCards
  } from '@lucide/svelte';
  import type { PageData } from './$types';

  type WhatnotMode = 'orders' | 'ledger';
  type FeedState = 'current' | 'due' | 'stale' | 'missing';

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
  let transactionDragging = $state(false);
  let transactionImporting = $state(false);
  let transactionError = $state<string | null>(null);
  let transactionResult = $state<EbayImportResult | null>(null);

  let activeFile = $state<File | null>(null);
  let activeDragging = $state(false);
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  function shortDate(value: string | null | undefined) {
    if (!value) return 'Not yet';
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return value;

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(parsed));
  }

  function shortDateTime(value: string | null | undefined) {
    if (!value) return 'Not yet';
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return value;

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(parsed));
  }

  function daysSince(value: string | null | undefined) {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
  }

  function freshness(
    ageDays: number | null,
    currentThrough: number,
    dueThrough: number
  ): FeedState {
    if (ageDays == null) return 'missing';
    if (ageDays <= currentThrough) return 'current';
    if (ageDays <= dueThrough) return 'due';
    return 'stale';
  }

  function stateLabel(state: FeedState) {
    return ({
      current: 'Current',
      due: 'Due soon',
      stale: 'Refresh',
      missing: 'Needed'
    } as const)[state];
  }

  const activeAge = $derived(daysSince(data.sync.latestActiveImport?.importedAt));
  const transactionAge = $derived(daysSince(data.sync.transactionDataThrough));

  const activeState = $derived(freshness(activeAge, 7, 14));
  const transactionState = $derived(freshness(transactionAge, 3, 7));

  const overallState = $derived.by(() => {
    if (
      activeState === 'missing' ||
      activeState === 'stale' ||
      transactionState === 'missing' ||
      transactionState === 'stale'
    ) return 'attention' as const;

    if (activeState === 'due' || transactionState === 'due') {
      return 'due' as const;
    }

    return 'current' as const;
  });

  const recommendedFeed = $derived.by(() => {
    if (transactionState !== 'current') return 'transactions' as const;
    if (activeState !== 'current') return 'inventory' as const;
    return null;
  });

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

  async function submitTransactions(event: SubmitEvent) {
    event.preventDefault();
    if (!transactionFile || transactionImporting) return;

    transactionImporting = true;
    transactionError = null;
    transactionResult = null;

    const form = new FormData();
    form.append('file', transactionFile);

    try {
      const response = await fetch('/api/ebay/import-transactions', {
        method: 'POST',
        body: form
      });

      const payload = await response.json() as
        | (EbayImportResult & { error?: string })
        | { error?: string };

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
      const response = await fetch('/api/ebay/import-active-listings', {
        method: 'POST',
        body: form
      });

      const payload = await response.json() as
        | (EbayActiveListingsImportResult & { error?: string })
        | { error?: string };

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

  function takeWhatnotFiles(selected: File[]) {
    whatnotFiles = selected.filter((file) => file.name.toLowerCase().endsWith('.csv'));
    whatnotError = selected.length && !whatnotFiles.length ? 'Choose CSV exports.' : null;
    whatnotResult = null;
    ledgerResult = null;
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

    const endpoint = whatnotMode === 'ledger'
      ? '/api/whatnot/import-ledger'
      : '/api/whatnot/import-orders';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: form
      });

      const payload = await response.json() as
        | (WhatnotImportResult & { error?: string })
        | (WhatnotLedgerResult & { error?: string });

      if (!response.ok) {
        whatnotError = payload.error ?? 'Whatnot import failed.';
        return;
      }

      if (whatnotMode === 'ledger') {
        ledgerResult = payload as WhatnotLedgerResult;
      } else {
        whatnotResult = payload as WhatnotImportResult;
      }
    } catch {
      whatnotError = 'Sellquity could not upload these Whatnot reports.';
    } finally {
      whatnotImporting = false;
    }
  }
</script>

<svelte:head>
  <title>Data sync · Sellquity</title>
  <meta
    name="description"
    content="Keep Sellquity current with eBay Seller Hub active inventory and Transaction report imports."
  />
</svelte:head>

<div class="sync-shell">
  <header class="sync-topbar">
    <a href="/"><ArrowLeft size={16} /> Sellquity</a>
    <span><FileSpreadsheet size={14} /> DATA SYNC</span>
  </header>

  <main>
    <section class="sync-hero">
      <div>
        <span class="eyebrow">EBAY · SELLER HUB</span>
        <h1>Keep Sellquity current.</h1>
        <p>
          Two official eBay reports keep the whole system aligned: one tells Sellquity
          what is live, the other tells it what happened to the money.
        </p>
      </div>

      <div class:attention={overallState === 'attention'} class:due={overallState === 'due'} class="sync-status">
        <span class="status-icon"><Check size={22} /></span>
        <span>
          <small>SYNC STATUS</small>
          <strong>
            {#if overallState === 'current'}
              eBay data is current
            {:else if overallState === 'due'}
              A refresh is coming due
            {:else}
              Sellquity needs fresh eBay data
            {/if}
          </strong>
          <em>
            {#if overallState === 'current'}
              Nothing is waiting on a newer report.
            {:else if recommendedFeed === 'transactions'}
              Refresh the Transaction report first.
            {:else}
              Refresh the active inventory snapshot.
            {/if}
          </em>
        </span>

        {#if recommendedFeed}
          <a href={recommendedFeed === 'transactions' ? '#transactions' : '#inventory-snapshot'}>
            Refresh now <ChevronRight size={15} />
          </a>
        {/if}
      </div>
    </section>

    <section class="feed-grid" aria-label="eBay data feeds">
      <article class="feed-card">
        <div class="feed-icon"><ReceiptText size={20} /></div>
        <div class="feed-copy">
          <span>TRANSACTION REPORT</span>
          <strong>
            {#if data.sync.transactionDataThrough}
              Data through {shortDate(data.sync.transactionDataThrough)}
            {:else}
              No transaction coverage yet
            {/if}
          </strong>
          <small>
            {#if data.sync.latestTransactionImport}
              Last imported {shortDate(data.sync.latestTransactionImport.importedAt)}
            {:else}
              Import your first Payments report
            {/if}
          </small>
        </div>
        <span class={`state-pill ${transactionState}`}>{stateLabel(transactionState)}</span>
      </article>

      <article class="feed-card">
        <div class="feed-icon"><PackageCheck size={20} /></div>
        <div class="feed-copy">
          <span>ACTIVE INVENTORY</span>
          <strong>{data.sync.activeListingsCount} active eBay listing{data.sync.activeListingsCount === 1 ? '' : 's'}</strong>
          <small>
            {#if data.sync.latestActiveImport}
              Snapshot imported {shortDate(data.sync.latestActiveImport.importedAt)}
            {:else}
              Import your current listing snapshot
            {/if}
          </small>
        </div>
        <span class={`state-pill ${activeState}`}>{stateLabel(activeState)}</span>
      </article>
    </section>

    <section class="import-grid">
      <article id="transactions" class="import-panel primary-feed">
        <div class="panel-head">
          <span class="step">01</span>
          <div>
            <span class="eyebrow">MONEY + SALES</span>
            <h2>Transaction report</h2>
            <p>
              Seller Hub → <strong>Payments</strong> → Reports → Transaction report.
              This updates sales, fees, labels, payouts and sold inventory.
            </p>
          </div>
          <span class="safe"><Check size={13} /> Duplicate-safe</span>
        </div>

        <form onsubmit={submitTransactions}>
          <label
            class:dragging={transactionDragging}
            class="dropzone"
            ondragenter={(event) => {
              event.preventDefault();
              transactionDragging = true;
            }}
            ondragover={(event) => {
              event.preventDefault();
              transactionDragging = true;
            }}
            ondragleave={() => transactionDragging = false}
            ondrop={(event) => {
              event.preventDefault();
              transactionDragging = false;
              takeTransactionFile([...(event.dataTransfer?.files ?? [])]);
            }}
          >
            <input
              type="file"
              accept=".csv,text/csv"
              onchange={(event) => takeTransactionFile([...(event.currentTarget.files ?? [])])}
            />

            <CloudUpload size={24} />

            {#if transactionFile}
              <span>
                <small>READY</small>
                <strong>{transactionFile.name}</strong>
                <em>{(transactionFile.size / 1024).toFixed(1)} KB</em>
              </span>
            {:else}
              <span>
                <strong>Drop Transaction report</strong>
                <small>or click to choose the CSV</small>
              </span>
            {/if}
          </label>

          <button class="import-button" disabled={!transactionFile || transactionImporting}>
            {#if transactionImporting}<RefreshCw class="spin" size={17} />{:else}<ReceiptText size={17} />{/if}
            {transactionImporting ? 'Reconciling…' : 'Import transactions'}
          </button>
        </form>

        {#if transactionError}
          <div class="message error"><AlertTriangle size={17} /><span>{transactionError}</span></div>
        {/if}

        {#if transactionResult}
          <div class="result-card">
            <div class="result-head">
              <span><Check size={17} /></span>
              <div>
                <strong>Transaction sync complete</strong>
                <small>{transactionResult.rowsImported} rows reconciled</small>
              </div>
            </div>

            <div class="result-grid">
              <span><small>Orders</small><b>{transactionResult.ordersImported}</b></span>
              <span><small>Fees</small><b>{transactionResult.sellingFeesImported}</b></span>
              <span><small>Labels</small><b>{transactionResult.shippingLabelsImported}</b></span>
              <span><small>Inventory matched</small><b>{transactionResult.inventoryMatched}</b></span>
            </div>

            {#if transactionResult.unallocatedTransactions}
              <p class="result-warning">
                <AlertTriangle size={14} />
                {transactionResult.unallocatedTransactions} account-level adjustment{transactionResult.unallocatedTransactions === 1 ? '' : 's'} retained in Accounting.
              </p>
            {/if}

            <div class="result-links">
              <a href="/">Overview <ChevronRight size={13} /></a>
              <a href="/cogs">COGS <ChevronRight size={13} /></a>
            </div>
          </div>
        {/if}
      </article>

      <article id="inventory-snapshot" class="import-panel">
        <div class="panel-head">
          <span class="step">02</span>
          <div>
            <span class="eyebrow">WHAT IS LIVE</span>
            <h2>Active inventory snapshot</h2>
            <p>
              Seller Hub → Reports → Downloads → <strong>Listings</strong> →
              All active listings. This keeps active inventory and asking prices aligned.
            </p>
          </div>
        </div>

        <form onsubmit={submitActive}>
          <label
            class:dragging={activeDragging}
            class="dropzone"
            ondragenter={(event) => {
              event.preventDefault();
              activeDragging = true;
            }}
            ondragover={(event) => {
              event.preventDefault();
              activeDragging = true;
            }}
            ondragleave={() => activeDragging = false}
            ondrop={(event) => {
              event.preventDefault();
              activeDragging = false;
              takeActiveFile([...(event.dataTransfer?.files ?? [])]);
            }}
          >
            <input
              type="file"
              accept=".csv,text/csv"
              onchange={(event) => takeActiveFile([...(event.currentTarget.files ?? [])])}
            />

            <CloudUpload size={24} />

            {#if activeFile}
              <span>
                <small>READY</small>
                <strong>{activeFile.name}</strong>
                <em>{(activeFile.size / 1024).toFixed(1)} KB</em>
              </span>
            {:else}
              <span>
                <strong>Drop active listings CSV</strong>
                <small>or click to choose the snapshot</small>
              </span>
            {/if}
          </label>

          <button class="import-button secondary" disabled={!activeFile || activeImporting}>
            {#if activeImporting}<RefreshCw class="spin" size={17} />{:else}<PackageCheck size={17} />{/if}
            {activeImporting ? 'Refreshing inventory…' : 'Import active inventory'}
          </button>
        </form>

        {#if activeError}
          <div class="message error"><AlertTriangle size={17} /><span>{activeError}</span></div>
        {/if}

        {#if activeResult}
          <div class="result-card">
            <div class="result-head">
              <span><Check size={17} /></span>
              <div>
                <strong>Inventory snapshot complete</strong>
                <small>{activeResult.listingsImported} active listings imported</small>
              </div>
            </div>

            <div class="result-grid three">
              <span><small>Created</small><b>{activeResult.inventoryCreated}</b></span>
              <span><small>Matched</small><b>{activeResult.inventoryMatched}</b></span>
              <span><small>Categories inferred</small><b>{activeResult.categoriesInferred}</b></span>
            </div>

            {#if activeResult.otherCategoryCount || activeResult.multiQuantityListings}
              <p class="result-warning">
                <AlertTriangle size={14} />
                {#if activeResult.otherCategoryCount}
                  {activeResult.otherCategoryCount} listing{activeResult.otherCategoryCount === 1 ? '' : 's'} started in Other.
                {/if}
                {#if activeResult.multiQuantityListings}
                  {activeResult.multiQuantityListings} multi-quantity listing{activeResult.multiQuantityListings === 1 ? '' : 's'} detected.
                {/if}
              </p>
            {/if}

            <div class="result-links">
              <a href="/">Inventory <ChevronRight size={13} /></a>
              <a href="/categories">Categories <ChevronRight size={13} /></a>
            </div>
          </div>
        {/if}
      </article>
    </section>

    <details class="history-panel">
      <summary>
        <span>
          <FileSpreadsheet size={17} />
          <strong>Recent sync history</strong>
          <small>{data.sync.history.length} recent import{data.sync.history.length === 1 ? '' : 's'}</small>
        </span>
        <ChevronDown size={18} />
      </summary>

      <div class="history-list">
        {#if data.sync.history.length}
          {#each data.sync.history as batch}
            <div class="history-row">
              <span class="history-kind">
                {#if batch.source === 'ebay_csv'}<ReceiptText size={15} />{:else}<PackageCheck size={15} />{/if}
              </span>
              <span class="history-copy">
                <strong>{batch.source === 'ebay_csv' ? 'Transaction report' : 'Active inventory snapshot'}</strong>
                <small>{batch.filename ?? 'eBay CSV'} · {shortDateTime(batch.importedAt)}</small>
              </span>
              <span class="history-detail">
                {#if batch.source === 'ebay_csv'}
                  <strong>{batch.rowsImported} rows</strong>
                  <small>
                    {#if batch.dataFrom && batch.dataThrough}
                      {shortDate(batch.dataFrom)} → {shortDate(batch.dataThrough)}
                    {:else}
                      {batch.transactionsImported} ledger rows
                    {/if}
                  </small>
                {:else}
                  <strong>{batch.rowsImported} listings</strong>
                  <small>snapshot</small>
                {/if}
              </span>
            </div>
          {/each}
        {:else}
          <div class="history-empty">
            <FileSpreadsheet size={22} />
            <strong>No sync history yet.</strong>
            <small>Your successful eBay imports will appear here.</small>
          </div>
        {/if}
      </div>
    </details>

    <details class="other-imports">
      <summary>
        <span>
          <ShoppingBag size={17} />
          <strong>Parked marketplace tools</strong>
          <small>Whatnot pipelines remain available</small>
        </span>
        <ChevronDown size={18} />
      </summary>

      <div class="other-body">
        <div class="whatnot-modes">
          <button class:active={whatnotMode === 'orders'} type="button" onclick={() => {
            whatnotMode = 'orders';
            whatnotFiles = [];
            whatnotResult = null;
            ledgerResult = null;
          }}>
            <strong>Orders &amp; profit</strong>
            <small>Weekly Orders Reports</small>
          </button>

          <button class:active={whatnotMode === 'ledger'} type="button" onclick={() => {
            whatnotMode = 'ledger';
            whatnotFiles = [];
            whatnotResult = null;
            ledgerResult = null;
          }}>
            <strong>Balance &amp; payouts</strong>
            <small>Ledger export</small>
          </button>
        </div>

        <form class="whatnot-form" onsubmit={submitWhatnot}>
          <label>
            <span>
              <strong>{whatnotMode === 'ledger' ? 'Whatnot Ledger CSV' : 'Whatnot Weekly Orders Report CSV'}</strong>
              <small>{whatnotFiles.length ? `${whatnotFiles.length} file${whatnotFiles.length === 1 ? '' : 's'} selected` : 'Choose one or more CSV exports'}</small>
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              onchange={(event) => takeWhatnotFiles([...(event.currentTarget.files ?? [])])}
            />
          </label>

          <button disabled={!whatnotFiles.length || whatnotImporting}>
            {whatnotImporting ? 'Importing…' : 'Import Whatnot data'}
          </button>
        </form>

        {#if whatnotResult}
          <div class="whatnot-result">
            <strong>Whatnot order import complete.</strong>
            <span>{whatnotResult.ordersImported} orders · {whatnotResult.feesImported} fees · {whatnotResult.inventoryMatched} SKU matches</span>
          </div>
        {/if}

        {#if ledgerResult}
          <div class="whatnot-result">
            <strong>Whatnot Ledger import complete.</strong>
            <span>{ledgerResult.salesEntries} sales entries · {ledgerResult.tipEntries} tips · {money(ledgerResult.netBalanceChangeCents)} net balance change</span>
          </div>
        {/if}

        {#if whatnotError}
          <div class="message error"><AlertTriangle size={16} /><span>{whatnotError}</span></div>
        {/if}
      </div>
    </details>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background:
      radial-gradient(circle at 70% -15%, #0069e317 0, transparent 34rem),
      #050b14;
    color: #f4f8ff;
    font-family: "Arial Narrow", "Roboto Condensed", Inter, ui-sans-serif, system-ui, sans-serif;
  }

  * { box-sizing: border-box; }

  .sync-shell { min-height: 100vh; }

  .sync-topbar {
    min-height: 66px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 10px max(22px, calc((100vw - 1320px) / 2));
    border-bottom: 1px solid #17304a;
    background: #06101bd9;
    backdrop-filter: blur(14px);
  }

  .sync-topbar a,
  .sync-topbar > span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .sync-topbar a {
    color: #9ab0c2;
    font-size: .82rem;
    font-weight: 850;
  }

  .sync-topbar a:hover { color: #01d0e9; }

  .sync-topbar > span {
    border: 1px solid #1c4a62;
    border-radius: 999px;
    padding: 6px 10px;
    color: #68e4d5;
    background: #08212b;
    font: 800 .64rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .07em;
  }

  main {
    width: min(1320px, calc(100% - 42px));
    margin: 0 auto;
    padding: 46px 0 82px;
  }

  .eyebrow {
    color: #01d4a5;
    font: 850 .7rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .12em;
  }

  .sync-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, .62fr);
    gap: 42px;
    align-items: end;
    margin-bottom: 24px;
  }

  h1 {
    margin: 8px 0 10px;
    font-size: clamp(2.7rem, 5.5vw, 5rem);
    line-height: .92;
    letter-spacing: -.055em;
  }

  .sync-hero > div:first-child > p {
    max-width: 720px;
    margin: 0;
    color: #849aad;
    font-size: .92rem;
    line-height: 1.65;
  }

  .sync-status {
    min-height: 112px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    border: 1px solid #176051;
    border-radius: 13px;
    padding: 16px;
    background:
      radial-gradient(circle at 100% 0, #01d4a510, transparent 12rem),
      #08221f;
  }

  .sync-status.due {
    border-color: #65502e;
    background: #221b11;
  }

  .sync-status.attention {
    border-color: #65343d;
    background: #241318;
  }

  .status-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid #1e6c62;
    border-radius: 10px;
    color: #6ee6d1;
    background: #0a302c;
  }

  .sync-status.due .status-icon {
    border-color: #755c33;
    color: #e5b66b;
    background: #2e2415;
  }

  .sync-status.attention .status-icon {
    border-color: #753e46;
    color: #ef939b;
    background: #31191e;
  }

  .sync-status > span:nth-child(2) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .sync-status small {
    color: #5f8b87;
    font: 800 .56rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .08em;
  }

  .sync-status strong { font-size: .9rem; }

  .sync-status em {
    color: #759493;
    font-size: .7rem;
    font-style: normal;
  }

  .sync-status > a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #72decf;
    font-size: .72rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .feed-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .feed-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    border: 1px solid #19364d;
    border-radius: 12px;
    padding: 15px 17px;
    background: linear-gradient(145deg, #0c1927, #09131f);
  }

  .feed-icon {
    width: 39px;
    height: 39px;
    display: grid;
    place-items: center;
    border: 1px solid #1b5a72;
    border-radius: 9px;
    color: #64dce9;
    background: #092333;
  }

  .feed-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .feed-copy > span {
    color: #5d7a91;
    font: 850 .55rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .08em;
  }

  .feed-copy strong {
    overflow: hidden;
    font-size: .86rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .feed-copy small {
    color: #688399;
    font-size: .68rem;
  }

  .state-pill {
    border: 1px solid #315067;
    border-radius: 999px;
    padding: 5px 8px;
    color: #7e96a9;
    background: #0b1924;
    font: 850 .54rem "SFMono-Regular", Consolas, monospace;
    text-transform: uppercase;
  }

  .state-pill.current {
    border-color: #176051;
    color: #66dec8;
    background: #09231f;
  }

  .state-pill.due {
    border-color: #65502e;
    color: #ddb16b;
    background: #261e12;
  }

  .state-pill.stale,
  .state-pill.missing {
    border-color: #63363d;
    color: #e98b94;
    background: #251419;
  }

  .import-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
  }

  .import-panel {
    scroll-margin-top: 20px;
    overflow: hidden;
    border: 1px solid #19364d;
    border-radius: 14px;
    background: linear-gradient(145deg, #0c1927, #09131f);
  }

  .import-panel.primary-feed {
    border-color: #1b516b;
    box-shadow: 0 16px 44px #00000027;
  }

  .panel-head {
    min-height: 140px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
    border-bottom: 1px solid #173047;
    padding: 18px;
  }

  .step {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid #1c6078;
    border-radius: 8px;
    color: #69e4d3;
    background: #092533;
    font: 900 .62rem "SFMono-Regular", Consolas, monospace;
  }

  .panel-head > div { min-width: 0; }

  .panel-head h2 {
    margin: 5px 0 7px;
    font-size: 1.35rem;
    letter-spacing: -.025em;
  }

  .panel-head p {
    margin: 0;
    color: #7891a5;
    font-size: .75rem;
    line-height: 1.55;
  }

  .panel-head p strong { color: #b9ccd9; }

  .safe {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #176051;
    border-radius: 999px;
    padding: 5px 8px;
    color: #65dfca;
    background: #09231f;
    font: 800 .54rem "SFMono-Regular", Consolas, monospace;
    white-space: nowrap;
  }

  .import-panel form {
    display: grid;
    gap: 10px;
    padding: 16px 18px 18px;
  }

  .dropzone {
    position: relative;
    min-height: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 9px;
    border: 1px dashed #276481;
    border-radius: 10px;
    color: #6f99ab;
    background: #071521;
    text-align: center;
    cursor: pointer;
    transition: border-color .14s ease, background .14s ease;
  }

  .dropzone:hover,
  .dropzone.dragging {
    border-color: #01d0e9;
    background: #08202c;
  }

  .dropzone input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .dropzone :global(svg) { color: #56d1df; }

  .dropzone > span {
    max-width: 88%;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .dropzone strong {
    overflow: hidden;
    color: #dceaf2;
    font-size: .8rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropzone small {
    color: #68869a;
    font-size: .67rem;
  }

  .dropzone em {
    color: #59758a;
    font-size: .6rem;
    font-style: normal;
  }

  .dropzone span small:first-child {
    color: #01d4a5;
    font: 850 .51rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .07em;
  }

  .import-button {
    min-height: 43px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 0;
    border-radius: 8px;
    color: #03131a;
    background: linear-gradient(135deg, #0069e3, #01d0e9 56%, #01d4a5);
    font-size: .8rem;
    font-weight: 900;
    cursor: pointer;
  }

  .import-button.secondary {
    border: 1px solid #215874;
    color: #cce4ee;
    background: #0a2231;
  }

  .import-button:disabled {
    opacity: .38;
    cursor: not-allowed;
  }

  .message {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 18px 16px;
    border-radius: 9px;
    padding: 10px 11px;
    font-size: .7rem;
  }

  .message.error {
    border: 1px solid #663840;
    color: #efa1a8;
    background: #281419;
  }

  .result-card {
    margin: 0 18px 18px;
    overflow: hidden;
    border: 1px solid #17605b;
    border-radius: 10px;
    background: #08231f;
  }

  .result-head {
    display: flex;
    align-items: center;
    gap: 9px;
    border-bottom: 1px solid #174a48;
    padding: 11px 12px;
  }

  .result-head > span {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: #69e5d0;
    background: #0b3430;
  }

  .result-head > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .result-head strong { font-size: .75rem; }
  .result-head small { color: #6d9992; font-size: .62rem; }

  .result-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
  }

  .result-grid.three { grid-template-columns: repeat(3, 1fr); }

  .result-grid span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    border-right: 1px solid #174a48;
    padding: 10px 11px;
  }

  .result-grid span:last-child { border-right: 0; }

  .result-grid small {
    color: #67928c;
    font-size: .57rem;
  }

  .result-grid b { font-size: .82rem; }

  .result-warning {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 0;
    border-top: 1px solid #174a48;
    padding: 9px 11px;
    color: #d6ad72;
    background: #231c13;
    font-size: .62rem;
    line-height: 1.45;
  }

  .result-warning :global(svg) { flex: 0 0 auto; }

  .result-links {
    display: flex;
    gap: 13px;
    border-top: 1px solid #174a48;
    padding: 9px 11px;
  }

  .result-links a {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: #70bccc;
    font-size: .64rem;
    font-weight: 850;
  }

  .history-panel,
  .other-imports {
    margin-top: 12px;
    overflow: visible;
    border: 1px solid #19364d;
    border-radius: 12px;
    background: #08141f;
  }

  .history-panel > summary,
  .other-imports > summary {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 0 16px;
    list-style: none;
    cursor: pointer;
  }

  .history-panel > summary::-webkit-details-marker,
  .other-imports > summary::-webkit-details-marker {
    display: none;
  }

  .history-panel > summary > span,
  .other-imports > summary > span {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .history-panel > summary strong,
  .other-imports > summary strong {
    font-size: .78rem;
  }

  .history-panel > summary small,
  .other-imports > summary small {
    color: #667f93;
    font-size: .66rem;
  }

  .history-panel > summary :global(svg),
  .other-imports > summary :global(svg) {
    color: #5599ae;
  }

  details[open] > summary > :global(svg:last-child) {
    transform: rotate(180deg);
  }

  .history-list {
    border-top: 1px solid #173047;
  }

  .history-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    border-bottom: 1px solid #173047;
    padding: 11px 14px;
  }

  .history-row:last-child { border-bottom: 0; }

  .history-kind {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 1px solid #1b526b;
    border-radius: 8px;
    color: #61cddd;
    background: #092131;
  }

  .history-copy,
  .history-detail {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .history-copy strong,
  .history-detail strong {
    font-size: .72rem;
  }

  .history-copy small,
  .history-detail small {
    color: #668297;
    font-size: .62rem;
  }

  .history-copy strong,
  .history-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-detail { text-align: right; }

  .history-empty {
    min-height: 130px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 5px;
    color: #648094;
  }

  .history-empty strong { color: #a9bfce; font-size: .75rem; }
  .history-empty small { font-size: .64rem; }

  .other-body {
    border-top: 1px solid #173047;
    padding: 14px;
  }

  .whatnot-modes {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 10px;
  }

  .whatnot-modes button {
    display: flex;
    flex-direction: column;
    gap: 3px;
    border: 1px solid #1d3e56;
    border-radius: 8px;
    padding: 10px;
    color: #8198aa;
    background: #07131e;
    text-align: left;
    cursor: pointer;
  }

  .whatnot-modes button.active {
    border-color: #1a6279;
    color: #dcedf4;
    background: #092231;
  }

  .whatnot-modes strong { font-size: .72rem; }
  .whatnot-modes small { color: #607b90; font-size: .62rem; }

  .whatnot-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .whatnot-form label {
    position: relative;
    min-height: 45px;
    display: flex;
    align-items: center;
    border: 1px solid #1d3e56;
    border-radius: 8px;
    padding: 8px 11px;
    background: #07131e;
    cursor: pointer;
  }

  .whatnot-form label > span {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .whatnot-form label strong { font-size: .7rem; }
  .whatnot-form label small { color: #607c90; font-size: .61rem; }

  .whatnot-form input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .whatnot-form button {
    min-width: 160px;
    border: 1px solid #1f5974;
    border-radius: 8px;
    color: #c5dde8;
    background: #0a2231;
    font-size: .72rem;
    font-weight: 850;
  }

  .whatnot-form button:disabled {
    opacity: .38;
    cursor: not-allowed;
  }

  .whatnot-result {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 9px;
    border: 1px solid #17605b;
    border-radius: 8px;
    padding: 9px 10px;
    color: #6ee1cd;
    background: #08231f;
  }

  .whatnot-result strong { font-size: .7rem; }
  .whatnot-result span { color: #6e9992; font-size: .62rem; }

  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 980px) {
    .sync-hero,
    .import-grid {
      grid-template-columns: 1fr;
    }

    .sync-status {
      max-width: 650px;
    }
  }

  @media (max-width: 700px) {
    main { width: min(100% - 24px, 1320px); padding-top: 30px; }

    .sync-topbar { padding-inline: 12px; }

    .sync-hero {
      gap: 22px;
    }

    .sync-status {
      grid-template-columns: auto 1fr;
    }

    .sync-status > a {
      grid-column: 2;
    }

    .feed-grid {
      grid-template-columns: 1fr;
    }

    .panel-head {
      grid-template-columns: auto 1fr;
      min-height: 0;
    }

    .safe {
      grid-column: 2;
      justify-self: start;
    }

    .result-grid,
    .result-grid.three {
      grid-template-columns: repeat(2, 1fr);
    }

    .history-row {
      grid-template-columns: auto 1fr;
    }

    .history-detail {
      grid-column: 2;
      text-align: left;
    }

    .whatnot-modes,
    .whatnot-form {
      grid-template-columns: 1fr;
    }

    .whatnot-form button {
      min-height: 42px;
    }
  }

  @media (max-width: 480px) {
    .sync-topbar > span { display: none; }

    h1 { font-size: 2.7rem; }

    .feed-card {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .feed-card .state-pill {
      grid-column: 2;
      justify-self: start;
    }

    .result-grid,
    .result-grid.three {
      grid-template-columns: 1fr;
    }

    .result-grid span {
      border-right: 0;
      border-bottom: 1px solid #174a48;
    }

    .result-grid span:last-child { border-bottom: 0; }

    .history-panel > summary small,
    .other-imports > summary small {
      display: none;
    }
  }
</style>
