<script lang="ts">
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { Boxes, Check, ChevronRight, Plus, Search, X } from '@lucide/svelte';
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
  const missing = $derived(unsold.filter((item) => item.costCents == null || !item.source?.trim() || !item.location?.trim()));
  const missingCogs = $derived(data.sales.filter((sale) => sale.cogsCents == null));
  const unmatchedSales = $derived(data.sales.filter((sale) => !sale.inventoryItemId));

  const counts = $derived({
    inventoryAll: data.inventory.length,
    inventoryUnlisted: unlisted.length,
    inventoryScheduled: scheduled.length,
    inventoryActive: active.length,
    inventoryMissing: missing.length,
    soldAll: data.sales.length,
    soldMissingCogs: missingCogs.length,
    soldUnmatched: unmatchedSales.length
  });

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return data.inventory.filter((item) => {
      if (status !== 'all' && item.status !== status) return false;
      if (quality === 'missing' && item.status !== 'sold' && item.costCents != null && item.source?.trim() && item.location?.trim()) return false;
      if (quality === 'missing' && item.status === 'sold') return false;
      if (age === 'stale' && !(item.status === 'active' && item.ageDays >= 91)) return false;
      if (!needle) return true;
      const haystack = [item.title, item.sku, item.ebayItemId, item.source, item.location, item.conditionName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
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
      formMessage = 'Enter a title and valid purchase cost.';
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
  active={quality === 'missing' ? 'inventory-missing' : status === 'active' ? 'inventory-active' : status === 'scheduled' ? 'inventory-scheduled' : status === 'unlisted' ? 'inventory-unlisted' : 'inventory-all'}
  eyebrow="INVENTORY"
  title="Inventory"
  workspace={data.workspace}
  connected={data.connected}
  lastSyncedAt={data.lastSyncedAt}
  {counts}
>
  {#snippet headerActions()}
    <button class="org-button primary" type="button" onclick={openAdd}><Plus size={16} /> Add inventory</button>
  {/snippet}

  <div class="org-stack">
    <section class="org-grid cols-4">
      <a class="org-card org-metric" href="/inventory?status=unlisted"><div class="org-metric-top"><span>Unlisted</span><Boxes size={16} /></div><strong>{unlisted.length}</strong><small>ready for prep</small></a>
      <a class="org-card org-metric" href="/inventory?status=scheduled"><div class="org-metric-top"><span>Scheduled</span><Boxes size={16} /></div><strong>{scheduled.length}</strong><small>future marketplace listings</small></a>
      <a class="org-card org-metric" href="/inventory?status=active"><div class="org-metric-top"><span>Active</span><Boxes size={16} /></div><strong>{active.length}</strong><small>{money(active.reduce((sum, item) => sum + (item.listPriceCents ?? 0), 0))} asking value</small></a>
      <a class="org-card org-metric" href="/inventory?quality=missing"><div class="org-metric-top"><span>Missing data</span><Boxes size={16} /></div><strong>{missing.length}</strong><small>cost, source or location</small></a>
    </section>

    <section class="org-card">
      <div class="org-toolbar">
        <label class="org-search">
          <Search size={16} />
          <input class="org-input" bind:value={query} placeholder="Search title, SKU, source, location…" />
        </label>
        <div class="org-segments" aria-label="Inventory status">
          <a class:active={status === 'all' && quality === 'all'} href="/inventory">All</a>
          <a class:active={status === 'unlisted'} href="/inventory?status=unlisted">Unlisted</a>
          <a class:active={status === 'scheduled'} href="/inventory?status=scheduled">Scheduled</a>
          <a class:active={status === 'active'} href="/inventory?status=active">Active</a>
          <a class:active={quality === 'missing'} href="/inventory?quality=missing">Missing data</a>
        </div>
      </div>

      {#if filtered.length}
        <div class="org-table-wrap">
          <table class="org-table">
            <thead><tr><th>Product</th><th>Status</th><th>Location</th><th>Source</th><th class="num">Cost</th><th class="num">List price</th><th class="num">Age</th><th></th></tr></thead>
            <tbody>
              {#each filtered as item}
                <tr>
                  <td class="title">
                    <a href={`/inventory/${encodeURIComponent(item.id)}`}>
                      {#if item.imageUrl}<img class="org-item-thumb" src={item.imageUrl} alt="" />{:else}<span class="org-item-thumb"></span>{/if}
                      <span><strong>{item.title}</strong><small>{item.sku || item.ebayItemId || 'No marketplace identity'}{item.purchasedAt ? ` · bought ${shortDate(item.purchasedAt)}` : ''}</small></span>
                    </a>
                  </td>
                  <td><span class={`org-pill ${statusClass(item)}`}>{item.status}</span></td>
                  <td class:org-warning={!item.location}>{item.location || 'Missing'}</td>
                  <td class:org-warning={!item.source}>{item.source || 'Missing'}</td>
                  <td class:org-warning={item.costCents == null} class="num">{item.costCents == null ? 'Missing' : money(item.costCents)}</td>
                  <td class="num">{item.listPriceCents == null ? '—' : money(item.listPriceCents)}</td>
                  <td class:org-warning={item.status === 'active' && item.ageDays >= 91} class="num">{item.status === 'active' || item.status === 'scheduled' ? `${item.ageDays}d` : '—'}</td>
                  <td class="num"><a class="org-button ghost mini" href={`/inventory/${encodeURIComponent(item.id)}`}>Open <ChevronRight size={12} /></a></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="org-empty"><strong>No inventory matches this view.</strong>Clear the search or choose another status.</div>
      {/if}
    </section>
  </div>

  {#if addOpen}
    <div class="org-modal-backdrop" role="presentation">
      <div class="org-modal" role="dialog" aria-modal="true" aria-labelledby="add-inventory-title">
        <button class="org-modal-close" type="button" aria-label="Close" onclick={() => addOpen = false}><X size={17} /></button>
        <div class="org-card-head"><div><span class="org-kicker">QUICK INTAKE</span><h2 id="add-inventory-title">Add inventory</h2><p>Capture cost now; Sellquity will generate the next category SKU.</p></div></div>
        <form onsubmit={saveInventory}>
          <div class="org-form-grid">
            <label class="org-field wide"><span>Item title</span><input class="org-input" bind:value={title} required placeholder="What did you buy?" /></label>
            <label class="org-field"><span>Category</span><select class="org-select" bind:value={category}>{#each categories as option}<option value={option.value}>{option.label}</option>{/each}</select></label>
            <label class="org-field"><span>Purchase cost</span><input class="org-input" bind:value={purchaseCost} inputmode="decimal" placeholder="0.00" required /></label>
            <label class="org-field"><span>Purchase date</span><input class="org-input" type="date" bind:value={purchasedAt} /></label>
            <label class="org-field"><span>Condition</span><input class="org-input" bind:value={condition} placeholder="Used, Near Mint…" /></label>
            <label class="org-field"><span>Source</span><input class="org-input" bind:value={source} placeholder="Goodwill, card show…" /></label>
            <label class="org-field"><span>Storage location</span><input class="org-input" bind:value={location} placeholder="Bin A-14" /></label>
          </div>
          {#if formMessage}<p class="org-form-message bad">{formMessage}</p>{/if}
          <div class="org-form-actions"><button class="org-button secondary" type="button" onclick={() => addOpen = false}>Cancel</button><button class="org-button primary" disabled={saving}>{#if saving}<span>Saving…</span>{:else}<Check size={15} /> Add inventory{/if}</button></div>
        </form>
      </div>
    </div>
  {/if}
</PageChrome>
