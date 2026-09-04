<script lang="ts">
  type Marketplace = 'ebay' | 'whatnot';

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

  let marketplace = $state<Marketplace>('whatnot');
  let files = $state<File[]>([]);
  let importing = $state(false);
  let error = $state<string | null>(null);
  let ebayResult = $state<EbayImportResult | null>(null);
  let whatnotResult = $state<WhatnotImportResult | null>(null);

  function selectMarketplace(value: Marketplace) {
    marketplace = value;
    files = [];
    error = null;
    ebayResult = null;
    whatnotResult = null;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!files.length || importing) return;

    importing = true;
    error = null;
    ebayResult = null;
    whatnotResult = null;

    const form = new FormData();
    for (const file of files) form.append('file', file);

    const endpoint = marketplace === 'whatnot'
      ? '/api/whatnot/import-orders'
      : '/api/ebay/import-transactions';

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });
    const payload = await response.json() as
      | (EbayImportResult & { error?: string })
      | (WhatnotImportResult & { error?: string });

    importing = false;
    if (!response.ok) {
      error = payload.error ?? 'Import failed.';
      return;
    }

    if (marketplace === 'whatnot') {
      whatnotResult = payload as WhatnotImportResult;
    } else {
      ebayResult = payload as EbayImportResult;
    }
  }
</script>

<svelte:head>
  <title>Import marketplace data · Nettiva</title>
</svelte:head>

<main class="import-shell">
  <a class="back" href="/">← Back to Nettiva</a>

  <section class="card">
    <span class="eyebrow">NETTIVA · MARKETPLACE IMPORTS</span>
    <h1>Bring in seller history</h1>
    <p class="intro">
      Marketplace exports feed the same normalized inventory and accounting model.
      Re-importing the same report is safe: Nettiva uses deterministic marketplace IDs.
    </p>

    <div class="marketplace-tabs">
      <button
        type="button"
        class:active={marketplace === 'whatnot'}
        onclick={() => selectMarketplace('whatnot')}
      >
        <span class="whatnot-mark">W</span>
        <span><strong>Whatnot</strong><small>Weekly Orders Report</small></span>
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
      <div class="report-note">
        <strong>Use the Weekly Orders Report.</strong>
        Seller Hub → Financials → Statements → choose a week → Download.
        The separate Whatnot Ledger export will become Nettiva's payout/reconciliation feed later.
      </div>
    {:else}
      <div class="report-note">
        <strong>Advanced / fallback.</strong>
        Use the Transaction report exported from eBay Seller Hub for historical backfill or reconciliation.
      </div>
    {/if}

    <form onsubmit={submit}>
      <label class="file-box">
        <strong>{marketplace === 'whatnot' ? 'Whatnot Weekly Orders Report CSV' : 'eBay Transaction report CSV'}</strong>
        <span>
          {files.length
            ? files.length === 1
              ? files[0].name
              : `${files.length} weekly reports selected`
            : marketplace === 'whatnot'
              ? 'Choose one or more weekly CSV reports'
              : 'Choose a CSV file'}
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
        {importing ? 'Importing…' : `Import ${marketplace === 'whatnot' ? 'Whatnot orders' : 'eBay transactions'}`}
      </button>
    </form>

    {#if error}
      <div class="message error">{error}</div>
    {/if}

    {#if whatnotResult}
      <div class="message success">
        <strong>Whatnot import complete.</strong>
        <p>{whatnotResult.filesImported} weekly report{whatnotResult.filesImported === 1 ? '' : 's'} processed.</p>
        <div class="stats whatnot-stats">
          <span><b>{whatnotResult.ordersImported}</b> orders</span>
          <span><b>{whatnotResult.feesImported}</b> fee rows</span>
          <span><b>{whatnotResult.sellerShippingImported}</b> seller shipping</span>
          <span><b>{whatnotResult.giveaways}</b> giveaways</span>
          <span><b>{whatnotResult.inventoryMatched}</b> SKU matches</span>
          <span><b>{whatnotResult.inventoryCreated}</b> history items</span>
        </div>

        {#if whatnotResult.skuConflicts}
          <p class="warning">
            {whatnotResult.skuConflicts} SKU conflict{whatnotResult.skuConflicts === 1 ? '' : 's'}
            were imported using separate history records so Nettiva would not assign the same inventory item to two sales.
          </p>
        {/if}

        {#if whatnotResult.unreconciledRows}
          <p class="warning">
            {whatnotResult.unreconciledRows} row{whatnotResult.unreconciledRows === 1 ? '' : 's'}
            required a reconciliation adjustment because Whatnot's net amount did not exactly equal sale price minus reported fees.
          </p>
        {/if}

        <p>
          Missing SKU or COGS is intentionally preserved as missing data. Historical sales still appear in Nettiva,
          and their purchase cost can be completed through the COGS Desk.
        </p>
        <a class="dashboard" href="/">Open dashboard →</a>
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
  .import-shell {
    min-height: 100vh;
    box-sizing: border-box;
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
    box-sizing: border-box;
    background: #0e151c;
    border: 1px solid #293640;
    border-radius: 20px;
    padding: 34px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, .32);
  }
  .eyebrow {
    color: #b8f34a;
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
  .marketplace-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
  }
  .marketplace-tabs button {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    border: 1px solid #2d3943;
    border-radius: 12px;
    padding: 12px;
    background: #0a1016;
    color: #dbe4de;
    cursor: pointer;
  }
  .marketplace-tabs button.active {
    border-color: #657d3d;
    box-shadow: 0 0 0 1px #657d3d55;
    background: #111910;
  }
  .marketplace-tabs button > span:last-child {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .marketplace-tabs small { color: #687682; font-size: 11px; }
  .whatnot-mark, .ebay-mark {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    font-weight: 950;
  }
  .whatnot-mark { background: #b8f34a; color: #091006; }
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
  .import-button, .dashboard {
    display: inline-flex;
    justify-content: center;
    border: 0;
    border-radius: 10px;
    padding: 13px 18px;
    background: #b8f34a;
    color: #081007;
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
  .whatnot-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
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
  .dashboard { margin-top: 6px; }
  @media (max-width: 640px) {
    .card { padding: 24px; }
    .marketplace-tabs { grid-template-columns: 1fr; }
    .stats, .whatnot-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
