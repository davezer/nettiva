<script lang="ts">
  import {
    ArrowLeft,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleDollarSign,
    LoaderCircle,
    Search,
    Tag
  } from '@lucide/svelte';

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
    workspace: {
      id: string;
      name: string;
      slug: string;
      plan: string;
      role: 'owner' | 'admin' | 'member';
    } | null;
    items: CogsItem[];
  };

  let { data } = $props<{ data: PageData }>();

  const PAGE_SIZE = 20;

  let items = $state<CogsItem[]>([]);
  let initialItemsApplied = $state(false);
  let query = $state('');

  $effect(() => {
    if (initialItemsApplied) return;
    items = [...data.items];
    initialItemsApplied = true;
  });
  let provider = $state<Provider>('all');
  let page = $state(1);
  let drafts = $state<Record<string, string>>({});
  let selected = $state<Record<string, boolean>>({});
  let bulkCost = $state('');
  let savingId = $state<string | null>(null);
  let bulkSaving = $state(false);
  let message = $state<string | null>(null);
  let messageKind = $state<'success' | 'error'>('success');

  function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  function soldDate(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }

  function providerLabel(value: CogsItem['provider']) {
    return value === 'whatnot' ? 'Whatnot' : 'eBay';
  }

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();

    return items.filter((item) => {
      const providerMatch = provider === 'all' || item.provider === provider;
      if (!providerMatch) return false;
      if (!needle) return true;

      return [
        item.title,
        item.sku ?? '',
        item.orderId ?? '',
        providerLabel(item.provider)
      ].join(' ').toLowerCase().includes(needle);
    });
  });

  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const safePage = $derived(Math.min(page, pageCount));
  const pageItems = $derived(
    filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  );

  const selectedCount = $derived(
    items.reduce((count, item) => count + (selected[item.saleId] ? 1 : 0), 0)
  );

  const enteredCount = $derived(
    items.reduce((count, item) => {
      const raw = drafts[item.saleId]?.trim() ?? '';
      return count + (raw ? 1 : 0);
    }, 0)
  );

  $effect(() => {
    query;
    provider;
    page = 1;
  });

  function setSelected(item: CogsItem, checked: boolean) {
    selected[item.saleId] = checked;
  }

  function selectPage() {
    for (const item of pageItems) selected[item.saleId] = true;
  }

  function selectFiltered() {
    for (const item of filtered) selected[item.saleId] = true;
  }

  function clearSelection() {
    selected = {};
  }

  function applyBulkCost() {
    const amount = Number(bulkCost);
    if (bulkCost.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      messageKind = 'error';
      message = 'Enter a valid batch purchase cost.';
      return;
    }

    const targets = items.filter((item) => selected[item.saleId]);
    if (!targets.length) {
      messageKind = 'error';
      message = 'Select at least one sale first.';
      return;
    }

    for (const item of targets) {
      drafts[item.saleId] = amount.toFixed(2);
    }

    messageKind = 'success';
    message = `Applied ${money(Math.round(amount * 100))} to ${targets.length} selected item${targets.length === 1 ? '' : 's'}. Review them, then save all entered.`;
  }

  async function sendBatch(targets: CogsItem[]) {
    const updates = targets.map((item) => {
      const raw = drafts[item.saleId] ?? '';
      const amount = Number(raw);
      return {
        item,
        raw,
        amount,
        purchaseCostCents: Math.round(amount * 100)
      };
    });

    const invalid = updates.find(({ raw, amount }) =>
      raw.trim() === '' || !Number.isFinite(amount) || amount < 0
    );
    if (invalid) {
      messageKind = 'error';
      message = `Enter a valid purchase cost for ${invalid.item.title}.`;
      return false;
    }

    const byInventory = new Map<string, {
      inventoryItemId: string;
      purchaseCostCents: number;
      saleIds: string[];
    }>();

    for (const update of updates) {
      const existing = byInventory.get(update.item.inventoryItemId);
      if (existing) {
        if (existing.purchaseCostCents !== update.purchaseCostCents) {
          messageKind = 'error';
          message = `Two selected sales point to the same inventory item with different costs. Make those costs match before saving.`;
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

    bulkSaving = true;
    message = null;

    const response = await fetch('/api/cogs/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        updates: [...byInventory.values()].map(({ inventoryItemId, purchaseCostCents }) => ({
          inventoryItemId,
          purchaseCostCents
        }))
      })
    });

    bulkSaving = false;

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      messageKind = 'error';
      message = result?.error ?? 'Could not save the COGS batch.';
      return false;
    }

    const saleIds = new Set(updates.map(({ item }) => item.saleId));
    for (const saleId of saleIds) {
      delete drafts[saleId];
      delete selected[saleId];
    }
    items = items.filter((item) => !saleIds.has(item.saleId));

    messageKind = 'success';
    message = `Saved COGS for ${saleIds.size} sale${saleIds.size === 1 ? '' : 's'}.`;

    if (safePage > Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))) {
      page = Math.max(1, page - 1);
    }

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
    if (!targets.length) {
      messageKind = 'error';
      message = 'Enter at least one purchase cost first.';
      return;
    }

    await sendBatch(targets);
  }

</script>

<svelte:head>
  <title>COGS Desk · Sellquity</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="cogs-shell">
  <header class="topbar">
    <a class="back" href="/"><ArrowLeft size={16} /> Sellquity</a>
    <div class="workspace">
      <span>WORKSPACE</span>
      <strong>{data.workspace?.name ?? 'Sellquity'}</strong>
    </div>
  </header>

  <main>
    <section class="hero">
      <div>
        <span class="eyebrow">COGS WORKBENCH</span>
        <h1>Finish your purchase costs.</h1>
        <p>
          Work through missing sale costs without turning the accounting dashboard into a
          hundred-row form. Saving a cost updates the underlying inventory item and disappears
          it from this queue.
        </p>
      </div>

      <div class="hero-count">
        <Tag size={20} />
        <span><small>Still missing</small><strong>{items.length}</strong></span>
      </div>
    </section>

    <section class="toolbar">
      <label class="search">
        <Search size={17} />
        <span class="sr-only">Search missing COGS</span>
        <input bind:value={query} placeholder="Search title, SKU, or order…" />
      </label>

      <div class="provider-tabs" role="group" aria-label="Filter marketplace">
        <button class:active={provider === 'all'} onclick={() => provider = 'all'}>All channels</button>
        <button class:active={provider === 'ebay'} onclick={() => provider = 'ebay'}>eBay</button>
        <button class:active={provider === 'whatnot'} onclick={() => provider = 'whatnot'}>Whatnot</button>
      </div>
    </section>

    {#if message}
      <div class:error={messageKind === 'error'} class="message">
        {#if messageKind === 'success'}<Check size={15} />{/if}
        {message}
      </div>
    {/if}

    <section class="workbench">
      <div class="workbench-head">
        <div>
          <span class="eyebrow">MISSING PURCHASE COSTS</span>
          <h2>{filtered.length} item{filtered.length === 1 ? '' : 's'} in this view</h2>
        </div>
        <div class="workbench-actions">
          <span class="page-label">Page {safePage} of {pageCount}</span>
          <button
            class="save-all"
            disabled={!enteredCount || bulkSaving || Boolean(savingId)}
            onclick={saveAllEntered}
          >
            {#if bulkSaving}<LoaderCircle class="spin" size={15} />{:else}<Check size={15} />{/if}
            Save all entered
            {#if enteredCount}<span>{enteredCount}</span>{/if}
          </button>
        </div>
      </div>

      {#if pageItems.length}
        <div class="bulk-bar">
          <div class="selection-actions">
            <strong>{selectedCount} selected</strong>
            <button type="button" onclick={selectPage}>Select page</button>
            <button type="button" onclick={selectFiltered}>Select all {filtered.length}</button>
            {#if selectedCount}<button type="button" onclick={clearSelection}>Clear</button>{/if}
          </div>

          <div class="bulk-cost">
            <label>
              <span>Same COGS for selected</span>
              <div>
                <i>$</i>
                <input
                  aria-label="Batch purchase cost"
                  inputmode="decimal"
                  placeholder="0.00"
                  bind:value={bulkCost}
                />
              </div>
            </label>
            <button
              type="button"
              disabled={!selectedCount || bulkSaving}
              onclick={applyBulkCost}
            >Apply to selected</button>
          </div>
        </div>
        <div class="rows">
          {#each pageItems as item}
            <article class:selected={Boolean(selected[item.saleId])} class="row">
              <label class="row-select">
                <input
                  type="checkbox"
                  aria-label={`Select ${item.title}`}
                  checked={Boolean(selected[item.saleId])}
                  onchange={(event) => setSelected(item, event.currentTarget.checked)}
                />
              </label>

              <div class="item-copy">
                <div class="title-line">
                  <strong>{item.title}</strong>
                  <span class:whatnot={item.provider === 'whatnot'} class="provider">
                    {providerLabel(item.provider)}
                  </span>
                </div>
                <small>
                  {soldDate(item.soldAt)}
                  · gross {money(item.grossCents)}
                  {item.sku ? ` · ${item.sku}` : ''}
                  {item.orderId ? ` · ${item.orderId}` : ''}
                </small>
              </div>

              <label class="cost-input">
                <span>$</span>
                <input
                  aria-label={`Purchase cost for ${item.title}`}
                  inputmode="decimal"
                  placeholder="0.00"
                  value={drafts[item.saleId] ?? ''}
                  oninput={(event) => drafts[item.saleId] = event.currentTarget.value}
                  onkeydown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      saveCost(item);
                    }
                  }}
                />
              </label>

              <button
                class="save"
                disabled={bulkSaving || savingId === item.saleId}
                onclick={() => saveCost(item)}
              >
                {#if savingId === item.saleId}
                  <LoaderCircle class="spin" size={15} />
                {:else}
                  <Check size={15} />
                {/if}
                Save
              </button>
            </article>
          {/each}
        </div>

        <div class="pagination">
          <span>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}
            of {filtered.length}
          </span>
          <div>
            <button
              aria-label="Previous page"
              disabled={safePage <= 1}
              onclick={() => page = Math.max(1, safePage - 1)}
            ><ChevronLeft size={16} /> Previous</button>
            <button
              aria-label="Next page"
              disabled={safePage >= pageCount}
              onclick={() => page = Math.min(pageCount, safePage + 1)}
            >Next <ChevronRight size={16} /></button>
          </div>
        </div>
      {:else}
        <div class="empty">
          <CircleDollarSign size={28} />
          <strong>{items.length ? 'No missing costs match this filter.' : 'Every sale has COGS.'}</strong>
          <p>{items.length ? 'Try another search or marketplace.' : 'Your profit can now be calculated with complete purchase costs.'}</p>
        </div>
      {/if}
    </section>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #080d12;
    color: #e8eee9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * { box-sizing: border-box; }

  .cogs-shell { min-height: 100vh; background: #080d12; }

  .topbar {
    height: 62px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 max(24px, calc((100vw - 1180px) / 2));
    border-bottom: 1px solid #202a33;
    background: #0b1117;
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #9aa8b3;
    text-decoration: none;
    font-size: .78rem;
    font-weight: 800;
  }

  .back:hover { color: #01d4a5; }

  .workspace {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }

  .workspace span,
  .eyebrow {
    color: #788591;
    font: 800 .63rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .13em;
  }

  .workspace strong { font-size: .76rem; }

  main {
    width: min(1180px, calc(100% - 40px));
    margin: 0 auto;
    padding: 48px 0 80px;
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 34px;
    margin-bottom: 26px;
  }

  h1 {
    margin: 8px 0 10px;
    font-size: clamp(2.1rem, 5vw, 3.8rem);
    line-height: 1;
    letter-spacing: -.045em;
  }

  .hero p {
    max-width: 760px;
    margin: 0;
    color: #7f8c97;
    font-size: .85rem;
    line-height: 1.65;
  }

  .hero-count {
    min-width: 165px;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid #38452c;
    border-radius: 13px;
    padding: 15px 17px;
    background: #0a1722;
  }

  .hero-count > :global(svg) { color: #01d4a5; }

  .hero-count span {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .hero-count small { color: #74816c; font-size: .66rem; }
  .hero-count strong { color: #01d4a5; font-size: 1.35rem; }

  .toolbar {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) auto;
    gap: 12px;
    margin-bottom: 14px;
  }

  .search {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search > :global(svg) {
    position: absolute;
    left: 13px;
    color: #61707b;
    pointer-events: none;
  }

  .search input {
    width: 100%;
    height: 42px;
    border: 1px solid #2c3842;
    border-radius: 10px;
    padding: 0 14px 0 39px;
    outline: 0;
    color: #e4ebe6;
    background: #0d141a;
  }

  .search input:focus { border-color: #647943; }

  .provider-tabs {
    display: flex;
    gap: 4px;
    border: 1px solid #2c3842;
    border-radius: 10px;
    padding: 4px;
    background: #0d141a;
  }

  .provider-tabs button {
    border: 0;
    border-radius: 7px;
    padding: 0 15px;
    color: #82909b;
    background: transparent;
    font: inherit;
    font-size: .73rem;
    font-weight: 800;
    cursor: pointer;
  }

  .provider-tabs button.active {
    color: #0a1007;
    background: #01d4a5;
  }

  .message {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 14px;
    border: 1px solid #365027;
    border-radius: 10px;
    padding: 10px 12px;
    color: #acd870;
    background: #121e0f;
    font-size: .75rem;
  }

  .message.error {
    border-color: #63343a;
    color: #ef9da3;
    background: #281519;
  }

  .workbench {
    border: 1px solid #293640;
    border-radius: 15px;
    padding: 20px;
    background: #0e151c;
  }

  .workbench-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 16px;
  }

  .workbench-head h2 { margin: 4px 0 0; font-size: 1rem; }
  .page-label { color: #697681; font-size: .7rem; }

  .workbench-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .save-all {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 0;
    border-radius: 8px;
    padding: 0 12px;
    color: #03131a;
    background: #01d4a5;
    font: inherit;
    font-size: .7rem;
    font-weight: 900;
    cursor: pointer;
  }

  .save-all span {
    min-width: 20px;
    border-radius: 999px;
    padding: 2px 6px;
    color: #dfffa7;
    background: #1b2a10;
    font-size: .61rem;
  }

  .save-all:disabled {
    opacity: .4;
    cursor: not-allowed;
  }

  .bulk-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 16px;
    margin-bottom: 12px;
    border: 1px solid #173c4a;
    border-radius: 11px;
    padding: 12px;
    background: #091923;
  }

  .selection-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
  }

  .selection-actions strong {
    margin-right: 3px;
    color: #01d4a5;
    font-size: .72rem;
  }

  .selection-actions button,
  .bulk-cost > button {
    min-height: 32px;
    border: 1px solid #173c4a;
    border-radius: 7px;
    padding: 0 10px;
    color: #b3c0b7;
    background: #0b1b25;
    font: inherit;
    font-size: .66rem;
    font-weight: 800;
    cursor: pointer;
  }

  .selection-actions button:hover,
  .bulk-cost > button:hover {
    border-color: #11698a;
    color: #01d4a5;
  }

  .bulk-cost {
    display: flex;
    align-items: end;
    gap: 8px;
  }

  .bulk-cost label {
    display: grid;
    gap: 5px;
  }

  .bulk-cost label > span {
    color: #78866f;
    font-size: .62rem;
    font-weight: 800;
  }

  .bulk-cost label > div {
    position: relative;
  }

  .bulk-cost i {
    position: absolute;
    top: 8px;
    left: 10px;
    color: #6e7b68;
    font-style: normal;
    font-size: .72rem;
  }

  .bulk-cost input {
    width: 110px;
    height: 32px;
    border: 1px solid #173c4a;
    border-radius: 7px;
    padding: 0 9px 0 23px;
    outline: 0;
    color: #e8eee9;
    background: #07131c;
  }

  .bulk-cost input:focus { border-color: #11698a; }
  .bulk-cost > button:disabled { opacity: .4; cursor: not-allowed; }

  .rows { display: grid; gap: 8px; }

  .row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 132px 86px;
    align-items: center;
    gap: 11px;
    border: 1px solid #28343e;
    border-radius: 10px;
    padding: 12px;
    background: #0a1117;
  }

  .row.selected {
    border-color: #14516a;
    background: #081720;
  }

  .row-select {
    display: grid;
    place-items: center;
  }

  .row-select input {
    width: 16px;
    height: 16px;
    accent-color: #01d4a5;
    cursor: pointer;
  }

  .item-copy { min-width: 0; }

  .title-line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .title-line strong {
    overflow: hidden;
    color: #e8eee9;
    font-size: .82rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .item-copy small {
    display: block;
    overflow: hidden;
    margin-top: 4px;
    color: #66747f;
    font-size: .68rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .provider {
    flex: 0 0 auto;
    border: 1px solid #3b4650;
    border-radius: 999px;
    padding: 3px 7px;
    color: #a7b3bc;
    background: #182028;
    font: 800 .58rem "SFMono-Regular", Consolas, monospace;
    text-transform: uppercase;
  }

  .provider.whatnot {
    border-color: #4c632f;
    color: #01d4a5;
    background: #17200f;
  }

  .cost-input { position: relative; }

  .cost-input span {
    position: absolute;
    top: 10px;
    left: 10px;
    color: #66737e;
    font-size: .75rem;
  }

  .cost-input input {
    width: 100%;
    height: 38px;
    border: 1px solid #34414b;
    border-radius: 8px;
    padding: 0 10px 0 25px;
    outline: 0;
    color: #e8eee9;
    background: #0b1117;
  }

  .cost-input input:focus { border-color: #687e43; }

  .save {
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 0;
    border-radius: 8px;
    padding: 0 12px;
    color: #03131a;
    background: #01d4a5;
    font: inherit;
    font-size: .72rem;
    font-weight: 900;
    cursor: pointer;
  }

  .save:disabled { opacity: .55; cursor: wait; }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-top: 16px;
    border-top: 1px solid #25313a;
    padding-top: 15px;
  }

  .pagination > span { color: #697681; font-size: .68rem; }

  .pagination > div { display: flex; gap: 7px; }

  .pagination button {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #34414b;
    border-radius: 8px;
    padding: 0 11px;
    color: #b7c1c9;
    background: #111920;
    font: inherit;
    font-size: .68rem;
    font-weight: 800;
    cursor: pointer;
  }

  .pagination button:disabled { opacity: .35; cursor: default; }

  .empty {
    min-height: 220px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 8px;
    color: #697681;
    text-align: center;
  }

  .empty > :global(svg) { color: #8cb94e; }
  .empty strong { color: #cbd5ce; }
  .empty p { margin: 0; font-size: .75rem; }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 760px) {
    main { width: min(100% - 24px, 1180px); padding-top: 30px; }
    .topbar { padding: 0 14px; }
    .hero { grid-template-columns: 1fr; }
    .hero-count { justify-self: start; }
    .toolbar { grid-template-columns: 1fr; }
    .provider-tabs button { min-height: 36px; }
    .row { grid-template-columns: 24px minmax(0, 1fr) 110px 80px; }
    .bulk-bar { grid-template-columns: 1fr; }
    .bulk-cost { justify-content: space-between; }
  }

  @media (max-width: 560px) {
    .workbench-head { align-items: flex-start; flex-direction: column; }
    .workbench-actions { width: 100%; justify-content: space-between; }
    .row { grid-template-columns: 24px 1fr; }
    .row .cost-input,
    .row .save { grid-column: 2; }
    .save { width: 100%; }
    .bulk-cost { align-items: stretch; flex-direction: column; }
    .bulk-cost input { width: 100%; }
    .pagination { align-items: flex-start; flex-direction: column; }
  }
</style>
