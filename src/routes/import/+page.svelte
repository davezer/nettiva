<script lang="ts">
  type Marketplace = 'ebay' | 'whatnot';
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

  let marketplace = $state<Marketplace>('whatnot');
  let whatnotMode = $state<WhatnotMode>('orders');
  let files = $state<File[]>([]);
  let importing = $state(false);
  let error = $state<string | null>(null);
  let ebayResult = $state<EbayImportResult | null>(null);
  let whatnotResult = $state<WhatnotImportResult | null>(null);
  let ledgerResult = $state<WhatnotLedgerResult | null>(null);

  function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  function resetResults() {
    error = null;
    ebayResult = null;
    whatnotResult = null;
    ledgerResult = null;
  }

  function selectMarketplace(value: Marketplace) {
    marketplace = value;
    files = [];
    resetResults();
  }

  function selectWhatnotMode(value: WhatnotMode) {
    whatnotMode = value;
    files = [];
    resetResults();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!files.length || importing) return;

    importing = true;
    resetResults();

    const form = new FormData();
    for (const file of files) form.append('file', file);

    const endpoint = marketplace === 'ebay'
      ? '/api/ebay/import-transactions'
      : whatnotMode === 'ledger'
        ? '/api/whatnot/import-ledger'
        : '/api/whatnot/import-orders';

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    const payload = await response.json() as
      | (EbayImportResult & { error?: string })
      | (WhatnotImportResult & { error?: string })
      | (WhatnotLedgerResult & { error?: string });

    importing = false;

    if (!response.ok) {
      error = payload.error ?? 'Import failed.';
      return;
    }

    if (marketplace === 'ebay') {
      ebayResult = payload as EbayImportResult;
    } else if (whatnotMode === 'ledger') {
      ledgerResult = payload as WhatnotLedgerResult;
    } else {
      whatnotResult = payload as WhatnotImportResult;
    }
  }

  const pickerLabel = $derived(
    marketplace === 'ebay'
      ? 'eBay Transaction report CSV'
      : whatnotMode === 'ledger'
        ? 'Whatnot Ledger CSV'
        : 'Whatnot Weekly Orders Report CSV'
  );

  const pickerEmpty = $derived(
    marketplace === 'ebay'
      ? 'Choose a CSV file'
      : whatnotMode === 'ledger'
        ? 'Choose one or more ledger CSV exports'
        : 'Choose one or more weekly CSV reports'
  );

  const importLabel = $derived(
    marketplace === 'ebay'
      ? 'Import eBay transactions'
      : whatnotMode === 'ledger'
        ? 'Import Whatnot ledger'
        : 'Import Whatnot orders'
  );
</script>

<svelte:head>
  <title>Import marketplace data · Sellquity</title>
</svelte:head>

<main class="import-shell">
  <a class="back" href="/">← Back to Sellquity</a>

  <section class="card">
    <span class="eyebrow">SELLQUITY · MARKETPLACE IMPORTS</span>
    <h1>Bring in seller history</h1>
    <p class="intro">
      Marketplace exports feed the same normalized reseller workspace.
      Re-importing the same report is safe: Sellquity uses deterministic marketplace identities.
    </p>

    <div class="marketplace-tabs">
      <button
        type="button"
        class:active={marketplace === 'whatnot'}
        onclick={() => selectMarketplace('whatnot')}
      >
        <span class="whatnot-mark">W</span>
        <span><strong>Whatnot</strong><small>Orders + ledger</small></span>
      </button>
      <button
        type="button"
        class:active={marketplace === 'ebay'}
        onclick={() => selectMarketplace('ebay')}
      >
        <span class="ebay-mark">e</span>
        <span><strong>eBay</strong><small>Transaction report</small></span>
      </button>
    </div>

    {#if marketplace === 'whatnot'}
      <div class="whatnot-modes">
        <button
          type="button"
          class:active={whatnotMode === 'orders'}
          onclick={() => selectWhatnotMode('orders')}
        >
          <strong>Orders & profit</strong>
          <small>Weekly Orders Reports</small>
        </button>
        <button
          type="button"
          class:active={whatnotMode === 'ledger'}
          onclick={() => selectWhatnotMode('ledger')}
        >
          <strong>Balance & payouts</strong>
          <small>Ledger export</small>
        </button>
      </div>

      {#if whatnotMode === 'orders'}
        <div class="report-note">
          <strong>Weekly Orders Reports drive P&amp;L.</strong>
          Sellquity uses them for gross sales, marketplace fees, seller-paid shipping, SKU matching,
          and COGS.
        </div>
      {:else}
        <div class="report-note">
          <strong>The Ledger drives balance reconciliation.</strong>
          Sales earnings are recorded as account-balance movement without being counted as revenue
          a second time. Tips become income; payouts stay excluded from P&amp;L.
        </div>
      {/if}
    {:else}
      <div class="report-note">
        <strong>Advanced / fallback.</strong>
        Use the Transaction report exported from eBay Seller Hub for historical backfill or reconciliation.
      </div>
    {/if}

    <form onsubmit={submit}>
      <label class="file-box">
        <strong>{pickerLabel}</strong>
        <span>
          {files.length
            ? files.length === 1
              ? files[0].name
              : `${files.length} files selected`
            : pickerEmpty}
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple={marketplace === 'whatnot'}
          onchange={(event) => {
            const selected = [...(event.currentTarget.files ?? [])];
            files = marketplace === 'whatnot' ? selected : selected.slice(0, 1);
          }}
        />
      </label>

      <button class="import-button" disabled={!files.length || importing}>
        {importing ? 'Importing…' : importLabel}
      </button>
    </form>

    {#if error}
      <div class="message error">{error}</div>
    {/if}

    {#if whatnotResult}
      <div class="message success">
        <strong>Whatnot order import complete.</strong>
        <p>{whatnotResult.filesImported} weekly report{whatnotResult.filesImported === 1 ? '' : 's'} processed.</p>

        <div class="stats whatnot-stats">
          <span><b>{whatnotResult.ordersImported}</b> orders</span>
          <span><b>{whatnotResult.feesImported}</b> fee rows</span>
          <span><b>{whatnotResult.sellerShippingImported}</b> seller shipping</span>
          <span><b>{whatnotResult.giveaways}</b> giveaways</span>
          <span><b>{whatnotResult.inventoryMatched}</b> SKU matches</span>
          <span><b>{whatnotResult.inventoryCreated}</b> history records</span>
        </div>

        {#if whatnotResult.skuConflicts}
          <p class="warning">
            {whatnotResult.skuConflicts} SKU conflict{whatnotResult.skuConflicts === 1 ? '' : 's'}
            were imported using separate history records.
          </p>
        {/if}

        {#if whatnotResult.unreconciledRows}
          <p class="warning">
            {whatnotResult.unreconciledRows} row{whatnotResult.unreconciledRows === 1 ? '' : 's'}
            required a reconciliation adjustment.
          </p>
        {/if}

        <div class="result-links">
          <a class="dashboard" href="/">Open dashboard →</a>
          <a class="secondary-link" href="/cogs">Open COGS Desk →</a>
        </div>
      </div>
    {/if}

    {#if ledgerResult}
      <div class="message success">
        <strong>Whatnot Ledger import complete.</strong>
        <p>{ledgerResult.filesImported} ledger export{ledgerResult.filesImported === 1 ? '' : 's'} processed.</p>

        <div class="stats ledger-stats">
          <span><b>{ledgerResult.salesEntries}</b> sales entries</span>
          <span><b>{ledgerResult.tipEntries}</b> tips</span>
          <span><b>{ledgerResult.payoutEntries}</b> payouts</span>
          <span><b>{money(ledgerResult.salesEarningsCents)}</b> sales earnings</span>
          <span><b>{money(ledgerResult.tipIncomeCents)}</b> tip income</span>
          <span><b>{money(ledgerResult.netBalanceChangeCents)}</b> net balance change</span>
        </div>

        {#if ledgerResult.pendingRows}
          <p class="warning">
            {ledgerResult.pendingRows} ledger row{ledgerResult.pendingRows === 1 ? '' : 's'} are still pending.
            They are retained for reconciliation but do not affect accounting yet.
          </p>
        {/if}

        <p>
          Ledger SALES rows do not add revenue again. Weekly Orders Reports remain the canonical
          sales P&amp;L source.
        </p>

        <div class="result-links">
          <a class="dashboard" href="/reconciliation">Open reconciliation →</a>
          <a class="secondary-link" href="/">Open dashboard →</a>
        </div>
      </div>
    {/if}

    {#if ebayResult}
      <div class="message success">
        <strong>eBay import complete.</strong>
        <div class="stats">
          <span><b>{ebayResult.ordersImported}</b> orders</span>
          <span><b>{ebayResult.sellingFeesImported}</b> selling fees</span>
          <span><b>{ebayResult.shippingLabelsImported}</b> shipping labels</span>
          <span><b>{ebayResult.payoutsImported}</b> payouts</span>
        </div>

        {#if ebayResult.unallocatedTransactions}
          <p>
            {ebayResult.unallocatedTransactions} transaction{ebayResult.unallocatedTransactions === 1 ? '' : 's'}
            could not be tied to an order and were retained as account-level adjustments.
          </p>
        {/if}

        <a class="dashboard" href="/">Open dashboard →</a>
      </div>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #080d12;
    color: #e8eee9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * { box-sizing: border-box; }

  .import-shell {
    min-height: 100vh;
    padding: 48px 24px;
    display: grid;
    align-content: start;
    justify-items: center;
    gap: 18px;
  }

  .back {
    width: min(760px, 100%);
    color: #91a0ac;
    text-decoration: none;
    font-size: 14px;
  }

  .card {
    width: min(760px, 100%);
    background: #0e151c;
    border: 1px solid #293640;
    border-radius: 20px;
    padding: 34px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, .32);
  }

  .eyebrow {
    color: #01d4a5;
    font-size: 11px;
    font-weight: 850;
    letter-spacing: .14em;
  }

  h1 {
    margin: 8px 0 10px;
    font-size: clamp(30px, 5vw, 44px);
    letter-spacing: -.035em;
  }

  .intro {
    color: #8997a2;
    line-height: 1.65;
    margin-bottom: 22px;
  }

  .marketplace-tabs,
  .whatnot-modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .marketplace-tabs { margin-bottom: 12px; }
  .whatnot-modes { margin-bottom: 14px; }

  .marketplace-tabs button,
  .whatnot-modes button {
    border: 1px solid #2d3943;
    border-radius: 12px;
    background: #0a1016;
    color: #dbe4de;
    cursor: pointer;
  }

  .marketplace-tabs button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    text-align: left;
  }

  .whatnot-modes button {
    display: grid;
    gap: 2px;
    padding: 11px 12px;
    text-align: left;
  }

  .marketplace-tabs button.active,
  .whatnot-modes button.active {
    border-color: #11698a;
    box-shadow: 0 0 0 1px #11698a55;
    background: #0a1722;
  }

  .marketplace-tabs button > span:last-child {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .marketplace-tabs small,
  .whatnot-modes small {
    color: #687682;
    font-size: 11px;
  }

  .whatnot-mark, .ebay-mark {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    font-weight: 950;
  }

  .whatnot-mark { background: #01d4a5; color: #03131a; }
  .ebay-mark { background: #eef3f6; color: #14202a; }

  .report-note {
    margin-bottom: 20px;
    border: 1px solid #2c3942;
    border-radius: 10px;
    padding: 11px 12px;
    color: #7d8b96;
    background: #0a1117;
    font-size: 12px;
    line-height: 1.55;
  }

  .report-note strong { color: #b7c4cd; }

  form {
    display: grid;
    gap: 14px;
  }

  .file-box {
    display: grid;
    gap: 7px;
    padding: 22px;
    border: 1px dashed #465660;
    border-radius: 14px;
    background: #090f14;
    cursor: pointer;
  }

  .file-box span { color: #82919c; font-size: 14px; }
  .file-box input { margin-top: 8px; }

  .import-button,
  .dashboard {
    display: inline-flex;
    justify-content: center;
    border: 0;
    border-radius: 10px;
    padding: 13px 18px;
    background: #01d4a5;
    color: #03131a;
    font: inherit;
    font-weight: 900;
    text-decoration: none;
    cursor: pointer;
  }

  .import-button:disabled {
    opacity: .45;
    cursor: not-allowed;
  }

  .message {
    margin-top: 22px;
    padding: 18px;
    border-radius: 13px;
    line-height: 1.5;
  }

  .error {
    border: 1px solid #673239;
    background: #2a151a;
    color: #ffb5bd;
  }

  .success {
    border: 1px solid #365229;
    background: #111d0e;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 9px;
    margin: 16px 0;
  }

  .whatnot-stats,
  .ledger-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .stats span {
    padding: 11px;
    border-radius: 9px;
    background: rgba(255, 255, 255, .045);
    color: #aebbc4;
    font-size: 12px;
  }

  .stats b {
    display: block;
    color: #fff;
    font-size: 21px;
  }

  .warning { color: #e0bd71; }

  .result-links {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  .secondary-link {
    color: #a5b1ba;
    font-size: 13px;
    font-weight: 800;
    text-decoration: none;
  }

  .secondary-link:hover { color: #01d4a5; }

  @media (max-width: 640px) {
    .card { padding: 24px; }
    .marketplace-tabs,
    .whatnot-modes { grid-template-columns: 1fr; }
    .stats,
    .whatnot-stats,
    .ledger-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
