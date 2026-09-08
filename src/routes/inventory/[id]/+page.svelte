<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ArrowLeft, Check, ChevronRight, ClipboardCheck, ExternalLink, PackageCheck, Save, Tag } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money, shortDate } from '$lib/money';

  let { data } = $props();

  const dashboard = $derived(data.dashboard);
  const item = $derived(data.item);
  const sale = $derived(data.sale);

  let title = $state('');
  let sku = $state('');
  let condition = $state('');
  let purchasedAt = $state('');
  let purchaseCost = $state('');
  let source = $state('');
  let location = $state('');
  let hydratedItemId = $state<string | null>(null);
  let saving = $state(false);
  let message = $state<string | null>(null);
  let messageBad = $state(false);

  $effect(() => {
    const current = item;
    if (hydratedItemId === current.id) return;

    title = current.title;
    sku = current.sku ?? '';
    condition = current.conditionName ?? '';
    purchasedAt = current.purchasedAt?.slice(0, 10) ?? '';
    purchaseCost = current.costCents == null ? '' : (current.costCents / 100).toFixed(2);
    source = current.source ?? '';
    location = current.location ?? '';
    hydratedItemId = current.id;
  });

  const unsold = $derived(dashboard.inventory.filter((candidate) => candidate.status !== 'sold'));
  const missingInventory = $derived(unsold.filter((candidate) => candidate.costCents == null || !candidate.source?.trim() || !candidate.location?.trim()));
  const counts = $derived({
    inventoryAll: dashboard.inventory.length,
    inventoryUnlisted: dashboard.inventory.filter((candidate) => candidate.status === 'unlisted').length,
    inventoryScheduled: dashboard.inventory.filter((candidate) => candidate.status === 'scheduled').length,
    inventoryActive: dashboard.inventory.filter((candidate) => candidate.status === 'active').length,
    inventoryMissing: missingInventory.length,
    soldAll: dashboard.sales.length,
    soldMissingCogs: dashboard.sales.filter((candidate) => candidate.cogsCents == null).length,
    soldUnmatched: dashboard.sales.filter((candidate) => !candidate.inventoryItemId).length
  });

  async function saveItem(event: SubmitEvent) {
    event.preventDefault();
    const parsed = purchaseCost.trim() === '' ? null : Number(purchaseCost);
    if (!title.trim() || (parsed != null && (!Number.isFinite(parsed) || parsed < 0))) {
      messageBad = true;
      message = 'Enter a title and a valid purchase cost.';
      return;
    }

    saving = true;
    message = null;
    messageBad = false;

    const response = await fetch(`/api/inventory/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        sku: sku.trim() || null,
        conditionName: condition.trim() || null,
        category: item.category,
        purchasedAt: purchasedAt || null,
        purchaseCostCents: parsed == null ? null : Math.round(parsed * 100),
        source: source.trim() || null,
        storageLocation: location.trim() || null
      })
    });

    const result = await response.json().catch(() => null) as { error?: string } | null;
    saving = false;
    if (!response.ok) {
      messageBad = true;
      message = result?.error ?? 'Could not save this item.';
      return;
    }

    message = 'Inventory details saved.';
    await invalidateAll();
  }
</script>

<svelte:head><title>{item.title} · Sellquity</title></svelte:head>

<PageChrome active="inventory" eyebrow="INVENTORY ITEM" title="Item details" workspace={dashboard.workspace} connected={dashboard.connected} lastSyncedAt={dashboard.lastSyncedAt} {counts}>
  {#snippet headerActions()}
    <a class="org-button secondary" href="/inventory"><ArrowLeft size={15} /> Inventory</a>
    {#if sale}<a class="org-button primary" href={`/sold/${encodeURIComponent(sale.id)}`}><PackageCheck size={15} /> Sale breakdown</a>{/if}
  {/snippet}

  <div class="org-stack">
    <section class="org-grid detail-main">
      <article class="org-card">
        <div class="org-detail-photo">
          <div class="org-detail-photo-frame">
            {#if item.imageUrl}<img src={item.imageUrl} alt={item.title} />{:else}<span class="fallback">S</span>{/if}
          </div>
          <div>
            <span class={`org-pill ${item.status}`}>{item.status}</span>
            <h2 style="margin:10px 0 5px;font-size:1rem">{item.title}</h2>
            <p style="margin:0;color:#617d8b;font-size:.65rem">{item.sku || item.ebayItemId || 'No marketplace identity yet'}</p>
          </div>
          <div class="org-detail-meta">
            <div class="org-detail-meta-row"><span>Category</span><strong>{item.category.replace(/_/g, ' ')}</strong></div>
            <div class="org-detail-meta-row"><span>Purchase date</span><strong>{item.purchasedAt ? shortDate(item.purchasedAt) : 'Missing'}</strong></div>
            <div class="org-detail-meta-row"><span>Purchase cost</span><strong class:org-warning={item.costCents == null}>{item.costCents == null ? 'Missing' : money(item.costCents)}</strong></div>
            <div class="org-detail-meta-row"><span>Source</span><strong class:org-warning={!item.source}>{item.source || 'Missing'}</strong></div>
            <div class="org-detail-meta-row"><span>Location</span><strong class:org-warning={!item.location}>{item.location || 'Missing'}</strong></div>
            <div class="org-detail-meta-row"><span>List price</span><strong>{item.listPriceCents == null ? '—' : money(item.listPriceCents)}</strong></div>
          </div>
        </div>
      </article>

      <div class="org-stack">
        <article class="org-card">
          <div class="org-card-head"><div><span class="org-kicker">LIFECYCLE</span><h2>Where this item is now</h2></div><Tag size={18} /></div>
          <div class="org-timeline">
            <div class="org-timeline-row"><span class="org-timeline-dot"><Check size={14} /></span><div class="org-timeline-copy"><strong>Tracked in Sellquity</strong><small>{item.purchasedAt ? `Purchase date ${shortDate(item.purchasedAt)}` : 'Purchase date still needed'}</small><p>Cost, source and storage data stay attached to this inventory identity.</p></div></div>
            {#if item.listedAt}<div class="org-timeline-row"><span class="org-timeline-dot"><ClipboardCheck size={14} /></span><div class="org-timeline-copy"><strong>Listed</strong><small>{shortDate(item.listedAt)}</small><p>{item.listPriceCents != null ? `Listed at ${money(item.listPriceCents)}.` : 'Marketplace listing attached.'}</p></div></div>{/if}
            {#if sale}<div class="org-timeline-row"><span class="org-timeline-dot"><PackageCheck size={14} /></span><div class="org-timeline-copy"><strong>Sold</strong><small>{shortDate(sale.soldAt)}</small><p>Gross {money(sale.salePriceCents + sale.shippingChargedCents)} · profit {money(sale.netProfitCents)}.</p></div></div>{/if}
          </div>
        </article>

        <article class="org-card">
          <div class="org-card-head"><div><span class="org-kicker">ITEM DATA</span><h2>Edit the durable record</h2><p>Fix the source-of-truth fields once; every future report benefits.</p></div></div>
          <form onsubmit={saveItem}>
            <div class="org-form-grid">
              <label class="org-field wide"><span>Title</span><input class="org-input" bind:value={title} /></label>
              <label class="org-field"><span>SKU / custom label</span><input class="org-input" bind:value={sku} /></label>
              <label class="org-field"><span>Condition</span><input class="org-input" bind:value={condition} /></label>
              <label class="org-field"><span>Purchase date</span><input class="org-input" type="date" bind:value={purchasedAt} /></label>
              <label class="org-field"><span>Purchase cost</span><input class="org-input" inputmode="decimal" bind:value={purchaseCost} placeholder="0.00" /></label>
              <label class="org-field"><span>Source</span><input class="org-input" bind:value={source} placeholder="Goodwill, card show…" /></label>
              <label class="org-field"><span>Storage location</span><input class="org-input" bind:value={location} placeholder="Bin A-14" /></label>
            </div>
            {#if message}<p class:bad={messageBad} class="org-form-message">{message}</p>{/if}
            <div class="org-form-actions"><button class="org-button primary" disabled={saving}>{#if saving}Saving…{:else}<Save size={14} /> Save details{/if}</button></div>
          </form>
        </article>
      </div>
    </section>

    {#if item.ebayItemId}
      <section class="org-card pad"><a class="org-button ghost" href={`/integrations/ebay`}><ExternalLink size={14} /> Marketplace identity attached · eBay item {item.ebayItemId} <ChevronRight size={12} /></a></section>
    {/if}
  </div>
</PageChrome>
