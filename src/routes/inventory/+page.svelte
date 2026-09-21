<script lang="ts">
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { Boxes, Check, ChevronRight, ClipboardCheck, Plus, Search, ShoppingBag, X } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { BUILT_IN_INVENTORY_CATEGORIES } from '$lib/inventory-categories';
  import { money, shortDate } from '$lib/money';
  import type { InventoryCategory, InventoryRow } from '$lib/types';
  import type { OrganizedDashboardData } from '$lib/server/organized-dashboard';

  let { data }: { data: OrganizedDashboardData } = $props();

  let query = $state('');
  let addOpen = $state(false);
  let saving = $state(false);
  let formMessage = $state<string | null>(null);
  let title = $state('');
  let category = $state<InventoryCategory>('other');
  let purchaseCost = $state('');
  let source = $state('');
  let location = $state('');
  let condition = $state('');
  let purchasedAt = $state(new Date().toISOString().slice(0, 10));

  const status = $derived(page.url.searchParams.get('status') ?? 'all');
  const quality = $derived(page.url.searchParams.get('quality') ?? 'all');
  const age = $derived(page.url.searchParams.get('age') ?? 'all');

  const unsold = $derived(data.inventory.filter((item) => item.status !== 'sold'));
  const active = $derived(data.inventory.filter((item) => item.status === 'active'));
  const scheduled = $derived(data.inventory.filter((item) => item.status === 'scheduled'));
  const unlisted = $derived(data.inventory.filter((item) => item.status === 'unlisted'));
  const stale = $derived(active.filter((item) => item.ageDays >= 91));
  const missing = $derived(unsold.filter((item) => item.costCents == null || !item.source?.trim() || !item.location?.trim()));

  const counts = $derived({
    inventoryAll: unsold.length,
    inventoryUnlisted: unlisted.length,
    inventoryScheduled: scheduled.length,
    inventoryActive: active.length,
    inventoryMissing: missing.length,
    soldAll: data.sales.length,
    soldMissingCogs: data.sales.filter((sale) => sale.cogsCents == null).length,
    soldUnmatched: data.sales.filter((sale) => !sale.inventoryItemId).length
  });

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return unsold.filter((item) => {
      if (status !== 'all' && item.status !== status) return false;
      if (quality === 'missing' && item.costCents != null && item.source?.trim() && item.location?.trim()) return false;
      if (age === 'stale' && !(item.status === 'active' && item.ageDays >= 91)) return false;
      if (!needle) return true;
      return [item.title, item.sku, item.ebayItemId, item.source, item.location, item.conditionName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  });

  const categories = $derived.by(() => {
    const seen = new Set<string>();
    const result: Array<{ value: InventoryCategory; label: string; prefix: string }> =
      BUILT_IN_INVENTORY_CATEGORIES.map((option) => ({ value: option.value, label: option.label, prefix: option.prefix }));
    for (const item of data.inventory) {
      if (result.some((candidate) => candidate.value === item.category) || seen.has(item.category)) continue;
      seen.add(item.category);
      result.push({ value: item.category, label: item.category.replace(/_/g, ' '), prefix: 'OTH' });
    }
    return result;
  });

  function resetForm() {
    title = '';
    category = 'other';
    purchaseCost = '';
    source = '';
    location = '';
    condition = '';
    purchasedAt = new Date().toISOString().slice(0, 10);
    formMessage = null;
  }

  function openAdd() {
    resetForm();
    addOpen = true;
  }

  async function saveInventory(event: SubmitEvent) {
    event.preventDefault();
    const cost = Number(purchaseCost);
    if (!title.trim() || !Number.isFinite(cost) || cost < 0) {
      formMessage = 'Enter an item title and a valid purchase cost.';
      return;
    }

    const definition = categories.find((candidate) => candidate.value === category);
    saving = true;
    formMessage = null;

    const response = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        sku: null,
        autoSku: true,
        skuPrefix: definition?.prefix ?? 'OTH',
        quantity: 1,
        category,
        purchaseCostCents: Math.round(cost * 100),
        costMode: 'each',
        source: source.trim() || null,
        storageLocation: location.trim() || null,
        purchasedAt: purchasedAt || null,
        conditionName: condition.trim() || null
      })
    });

    const result = await response.json().catch(() => null) as { error?: string } | null;
    saving = false;

    if (!response.ok) {
      formMessage = result?.error ?? 'Could not add inventory.';
      return;
    }

    addOpen = false;
    await invalidateAll();
  }

  function statusClass(item: InventoryRow) {
    return item.status;
  }
</script>

<svelte:head><title>Sellquity · Inventory</title></svelte:head>

<PageChrome
  active="inventory-all"
  eyebrow="INVENTORY"
  title="Inventory"
  workspace={data.workspace}
  connected={data.connected}
  lastSyncedAt={data.lastSyncedAt}
  {counts}
>
  {#snippet headerActions()}
    <a class="org-button secondary" href="/purchase-lots"><ShoppingBag size={15} /> Add a purchase</a>
    <button class="org-button primary" type="button" onclick={openAdd}><Plus size={16} /> Add one item</button>
  {/snippet}

  <div class="org-stack">
    <section class="org-card inventory-intro">
      <div>
        <span class="org-kicker">WHAT YOU OWN</span>
        <h2>{unsold.length} item{unsold.length === 1 ? '' : 's'} currently in inventory</h2>
        <p>Track what you bought, where it is, whether it is listed, and how much money is tied up in it.</p>
      </div>
      <a class="org-button secondary" href="/listing-prep"><ClipboardCheck size={15} /> Prep listings</a>
    </section>

    <section class="inventory-status-grid" aria-label="Inventory status">
      <a class:active={status === 'all' && quality === 'all' && age === 'all'} href="/inventory">
        <span>All inventory</span><strong>{unsold.length}</strong><small>{money(unsold.reduce((sum, item) => sum + (item.costCents ?? 0), 0))} invested</small>
      </a>
      <a class:active={status === 'unlisted'} href="/inventory?status=unlisted">
        <span>Unlisted</span><strong>{unlisted.length}</strong><small>waiting to list</small>
      </a>
      <a class:active={status === 'scheduled'} href="/inventory?status=scheduled">
        <span>Scheduled</span><strong>{scheduled.length}</strong><small>queued to go live</small>
      </a>
      <a class:active={status === 'active'} href="/inventory?status=active">
        <span>Active</span><strong>{active.length}</strong><small>{money(active.reduce((sum, item) => sum + (item.listPriceCents ?? 0), 0))} asking</small>
      </a>
      <a class:attention={missing.length > 0} class:active={quality === 'missing'} href="/inventory?quality=missing">
        <span>Needs info</span><strong>{missing.length}</strong><small>cost, source or location</small>
      </a>
      <a class:attention={stale.length > 0} class:active={age === 'stale'} href="/inventory?status=active&age=stale">
        <span>90+ days</span><strong>{stale.length}</strong><small>worth a pricing review</small>
      </a>
    </section>

    <section class="org-card">
      <div class="org-toolbar inventory-toolbar">
        <label class="org-search">
          <Search size={16} />
          <input class="org-input" bind:value={query} placeholder="Search title, SKU, source or location…" />
        </label>
        <span class="view-count">{filtered.length} shown</span>
      </div>

      {#if filtered.length}
        <div class="org-table-wrap">
          <table class="org-table">
            <thead><tr><th>Item</th><th>Status</th><th>Location</th><th>Source</th><th class="num">Cost</th><th class="num">List price</th><th class="num">Age</th><th></th></tr></thead>
            <tbody>
              {#each filtered as item}
                <tr>
                  <td class="title">
                    <a href={`/inventory/${encodeURIComponent(item.id)}`}>
                      {#if item.imageUrl}<img class="org-item-thumb" src={item.imageUrl} alt="" />{:else}<span class="org-item-thumb"></span>{/if}
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.sku || item.ebayItemId || 'No listing ID yet'}{item.purchasedAt ? ` · bought ${shortDate(item.purchasedAt)}` : ''}</small>
                      </span>
                    </a>
                  </td>
                  <td><span class={`org-pill ${statusClass(item)}`}>{item.status}</span></td>
                  <td class:org-warning={!item.location}>{item.location || 'Add location'}</td>
                  <td class:org-warning={!item.source}>{item.source || 'Add source'}</td>
                  <td class:org-warning={item.costCents == null} class="num">{item.costCents == null ? 'Add cost' : money(item.costCents)}</td>
                  <td class="num">{item.listPriceCents == null ? '—' : money(item.listPriceCents)}</td>
                  <td class:org-warning={item.status === 'active' && item.ageDays >= 91} class="num">{item.status === 'active' || item.status === 'scheduled' ? `${item.ageDays}d` : '—'}</td>
                  <td class="num"><a class="org-button ghost mini" href={`/inventory/${encodeURIComponent(item.id)}`}>Open <ChevronRight size={12} /></a></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="org-empty"><Boxes size={20} /><strong>No inventory matches this view.</strong>Try another status or clear the search.</div>
      {/if}
    </section>
  </div>

  {#if addOpen}
    <div class="org-modal-backdrop" role="presentation">
      <div class="org-modal" role="dialog" aria-modal="true" aria-labelledby="add-inventory-title">
        <button class="org-modal-close" type="button" aria-label="Close" onclick={() => addOpen = false}><X size={17} /></button>
        <div class="org-card-head">
          <div>
            <span class="org-kicker">ADD ONE ITEM</span>
            <h2 id="add-inventory-title">Quick inventory</h2>
            <p>For a mixed haul or collection, use <a href="/purchase-lots">Add a purchase</a> instead.</p>
          </div>
        </div>
        <form onsubmit={saveInventory}>
          <div class="org-form-grid">
            <label class="org-field wide"><span>Item title</span><input class="org-input" bind:value={title} required placeholder="What did you buy?" /></label>
            <label class="org-field"><span>Category</span><select class="org-select" bind:value={category}>{#each categories as option}<option value={option.value}>{option.label}</option>{/each}</select></label>
            <label class="org-field"><span>Purchase cost</span><input class="org-input" bind:value={purchaseCost} inputmode="decimal" placeholder="0.00" required /></label>
            <label class="org-field"><span>Purchase date</span><input class="org-input" type="date" bind:value={purchasedAt} /></label>
            <label class="org-field"><span>Condition</span><input class="org-input" bind:value={condition} placeholder="Used, Near Mint…" /></label>
            <label class="org-field"><span>Where did you buy it?</span><input class="org-input" bind:value={source} placeholder="Goodwill, flea market…" /></label>
            <label class="org-field"><span>Where is it stored?</span><input class="org-input" bind:value={location} placeholder="Bin A-14" /></label>
          </div>
          {#if formMessage}<p class="org-form-message bad">{formMessage}</p>{/if}
          <div class="org-form-actions">
            <button class="org-button secondary" type="button" onclick={() => addOpen = false}>Cancel</button>
            <button class="org-button primary" disabled={saving}>{#if saving}Saving…{:else}<Check size={15} /> Add item{/if}</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</PageChrome>

<style>
  .inventory-intro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 18px 20px;
  }
  .inventory-intro h2 { margin: 4px 0 5px; font-size: 1rem; }
  .inventory-intro p { margin: 0; color: #66818f; font-size: .68rem; line-height: 1.55; }
  .inventory-status-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 9px;
  }
  .inventory-status-grid a {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid #1c3547;
    border-radius: 11px;
    padding: 13px 14px;
    color: #8da4b4;
    background: #0a1520;
    text-decoration: none;
  }
  .inventory-status-grid a:hover,
  .inventory-status-grid a.active { border-color: #1d7187; background: #0b1e2a; }
  .inventory-status-grid a.attention strong { color: #f0bd6a; }
  .inventory-status-grid span { font-size: .65rem; font-weight: 800; }
  .inventory-status-grid strong { color: #f1f7fb; font-size: 1.35rem; }
  .inventory-status-grid small { overflow: hidden; color: #5e7a8d; font-size: .58rem; text-overflow: ellipsis; white-space: nowrap; }
  .inventory-toolbar { justify-content: space-between; }
  .inventory-toolbar .org-search { max-width: 560px; flex: 1; }
  .view-count { color: #66818f; font-size: .65rem; font-weight: 800; }
  .org-modal a { color: #64c7d8; }
  @media (max-width: 1120px) { .inventory-status-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 700px) {
    .inventory-intro { align-items: stretch; flex-direction: column; }
    .inventory-status-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
