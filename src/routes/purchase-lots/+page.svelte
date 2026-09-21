<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Check, ChevronDown, PackagePlus, Plus, ReceiptText, RefreshCw, Trash2 } from '@lucide/svelte';
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
    ...(data.builtInInventoryCategories ?? BUILT_IN_INVENTORY_CATEGORIES).filter((category) => category.enabled !== false),
    ...(data.customInventoryCategories ?? [])
  ]);

  function newDraft(category: InventoryCategory = 'action_figures'): LotItemDraft {
    const matched = categories.find((row) => row.value === category) ?? categories[0];
    return { clientId: crypto.randomUUID(), title: '', category: matched.value as InventoryCategory, conditionName: '', skuPrefix: matched.prefix, manualCost: '' };
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
  const totalCostCents = $derived(
    Number.isFinite(purchaseAmountCents) && Number.isFinite(taxFeesCents) && Number.isFinite(inboundShippingCents)
      ? purchaseAmountCents + taxFeesCents + inboundShippingCents
      : NaN
  );
  const manualTotalCents = $derived(items.reduce((sum, item) => {
    const value = parseMoney(item.manualCost);
    return Number.isFinite(value) ? sum + value : NaN;
  }, 0));
  const allocationMatches = $derived(allocationMode === 'equal' || (
    Number.isFinite(manualTotalCents) && Number.isFinite(totalCostCents) && manualTotalCents === totalCostCents
  ));

  function money(cents: number) {
    if (!Number.isFinite(cents)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }
  function categoryLabel(category: string) { return categories.find((row) => row.value === category)?.label ?? 'Other'; }
  function changeCategory(item: LotItemDraft, category: InventoryCategory) {
    item.category = category;
    item.skuPrefix = categories.find((row) => row.value === category)?.prefix ?? 'OTH';
  }
  function addItem() { items.push(newDraft(items.at(-1)?.category ?? 'action_figures')); }
  function removeItem(clientId: string) {
    if (items.length === 1) { items[0] = newDraft(items[0].category); return; }
    items = items.filter((item) => item.clientId !== clientId);
  }
  function equalPreview(index: number) {
    if (!Number.isFinite(totalCostCents) || items.length < 1) return NaN;
    const base = Math.floor(totalCostCents / items.length);
    const remainder = totalCostCents - base * items.length;
    return base + (index < remainder ? 1 : 0);
  }
  function itemPreview(index: number, item: LotItemDraft) { return allocationMode === 'equal' ? equalPreview(index) : parseMoney(item.manualCost); }
  function resetForm() {
    lotLabel = ''; source = ''; purchasedAt = new Date().toISOString().slice(0, 10); purchaseAmount = ''; taxFees = ''; inboundShipping = '';
    defaultLocation = ''; notes = ''; allocationMode = 'equal'; items = [newDraft()];
  }

  async function createLot(event: SubmitEvent) {
    event.preventDefault(); message = null;
    if (!lotLabel.trim()) { messageKind = 'error'; message = 'Give this purchase a name.'; return; }
    if (items.some((item) => !item.title.trim())) { messageKind = 'error'; message = 'Every item needs a title.'; return; }
    if (!Number.isFinite(totalCostCents)) { messageKind = 'error'; message = 'Enter valid purchase amounts.'; return; }
    if (!allocationMatches) { messageKind = 'error'; message = `Item costs must add up to ${money(totalCostCents)}.`; return; }

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
    const result = await response.json().catch(() => null) as { error?: string; itemCount?: number; totalCostCents?: number } | null;
    saving = false;
    if (!response.ok) { messageKind = 'error'; message = result?.error ?? 'Could not save this purchase.'; return; }

    const count = result?.itemCount ?? items.length;
    const total = result?.totalCostCents ?? totalCostCents;
    messageKind = 'success';
    message = `${count} item${count === 1 ? '' : 's'} added to inventory with ${money(total)} total purchase cost.`;
    resetForm();
    await invalidateAll();
  }

  function lotItems(lotId: string) { return data.recentLotItems.filter((item) => item.purchaseLotId === lotId); }
</script>

<svelte:head><title>Add a purchase · Sellquity</title></svelte:head>

<div class="purchase-page">
  <header class="page-head">
    <div>
      <a href="/inventory">← Inventory</a>
      <span>PURCHASE</span>
      <h1>Add a purchase</h1>
      <p>Bought a box, collection, thrift haul, or flea-market lot? Enter the purchase once, add the items, and Sellquity will track the cost of each one.</p>
    </div>
    <div class="summary"><small>Total cost</small><strong>{money(totalCostCents)}</strong><span>{items.length} item{items.length === 1 ? '' : 's'}</span></div>
  </header>

  {#if message}<div class:error={messageKind === 'error'} class="notice">{#if messageKind === 'success'}<Check size={15} />{/if}{message}</div>{/if}

  <div class="layout">
    <form class="builder" onsubmit={createLot}>
      <section class="panel">
        <div class="section-head"><div><span>1</span><strong>Purchase details</strong><small>Where it came from and what you spent.</small></div></div>
        <div class="purchase-grid">
          <label class="wide"><span>Purchase name</span><input bind:value={lotLabel} maxlength="160" placeholder="Flea market haul · Sep 21" required /></label>
          <label><span>Where did you buy it?</span><input bind:value={source} maxlength="120" placeholder="Goodwill, flea market, collection…" /></label>
          <label><span>Purchase date</span><input type="date" bind:value={purchasedAt} /></label>
          <label><span>Default storage location</span><input bind:value={defaultLocation} maxlength="80" placeholder="Bin A-1" /></label>
          <label><span>Item price</span><div class="money-input"><i>$</i><input bind:value={purchaseAmount} inputmode="decimal" placeholder="0.00" /></div></label>
          <label><span>Tax / buyer fees</span><div class="money-input"><i>$</i><input bind:value={taxFees} inputmode="decimal" placeholder="0.00" /></div></label>
          <label><span>Shipping to you</span><div class="money-input"><i>$</i><input bind:value={inboundShipping} inputmode="decimal" placeholder="0.00" /></div></label>
          <div class="total-box"><small>TOTAL COST</small><strong>{money(totalCostCents)}</strong><span>Everything you paid to get it home</span></div>
          <label class="wide"><span>Notes <small>optional</small></span><textarea bind:value={notes} maxlength="1200" rows="2" placeholder="Anything worth remembering about this purchase"></textarea></label>
        </div>
      </section>

      <section class="panel">
        <div class="section-head items-head">
          <div><span>2</span><strong>Add the items</strong><small>Each row becomes a separate inventory item.</small></div>
          <button class="secondary" type="button" onclick={addItem}><Plus size={14} /> Add item</button>
        </div>

        <div class="items">
          {#each items as item, index (item.clientId)}
            <article class="item-row">
              <b>{index + 1}</b>
              <div class="item-fields">
                <label class="title"><span>Item</span><input bind:value={item.title} maxlength="240" placeholder="1991 WWF Hulk Hogan figure" required /></label>
                <label><span>Category</span><select value={item.category} onchange={(event) => changeCategory(item, event.currentTarget.value as InventoryCategory)}>{#each categories as category}<option value={category.value}>{category.label}</option>{/each}</select></label>
                <label><span>Condition</span><input bind:value={item.conditionName} maxlength="80" placeholder="Used, sealed…" /></label>
                <label class="cost"><span>{allocationMode === 'equal' ? 'Item cost' : 'Assigned cost'}</span>{#if allocationMode === 'manual'}<div class="money-input"><i>$</i><input bind:value={item.manualCost} inputmode="decimal" placeholder="0.00" /></div>{:else}<div class="cost-preview">{money(itemPreview(index, item))}</div>{/if}</label>
              </div>
              <button class="remove" type="button" aria-label={`Remove ${item.title || `item ${index + 1}`}`} onclick={() => removeItem(item.clientId)}><Trash2 size={15} /></button>
            </article>
          {/each}
        </div>
      </section>

      <section class="panel split-panel">
        <div class="section-head"><div><span>3</span><strong>Split the purchase cost</strong><small>Most purchases can use an even split. Assign exact costs only when you need to.</small></div></div>
        <div class="split-options">
          <button type="button" class:active={allocationMode === 'equal'} onclick={() => allocationMode = 'equal'}><Check size={15} /><span><strong>Split evenly</strong><small>Recommended · Sellquity handles the pennies</small></span></button>
          <button type="button" class:active={allocationMode === 'manual'} onclick={() => allocationMode = 'manual'}><ChevronDown size={15} /><span><strong>Assign exact costs</strong><small>Use when some items cost more than others</small></span></button>
        </div>
        {#if allocationMode === 'manual'}
          <div class:bad={!allocationMatches} class="allocation-status"><span>Assigned {money(manualTotalCents)}</span><span>Purchase total {money(totalCostCents)}</span><strong>{allocationMatches ? 'Ready' : `${money(Math.abs(totalCostCents - manualTotalCents))} difference`}</strong></div>
        {/if}
      </section>

      <footer class="save-bar">
        <div><strong>{money(totalCostCents)}</strong><span>across {items.length} item{items.length === 1 ? '' : 's'}</span></div>
        <button class="primary" disabled={saving || !allocationMatches}>{#if saving}<RefreshCw class="spin" size={15} /> Saving…{:else}<PackagePlus size={15} /> Add purchase to inventory{/if}</button>
      </footer>
    </form>

    <aside class="history">
      <div class="history-head"><span>RECENT PURCHASES</span><h2>Purchase history</h2><p>Your last ten mixed purchases.</p></div>
      {#if data.recentLots.length}
        <div class="history-list">
          {#each data.recentLots as lot}
            <details>
              <summary><ReceiptText size={16} /><span><strong>{lot.label}</strong><small>{lot.source ?? 'Source not set'}{lot.purchasedAt ? ` · ${new Date(lot.purchasedAt).toLocaleDateString()}` : ''}</small></span><b>{money(lot.totalCostCents)}</b></summary>
              <div class="history-detail">
                <div class="history-meta"><span><small>Items</small><strong>{lot.itemCount}</strong></span><span><small>Split</small><strong>{lot.allocationMode === 'manual' ? 'Exact' : 'Even'}</strong></span></div>
                <div class="history-items">{#each lotItems(lot.id) as item}<div><span><strong>{item.title}</strong><small>{categoryLabel(item.category)} · {item.sku ?? 'No SKU'}</small></span><b>{item.costCents == null ? '—' : money(item.costCents)}</b></div>{/each}</div>
              </div>
            </details>
          {/each}
        </div>
      {:else}
        <div class="history-empty"><ReceiptText size={24} /><strong>No purchases yet.</strong><small>Your first mixed purchase will show up here.</small></div>
      {/if}
    </aside>
  </div>
</div>

<style>
  .purchase-page { width: min(1240px, calc(100% - 36px)); margin: 0 auto; padding: 34px 0 70px; color: #edf5f8; }
  .page-head { display: flex; justify-content: space-between; align-items: end; gap: 30px; margin-bottom: 20px; }
  .page-head a { display: inline-block; margin-bottom: 18px; color: #7895a7; text-decoration: none; font-size: .7rem; font-weight: 800; }
  .page-head > div > span, .history-head > span { display: block; color: #01d4a5; font: 800 .62rem Consolas, monospace; letter-spacing: .12em; }
  h1 { margin: 6px 0 8px; font-size: clamp(2rem, 4vw, 3.2rem); letter-spacing: -.045em; }
  .page-head p { max-width: 760px; margin: 0; color: #7890a0; font-size: .78rem; line-height: 1.6; }
  .summary { min-width: 160px; border: 1px solid #28485a; border-radius: 12px; padding: 13px 15px; background: #0a1721; }
  .summary small, .summary span { display: block; color: #71899a; font-size: .6rem; }
  .summary strong { display: block; margin: 3px 0; font-size: 1.35rem; }
  .notice { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; border: 1px solid #176052; border-radius: 9px; padding: 10px 12px; color: #74e2d0; background: #08231f; font-size: .72rem; }
  .notice.error { border-color: #63343a; color: #ef9da3; background: #281519; }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 14px; align-items: start; }
  .builder { display: grid; gap: 12px; }
  .panel, .history { border: 1px solid #20394b; border-radius: 13px; background: #0a151f; }
  .panel { padding: 18px; }
  .section-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
  .section-head > div { display: grid; grid-template-columns: 26px 1fr; column-gap: 8px; align-items: center; }
  .section-head > div > span { grid-row: 1 / 3; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px; color: #03131a; background: #01d4a5; font-size: .66rem; font-weight: 900; }
  .section-head strong { font-size: .82rem; }
  .section-head small { color: #6c8596; font-size: .61rem; line-height: 1.4; }
  .purchase-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  label { display: grid; gap: 5px; }
  label > span { color: #839aaa; font-size: .64rem; font-weight: 800; }
  label > span small { color: #587185; font-weight: 600; }
  .wide { grid-column: 1 / -1; }
  input, select, textarea { box-sizing: border-box; width: 100%; border: 1px solid #284456; border-radius: 8px; outline: 0; padding: 9px 10px; color: #edf5f8; background: #07121b; font: inherit; font-size: .72rem; }
  input:focus, select:focus, textarea:focus { border-color: #1b7990; }
  textarea { resize: vertical; }
  .money-input { position: relative; }
  .money-input i { position: absolute; left: 9px; top: 9px; color: #667f90; font-style: normal; font-size: .7rem; }
  .money-input input { padding-left: 21px; }
  .total-box { display: flex; flex-direction: column; justify-content: center; border: 1px solid #176072; border-radius: 8px; padding: 9px 11px; background: #08202a; }
  .total-box small { color: #01d4a5; font-size: .55rem; font-weight: 900; letter-spacing: .08em; }
  .total-box strong { margin: 2px 0; font-size: 1rem; }
  .total-box span { color: #607d8f; font-size: .54rem; }
  .secondary, .primary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 8px; font: inherit; font-size: .67rem; font-weight: 900; cursor: pointer; }
  .secondary { min-height: 32px; border: 1px solid #285067; padding: 0 10px; color: #9ec0cd; background: #0b1d29; }
  .items { display: grid; gap: 8px; }
  .item-row { display: grid; grid-template-columns: 26px minmax(0,1fr) 30px; gap: 9px; align-items: start; border: 1px solid #1e3849; border-radius: 9px; padding: 10px; background: #08131d; }
  .item-row > b { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 7px; color: #70e1cf; background: #0b2630; font-size: .62rem; }
  .item-fields { display: grid; grid-template-columns: minmax(220px, 2fr) minmax(130px,1fr) minmax(120px,1fr) 110px; gap: 8px; }
  .cost-preview { min-height: 35px; display: flex; align-items: center; border: 1px solid #176071; border-radius: 8px; padding: 0 9px; color: #71e2d1; background: #08202a; font-size: .7rem; font-weight: 900; }
  .remove { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid #55313a; border-radius: 7px; color: #e9858e; background: #231218; cursor: pointer; }
  .split-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .split-options button { display: grid; grid-template-columns: auto 1fr; gap: 9px; align-items: center; border: 1px solid #284456; border-radius: 9px; padding: 11px; color: #8199a9; background: #08131d; text-align: left; cursor: pointer; }
  .split-options button.active { border-color: #17788f; color: #eafcff; background: #09232d; }
  .split-options button > span { display: flex; flex-direction: column; gap: 2px; }
  .split-options strong { font-size: .7rem; }
  .split-options small { color: #607d90; font-size: .57rem; }
  .allocation-status { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-top: 8px; border-radius: 8px; padding: 9px 10px; color: #70dfcd; background: #08231f; font-size: .63rem; }
  .allocation-status.bad { color: #e5b969; background: #231b10; }
  .save-bar { display: flex; justify-content: space-between; align-items: center; gap: 14px; border: 1px solid #214153; border-radius: 12px; padding: 13px 15px; background: #091722; }
  .save-bar > div { display: flex; align-items: baseline; gap: 7px; }
  .save-bar strong { font-size: 1rem; }
  .save-bar span { color: #6c8596; font-size: .62rem; }
  .primary { min-height: 39px; border: 0; padding: 0 14px; color: #03131a; background: linear-gradient(135deg, #0069e3, #01d0e9 56%, #01d4a5); }
  .primary:disabled { opacity: .4; cursor: default; }
  .history { position: sticky; top: 18px; padding: 16px; }
  .history-head h2 { margin: 5px 0 3px; font-size: .9rem; }
  .history-head p { margin: 0 0 10px; color: #678092; font-size: .6rem; }
  .history-list { display: grid; gap: 7px; }
  .history-list details { border: 1px solid #1e3748; border-radius: 9px; background: #08131d; overflow: hidden; }
  .history-list summary { display: grid; grid-template-columns: auto minmax(0,1fr) auto; gap: 8px; align-items: center; padding: 10px; list-style: none; cursor: pointer; }
  .history-list summary::-webkit-details-marker { display: none; }
  .history-list summary :global(svg) { color: #01d0e9; }
  .history-list summary > span { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .history-list summary strong { overflow: hidden; font-size: .66rem; text-overflow: ellipsis; white-space: nowrap; }
  .history-list summary small { color: #607b8e; font-size: .54rem; }
  .history-list summary > b { color: #72e1d0; font-size: .65rem; }
  .history-detail { border-top: 1px solid #1c3444; padding: 9px; }
  .history-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .history-meta span { display: flex; flex-direction: column; border-radius: 6px; padding: 6px; background: #07111a; }
  .history-meta small { color: #5e788a; font-size: .52rem; }
  .history-meta strong { font-size: .62rem; }
  .history-items { display: grid; gap: 5px; margin-top: 7px; }
  .history-items > div { display: flex; justify-content: space-between; gap: 8px; border-top: 1px solid #172e3e; padding-top: 5px; }
  .history-items > div > span { min-width: 0; display: flex; flex-direction: column; }
  .history-items strong, .history-items b { font-size: .57rem; }
  .history-items small { color: #587386; font-size: .5rem; }
  .history-empty { min-height: 180px; display: grid; place-items: center; align-content: center; gap: 5px; color: #607d90; text-align: center; }
  .history-empty strong { color: #a7bbc8; font-size: .7rem; }
  .history-empty small { font-size: .57rem; }
  :global(.spin) { animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } .history { position: static; } .item-fields { grid-template-columns: 2fr 1fr 1fr 100px; } }
  @media (max-width: 720px) { .page-head { align-items: flex-start; flex-direction: column; } .purchase-grid, .item-fields, .split-options { grid-template-columns: 1fr; } .wide { grid-column: auto; } .save-bar { align-items: stretch; flex-direction: column; } .primary { width: 100%; } }
</style>
