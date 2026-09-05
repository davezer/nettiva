<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    ArrowLeft,
    Boxes,
    Check,
    CircleDollarSign,
    MapPin,
    PackagePlus,
    Plus,
    ReceiptText,
    RefreshCw,
    ShoppingBag,
    Trash2
  } from '@lucide/svelte';
  import type { InventoryCategory } from '$lib/types';
  import { BUILT_IN_INVENTORY_CATEGORIES } from '$lib/inventory-categories';
  import type { PageData } from './$types';

  type AllocationMode = 'equal' | 'manual';

  type LotItemDraft = {
    clientId: string;
    title: string;
    category: InventoryCategory;
    conditionName: string;
    skuPrefix: string;
    manualCost: string;
  };

  let { data }: { data: PageData } = $props();

  const categories = $derived([
    ...BUILT_IN_INVENTORY_CATEGORIES,
    ...(data.customInventoryCategories ?? [])
  ]);

  function newDraft(category: InventoryCategory = 'action_figures'): LotItemDraft {
    const matched = categories.find((row) => row.value === category) ?? categories[0];
    return {
      clientId: crypto.randomUUID(),
      title: '',
      category,
      conditionName: '',
      skuPrefix: matched.prefix,
      manualCost: ''
    };
  }

  let lotLabel = $state('');
  let source = $state('');
  let purchasedAt = $state(new Date().toISOString().slice(0, 10));
  let purchaseAmount = $state('');
  let taxFees = $state('');
  let inboundShipping = $state('');
  let defaultLocation = $state('');
  let notes = $state('');
  let allocationMode = $state<AllocationMode>('equal');
  let items = $state<LotItemDraft[]>([newDraft()]);
  let saving = $state(false);
  let message = $state<string | null>(null);
  let messageKind = $state<'success' | 'error'>('success');

  function parseMoney(value: string) {
    if (!value.trim()) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : NaN;
  }

  const purchaseAmountCents = $derived(parseMoney(purchaseAmount));
  const taxFeesCents = $derived(parseMoney(taxFees));
  const inboundShippingCents = $derived(parseMoney(inboundShipping));
  const landedTotalCents = $derived(
    Number.isFinite(purchaseAmountCents) &&
    Number.isFinite(taxFeesCents) &&
    Number.isFinite(inboundShippingCents)
      ? purchaseAmountCents + taxFeesCents + inboundShippingCents
      : NaN
  );

  const manualTotalCents = $derived(
    items.reduce((sum, item) => {
      const value = parseMoney(item.manualCost);
      return Number.isFinite(value) ? sum + value : NaN;
    }, 0)
  );

  const allocationMatches = $derived(
    allocationMode === 'equal' || (
      Number.isFinite(manualTotalCents) &&
      Number.isFinite(landedTotalCents) &&
      manualTotalCents === landedTotalCents
    )
  );

  function money(cents: number) {
    if (!Number.isFinite(cents)) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  function categoryLabel(category: string) {
    return categories.find((row) => row.value === category)?.label ?? 'Other';
  }

  function changeCategory(item: LotItemDraft, category: InventoryCategory) {
    item.category = category;
    item.skuPrefix = categories.find((row) => row.value === category)?.prefix ?? 'OTH';
  }

  function addItem() {
    const previousCategory = items.at(-1)?.category ?? 'action_figures';
    items.push(newDraft(previousCategory));
  }

  function removeItem(clientId: string) {
    if (items.length === 1) {
      items[0] = newDraft(items[0].category);
      return;
    }
    items = items.filter((item) => item.clientId !== clientId);
  }

  function equalPreview(index: number) {
    if (!Number.isFinite(landedTotalCents) || items.length < 1) return NaN;
    const base = Math.floor(landedTotalCents / items.length);
    const remainder = landedTotalCents - base * items.length;
    return base + (index < remainder ? 1 : 0);
  }

  function itemPreview(index: number, item: LotItemDraft) {
    return allocationMode === 'equal' ? equalPreview(index) : parseMoney(item.manualCost);
  }

  function resetForm() {
    lotLabel = '';
    purchaseAmount = '';
    taxFees = '';
    inboundShipping = '';
    notes = '';
    allocationMode = 'equal';
    items = [newDraft()];
  }

  async function createLot(event: SubmitEvent) {
    event.preventDefault();
    message = null;

    if (!lotLabel.trim()) {
      messageKind = 'error';
      message = 'Give this purchase lot a name.';
      return;
    }

    if (items.some((item) => !item.title.trim())) {
      messageKind = 'error';
      message = 'Every item in the lot needs a title.';
      return;
    }

    if (!Number.isFinite(landedTotalCents)) {
      messageKind = 'error';
      message = 'Enter valid purchase amounts.';
      return;
    }

    if (!allocationMatches) {
      messageKind = 'error';
      message = `Manual item COGS must equal the landed total of ${money(landedTotalCents)}.`;
      return;
    }

    saving = true;

    const response = await fetch('/api/purchase-lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        label: lotLabel,
        source,
        purchasedAt,
        purchasePriceCents: purchaseAmountCents,
        taxFeesCents,
        inboundShippingCents,
        defaultLocation,
        notes,
        allocationMode,
        items: items.map((item) => ({
          title: item.title,
          category: item.category,
          conditionName: item.conditionName,
          skuPrefix: item.skuPrefix,
          manualCostCents: allocationMode === 'manual' ? parseMoney(item.manualCost) : null
        }))
      })
    });

    const result = await response.json().catch(() => null) as {
      error?: string;
      itemCount?: number;
      totalCostCents?: number;
    } | null;

    saving = false;

    if (!response.ok) {
      messageKind = 'error';
      message = result?.error ?? 'Could not create this purchase lot.';
      return;
    }

    const count = result?.itemCount ?? items.length;
    const total = result?.totalCostCents ?? landedTotalCents;

    messageKind = 'success';
    message = `${count} item${count === 1 ? '' : 's'} added with ${money(total)} exact total COGS.`;
    resetForm();
    await invalidateAll();
  }

  function lotItems(lotId: string) {
    return data.recentLotItems.filter((item) => item.purchaseLotId === lotId);
  }
</script>

<svelte:head>
  <title>Purchase lots · Sellquity</title>
  <meta
    name="description"
    content="Turn reseller hauls and mixed purchase lots into individually tracked Sellquity inventory with exact allocated COGS."
  />
</svelte:head>

<div class="lots-shell">
  <header class="topbar">
    <a href="/" class="back"><ArrowLeft size={16} /> Sellquity</a>
    <span class="mode-pill"><ShoppingBag size={14} /> PURCHASE LOTS</span>
  </header>

  <main>
    <section class="hero">
      <div>
        <span class="eyebrow">INTAKE SESSIONS</span>
        <h1>One haul in.<br /><em>Individual inventory out.</em></h1>
        <p>
          Record a flea-market haul, collection buy, auction pickup, or mixed purchase once.
          Sellquity turns it into individually tracked SKUs and makes the item-level COGS add back
          to the exact penny you spent.
        </p>
      </div>

      <div class="hero-flow">
        <span><ShoppingBag size={18} /><small>1 · Purchase</small><strong>Record the lot</strong></span>
        <span><Boxes size={18} /><small>2 · Break apart</small><strong>Add each item</strong></span>
        <span><CircleDollarSign size={18} /><small>3 · Allocate</small><strong>Exact COGS</strong></span>
      </div>
    </section>

    <section class="workspace">
      <form class="lot-builder" onsubmit={createLot}>
        <div class="builder-head">
          <div>
            <span class="eyebrow">NEW PURCHASE LOT</span>
            <h2>Build an intake session</h2>
          </div>
          <span class="item-count">{items.length} item{items.length === 1 ? '' : 's'}</span>
        </div>

        <div class="lot-fields">
          <label class="wide">
            <span>Lot name</span>
            <input bind:value={lotLabel} maxlength="160" placeholder="Flea Market · Sep 5" required />
          </label>

          <label>
            <span>Source</span>
            <input bind:value={source} maxlength="120" placeholder="Flea market, Goodwill, collection…" />
          </label>

          <label>
            <span>Purchase date</span>
            <input type="date" bind:value={purchasedAt} />
          </label>

          <label>
            <span>Default storage / bin</span>
            <input bind:value={defaultLocation} maxlength="80" placeholder="BIN-A1" />
          </label>

          <label>
            <span>Purchase amount</span>
            <div class="money-field"><i>$</i><input bind:value={purchaseAmount} inputmode="decimal" placeholder="0.00" /></div>
          </label>

          <label>
            <span>Tax / buyer fees</span>
            <div class="money-field"><i>$</i><input bind:value={taxFees} inputmode="decimal" placeholder="0.00" /></div>
          </label>

          <label>
            <span>Inbound shipping</span>
            <div class="money-field"><i>$</i><input bind:value={inboundShipping} inputmode="decimal" placeholder="0.00" /></div>
          </label>

          <div class="landed-total">
            <span>LANDED TOTAL</span>
            <strong>{money(landedTotalCents)}</strong>
            <small>purchase + fees + inbound shipping</small>
          </div>

          <label class="wide">
            <span>Notes</span>
            <textarea bind:value={notes} maxlength="1200" rows="2" placeholder="Optional notes about the haul or purchase"></textarea>
          </label>
        </div>

        <div class="allocation-panel">
          <div>
            <span class="eyebrow">COGS ALLOCATION</span>
            <h3>How should the lot cost be split?</h3>
          </div>

          <div class="allocation-tabs">
            <button
              type="button"
              class:active={allocationMode === 'equal'}
              onclick={() => allocationMode = 'equal'}
            >
              <strong>Equal split</strong>
              <small>Sellquity handles rounding pennies</small>
            </button>
            <button
              type="button"
              class:active={allocationMode === 'manual'}
              onclick={() => allocationMode = 'manual'}
            >
              <strong>Manual</strong>
              <small>You assign exact COGS to each item</small>
            </button>
          </div>
        </div>

        <div class="items-head">
          <div>
            <span class="eyebrow">ITEMS IN THIS LOT</span>
            <h3>Every row becomes its own inventory item + SKU.</h3>
          </div>
          <button type="button" class="add-row" onclick={addItem}><Plus size={15} /> Add item</button>
        </div>

        <div class="item-list">
          {#each items as item, index (item.clientId)}
            <article class="item-card">
              <div class="item-number">{index + 1}</div>

              <div class="item-fields">
                <label class="title-field">
                  <span>Item title</span>
                  <input bind:value={item.title} maxlength="240" placeholder="1991 WWF Hulk Hogan figure" required />
                </label>

                <label>
                  <span>Category</span>
                  <select
                    value={item.category}
                    onchange={(event) => changeCategory(item, event.currentTarget.value as InventoryCategory)}
                  >
                    {#each categories as category}
                      <option value={category.value}>{category.label}</option>
                    {/each}
                  </select>
                </label>

                <label>
                  <span>Condition</span>
                  <input bind:value={item.conditionName} maxlength="80" placeholder="Used, NM, Sealed…" />
                </label>

                <label class="prefix-field">
                  <span>SKU prefix</span>
                  <input bind:value={item.skuPrefix} maxlength="8" />
                </label>

                <label class:disabled={allocationMode !== 'manual'} class="cost-field">
                  <span>Allocated COGS</span>
                  {#if allocationMode === 'manual'}
                    <div class="money-field"><i>$</i><input bind:value={item.manualCost} inputmode="decimal" placeholder="0.00" /></div>
                  {:else}
                    <div class="allocation-preview">{money(itemPreview(index, item))}</div>
                  {/if}
                </label>
              </div>

              <button
                class="remove-row"
                type="button"
                aria-label={`Remove ${item.title || `item ${index + 1}`}`}
                onclick={() => removeItem(item.clientId)}
              >
                <Trash2 size={16} />
              </button>
            </article>
          {/each}
        </div>

        <div class="builder-footer">
          <div class:bad={!allocationMatches} class="allocation-check">
            {#if allocationMode === 'equal'}
              <Check size={16} />
              <span><strong>{money(landedTotalCents)}</strong> will be allocated exactly across {items.length} item{items.length === 1 ? '' : 's'}.</span>
            {:else if allocationMatches}
              <Check size={16} />
              <span>Manual allocations match the lot total exactly.</span>
            {:else}
              <CircleDollarSign size={16} />
              <span>{money(manualTotalCents)} allocated of {money(landedTotalCents)}.</span>
            {/if}
          </div>

          <button class="create-button" disabled={saving || !allocationMatches}>
            {#if saving}<RefreshCw class="spin" size={16} />{:else}<PackagePlus size={16} />{/if}
            {saving ? 'Creating inventory…' : `Create lot + ${items.length} item${items.length === 1 ? '' : 's'}`}
          </button>
        </div>

        {#if message}
          <div class:error={messageKind === 'error'} class="message">{message}</div>
        {/if}
      </form>

      <aside class="history">
        <div class="history-head">
          <span class="eyebrow">RECENT PURCHASES</span>
          <h2>Lot history</h2>
        </div>

        {#if data.recentLots.length}
          <div class="lot-history">
            {#each data.recentLots as lot}
              <details class="lot-history-card">
                <summary>
                  <span class="lot-icon"><ReceiptText size={16} /></span>
                  <span class="lot-summary">
                    <strong>{lot.label}</strong>
                    <small>
                      {lot.source ?? 'Source not set'}
                      {#if lot.purchasedAt} · {new Date(lot.purchasedAt).toLocaleDateString()}{/if}
                    </small>
                  </span>
                  <span class="lot-money">
                    <strong>{money(lot.totalCostCents)}</strong>
                    <small>{lot.itemCount} item{lot.itemCount === 1 ? '' : 's'}</small>
                  </span>
                </summary>

                <div class="lot-detail">
                  <div class="lot-meta">
                    <span><small>Purchase</small><strong>{money(lot.purchasePriceCents)}</strong></span>
                    <span><small>Tax / fees</small><strong>{money(lot.taxFeesCents)}</strong></span>
                    <span><small>Inbound ship</small><strong>{money(lot.inboundShippingCents)}</strong></span>
                    <span><small>Allocation</small><strong>{lot.allocationMode === 'manual' ? 'Manual' : 'Equal'}</strong></span>
                  </div>

                  {#if lot.defaultLocation}
                    <div class="lot-location"><MapPin size={14} /> {lot.defaultLocation}</div>
                  {/if}

                  <div class="lot-items">
                    {#each lotItems(lot.id) as item}
                      <div>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{categoryLabel(item.category)} · {item.sku ?? 'No SKU'} · {item.status}</small>
                        </span>
                        <strong>{item.costCents == null ? '—' : money(item.costCents)}</strong>
                      </div>
                    {/each}
                  </div>

                  {#if lot.notes}
                    <p>{lot.notes}</p>
                  {/if}
                </div>
              </details>
            {/each}
          </div>
        {:else}
          <div class="history-empty">
            <ShoppingBag size={26} />
            <strong>No purchase lots yet.</strong>
            <small>Your first mixed haul will show up here.</small>
          </div>
        {/if}
      </aside>
    </section>
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

  .lots-shell { min-height: 100vh; }
  .topbar {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 max(22px, calc((100vw - 1260px) / 2));
    border-bottom: 1px solid #17304a;
    background: #07111bd9;
    backdrop-filter: blur(14px);
  }

  .back, .mode-pill, .add-row {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .back { color: #91a8bc; text-decoration: none; font-size: .78rem; font-weight: 850; }
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
    width: min(1260px, calc(100% - 36px));
    margin: 0 auto;
    padding: 48px 0 80px;
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(390px, .65fr);
    gap: 34px;
    align-items: end;
    margin-bottom: 24px;
  }

  .eyebrow {
    color: #01d4a5;
    font: 850 .67rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .14em;
  }

  h1 {
    margin: 8px 0 14px;
    font-size: clamp(2.3rem, 5vw, 4.5rem);
    line-height: .94;
    letter-spacing: -.055em;
  }

  h1 em { color: #01d0e9; font-style: normal; }
  h2, h3 { margin: 5px 0 0; letter-spacing: -.025em; }
  .hero p { max-width: 780px; margin: 0; color: #8da0ba; line-height: 1.65; font-size: .91rem; }

  .hero-flow {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid #193b55;
    border-radius: 14px;
    overflow: hidden;
    background: #081521;
  }

  .hero-flow > span {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
    border-right: 1px solid #193b55;
  }
  .hero-flow > span:last-child { border-right: 0; }
  .hero-flow :global(svg) { color: #01d0e9; }
  .hero-flow small { color: #607f97; font-size: .62rem; }
  .hero-flow strong { font-size: .73rem; }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(330px, .58fr);
    gap: 18px;
    align-items: start;
  }

  .lot-builder, .history {
    border: 1px solid #19314f;
    border-radius: 15px;
    background: linear-gradient(145deg, #0d1928 0%, #09131f 100%);
    box-shadow: 0 12px 38px #0000002b;
  }

  .lot-builder { padding: 24px; }
  .history { padding: 20px; position: sticky; top: 82px; }

  .builder-head, .items-head, .history-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .item-count {
    border: 1px solid #1c566a;
    border-radius: 999px;
    padding: 5px 9px;
    color: #68e6d4;
    background: #09232b;
    font-size: .66rem;
    font-weight: 850;
  }

  .lot-fields {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-top: 20px;
  }

  .lot-fields label, .item-fields label {
    display: grid;
    gap: 6px;
  }

  label > span {
    color: #7f98ad;
    font-size: .67rem;
    font-weight: 800;
  }

  .wide { grid-column: 1 / -1; }

  input, select, textarea {
    width: 100%;
    border: 1px solid #24445f;
    border-radius: 8px;
    padding: 10px 11px;
    color: #eef8ff;
    background: #07111b;
    font: inherit;
    font-size: .76rem;
  }

  input:focus, select:focus, textarea:focus {
    outline: 0;
    border-color: #1985a8;
    box-shadow: 0 0 0 3px #01d0e910;
  }

  textarea { resize: vertical; }

  .money-field {
    position: relative;
    display: flex;
    align-items: center;
  }
  .money-field i {
    position: absolute;
    left: 11px;
    color: #617f96;
    font-style: normal;
    font-size: .75rem;
    pointer-events: none;
  }
  .money-field input { padding-left: 24px; }

  .landed-total {
    display: flex;
    flex-direction: column;
    justify-content: center;
    border: 1px solid #176070;
    border-radius: 9px;
    padding: 10px 12px;
    background:
      radial-gradient(circle at 100% 0%, #01d4a512, transparent 7rem),
      #08202a;
  }
  .landed-total span {
    color: #01d4a5;
    font: 850 .59rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .1em;
  }
  .landed-total strong { margin-top: 3px; font-size: 1.08rem; }
  .landed-total small { color: #668799; font-size: .59rem; }

  .allocation-panel {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 18px;
    margin-top: 22px;
    border-top: 1px solid #19314f;
    padding-top: 20px;
  }

  .allocation-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; min-width: 390px; }
  .allocation-tabs button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    border: 1px solid #24465f;
    border-radius: 9px;
    padding: 9px 11px;
    color: #8fa6b9;
    background: #08131e;
    cursor: pointer;
  }
  .allocation-tabs button.active {
    border-color: #17788f;
    color: #eafcff;
    background: #09232d;
    box-shadow: inset 3px 0 #01d0e9;
  }
  .allocation-tabs strong { font-size: .72rem; }
  .allocation-tabs small { color: #617f93; font-size: .59rem; }

  .items-head {
    align-items: end;
    margin-top: 22px;
    border-top: 1px solid #19314f;
    padding-top: 20px;
  }

  .add-row {
    border: 1px solid #1f6a82;
    border-radius: 8px;
    padding: 8px 11px;
    color: #65ead7;
    background: #09232c;
    font-weight: 850;
    cursor: pointer;
  }

  .item-list { display: grid; gap: 9px; margin-top: 12px; }

  .item-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
    border: 1px solid #1a3850;
    border-radius: 11px;
    padding: 12px;
    background: #08141f;
  }

  .item-number {
    width: 28px; height: 28px;
    display: grid; place-items: center;
    border: 1px solid #1e5f7c;
    border-radius: 8px;
    color: #68ead8;
    background: #092335;
    font-size: .66rem;
    font-weight: 900;
  }

  .item-fields {
    display: grid;
    grid-template-columns: minmax(220px, 2fr) minmax(150px, 1fr) minmax(130px, .8fr) 90px 120px;
    gap: 9px;
    align-items: end;
  }

  .allocation-preview {
    min-height: 37px;
    display: flex;
    align-items: center;
    border: 1px solid #174657;
    border-radius: 8px;
    padding: 0 10px;
    color: #61ead6;
    background: #082028;
    font-size: .77rem;
    font-weight: 900;
  }

  .cost-field.disabled { opacity: .9; }

  .remove-row {
    width: 30px; height: 30px;
    display: grid; place-items: center;
    border: 1px solid #55313a;
    border-radius: 8px;
    color: #e87d87;
    background: #231218;
    cursor: pointer;
  }
  .remove-row:hover { border-color: #8a434d; color: #ff9da6; }

  .builder-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
    border-top: 1px solid #19314f;
    padding-top: 16px;
  }

  .allocation-check {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #68e6d4;
    font-size: .68rem;
  }
  .allocation-check.bad { color: #e7b84c; }
  .allocation-check strong { color: #f4f8ff; }

  .create-button {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 0;
    border-radius: 8px;
    padding: 0 15px;
    color: #03131a;
    background: linear-gradient(135deg, #0069e3, #01d0e9 55%, #01d4a5);
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 8px 24px #0069e329;
  }
  .create-button:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }

  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .message {
    margin-top: 13px;
    border: 1px solid #175564;
    border-radius: 8px;
    padding: 10px 12px;
    color: #70e8d8;
    background: #08242b;
    font-size: .7rem;
    font-weight: 800;
  }
  .message.error { border-color: #69343b; color: #ff9ca3; background: #281319; }

  .lot-history { display: grid; gap: 8px; margin-top: 13px; }
  .lot-history-card {
    border: 1px solid #18374e;
    border-radius: 10px;
    background: #08141f;
    overflow: hidden;
  }

  .lot-history-card summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 9px;
    align-items: center;
    padding: 11px;
    cursor: pointer;
    list-style: none;
  }
  .lot-history-card summary::-webkit-details-marker { display: none; }

  .lot-icon {
    width: 30px; height: 30px;
    display: grid; place-items: center;
    border-radius: 8px;
    color: #01d0e9;
    background: #092335;
  }

  .lot-summary, .lot-money { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .lot-summary strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .71rem; }
  .lot-summary small, .lot-money small { color: #668399; font-size: .59rem; }
  .lot-money { align-items: flex-end; }
  .lot-money strong { color: #69e7d5; font-size: .72rem; }

  .lot-detail { border-top: 1px solid #18374e; padding: 11px; }
  .lot-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
  .lot-meta span {
    display: flex; flex-direction: column; gap: 2px;
    border: 1px solid #163146;
    border-radius: 7px;
    padding: 7px;
    background: #07111b;
  }
  .lot-meta small { color: #617e92; font-size: .56rem; }
  .lot-meta strong { font-size: .65rem; }

  .lot-location {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 9px;
    color: #75b9ce;
    font-size: .64rem;
  }

  .lot-items { display: grid; gap: 5px; margin-top: 9px; }
  .lot-items > div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-top: 1px solid #132b3d;
    padding-top: 6px;
  }
  .lot-items > div > span { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .lot-items strong { font-size: .63rem; }
  .lot-items small { color: #5f7b8f; font-size: .55rem; text-transform: capitalize; }
  .lot-detail p { margin: 9px 0 0; color: #718da2; font-size: .62rem; line-height: 1.45; }

  .history-empty {
    min-height: 180px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
    color: #55758b;
    text-align: center;
  }
  .history-empty strong { color: #9db1c2; font-size: .75rem; }
  .history-empty small { font-size: .62rem; }

  @media (max-width: 1080px) {
    .hero, .workspace { grid-template-columns: 1fr; }
    .history { position: static; }
    .item-fields { grid-template-columns: 2fr 1fr 1fr 100px 120px; }
  }

  @media (max-width: 780px) {
    main { width: min(100% - 24px, 1260px); padding-top: 32px; }
    .topbar { padding: 0 14px; }
    .mode-pill { display: none; }
    .hero-flow { grid-template-columns: 1fr; }
    .hero-flow > span { border-right: 0; border-bottom: 1px solid #193b55; }
    .hero-flow > span:last-child { border-bottom: 0; }
    .lot-fields, .item-fields { grid-template-columns: 1fr; }
    .wide { grid-column: auto; }
    .allocation-panel, .items-head, .builder-footer { align-items: stretch; flex-direction: column; }
    .allocation-tabs { min-width: 0; }
    .item-card { grid-template-columns: auto minmax(0, 1fr); }
    .remove-row { grid-column: 2; justify-self: end; }
    .lot-meta { grid-template-columns: repeat(2, 1fr); }
  }
</style>
