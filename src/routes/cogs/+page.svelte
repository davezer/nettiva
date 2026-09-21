<script lang="ts">
  import { Check, ChevronLeft, ChevronRight, CircleDollarSign, LoaderCircle, Search } from '@lucide/svelte';

  type Provider = 'all' | 'ebay' | 'whatnot';
  type CogsItem = {
    saleId: string;
    inventoryItemId: string;
    title: string;
    sku: string | null;
    provider: 'ebay' | 'whatnot';
    orderId: string | null;
    soldAt: string;
    grossCents: number;
  };
  type PageData = {
    workspace: { id: string; name: string; slug: string; plan: string; role: 'owner' | 'admin' | 'member' } | null;
    items: CogsItem[];
  };

  let { data } = $props<{ data: PageData }>();
  const PAGE_SIZE = 20;

  let items = $state<CogsItem[]>([]);
  let initialized = $state(false);
  let query = $state('');
  let provider = $state<Provider>('all');
  let page = $state(1);
  let drafts = $state<Record<string, string>>({});
  let selected = $state<Record<string, boolean>>({});
  let bulkCost = $state('');
  let savingId = $state<string | null>(null);
  let bulkSaving = $state(false);
  let message = $state<string | null>(null);
  let messageKind = $state<'success' | 'error'>('success');

  $effect(() => {
    if (initialized) return;
    items = [...data.items];
    initialized = true;
  });

  function money(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }

  function soldDate(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  function providerLabel(value: CogsItem['provider']) { return value === 'whatnot' ? 'Whatnot' : 'eBay'; }

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (provider !== 'all' && item.provider !== provider) return false;
      if (!needle) return true;
      return [item.title, item.sku ?? '', item.orderId ?? '', providerLabel(item.provider)].join(' ').toLowerCase().includes(needle);
    });
  });

  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const safePage = $derived(Math.min(page, pageCount));
  const pageItems = $derived(filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE));
  const selectedCount = $derived(items.reduce((count, item) => count + (selected[item.saleId] ? 1 : 0), 0));
  const enteredCount = $derived(items.reduce((count, item) => count + ((drafts[item.saleId]?.trim() ?? '') ? 1 : 0), 0));

  $effect(() => { query; provider; page = 1; });

  function setSelected(item: CogsItem, checked: boolean) { selected[item.saleId] = checked; }
  function selectPage() { for (const item of pageItems) selected[item.saleId] = true; }
  function selectFiltered() { for (const item of filtered) selected[item.saleId] = true; }
  function clearSelection() { selected = {}; }

  function applyBulkCost() {
    const amount = Number(bulkCost);
    if (bulkCost.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      messageKind = 'error'; message = 'Enter a valid purchase cost.'; return;
    }
    const targets = items.filter((item) => selected[item.saleId]);
    if (!targets.length) { messageKind = 'error'; message = 'Select at least one sale first.'; return; }
    for (const item of targets) drafts[item.saleId] = amount.toFixed(2);
    messageKind = 'success';
    message = `Applied ${money(Math.round(amount * 100))} to ${targets.length} selected item${targets.length === 1 ? '' : 's'}.`;
  }

  async function sendBatch(targets: CogsItem[]) {
    const updates = targets.map((item) => {
      const raw = drafts[item.saleId] ?? '';
      const amount = Number(raw);
      return { item, raw, amount, purchaseCostCents: Math.round(amount * 100) };
    });
    const invalid = updates.find(({ raw, amount }) => raw.trim() === '' || !Number.isFinite(amount) || amount < 0);
    if (invalid) { messageKind = 'error'; message = `Enter a valid purchase cost for ${invalid.item.title}.`; return false; }

    const byInventory = new Map<string, { inventoryItemId: string; purchaseCostCents: number; saleIds: string[] }>();
    for (const update of updates) {
      const existing = byInventory.get(update.item.inventoryItemId);
      if (existing) {
        if (existing.purchaseCostCents !== update.purchaseCostCents) {
          messageKind = 'error';
          message = 'Two selected sales point to the same inventory item with different costs. Make those costs match before saving.';
          return false;
        }
        existing.saleIds.push(update.item.saleId);
      } else {
        byInventory.set(update.item.inventoryItemId, {
          inventoryItemId: update.item.inventoryItemId,
          purchaseCostCents: update.purchaseCostCents,
          saleIds: [update.item.saleId]
        });
      }
    }

    bulkSaving = true; message = null;
    const response = await fetch('/api/cogs/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ updates: [...byInventory.values()].map(({ inventoryItemId, purchaseCostCents }) => ({ inventoryItemId, purchaseCostCents })) })
    });
    bulkSaving = false;

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      messageKind = 'error'; message = result?.error ?? 'Could not save purchase costs.'; return false;
    }

    const saleIds = new Set(updates.map(({ item }) => item.saleId));
    for (const saleId of saleIds) { delete drafts[saleId]; delete selected[saleId]; }
    items = items.filter((item) => !saleIds.has(item.saleId));
    messageKind = 'success';
    message = `Saved purchase cost for ${saleIds.size} sale${saleIds.size === 1 ? '' : 's'}.`;
    if (safePage > Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))) page = Math.max(1, page - 1);
    return true;
  }

  async function saveCost(item: CogsItem) {
    if (bulkSaving || savingId) return;
    savingId = item.saleId;
    const saved = await sendBatch([item]);
    savingId = null;
    return saved;
  }

  async function saveAllEntered() {
    if (bulkSaving || savingId) return;
    const targets = items.filter((item) => (drafts[item.saleId]?.trim() ?? '') !== '');
    if (!targets.length) { messageKind = 'error'; message = 'Enter at least one purchase cost first.'; return; }
    await sendBatch(targets);
  }
</script>

<svelte:head><title>Add purchase costs · Sellquity</title></svelte:head>

<div class="cost-page">
  <header class="page-head">
    <div>
      <a href="/sold">← Sales</a>
      <span>SALES CLEANUP</span>
      <h1>Add purchase costs</h1>
      <p>These sold items are missing what you paid for them. Add the cost and Sellquity can finish the profit calculation.</p>
    </div>
    <div class="remaining"><small>Still needs cost</small><strong>{items.length}</strong></div>
  </header>

  {#if message}<div class:error={messageKind === 'error'} class="notice">{#if messageKind === 'success'}<Check size={15} />{/if}{message}</div>{/if}

  <section class="toolbar">
    <label class="search"><Search size={16} /><input bind:value={query} placeholder="Search item, SKU or order…" /></label>
    <div class="tabs">
      <button class:active={provider === 'all'} onclick={() => provider = 'all'}>All</button>
      <button class:active={provider === 'ebay'} onclick={() => provider = 'ebay'}>eBay</button>
      <button class:active={provider === 'whatnot'} onclick={() => provider = 'whatnot'}>Whatnot</button>
    </div>
  </section>

  <section class="queue">
    <div class="queue-head">
      <div><strong>{filtered.length} sale{filtered.length === 1 ? '' : 's'}</strong><small>Enter what you originally paid for each item.</small></div>
      <button class="save-entered" disabled={!enteredCount || bulkSaving || Boolean(savingId)} onclick={saveAllEntered}>
        {#if bulkSaving}<LoaderCircle class="spin" size={15} />{:else}<Check size={15} />{/if}
        Save entered {#if enteredCount}<b>{enteredCount}</b>{/if}
      </button>
    </div>

    {#if pageItems.length}
      <div class="bulk">
        <div class="select-actions"><strong>{selectedCount} selected</strong><button onclick={selectPage}>Select page</button><button onclick={selectFiltered}>Select all</button>{#if selectedCount}<button onclick={clearSelection}>Clear</button>{/if}</div>
        <div class="same-cost"><label>Same cost for selected <span>$<input bind:value={bulkCost} inputmode="decimal" placeholder="0.00" /></span></label><button disabled={!selectedCount || bulkSaving} onclick={applyBulkCost}>Apply</button></div>
      </div>

      <div class="rows">
        {#each pageItems as item}
          <article class:selected={Boolean(selected[item.saleId])} class="row">
            <label class="check"><input type="checkbox" checked={Boolean(selected[item.saleId])} onchange={(event) => setSelected(item, event.currentTarget.checked)} /></label>
            <div class="item"><strong>{item.title}</strong><small>{providerLabel(item.provider)} · sold {soldDate(item.soldAt)} · {money(item.grossCents)} gross{item.sku ? ` · ${item.sku}` : ''}</small></div>
            <label class="cost"><span>$</span><input inputmode="decimal" placeholder="Purchase cost" value={drafts[item.saleId] ?? ''} oninput={(event) => drafts[item.saleId] = event.currentTarget.value} onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveCost(item); } }} /></label>
            <button class="save" disabled={bulkSaving || savingId === item.saleId} onclick={() => saveCost(item)}>{#if savingId === item.saleId}<LoaderCircle class="spin" size={14} />{:else}<Check size={14} />{/if} Save</button>
          </article>
        {/each}
      </div>

      <div class="pager"><span>Page {safePage} of {pageCount}</span><div><button disabled={safePage <= 1} onclick={() => page = Math.max(1, safePage - 1)}><ChevronLeft size={15} /> Previous</button><button disabled={safePage >= pageCount} onclick={() => page = Math.min(pageCount, safePage + 1)}>Next <ChevronRight size={15} /></button></div></div>
    {:else}
      <div class="empty"><CircleDollarSign size={28} /><strong>{items.length ? 'Nothing matches this filter.' : 'Every sold item has a purchase cost.'}</strong><p>{items.length ? 'Try another search or marketplace.' : 'Your completed sales can now show final profit.'}</p>{#if !items.length}<a href="/sold">Back to Sales</a>{/if}</div>
    {/if}
  </section>
</div>

<style>
  .cost-page { width: min(1120px, calc(100% - 36px)); margin: 0 auto; padding: 34px 0 70px; color: #edf5f8; }
  .page-head { display: flex; align-items: end; justify-content: space-between; gap: 30px; margin-bottom: 22px; }
  .page-head a { display: inline-block; margin-bottom: 18px; color: #7895a7; text-decoration: none; font-size: .7rem; font-weight: 800; }
  .page-head span { display: block; color: #01d4a5; font: 800 .63rem Consolas, monospace; letter-spacing: .12em; }
  h1 { margin: 6px 0 8px; font-size: clamp(2rem, 4vw, 3.2rem); letter-spacing: -.045em; }
  .page-head p { max-width: 720px; margin: 0; color: #7890a0; font-size: .78rem; line-height: 1.6; }
  .remaining { min-width: 145px; border: 1px solid #314657; border-radius: 12px; padding: 13px 16px; background: #0b1721; }
  .remaining small { display: block; color: #738b9b; font-size: .62rem; }
  .remaining strong { display: block; margin-top: 3px; font-size: 1.45rem; }
  .notice { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; border: 1px solid #176052; border-radius: 9px; padding: 10px 12px; color: #74e2d0; background: #08231f; font-size: .72rem; }
  .notice.error { border-color: #63343a; color: #ef9da3; background: #281519; }
  .toolbar { display: grid; grid-template-columns: minmax(240px, 1fr) auto; gap: 10px; margin-bottom: 10px; }
  .search { position: relative; display: flex; align-items: center; }
  .search :global(svg) { position: absolute; left: 12px; color: #607c8d; }
  input { box-sizing: border-box; border: 1px solid #274052; border-radius: 8px; outline: 0; color: #edf5f8; background: #08131d; font: inherit; }
  .search input { width: 100%; height: 40px; padding: 0 12px 0 36px; }
  input:focus { border-color: #1b7990; }
  .tabs { display: flex; gap: 4px; border: 1px solid #274052; border-radius: 9px; padding: 3px; background: #08131d; }
  .tabs button { border: 0; border-radius: 6px; padding: 0 14px; color: #7890a0; background: transparent; font: inherit; font-size: .68rem; font-weight: 800; cursor: pointer; }
  .tabs button.active { color: #03131a; background: #01d4a5; }
  .queue { border: 1px solid #20394b; border-radius: 13px; padding: 16px; background: #0a151f; }
  .queue-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
  .queue-head > div { display: flex; flex-direction: column; gap: 2px; }
  .queue-head strong { font-size: .85rem; }
  .queue-head small { color: #6f8798; font-size: .64rem; }
  button { cursor: pointer; }
  .save-entered, .save { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 8px; color: #03131a; background: #01d4a5; font: inherit; font-size: .68rem; font-weight: 900; }
  .save-entered { min-height: 36px; padding: 0 12px; }
  .save-entered b { border-radius: 99px; padding: 2px 6px; background: #07352d; color: #bdfff0; }
  button:disabled { opacity: .4; cursor: default; }
  .bulk { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12px; align-items: end; margin-bottom: 10px; border: 1px solid #1d4253; border-radius: 9px; padding: 10px; background: #081923; }
  .select-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .select-actions strong { margin-right: 5px; color: #70e1cf; font-size: .68rem; }
  .select-actions button, .same-cost > button, .pager button { min-height: 30px; border: 1px solid #294657; border-radius: 7px; padding: 0 9px; color: #a7bac5; background: #0c1b25; font: inherit; font-size: .62rem; font-weight: 800; }
  .same-cost { display: flex; align-items: end; gap: 7px; }
  .same-cost label { display: grid; gap: 4px; color: #768e9d; font-size: .6rem; font-weight: 800; }
  .same-cost label span { display: flex; align-items: center; gap: 4px; }
  .same-cost input { width: 90px; height: 30px; padding: 0 8px; }
  .rows { display: grid; gap: 7px; }
  .row { display: grid; grid-template-columns: 22px minmax(0,1fr) 140px 76px; gap: 10px; align-items: center; border: 1px solid #213847; border-radius: 9px; padding: 10px; background: #08121b; }
  .row.selected { border-color: #17617a; background: #081923; }
  .check { display: grid; place-items: center; }
  .check input { width: 16px; height: 16px; accent-color: #01d4a5; }
  .item { min-width: 0; }
  .item strong { display: block; overflow: hidden; font-size: .74rem; text-overflow: ellipsis; white-space: nowrap; }
  .item small { display: block; overflow: hidden; margin-top: 3px; color: #647e8f; font-size: .6rem; text-overflow: ellipsis; white-space: nowrap; }
  .cost { position: relative; }
  .cost span { position: absolute; left: 9px; top: 9px; color: #667e8e; font-size: .68rem; }
  .cost input { width: 100%; height: 35px; padding: 0 8px 0 21px; }
  .save { height: 35px; }
  .pager { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 13px; border-top: 1px solid #1d3444; padding-top: 12px; color: #667e8e; font-size: .62rem; }
  .pager > div { display: flex; gap: 6px; }
  .pager button { display: inline-flex; align-items: center; gap: 4px; }
  .empty { min-height: 220px; display: grid; place-items: center; align-content: center; gap: 6px; color: #698293; text-align: center; }
  .empty :global(svg) { color: #01d4a5; }
  .empty strong { color: #c9d8e0; }
  .empty p { margin: 0; font-size: .68rem; }
  .empty a { margin-top: 4px; color: #5fc6d8; font-size: .68rem; }
  :global(.spin) { animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 720px) { .page-head { align-items: flex-start; flex-direction: column; } .toolbar, .bulk { grid-template-columns: 1fr; } .row { grid-template-columns: 22px 1fr; } .row .cost, .row .save { grid-column: 2; } .same-cost { justify-content: space-between; } }
</style>
