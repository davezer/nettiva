<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    AlertTriangle, Archive, ArrowUpRight, BadgeDollarSign, BarChart3, Boxes,
    Check, ChevronRight, CircleDollarSign, Clock3, Cloud, ExternalLink,
    FileSpreadsheet, LayoutDashboard, LoaderCircle, MapPin, PackageCheck, PlugZap,
    RefreshCw, Search, Settings, ShoppingBag, Tag, TrendingUp, Upload, X
  } from '@lucide/svelte';
  import type { DashboardData, InventoryRow } from '$lib/types';
  import { money, shortDate } from '$lib/money';

  let { data }: { data: DashboardData } = $props();

  type View = 'dashboard' | 'inventory' | 'sales' | 'settings';
  type Filter = 'all' | InventoryRow['status'];

  let view = $state<View>('dashboard');
  let query = $state('');
  let filter = $state<Filter>('all');
  let syncing = $state(false);
  let editing = $state<InventoryRow | null>(null);
  let cost = $state('');
  let source = $state('');
  let location = $state('');
  let saveMessage = $state<string | null>(null);
  let saving = $state(false);
  let importFile = $state<File | null>(null);
  let importing = $state(false);
  let importMessage = $state<string | null>(null);
  let importPreview = $state<{
    filename: string;
    type: 'active-listings' | 'orders';
    rowsSeen: number;
    validRows: number;
    skippedRows: number;
    warnings: string[];
  } | null>(null);

  const navItems = [
    { view: 'dashboard' as const, label: 'Overview', icon: LayoutDashboard },
    { view: 'inventory' as const, label: 'Inventory', icon: Boxes },
    { view: 'sales' as const, label: 'Sales', icon: BadgeDollarSign },
    { view: 'settings' as const, label: 'Data & eBay', icon: Settings }
  ];

  const metrics = $derived.by(() => {
    const gross = data.sales.reduce((sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents, 0);
    const profit = data.sales.reduce((sum, sale) => sum + sale.netProfitCents, 0) + (data.unallocatedNetCents ?? 0);
    const activeItems = data.inventory.filter((item) => item.status === 'active');
    const avgAge = activeItems.length
      ? Math.round(activeItems.reduce((sum, item) => sum + item.ageDays, 0) / activeItems.length)
      : 0;
    return { gross, profit, margin: gross ? (profit / gross) * 100 : 0, active: activeItems.length, avgAge };
  });

  const filtered = $derived(data.inventory.filter((item) => {
    const matchesStatus = filter === 'all' || item.status === filter;
    const haystack = `${item.title} ${item.sku ?? ''} ${item.ebayItemId ?? ''}`.toLowerCase();
    return matchesStatus && haystack.includes(query.toLowerCase());
  }));

  const missingCost = $derived(data.inventory.filter((item) => item.costCents == null).length);
  const stale = $derived(data.inventory.filter((item) => item.status === 'active' && item.ageDays >= 90).length);
  const activeValue = $derived(data.inventory.filter((item) => item.status === 'active').reduce((sum, item) => sum + (item.listPriceCents ?? 0), 0));
  const maxProfit = $derived(Math.max(...data.sales.map((sale) => sale.netProfitCents), 1));

  const percent = (value: number) => `${value.toFixed(1)}%`;
  const initials = (title: string) => title.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

  function openEditor(item: InventoryRow) {
    editing = item;
    cost = item.costCents == null ? '' : (item.costCents / 100).toFixed(2);
    source = item.source ?? '';
    location = item.location ?? '';
    saveMessage = null;
  }

  async function saveItem(event: SubmitEvent) {
    event.preventDefault();
    if (!editing) return;
    if (data.isDemo) {
      saveMessage = 'Demo edits are a preview. Connect eBay to save real inventory data.';
      return;
    }
    saving = true;
    saveMessage = null;
    const response = await fetch(`/api/inventory/${encodeURIComponent(editing.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        purchaseCostCents: cost.trim() === '' ? null : Math.round(Number(cost) * 100),
        source: source.trim() || null,
        storageLocation: location.trim() || null
      })
    });
    saving = false;
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      saveMessage = result?.error ?? 'Could not save this item.';
      return;
    }
    editing = null;
    await invalidateAll();
  }

  async function syncNow() {
    syncing = true;
    const response = await fetch('/api/ebay/sync', { method: 'POST' });
    if (response.redirected) window.location.href = response.url;
    else {
      syncing = false;
      await invalidateAll();
    }
  }

  async function importReport(mode: 'preview' | 'commit') {
    if (!importFile) return;
    importing = true;
    importMessage = null;
    const form = new FormData();
    form.append('report', importFile);
    const response = await fetch(`/api/import/csv?mode=${mode}`, { method: 'POST', body: form });
    const result = await response.json().catch(() => null) as {
      preview?: NonNullable<typeof importPreview>;
      imported?: number;
      error?: string;
    } | null;
    importing = false;
    if (!response.ok || !result?.preview) {
      importMessage = result?.error ?? 'Could not read this report.';
      return;
    }
    importPreview = result.preview;
    if (mode === 'commit') {
      importMessage = `Imported ${result.imported ?? 0} ${result.preview.type === 'orders' ? 'order lines' : 'active listings'}.`;
      await invalidateAll();
    }
  }
</script>

<div class="app-shell">
  <aside class="sidebar">
    <div class="brand">
      <span class="brand-mark">N</span>
      <div><strong>NETTIVA</strong><small>Resale intelligence</small></div>
    </div>

    <nav aria-label="Primary navigation">
      {#each navItems as item}
        {@const Icon = item.icon}
        <button class:active={view === item.view} onclick={() => view = item.view}>
          <Icon size={19} />
          <span>{item.label}</span>
          {#if view === item.view}<ChevronRight class="nav-arrow" size={15} />{/if}
        </button>
      {/each}
    </nav>

    <div class="sidebar-foot">
      <div class:online={data.connected} class="connection-dot"></div>
      <div>
        <strong>{data.connected ? 'eBay connected' : data.hasImportedData ? 'CSV workspace' : 'Demo workspace'}</strong>
        <small>{data.lastSyncedAt ? `Synced ${shortDate(data.lastSyncedAt)}` : data.hasImportedData ? 'Manual reports loaded' : 'Read-only mode'}</small>
      </div>
    </div>
  </aside>

  <main class="main-panel">
    <header class="topbar">
      <div>
        <span class="eyebrow">{view === 'settings' ? 'SETUP' : 'SELLER COMMAND CENTER'}</span>
        <h1>{navItems.find((item) => item.view === view)?.label}</h1>
      </div>
      <div class="top-actions">
        {#if data.isDemo}<span class="demo-badge">Demo data</span>{:else if !data.financialsComplete}<span class="demo-badge">Fees pending</span>{/if}
        {#if data.connected}
          <button class="button secondary" onclick={syncNow} disabled={syncing}>
            {#if syncing}<LoaderCircle class="spin" size={17} />{:else}<RefreshCw size={17} />{/if}
            Sync now
          </button>
        {:else}
          <a class="button primary" href="/api/ebay/connect"><PlugZap size={17} /> Connect eBay</a>
        {/if}
      </div>
    </header>

    {#if view === 'dashboard'}
      <div class="view-stack">
        <section class="metrics-grid" aria-label="Business summary">
          <article class="metric-card tone-green"><div class="metric-top"><span>Gross sales</span><CircleDollarSign size={18} /></div><strong>{money(metrics.gross)}</strong><p>{data.sales.length} orders in view</p></article>
          <article class="metric-card tone-blue"><div class="metric-top"><span>{data.financialsComplete ? 'Net profit' : 'Estimated profit'}</span><TrendingUp size={18} /></div><strong>{money(metrics.profit)}</strong><p>{data.financialsComplete ? `${percent(metrics.margin)} true margin` : 'Before eBay seller fees'}</p></article>
          <article class="metric-card tone-violet"><div class="metric-top"><span>Active inventory</span><ShoppingBag size={18} /></div><strong>{metrics.active}</strong><p>{money(activeValue)} listed</p></article>
          <article class="metric-card tone-amber"><div class="metric-top"><span>Average age</span><Clock3 size={18} /></div><strong>{metrics.avgAge} days</strong><p>{stale ? `${stale} stale listing${stale === 1 ? '' : 's'}` : 'Inventory is moving'}</p></article>
        </section>

        <section class="dashboard-grid">
          <article class="panel profit-panel">
            <div class="panel-heading"><div><span class="kicker">RECENT PERFORMANCE</span><h2>Profit by sale</h2></div><button onclick={() => view = 'sales'}>View all <ChevronRight size={16} /></button></div>
            <div class="profit-bars">
              {#each data.sales.slice(0, 5) as sale}
                <div class="profit-row"><span>{shortDate(sale.soldAt)}</span><div class="bar-track"><span style:width={`${Math.max(8, sale.netProfitCents / maxProfit * 100)}%`}></span></div><strong>{money(sale.netProfitCents)}</strong></div>
              {/each}
            </div>
            <div class="margin-footer"><ArrowUpRight size={17} /><span><strong>{percent(metrics.margin)}</strong> of revenue kept after costs</span></div>
          </article>

          <article class="panel attention-panel">
            <div class="panel-heading"><div><span class="kicker">QUEUE</span><h2>Needs attention</h2></div><AlertTriangle size={20} /></div>
            <button onclick={() => { filter = 'all'; view = 'inventory'; }}><span class="attention-icon amber"><Tag size={17} /></span><span><strong>{missingCost} missing cost{missingCost === 1 ? '' : 's'}</strong><small>Profit is incomplete</small></span><ChevronRight size={17} /></button>
            <button onclick={() => { filter = 'active'; view = 'inventory'; }}><span class="attention-icon red"><Clock3 size={17} /></span><span><strong>{stale} listing{stale === 1 ? '' : 's'} over 90 days</strong><small>Review price or end listing</small></span><ChevronRight size={17} /></button>
            <button onclick={() => view = 'settings'}><span class="attention-icon blue"><Cloud size={17} /></span><span><strong>{data.connected ? 'Sync is healthy' : 'Connect your store'}</strong><small>{data.connected ? 'Read-only protection on' : 'Import listings and sales'}</small></span><ChevronRight size={17} /></button>
          </article>
        </section>

        <section class="panel recent-inventory">
          <div class="panel-heading table-heading"><div><span class="kicker">LIVE INVENTORY</span><h2>Items to watch</h2></div><button onclick={() => view = 'inventory'}>Open inventory <ChevronRight size={16} /></button></div>
          {@render inventoryTable(data.inventory.filter((item) => item.status !== 'sold').slice(0, 5))}
        </section>
      </div>
    {:else if view === 'inventory'}
      <section class="panel inventory-panel">
        <div class="inventory-tools">
          <label class="search-field"><Search size={18} /><span class="sr-only">Search inventory</span><input bind:value={query} placeholder="Search title, SKU, or eBay ID" /></label>
          <div class="filter-tabs" role="group" aria-label="Filter inventory">
            {#each ['all', 'active', 'unlisted', 'sold'] as value}
              <button class:active={filter === value} onclick={() => filter = value as Filter}>{value}</button>
            {/each}
          </div>
        </div>
        {@render inventoryTable(filtered)}
      </section>
    {:else if view === 'sales'}
      <section class="panel sales-panel">
        <div class="panel-heading table-heading"><div><span class="kicker">{data.financialsComplete ? 'RECONCILED ORDERS' : 'CSV ORDERS'}</span><h2>{data.financialsComplete ? 'True profit' : 'Estimated profit'}</h2></div><span class:data-warning={!data.financialsComplete} class="read-only">{#if data.financialsComplete}<Check size={14} /> eBay fees included{:else}<AlertTriangle size={14} /> eBay fees pending{/if}</span></div>
        <div class="table-wrap"><table><thead><tr><th>Item</th><th>Sold</th><th class="num">Gross</th><th class="num">Fees + ship</th><th class="num">COGS</th><th class="num">Profit</th><th class="num">Margin</th><th class="num">ROI</th></tr></thead><tbody>
          {#each data.sales as sale}
            <tr><td class="title-cell"><strong>{sale.title}</strong><small>Order line {sale.id}</small></td><td>{shortDate(sale.soldAt)}</td><td class="num">{money(sale.salePriceCents + sale.shippingChargedCents)}</td><td class="num negative">−{money(sale.costsAndFeesCents)}</td><td class="num negative">−{money(sale.cogsCents)}</td><td class="num profit">{money(sale.netProfitCents)}</td><td class="num">{percent(sale.margin)}</td><td class="num">{sale.roi == null ? '—' : percent(sale.roi)}</td></tr>
          {/each}
        </tbody></table></div>
      </section>
    {:else}
      <section class="connection-layout">
        <article class="connection-card">
          <div class:connected={data.connected} class="connection-hero"><PlugZap size={30} /><span>{data.connected ? 'CONNECTED' : 'NOT CONNECTED'}</span></div>
          <h2>{data.connected ? 'Your eBay store is linked' : 'Bring in your eBay business'}</h2>
          <p>{data.connected ? 'Listings, recent orders, and financial transactions can sync into your private workspace.' : 'Connect with eBay OAuth. Nettiva never sees or stores your eBay password.'}</p>
          {#if data.connected}<button class="button primary" onclick={syncNow} disabled={syncing}><RefreshCw size={17} /> Sync listings & sales</button>{:else}<a class="button primary" href="/api/ebay/connect"><ExternalLink size={17} /> Connect eBay securely</a>
          <a class="button secondary" href="/import">Import eBay CSV</a>{/if}
          <small>{data.lastSyncedAt ? `Last successful sync: ${new Date(data.lastSyncedAt).toLocaleString()}` : 'No production sync has run yet.'}</small>
        </article>
        <article class="panel setup-checklist"><span class="kicker">MVP SAFETY RAILS</span><h2>Read-only by design</h2><ul><li><Check /> Imports active listings</li><li><Check /> Imports recent completed orders</li><li><Check /> Imports actual eBay financial transactions</li><li><Check /> Saves cost, source, and bin location</li><li><Check /> Never edits a live eBay listing</li></ul><div class="setup-note"><BarChart3 /><span><strong>Next unlock</strong>Once the numbers reconcile, automation and repricing can sit safely on top.</span></div></article>
        <article class="panel import-card">
          <div class="import-heading"><span class="import-icon"><FileSpreadsheet size={23} /></span><div><span class="kicker">NO API REQUIRED</span><h2>Import an eBay CSV report</h2><p>Load an Orders or All Active Listings report while developer approval is pending.</p></div></div>
          <div class="import-controls">
            <label class="import-drop">
              <Upload size={19} />
              <span>{importFile?.name ?? 'Choose an eBay CSV report'}</span>
              <input type="file" accept=".csv,text/csv" onchange={(event) => {
                importFile = event.currentTarget.files?.[0] ?? null;
                importPreview = null;
                importMessage = null;
              }} />
            </label>
            <button class="button secondary" disabled={!importFile || importing} onclick={() => importReport('preview')}>{#if importing}<LoaderCircle class="spin" size={17} />{:else}<FileSpreadsheet size={17} />{/if} Preview</button>
          </div>
          {#if importPreview}
            <div class="import-summary">
              <div class="import-stats"><span><strong>{importPreview.validRows}</strong> ready</span><span><strong>{importPreview.skippedRows}</strong> skipped</span><span><strong>{importPreview.type === 'orders' ? 'Orders' : 'Active listings'}</strong> detected</span></div>
              {#each importPreview.warnings as warning}<p class="import-warning"><AlertTriangle size={15} />{warning}</p>{/each}
              <button class="button primary" disabled={importing} onclick={() => importReport('commit')}>{#if importing}<LoaderCircle class="spin" size={17} />{:else}<Upload size={17} />{/if} Import {importPreview.validRows} rows</button>
            </div>
          {/if}
          {#if importMessage}<p class="import-message">{importMessage}</p>{/if}
        </article>
      </section>
    {/if}
  </main>
</div>

{#snippet inventoryTable(items: InventoryRow[])}
  <div class="table-wrap"><table><thead><tr><th>Item</th><th>Status</th><th>Location</th><th class="num">Cost</th><th class="num">List price</th><th class="num">Age</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
    {#each items as item}
      <tr><td><div class="item-title">{#if item.imageUrl}<img class="item-avatar" src={item.imageUrl} alt="" />{:else}<span class="item-avatar item-fallback">{initials(item.title)}</span>{/if}<span><strong>{item.title}</strong><small>{item.sku || `eBay ${item.ebayItemId}`}</small></span></div></td><td><span class:status-active={item.status === 'active'} class:status-sold={item.status === 'sold'} class:status-unlisted={item.status === 'unlisted'} class="status-pill">{#if item.status === 'active'}<Cloud size={13} />{:else if item.status === 'sold'}<PackageCheck size={13} />{:else}<Archive size={13} />{/if}{item.status}</span></td><td><span class="location"><MapPin size={14} />{item.location || 'Not set'}</span></td><td class:missing={item.costCents == null} class="num">{money(item.costCents)}</td><td class="num">{money(item.listPriceCents)}</td><td class="num"><span class:age-stale={item.ageDays >= 90}>{item.ageDays ? `${item.ageDays}d` : '—'}</span></td><td class="action-cell"><button class="button mini secondary" onclick={() => openEditor(item)}>Edit</button></td></tr>
    {/each}
  </tbody></table></div>
{/snippet}

{#if editing}
  <div class="modal-backdrop" role="presentation">
    <button class="modal-dismiss" aria-label="Close inventory editor" onclick={() => editing = null}></button>
    <div class="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title">
      <button class="dialog-close" aria-label="Close" onclick={() => editing = null}><X size={18} /></button>
      <span class="kicker">INVENTORY DETAILS</span><h2 id="edit-title">{editing.title}</h2>
      <form onsubmit={saveItem}>
        <label><span>Purchase cost</span><div class="money-input"><span>$</span><input bind:value={cost} inputmode="decimal" placeholder="0.00" /></div></label>
        <label><span>Source</span><input bind:value={source} placeholder="Card show, Goodwill…" /></label>
        <label><span>Storage location</span><input bind:value={location} placeholder="A-14" /></label>
        {#if saveMessage}<p class="form-message">{saveMessage}</p>{/if}
        <div class="dialog-actions"><button type="button" class="button secondary" onclick={() => editing = null}>Cancel</button><button class="button primary" disabled={saving || (cost !== '' && !Number.isFinite(Number(cost)))}>{#if saving}<LoaderCircle class="spin" size={17} />{:else}<Check size={17} />{/if} Save details</button></div>
      </form>
    </div>
  </div>
{/if}
