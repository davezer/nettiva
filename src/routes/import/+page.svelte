<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    AlertTriangle,
    ArrowLeft,
    Check,
    ChevronDown,
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
    inventoryMatched: number;
    inventoryCreated: number;
    listingsEnded: number;
    cogsPreserved: number;
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

  let marketplace = $state<Marketplace>('ebay');
  let whatnotMode = $state<WhatnotMode>('orders');
  let files = $state<File[]>([]);
  let importing = $state(false);
  let dragging = $state(false);
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

  function shortDate(value: string) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return value;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(parsed));
  }

  function resetResults() {
    error = null;
    ebayResult = null;
    whatnotResult = null;
    ledgerResult = null;
  }

  function setMarketplace(value: Marketplace) {
    marketplace = value;
    files = [];
    resetResults();
  }

  function setWhatnotMode(value: WhatnotMode) {
    whatnotMode = value;
    files = [];
    resetResults();
  }

  function takeFiles(selected: File[]) {
    const csvs = selected.filter((file) => file.name.toLowerCase().endsWith('.csv'));
    files = marketplace === 'ebay' ? csvs.slice(0, 1) : csvs;
    resetResults();

    if (selected.length && !csvs.length) {
      error = 'Choose a CSV export.';
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    takeFiles([...(event.dataTransfer?.files ?? [])]);
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

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: form
      });

      const payload = await response.json() as
        | (EbayImportResult & { error?: string })
        | (WhatnotImportResult & { error?: string })
        | (WhatnotLedgerResult & { error?: string });

      if (!response.ok) {
        error = payload.error ?? 'Import failed.';
        return;
      }

      if (marketplace === 'ebay') {
        ebayResult = payload as EbayImportResult;
        await invalidateAll();
      } else if (whatnotMode === 'ledger') {
        ledgerResult = payload as WhatnotLedgerResult;
      } else {
        whatnotResult = payload as WhatnotImportResult;
      }
    } catch {
      error = 'Sellquity could not upload this report. Try the export again.';
    } finally {
      importing = false;
    }
  }

  const pickerLabel = $derived(
    marketplace === 'ebay'
      ? 'eBay Transaction report CSV'
      : whatnotMode === 'ledger'
        ? 'Whatnot Ledger CSV'
        : 'Whatnot Weekly Orders Report CSV'
  );

  const importLabel = $derived(
    marketplace === 'ebay'
      ? 'Import eBay report'
      : whatnotMode === 'ledger'
        ? 'Import Whatnot ledger'
        : 'Import Whatnot orders'
  );
</script>

<svelte:head>
  <title>eBay data import · Sellquity</title>
  <meta
    name="description"
    content="Import eBay Seller Hub transaction reports into Sellquity sales, inventory, fees, shipping, payouts, COGS, and profit."
  />
</svelte:head>

<div class="import-shell">
  <header class="topbar">
    <a class="back" href="/"><ArrowLeft size={16} /> Sellquity</a>
    <span class="mode-pill"><FileSpreadsheet size={14} /> DATA &amp; IMPORTS</span>
  </header>

  <main>
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">EBAY · SELLER HUB</span>
        <h1>Your eBay accounting sync.<br /><em>No API required.</em></h1>
        <p>
          Until direct eBay access is available, the official Transaction report is Sellquity's
          normal data feed—not a fallback. Drop it here and Sellquity reconciles the money trail
          and closes sold inventory by durable identity.
        </p>

        <div class="flow">
          <span><b>1</b><small>Export</small><strong>Seller Hub report</strong></span>
          <i>→</i>
          <span><b>2</b><small>Import</small><strong>Drop CSV</strong></span>
          <i>→</i>
          <span><b>3</b><small>Reconcile</small><strong>Profit + inventory</strong></span>
        </div>
      </div>

      <aside class="what-updates">
        <span class="eyebrow">ONE FILE UPDATES</span>
        <div><ReceiptText size={17} /><span><strong>Sales &amp; fees</strong><small>Orders and marketplace charges</small></span></div>
        <div><PackageCheck size={17} /><span><strong>Shipping labels</strong><small>Seller-paid postage</small></span></div>
        <div><WalletCards size={17} /><span><strong>Payout trail</strong><small>Recorded, never double-counted as P&amp;L</small></span></div>
        <div><Tag size={17} /><span><strong>Inventory status</strong><small>Item ID / listing ID / SKU → Sold</small></span></div>
      </aside>
    </section>

    <section class="work-grid">
      <article class="import-card">
        <div class="card-heading">
          <div>
            <span class="eyebrow">IMPORT NOW</span>
            <h2>eBay Transaction report</h2>
          </div>
          <span class="safe-pill"><Check size={13} /> Duplicate-safe</span>
        </div>

        <div class="report-note">
          <strong>Use the Transaction report exported from eBay Seller Hub.</strong>
          Sellquity uses the Custom label as your SKU when available. If you entered the eBay Item ID
          during Listing Prep, that identity takes priority.
        </div>

        <form onsubmit={submit}>
          <label
            class:dragging
            class="dropzone"
            ondragenter={(event) => {
              event.preventDefault();
              dragging = true;
            }}
            ondragover={(event) => {
              event.preventDefault();
              dragging = true;
            }}
            ondragleave={() => dragging = false}
            ondrop={handleDrop}
          >
            <input
              class="file-input"
              type="file"
              accept=".csv,text/csv"
              onchange={(event) => takeFiles([...(event.currentTarget.files ?? [])])}
            />
            <span class="upload-icon"><CloudUpload size={29} /></span>

            {#if files.length}
              <span class="file-selected">
                <small>READY TO IMPORT</small>
                <strong>{files[0].name}</strong>
                <em>{(files[0].size / 1024).toFixed(1)} KB</em>
              </span>
            {:else}
              <span class="drop-copy">
                <strong>Drop your eBay CSV here</strong>
                <small>or click to choose the Transaction report</small>
              </span>
            {/if}
          </label>

          <button class="import-button" disabled={!files.length || importing}>
            {#if importing}<RefreshCw class="spin" size={17} />{/if}
            {importing ? 'Reconciling eBay data…' : importLabel}
          </button>
        </form>

        {#if error}
          <div class="message error"><AlertTriangle size={18} /><span>{error}</span></div>
        {/if}

        {#if ebayResult}
          <div class="message success">
            <div class="success-head">
              <span class="success-icon"><Check size={19} /></span>
              <div>
                <strong>eBay import complete.</strong>
                <small>{ebayResult.rowsImported} report rows reconciled</small>
              </div>
            </div>

            <div class="stats">
              <span><b>{ebayResult.ordersImported}</b><small>order rows</small></span>
              <span><b>{ebayResult.sellingFeesImported}</b><small>selling fees</small></span>
              <span><b>{ebayResult.shippingLabelsImported}</b><small>shipping labels</small></span>
              <span><b>{ebayResult.payoutsImported}</b><small>payouts</small></span>
            </div>

            <div class="inventory-reconcile">
              <div>
                <Tag size={18} />
                <span>
                  <strong>{ebayResult.inventoryMatched} existing inventory match{ebayResult.inventoryMatched === 1 ? '' : 'es'}</strong>
                  <small>Matched by eBay Item ID, tracked listing ID, or exact SKU/custom label.</small>
                </span>
              </div>
              <div>
                <PackageCheck size={18} />
                <span>
                  <strong>{ebayResult.listingsEnded} live listing{ebayResult.listingsEnded === 1 ? '' : 's'} closed</strong>
                  <small>Matched Sellquity inventory moved to Sold automatically.</small>
                </span>
              </div>
              <div>
                <WalletCards size={18} />
                <span>
                  <strong>{ebayResult.cogsPreserved} matched COGS value{ebayResult.cogsPreserved === 1 ? '' : 's'} preserved</strong>
                  <small>Purchase cost, source, storage location, and SKU stay attached to your item.</small>
                </span>
              </div>
            </div>

            {#if ebayResult.inventoryCreated}
              <p class="result-note">
                {ebayResult.inventoryCreated} sale{ebayResult.inventoryCreated === 1 ? '' : 's'} had no
                existing Sellquity inventory identity, so historical Sold records were created.
              </p>
            {/if}

            {#if ebayResult.unallocatedTransactions}
              <p class="warning">
                <AlertTriangle size={15} />
                {ebayResult.unallocatedTransactions} account-level adjustment{ebayResult.unallocatedTransactions === 1 ? '' : 's'}
                could not be tied to an order. They were retained in Accounting.
              </p>
            {/if}

            <div class="result-links">
              <a class="primary-link" href="/">Open dashboard →</a>
              <a href="/cogs">Review COGS →</a>
              <a href="/listing-prep">Listing Prep →</a>
            </div>
          </div>
        {/if}
      </article>

      <aside class="side-stack">
        <section class="history-card">
          <div class="card-heading compact">
            <div>
              <span class="eyebrow">IMPORT HISTORY</span>
              <h2>Recent eBay reports</h2>
            </div>
          </div>

          {#if data.recentEbayImports.length}
            <div class="history-list">
              {#each data.recentEbayImports as batch}
                <div class="history-row">
                  <span class="history-icon"><FileSpreadsheet size={15} /></span>
                  <span>
                    <strong>{batch.filename ?? 'eBay Transaction report'}</strong>
                    <small>{shortDate(batch.importedAt)} · {batch.ordersImported} orders · {batch.transactionsImported} ledger rows</small>
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="history-empty">
              <FileSpreadsheet size={22} />
              <strong>No eBay reports imported yet.</strong>
              <small>Your first successful import will show here.</small>
            </div>
          {/if}
        </section>

        <section class="identity-card">
          <span class="eyebrow">THE CLOSED LOOP</span>
          <h2>Listing Prep now talks to Accounting.</h2>
          <p>
            Put the Sellquity SKU in eBay's Custom label field. When that item appears in a
            Transaction report, Sellquity can link the sale back to your original inventory record,
            preserve COGS, end the listing, and mark the item Sold.
          </p>
          <a href="/listing-prep"><Tag size={15} /> Open Listing Prep</a>
        </section>
      </aside>
    </section>

    <details class="other-imports">
      <summary>
        <span><ShoppingBag size={17} /><strong>Other marketplace imports</strong><small>Whatnot is parked, not deleted</small></span>
        <ChevronDown size={18} />
      </summary>

      <div class="other-body">
        <div class="other-heading">
          <div>
            <span class="eyebrow">PARKED MULTI-MARKETPLACE TOOLS</span>
            <h2>Whatnot CSV pipelines</h2>
          </div>
          <div class="marketplace-tabs">
            <button class:active={marketplace === 'ebay'} type="button" onclick={() => setMarketplace('ebay')}>eBay</button>
            <button class:active={marketplace === 'whatnot'} type="button" onclick={() => setMarketplace('whatnot')}>Whatnot</button>
          </div>
        </div>

        {#if marketplace === 'ebay'}
          <p class="other-copy">
            eBay is the active personal workflow. Use the main importer above for normal Sellquity accounting.
          </p>
        {:else}
          <div class="whatnot-modes">
            <button class:active={whatnotMode === 'orders'} type="button" onclick={() => setWhatnotMode('orders')}>
              <strong>Orders &amp; profit</strong><small>Weekly Orders Reports</small>
            </button>
            <button class:active={whatnotMode === 'ledger'} type="button" onclick={() => setWhatnotMode('ledger')}>
              <strong>Balance &amp; payouts</strong><small>Ledger export</small>
            </button>
          </div>

          <form class="secondary-form" onsubmit={submit}>
            <label class="secondary-picker">
              <span>
                <strong>{pickerLabel}</strong>
                <small>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Choose one or more CSV exports'}</small>
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                multiple
                onchange={(event) => takeFiles([...(event.currentTarget.files ?? [])])}
              />
            </label>
            <button class="secondary-import" disabled={!files.length || importing}>
              {importing ? 'Importing…' : importLabel}
            </button>
          </form>

          {#if whatnotResult}
            <div class="secondary-result">
              <strong>Whatnot order import complete.</strong>
              <span>{whatnotResult.ordersImported} orders · {whatnotResult.feesImported} fees · {whatnotResult.inventoryMatched} SKU matches</span>
            </div>
          {/if}

          {#if ledgerResult}
            <div class="secondary-result">
              <strong>Whatnot Ledger import complete.</strong>
              <span>{ledgerResult.salesEntries} sales entries · {ledgerResult.tipEntries} tips · {money(ledgerResult.netBalanceChangeCents)} net balance change</span>
            </div>
          {/if}

          {#if error}
            <div class="message error compact-error"><AlertTriangle size={16} /><span>{error}</span></div>
          {/if}
        {/if}
      </div>
    </details>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background:
      radial-gradient(circle at 72% -18%, #0069e31f 0, transparent 34rem),
      #050b14;
    color: #f4f8ff;
    font-family: "Arial Narrow", "Roboto Condensed", Inter, ui-sans-serif, system-ui, sans-serif;
  }

  * { box-sizing: border-box; }

  .import-shell { min-height: 100vh; }
  .topbar {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 max(22px, calc((100vw - 1180px) / 2));
    border-bottom: 1px solid #17304a;
    background: #07111bd9;
    backdrop-filter: blur(14px);
  }

  .back, .mode-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    text-decoration: none;
  }

  .back { color: #91a8bc; font-size: .78rem; font-weight: 850; }
  .back:hover { color: #01d0e9; }
  .mode-pill {
    border: 1px solid #1d4866;
    border-radius: 999px;
    padding: 6px 10px;
    color: #61e7d3;
    background: #09202b;
    font: 800 .66rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .08em;
  }

  main {
    width: min(1180px, calc(100% - 36px));
    margin: 0 auto;
    padding: 54px 0 80px;
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(300px, .72fr);
    gap: 28px;
    align-items: end;
    margin-bottom: 24px;
  }

  .eyebrow {
    color: #01d4a5;
    font: 850 .68rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .14em;
  }

  h1 {
    margin: 9px 0 15px;
    max-width: 810px;
    font-size: clamp(2.2rem, 5.2vw, 4.6rem);
    line-height: .94;
    letter-spacing: -.055em;
  }

  h1 em {
    color: #01d0e9;
    font-style: normal;
  }

  h2 { margin: 5px 0 0; letter-spacing: -.025em; }
  .hero-copy > p {
    max-width: 760px;
    margin: 0;
    color: #8da0ba;
    line-height: 1.65;
    font-size: .91rem;
  }

  .flow {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-top: 25px;
  }

  .flow > span {
    min-width: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 8px;
    align-items: center;
    border: 1px solid #173a54;
    border-radius: 10px;
    padding: 9px 11px;
    background: #081521;
  }

  .flow b {
    grid-row: 1 / 3;
    width: 25px; height: 25px;
    display: grid; place-items: center;
    border-radius: 7px;
    color: #03131a;
    background: linear-gradient(135deg, #0069e3, #01d0e9 55%, #01d4a5);
    font-size: .7rem;
  }
  .flow small { color: #607c94; font-size: .6rem; text-transform: uppercase; letter-spacing: .08em; }
  .flow strong { font-size: .74rem; }
  .flow i { color: #3c6680; font-style: normal; }

  .what-updates {
    display: grid;
    gap: 12px;
    border: 1px solid #193b55;
    border-radius: 15px;
    padding: 20px;
    background: linear-gradient(145deg, #0c1b2b, #08131f);
    box-shadow: 0 14px 40px #00000030;
  }

  .what-updates > div {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    align-items: center;
  }

  .what-updates :global(svg) { color: #01d0e9; }
  .what-updates div span { display: flex; flex-direction: column; gap: 2px; }
  .what-updates strong { font-size: .77rem; }
  .what-updates small { color: #68849c; font-size: .66rem; line-height: 1.35; }

  .work-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(300px, .65fr);
    gap: 18px;
    align-items: start;
  }

  .import-card, .history-card, .identity-card, .other-imports {
    border: 1px solid #19314f;
    border-radius: 15px;
    background: linear-gradient(145deg, #0d1928 0%, #09131f 100%);
    box-shadow: 0 12px 38px #0000002b;
  }

  .import-card { padding: 24px; }
  .card-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .card-heading.compact { margin-bottom: 14px; }

  .safe-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #155b62;
    border-radius: 999px;
    padding: 5px 8px;
    color: #67ead7;
    background: #08262b;
    font-size: .65rem;
    font-weight: 850;
  }

  .report-note {
    margin: 19px 0;
    border-left: 3px solid #01d0e9;
    padding: 11px 13px;
    color: #7f98ad;
    background: #071521;
    font-size: .76rem;
    line-height: 1.5;
  }
  .report-note strong { color: #dbeaf5; }

  form { display: grid; gap: 11px; }

  .dropzone {
    min-height: 190px;
    display: grid;
    place-items: center;
    gap: 11px;
    border: 1px dashed #256083;
    border-radius: 14px;
    padding: 26px;
    background:
      radial-gradient(circle at 50% 0%, #0069e312 0, transparent 18rem),
      #07121d;
    cursor: pointer;
    text-align: center;
    transition: 150ms ease;
  }

  .dropzone:hover, .dropzone.dragging {
    border-color: #01d0e9;
    background:
      radial-gradient(circle at 50% 0%, #01d0e91b 0, transparent 18rem),
      #081826;
    box-shadow: inset 0 0 0 1px #01d0e914;
  }

  .file-input {
    position: absolute;
    width: 1px; height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .upload-icon {
    width: 53px; height: 53px;
    display: grid; place-items: center;
    border: 1px solid #1e5f7c;
    border-radius: 14px;
    color: #68ecdc;
    background: linear-gradient(145deg, #092944, #09232d);
  }

  .drop-copy, .file-selected { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .drop-copy strong { font-size: .9rem; }
  .drop-copy small { color: #6d879d; font-size: .73rem; }

  .file-selected small {
    color: #01d4a5;
    font: 800 .6rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .1em;
  }
  .file-selected strong { max-width: 520px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .85rem; }
  .file-selected em { color: #638096; font-style: normal; font-size: .68rem; }

  .import-button {
    min-height: 46px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 0;
    border-radius: 9px;
    color: #03131a;
    background: linear-gradient(135deg, #0069e3, #01d0e9 55%, #01d4a5);
    box-shadow: 0 8px 24px #0069e329;
    font-weight: 900;
    cursor: pointer;
  }

  .import-button:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .message {
    margin-top: 15px;
    border-radius: 12px;
    padding: 15px;
  }
  .message.error {
    display: flex;
    gap: 9px;
    align-items: flex-start;
    border: 1px solid #69343b;
    color: #ff9ca3;
    background: #281319;
    font-size: .76rem;
  }
  .message.success {
    border: 1px solid #165564;
    background:
      radial-gradient(circle at 8% 0%, #01d4a50d 0, transparent 15rem),
      #08202a;
  }

  .success-head { display: flex; align-items: center; gap: 10px; }
  .success-icon {
    width: 37px; height: 37px;
    display: grid; place-items: center;
    border-radius: 10px;
    color: #03131a;
    background: linear-gradient(135deg, #01d0e9, #01d4a5);
  }
  .success-head > div { display: flex; flex-direction: column; gap: 2px; }
  .success-head strong { font-size: .88rem; }
  .success-head small { color: #71a4b4; font-size: .68rem; }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    margin-top: 14px;
    border: 1px solid #174052;
    border-radius: 9px;
    overflow: hidden;
    background: #174052;
  }
  .stats span {
    display: flex; flex-direction: column; gap: 2px;
    padding: 10px;
    background: #091a24;
  }
  .stats b { font-size: .95rem; }
  .stats small { color: #64869a; font-size: .61rem; }

  .inventory-reconcile { display: grid; gap: 8px; margin-top: 12px; }
  .inventory-reconcile > div {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 9px;
    align-items: center;
    border: 1px solid #144354;
    border-radius: 8px;
    padding: 9px 10px;
    background: #071923;
  }
  .inventory-reconcile :global(svg) { color: #01d4a5; }
  .inventory-reconcile span { display: flex; flex-direction: column; gap: 1px; }
  .inventory-reconcile strong { font-size: .72rem; }
  .inventory-reconcile small { color: #66889b; font-size: .62rem; line-height: 1.35; }

  .result-note {
    margin: 11px 0 0;
    color: #7e9bad;
    font-size: .69rem;
    line-height: 1.45;
  }
  .warning {
    display: flex;
    gap: 7px;
    margin: 11px 0 0;
    color: #e8bd68;
    font-size: .69rem;
    line-height: 1.45;
  }

  .result-links { display: flex; flex-wrap: wrap; gap: 13px; margin-top: 14px; }
  .result-links a {
    color: #82cbd8;
    text-decoration: none;
    font-size: .7rem;
    font-weight: 850;
  }
  .result-links a:hover, .result-links .primary-link { color: #01d4a5; }

  .side-stack { display: grid; gap: 18px; }
  .history-card, .identity-card { padding: 19px; }

  .history-list { display: grid; }
  .history-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 9px;
    align-items: center;
    padding: 10px 0;
    border-top: 1px solid #173047;
  }
  .history-row:first-child { border-top: 0; padding-top: 2px; }
  .history-icon {
    width: 30px; height: 30px;
    display: grid; place-items: center;
    border-radius: 8px;
    color: #01d0e9;
    background: #092335;
  }
  .history-row > span:last-child { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .history-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .7rem; }
  .history-row small { color: #607d93; font-size: .6rem; line-height: 1.35; }

  .history-empty {
    min-height: 150px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
    color: #55748b;
    text-align: center;
  }
  .history-empty strong { color: #9bb0c2; font-size: .75rem; }
  .history-empty small { font-size: .63rem; }

  .identity-card h2 { margin-top: 6px; font-size: 1.05rem; }
  .identity-card p { color: #7890a5; font-size: .72rem; line-height: 1.55; }
  .identity-card a {
    display: inline-flex; align-items: center; gap: 6px;
    color: #01d4a5;
    text-decoration: none;
    font-size: .7rem;
    font-weight: 850;
  }

  .other-imports { margin-top: 18px; overflow: hidden; }
  .other-imports summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    cursor: pointer;
    list-style: none;
  }
  .other-imports summary::-webkit-details-marker { display: none; }
  .other-imports summary > span {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    column-gap: 8px;
  }
  .other-imports summary strong { font-size: .77rem; }
  .other-imports summary small {
    grid-column: 2;
    color: #617d93;
    font-size: .61rem;
  }
  .other-imports[open] summary { border-bottom: 1px solid #19314f; }
  .other-imports[open] summary > :global(svg:last-child) { transform: rotate(180deg); }
  .other-body { padding: 18px; }
  .other-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 15px; }
  .other-copy { color: #7890a5; font-size: .73rem; }

  .marketplace-tabs, .whatnot-modes { display: flex; gap: 6px; }
  .marketplace-tabs button, .whatnot-modes button {
    border: 1px solid #24465f;
    border-radius: 8px;
    color: #8da3b5;
    background: #09141f;
    cursor: pointer;
  }
  .marketplace-tabs button { padding: 7px 11px; font-size: .68rem; }
  .marketplace-tabs button.active {
    border-color: transparent;
    color: #03131a;
    background: linear-gradient(135deg, #0069e3, #01d0e9 55%, #01d4a5);
  }

  .whatnot-modes { margin: 15px 0 11px; }
  .whatnot-modes button { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px; }
  .whatnot-modes button.active { border-color: #17788f; background: #09202a; }
  .whatnot-modes strong { font-size: .71rem; }
  .whatnot-modes small { color: #617b90; font-size: .6rem; }

  .secondary-form { grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; }
  .secondary-picker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid #24455e;
    border-radius: 9px;
    padding: 10px 12px;
    background: #07131e;
    cursor: pointer;
  }
  .secondary-picker > span { display: flex; flex-direction: column; gap: 2px; }
  .secondary-picker strong { font-size: .7rem; }
  .secondary-picker small { color: #607c91; font-size: .61rem; }
  .secondary-picker input { max-width: 230px; color: #7894a8; font-size: .62rem; }

  .secondary-import {
    border: 1px solid #1d6078;
    border-radius: 9px;
    padding: 0 14px;
    color: #62e6d4;
    background: #09222b;
    font-weight: 850;
    cursor: pointer;
  }
  .secondary-import:disabled { opacity: .45; cursor: not-allowed; }

  .secondary-result {
    display: flex; justify-content: space-between; gap: 15px;
    margin-top: 11px;
    border: 1px solid #18515c;
    border-radius: 8px;
    padding: 9px 11px;
    color: #82d9d1;
    background: #082229;
    font-size: .67rem;
  }
  .compact-error { margin-top: 11px; }

  @media (max-width: 900px) {
    .hero, .work-grid { grid-template-columns: 1fr; }
    .what-updates { grid-template-columns: repeat(2, 1fr); }
    .flow { flex-wrap: wrap; }
    .flow i { display: none; }
  }

  @media (max-width: 620px) {
    main { width: min(100% - 24px, 1180px); padding-top: 32px; }
    .topbar { padding: 0 14px; }
    .mode-pill { display: none; }
    .what-updates { grid-template-columns: 1fr; }
    .stats { grid-template-columns: repeat(2, 1fr); }
    .other-heading, .secondary-result { align-items: stretch; flex-direction: column; }
    .secondary-form { grid-template-columns: 1fr; }
    .secondary-picker { align-items: flex-start; flex-direction: column; }
  }
</style>
