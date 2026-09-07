<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    ArrowLeft,
    Camera,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleDollarSign,
    ClipboardCheck,
    Copy,
    FileText,
    LoaderCircle,
    MapPin,
    PackageCheck,
    Search,
    Tag,
    X
  } from '@lucide/svelte';

  type PrepItem = {
    id: string;
    title: string;
    sku: string | null;
    ebayItemId: string | null;
    conditionName: string | null;
    purchasedAt: string | null;
    category: string;
    costCents: number | null;
    source: string | null;
    location: string | null;
    listingTitleDraft: string | null;
    targetListPriceCents: number | null;
    listingPhotosReady: boolean;
    listingNotes: string | null;
    createdAt: string;
  };

  type CategoryDefinition = {
    value: string;
    label: string;
    prefix: string;
    custom?: boolean;
    enabled?: boolean;
  };

  type PageData = {
    workspace: {
      id: string;
      name: string;
      slug: string;
      plan: string;
      role: 'owner' | 'admin' | 'member';
    } | null;
    items: PrepItem[];
    categories: CategoryDefinition[];
  };

  type QueueFilter = 'all' | 'needs-work' | 'ready';
  type PrepStage = 'foundation' | 'photos' | 'details' | 'ready';

  let { data } = $props<{ data: PageData }>();

  let query = $state('');
  let queueFilter = $state<QueueFilter>('all');
  let selectedId = $state<string | null>(null);
  let savingId = $state<string | null>(null);
  let message = $state<string | null>(null);
  let messageKind = $state<'success' | 'error'>('success');

  let markListedItem = $state<PrepItem | null>(null);
  let ebayItemId = $state('');
  let listingPrice = $state('');
  let listedDate = $state(new Date().toISOString().slice(0, 10));
  let listingSaving = $state(false);

  let lastListed = $state<{ id: string; title: string } | null>(null);
  let undoing = $state(false);

  function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  function shortDate(value: string | null) {
    if (!value) return 'Not set';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }

  function categoryLabel(value: string) {
    return data.categories.find((category: CategoryDefinition) => category.value === value)?.label ?? 'Other';
  }

  function readiness(item: PrepItem) {
    const checks = [
      { key: 'sku', label: 'SKU', done: Boolean(item.sku?.trim()), icon: Tag },
      { key: 'cogs', label: 'COGS', done: item.costCents !== null, icon: CircleDollarSign },
      { key: 'photos', label: 'Photos', done: item.listingPhotosReady, icon: Camera },
      { key: 'title', label: 'Title', done: Boolean(item.listingTitleDraft?.trim()), icon: FileText },
      {
        key: 'price',
        label: 'Price',
        done: Boolean(item.targetListPriceCents && item.targetListPriceCents > 0),
        icon: CircleDollarSign
      }
    ];

    const done = checks.filter((check) => check.done).length;

    return {
      checks,
      done,
      total: checks.length,
      complete: done === checks.length
    };
  }

  function stage(item: PrepItem): PrepStage {
    const status = readiness(item);

    if (!status.checks[0].done || !status.checks[1].done) return 'foundation';
    if (!status.checks[2].done) return 'photos';
    if (!status.checks[3].done || !status.checks[4].done) return 'details';
    return 'ready';
  }

  function stageLabel(value: PrepStage) {
    return ({
      foundation: 'Foundation',
      photos: 'Photos',
      details: 'Listing details',
      ready: 'Ready'
    } as const)[value];
  }

  const readyItems = $derived(
    data.items.filter((item: PrepItem) => readiness(item).complete)
  );

  const costBasis = $derived(
    data.items.reduce((sum: number, item: PrepItem) => sum + (item.costCents ?? 0), 0)
  );

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();

    return data.items.filter((item: PrepItem) => {
      const status = readiness(item);

      if (queueFilter === 'ready' && !status.complete) return false;
      if (queueFilter === 'needs-work' && status.complete) return false;

      if (!needle) return true;

      return [
        item.title,
        item.sku ?? '',
        item.listingTitleDraft ?? '',
        item.location ?? '',
        item.source ?? '',
        categoryLabel(item.category)
      ].join(' ').toLowerCase().includes(needle);
    });
  });

  const selectedItem = $derived(
    filtered.find((item: PrepItem) => item.id === selectedId) ?? filtered[0] ?? null
  );

  const selectedIndex = $derived(
    selectedItem ? filtered.findIndex((item: PrepItem) => item.id === selectedItem.id) : -1
  );

  $effect(() => {
    if (!filtered.length) {
      selectedId = null;
      return;
    }

    if (!selectedId || !filtered.some((item: PrepItem) => item.id === selectedId)) {
      selectedId = filtered[0].id;
    }
  });

  function selectRelative(offset: number) {
    if (!filtered.length) return;
    const current = selectedIndex < 0 ? 0 : selectedIndex;
    const next = Math.min(filtered.length - 1, Math.max(0, current + offset));
    selectedId = filtered[next].id;
    message = null;
  }

  async function copyText(value: string | null | undefined, success: string) {
    const text = value?.trim();

    if (!text) {
      messageKind = 'error';
      message = 'There is nothing to copy yet.';
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      messageKind = 'success';
      message = success;
    } catch {
      messageKind = 'error';
      message = 'Could not copy to the clipboard.';
    }
  }

  async function saveProgress(event: SubmitEvent, item: PrepItem) {
    event.preventDefault();
    if (savingId || listingSaving) return;

    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);

    const sku = String(formData.get('sku') ?? '').trim();
    const costRaw = String(formData.get('purchaseCost') ?? '').trim();
    const title = String(formData.get('listingTitleDraft') ?? '').trim();
    const notes = String(formData.get('listingNotes') ?? '').trim();
    const priceRaw = String(formData.get('targetListPrice') ?? '').trim();

    const cost = costRaw ? Number(costRaw) : null;
    const price = priceRaw ? Number(priceRaw) : null;

    if (title.length > 80) {
      messageKind = 'error';
      message = 'eBay titles can be at most 80 characters.';
      return;
    }

    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      messageKind = 'error';
      message = 'Enter a valid purchase cost.';
      return;
    }

    if (price !== null && (!Number.isFinite(price) || price <= 0)) {
      messageKind = 'error';
      message = 'Enter a valid target list price.';
      return;
    }

    savingId = item.id;
    lastListed = null;
    message = null;

    const inventoryResponse = await fetch(`/api/inventory/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sku: sku || null,
        purchaseCostCents: cost === null ? null : Math.round(cost * 100)
      })
    });

    if (!inventoryResponse.ok) {
      savingId = null;
      const result = await inventoryResponse.json().catch(() => null) as { error?: string } | null;
      messageKind = 'error';
      message = result?.error ?? 'Could not save inventory foundation.';
      return;
    }

    const prepResponse = await fetch(`/api/listing-prep/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        listingTitleDraft: title || null,
        targetListPriceCents: price === null ? null : Math.round(price * 100),
        listingPhotosReady: formData.get('listingPhotosReady') === 'on',
        listingNotes: notes || null
      })
    });

    savingId = null;

    if (!prepResponse.ok) {
      const result = await prepResponse.json().catch(() => null) as { error?: string } | null;
      messageKind = 'error';
      message = result?.error ?? 'Could not save listing prep.';
      await invalidateAll();
      return;
    }

    messageKind = 'success';
    message = `Saved progress for ${item.title}.`;
    await invalidateAll();
  }

  function closeListedFromBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      markListedItem = null;
    }
  }

  function openMarkListed(item: PrepItem) {
    if (!readiness(item).complete) return;

    markListedItem = item;
    ebayItemId = item.ebayItemId ?? '';
    listingPrice = item.targetListPriceCents
      ? (item.targetListPriceCents / 100).toFixed(2)
      : '';
    listedDate = new Date().toISOString().slice(0, 10);
    message = null;
  }

  async function markListed(event: SubmitEvent) {
    event.preventDefault();
    if (!markListedItem || listingSaving) return;

    const parsedPrice = Number(listingPrice);

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      messageKind = 'error';
      message = 'Enter a valid eBay list price.';
      return;
    }

    listingSaving = true;
    message = null;

    const item = markListedItem;

    const response = await fetch(
      `/api/listing-prep/${encodeURIComponent(item.id)}/listed`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ebayItemId: ebayItemId.trim() || null,
          listPriceCents: Math.round(parsedPrice * 100),
          listedAt: listedDate
        })
      }
    );

    listingSaving = false;

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      messageKind = 'error';
      message = result?.error ?? 'Could not mark this item listed.';
      return;
    }

    lastListed = { id: item.id, title: item.title };
    markListedItem = null;
    messageKind = 'success';
    message = `${item.title} is now tracked as an active eBay listing.`;
    await invalidateAll();
  }

  async function undoLastListed() {
    if (!lastListed || undoing) return;

    undoing = true;

    const response = await fetch(
      `/api/listing-prep/${encodeURIComponent(lastListed.id)}/listed`,
      { method: 'DELETE' }
    );

    undoing = false;

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      messageKind = 'error';
      message = result?.error ?? 'Could not undo the listing.';
      return;
    }

    messageKind = 'success';
    message = `${lastListed.title} returned to Listing Prep.`;
    selectedId = lastListed.id;
    lastListed = null;
    await invalidateAll();
  }
</script>

<svelte:head>
  <title>Listing Prep · Sellquity</title>
  <meta
    name="description"
    content="Move unlisted reseller inventory through a focused eBay listing-prep workflow."
  />
</svelte:head>

<div class="prep-v2">
  <header class="prep-topbar">
    <a class="brand" href="/">
      <span><img src="/s-no-bg.png" alt="" aria-hidden="true" /></span>
      <div><strong>SELLQUITY</strong><small>Listing Prep</small></div>
    </a>

    <a class="back-link" href="/"><ArrowLeft size={16} /> Command center</a>
  </header>

  <main>
    <section class="prep-header">
      <div>
        <span class="eyebrow">LISTING WORKFLOW</span>
        <h1>Prep station</h1>
        <p>Take one item from inventory-ready to listing-ready without bouncing between screens.</p>
      </div>

      <div class="queue-summary">
        <span><small>QUEUE</small><strong>{data.items.length}</strong></span>
        <span><small>READY</small><strong>{readyItems.length}</strong></span>
        <span><small>COST BASIS</small><strong>{money(costBasis)}</strong></span>
      </div>
    </section>

    {#if message}
      <section class:success={messageKind === 'success'} class:error={messageKind === 'error'} class="message">
        <span>{message}</span>
        {#if lastListed && messageKind === 'success'}
          <button type="button" disabled={undoing} onclick={undoLastListed}>
            {#if undoing}<LoaderCircle class="spin" size={14} />{/if}
            Undo
          </button>
        {/if}
      </section>
    {/if}

    {#if data.items.length}
      <section class="prep-workspace">
        <aside class="queue-panel">
          <div class="queue-tools">
            <label class="search">
              <Search size={16} />
              <input bind:value={query} placeholder="Find an item…" />
            </label>

            <div class="tabs">
              <button class:active={queueFilter === 'all'} onclick={() => queueFilter = 'all'}>All</button>
              <button class:active={queueFilter === 'needs-work'} onclick={() => queueFilter = 'needs-work'}>Needs work</button>
              <button class:active={queueFilter === 'ready'} onclick={() => queueFilter = 'ready'}>Ready</button>
            </div>
          </div>

          <div class="queue-list">
            {#if filtered.length}
              {#each filtered as item}
                {@const itemStatus = readiness(item)}
                {@const itemStage = stage(item)}
                <button
                  type="button"
                  class:active={selectedItem?.id === item.id}
                  onclick={() => {
                    selectedId = item.id;
                    message = null;
                  }}
                >
                  <span class="queue-item-top">
                    <strong>{item.title}</strong>
                    <b class:ready={itemStage === 'ready'}>{stageLabel(itemStage)}</b>
                  </span>
                  <span class="queue-item-meta">
                    <small>{item.sku ?? 'No SKU'}</small>
                    <i>·</i>
                    <small>{itemStatus.done}/{itemStatus.total} checks</small>
                  </span>
                  <span class="queue-progress"><i style:width={`${itemStatus.done / itemStatus.total * 100}%`}></i></span>
                </button>
              {/each}
            {:else}
              <div class="queue-empty">
                <strong>No matching items.</strong>
                <small>Change the filter or search.</small>
              </div>
            {/if}
          </div>
        </aside>

        <section class="station">
          {#if selectedItem}
            {@const status = readiness(selectedItem)}
            {@const currentStage = stage(selectedItem)}

            <div class="station-head">
              <div class="station-identity">
                <span class="station-avatar">
                  {selectedItem.title
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((word: string) => word[0])
                    .join('')
                    .toUpperCase()}
                </span>

                <div>
                  <span class="stage-label">{stageLabel(currentStage)}</span>
                  <h2>{selectedItem.title}</h2>
                  <p>
                    {categoryLabel(selectedItem.category)}
                    <i>·</i>
                    bought {shortDate(selectedItem.purchasedAt ?? selectedItem.createdAt)}
                  </p>
                </div>
              </div>

              <div class="station-nav">
                <button type="button" disabled={selectedIndex <= 0} onclick={() => selectRelative(-1)}>
                  <ChevronLeft size={17} />
                </button>
                <span>{selectedIndex + 1} / {filtered.length}</span>
                <button type="button" disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1} onclick={() => selectRelative(1)}>
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            <div class="check-strip">
              {#each status.checks as check}
                {@const CheckIcon = check.icon}
                <span class:done={check.done}>
                  <i>{#if check.done}<Check size={14} />{:else}<CheckIcon size={14} />{/if}</i>
                  <small>{check.label}</small>
                </span>
              {/each}
            </div>

            <form class="station-form" onsubmit={(event) => saveProgress(event, selectedItem)}>
              <section class="form-section foundation-section">
                <div class="section-heading">
                  <span>
                    <small>01 · FOUNDATION</small>
                    <strong>Identity &amp; cost</strong>
                  </span>
                  <em>These follow the item forever.</em>
                </div>

                <div class="foundation-grid">
                  <label>
                    <span>Sellquity SKU</span>
                    <div class="copy-field">
                      <input
                        name="sku"
                        value={selectedItem.sku ?? ''}
                        placeholder="AFG-0001"
                        maxlength="100"
                      />
                      <button
                        type="button"
                        disabled={!selectedItem.sku}
                        title="Copy SKU for eBay Custom label"
                        onclick={() => copyText(selectedItem.sku, 'SKU copied for eBay Custom label.')}
                      ><Copy size={15} /></button>
                    </div>
                    <small>Use this exact value in eBay’s Custom label field.</small>
                  </label>

                  <label>
                    <span>Purchase cost / COGS</span>
                    <div class="money-field">
                      <i>$</i>
                      <input
                        name="purchaseCost"
                        inputmode="decimal"
                        value={selectedItem.costCents == null ? '' : (selectedItem.costCents / 100).toFixed(2)}
                        placeholder="0.00"
                      />
                    </div>
                    <small>What you have invested in this item.</small>
                  </label>
                </div>

                <div class="context-row">
                  <span><PackageCheck size={15} /><small>Condition</small><strong>{selectedItem.conditionName ?? 'Not set'}</strong></span>
                  <span><MapPin size={15} /><small>Location</small><strong>{selectedItem.location ?? 'Not set'}</strong></span>
                  <span><Tag size={15} /><small>Source</small><strong>{selectedItem.source ?? 'Not set'}</strong></span>
                </div>
              </section>

              <section class="form-section">
                <div class="section-heading">
                  <span>
                    <small>02 · LISTING</small>
                    <strong>What the buyer sees</strong>
                  </span>
                  <em>Get it ready to publish.</em>
                </div>

                <label class="photo-toggle">
                  <input
                    name="listingPhotosReady"
                    type="checkbox"
                    checked={selectedItem.listingPhotosReady}
                  />
                  <span class="photo-icon"><Camera size={19} /></span>
                  <span>
                    <strong>Photos are ready</strong>
                    <small>All listing photos are shot, reviewed and ready to upload.</small>
                  </span>
                  <b>{selectedItem.listingPhotosReady ? 'Ready' : 'Needed'}</b>
                </label>

                <label class="title-field">
                  <span>eBay title <small>80 characters max</small></span>
                  <div class="copy-field">
                    <input
                      name="listingTitleDraft"
                      maxlength="80"
                      value={selectedItem.listingTitleDraft ?? ''}
                      placeholder="1991 WWF Hasbro Undertaker Action Figure…"
                    />
                    <button
                      type="button"
                      disabled={!selectedItem.listingTitleDraft}
                      title="Copy listing title"
                      onclick={() => copyText(selectedItem.listingTitleDraft, 'Listing title copied.')}
                    ><Copy size={15} /></button>
                  </div>
                </label>

                <div class="listing-fields">
                  <label>
                    <span>Target price</span>
                    <div class="money-field">
                      <i>$</i>
                      <input
                        name="targetListPrice"
                        inputmode="decimal"
                        value={selectedItem.targetListPriceCents ? (selectedItem.targetListPriceCents / 100).toFixed(2) : ''}
                        placeholder="0.00"
                      />
                    </div>
                  </label>

                  <label>
                    <span>Prep notes <small>optional</small></span>
                    <input
                      name="listingNotes"
                      maxlength="1000"
                      value={selectedItem.listingNotes ?? ''}
                      placeholder="Flaws, measurements, shipping notes…"
                    />
                  </label>
                </div>
              </section>

              <div class="station-actions">
                <button class="save-button" type="submit" disabled={savingId === selectedItem.id}>
                  {#if savingId === selectedItem.id}<LoaderCircle class="spin" size={16} />{:else}<Check size={16} />{/if}
                  Save progress
                </button>

                <button
                  class:ready={status.complete}
                  class="list-button"
                  type="button"
                  disabled={!status.complete}
                  onclick={() => openMarkListed(selectedItem)}
                >
                  {status.complete ? 'Mark as listed' : `${status.total - status.done} check${status.total - status.done === 1 ? '' : 's'} left`}
                  <ChevronRight size={16} />
                </button>
              </div>
            </form>
          {:else}
            <div class="station-empty">
              <ClipboardCheck size={28} />
              <strong>No item selected.</strong>
              <small>Choose something from the queue.</small>
            </div>
          {/if}
        </section>
      </section>
    {:else}
      <section class="empty-state">
        <span><ClipboardCheck size={28} /></span>
        <strong>Your prep queue is empty.</strong>
        <p>When new inventory is added as unlisted, it will show up here automatically.</p>
        <a href="/">Back to inventory <ChevronRight size={15} /></a>
      </section>
    {/if}
  </main>
</div>

{#if markListedItem}
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={closeListedFromBackdrop}
  >
    <div class="listed-dialog" role="dialog" aria-modal="true" aria-labelledby="listed-title">
      <button class="modal-close" type="button" onclick={() => markListedItem = null} aria-label="Close">
        <X size={18} />
      </button>

      <span class="eyebrow">FINAL STEP</span>
      <h2 id="listed-title">Track the live eBay listing</h2>
      <p>
        Once this is live on eBay, record the final price and date so Sellquity can start
        listing-age tracking immediately.
      </p>

      <div class="listing-reference">
        <Tag size={17} />
        <span>
          <small>EBAY CUSTOM LABEL</small>
          <strong>{markListedItem.sku}</strong>
        </span>
      </div>

      <form onsubmit={markListed}>
        <label>
          <span>Final list price</span>
          <div class="money-field">
            <i>$</i>
            <input bind:value={listingPrice} inputmode="decimal" required />
          </div>
        </label>

        <label>
          <span>Listed date</span>
          <input bind:value={listedDate} type="date" required />
        </label>

        <label class="full-field">
          <span>eBay Item ID <small>optional, but best</small></span>
          <input bind:value={ebayItemId} inputmode="numeric" placeholder="e.g. 123456789012" />
        </label>

        <div class="dialog-note">
          If the Item ID is not handy yet, the exact SKU/custom label is still Sellquity’s durable identity.
        </div>

        <div class="dialog-actions">
          <button class="ghost" type="button" onclick={() => markListedItem = null}>Cancel</button>
          <button class="primary" disabled={listingSaving}>
            {#if listingSaving}<LoaderCircle class="spin" size={16} />{/if}
            Track active listing
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    background:
      radial-gradient(circle at 78% -15%, #0069e315 0, transparent 34rem),
      #050b14;
    color: #f4f8ff;
    font-family: "Arial Narrow", "Roboto Condensed", Inter, ui-sans-serif, system-ui, sans-serif;
  }

  * { box-sizing: border-box; }

  .prep-v2 { min-height: 100vh; }

  .prep-topbar {
    min-height: 68px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 10px max(22px, calc((100vw - 1380px) / 2));
    border-bottom: 1px solid #17304a;
    background: #06101bd9;
    backdrop-filter: blur(14px);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand > span {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid #1b5b7d;
    border-radius: 10px;
    background: linear-gradient(145deg, #071c31, #0b2840);
  }

  .brand img { width: 90%; height: 90%; object-fit: contain; }

  .brand div {
    display: flex;
    flex-direction: column;
  }

  .brand strong {
    font-size: .86rem;
    letter-spacing: .13em;
  }

  .brand small {
    margin-top: 2px;
    color: #708ba0;
    font-size: .68rem;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #8fa6b8;
    font-size: .78rem;
    font-weight: 850;
  }

  .back-link:hover { color: #01d0e9; }

  main {
    width: min(1380px, calc(100% - 44px));
    margin: 0 auto;
    padding: 40px 0 80px;
  }

  .eyebrow {
    color: #01d4a5;
    font: 850 .7rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .13em;
  }

  .prep-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 30px;
    margin-bottom: 22px;
  }

  h1 {
    margin: 7px 0 8px;
    font-size: clamp(2.6rem, 5vw, 4.4rem);
    line-height: .92;
    letter-spacing: -.055em;
  }

  .prep-header p {
    max-width: 720px;
    margin: 0;
    color: #8399ac;
    font-size: .9rem;
    line-height: 1.6;
  }

  .queue-summary {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(3, auto);
    overflow: hidden;
    border: 1px solid #19364d;
    border-radius: 10px;
    background: #08141f;
  }

  .queue-summary span {
    min-width: 100px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    border-right: 1px solid #19364d;
    padding: 10px 13px;
  }

  .queue-summary span:last-child { border-right: 0; }

  .queue-summary small {
    color: #5d7c91;
    font: 800 .53rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .07em;
  }

  .queue-summary strong { font-size: .9rem; }

  .message {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    border: 1px solid #17605b;
    border-radius: 9px;
    padding: 10px 12px;
    color: #74e2d0;
    background: #08231f;
    font-size: .75rem;
  }

  .message.error {
    border-color: #663840;
    color: #efa1a8;
    background: #281419;
  }

  .message button {
    border: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    font-weight: 850;
    cursor: pointer;
  }

  .prep-workspace {
    min-height: 650px;
    display: grid;
    grid-template-columns: 330px minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid #19364d;
    border-radius: 14px;
    background: #08131f;
    box-shadow: 0 18px 50px #0000002b;
  }

  .queue-panel {
    min-width: 0;
    border-right: 1px solid #19364d;
    background: #07111b;
  }

  .queue-tools {
    border-bottom: 1px solid #19364d;
    padding: 13px;
  }

  .search {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search :global(svg) {
    position: absolute;
    left: 11px;
    color: #617e92;
  }

  input {
    width: 100%;
    height: 42px;
    border: 1px solid #24445f;
    border-radius: 8px;
    padding: 0 11px;
    outline: 0;
    color: #eef8ff;
    background: #07111b;
    font: inherit;
    font-size: .82rem;
  }

  input:focus {
    border-color: #1985a8;
    box-shadow: 0 0 0 3px #01d0e910;
  }

  .search input { padding-left: 36px; }

  .tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
    margin-top: 8px;
    border: 1px solid #1c3a52;
    border-radius: 8px;
    padding: 3px;
    background: #08141f;
  }

  .tabs button {
    min-height: 32px;
    border: 0;
    border-radius: 5px;
    color: #748b9d;
    background: transparent;
    font: inherit;
    font-size: .66rem;
    font-weight: 850;
    cursor: pointer;
  }

  .tabs button.active {
    color: #03131a;
    background: linear-gradient(135deg, #0069e3, #01d0e9 56%, #01d4a5);
  }

  .queue-list {
    max-height: 720px;
    overflow-y: auto;
    scrollbar-color: #234057 transparent;
  }

  .queue-list > button {
    width: 100%;
    display: grid;
    gap: 6px;
    border: 0;
    border-bottom: 1px solid #142c40;
    padding: 13px;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .queue-list > button:hover {
    background: #0a1a27;
  }

  .queue-list > button.active {
    background:
      linear-gradient(90deg, #0069e31b, transparent 80%),
      #0a1c29;
    box-shadow: inset 3px 0 #01d0e9;
  }

  .queue-item-top {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .queue-item-top strong {
    display: -webkit-box;
    overflow: hidden;
    font-size: .76rem;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .queue-item-top b {
    flex: 0 0 auto;
    border: 1px solid #30465a;
    border-radius: 999px;
    padding: 3px 6px;
    color: #7891a4;
    background: #0b1824;
    font: 800 .48rem "SFMono-Regular", Consolas, monospace;
    white-space: nowrap;
  }

  .queue-item-top b.ready {
    border-color: #176051;
    color: #66dec8;
    background: #09231f;
  }

  .queue-item-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #617e92;
  }

  .queue-item-meta small { font-size: .62rem; }
  .queue-item-meta i { color: #355066; font-style: normal; }

  .queue-progress {
    height: 3px;
    overflow: hidden;
    border-radius: 999px;
    background: #172d3f;
  }

  .queue-progress i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #0069e3, #01d0e9, #01d4a5);
  }

  .queue-empty {
    min-height: 180px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 4px;
    color: #617f93;
    text-align: center;
  }

  .queue-empty strong { color: #a9bfce; font-size: .78rem; }
  .queue-empty small { font-size: .67rem; }

  .station {
    min-width: 0;
  }

  .station-head {
    min-height: 94px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 1px solid #19364d;
    padding: 16px 20px;
  }

  .station-identity {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .station-avatar {
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 1px solid #1b617d;
    border-radius: 9px;
    color: #72f2df;
    background: linear-gradient(145deg, #092842, #071a2c);
    font-size: .7rem;
    font-weight: 950;
  }

  .station-identity > div { min-width: 0; }

  .stage-label {
    color: #01d4a5;
    font: 800 .55rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .station-identity h2 {
    max-width: 760px;
    overflow: hidden;
    margin: 3px 0 4px;
    font-size: 1.08rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .station-identity p {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin: 0;
    color: #6d879b;
    font-size: .68rem;
  }

  .station-identity p i {
    color: #3f5d72;
    font-style: normal;
  }

  .station-nav {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .station-nav button {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid #24445f;
    border-radius: 7px;
    color: #84a0b3;
    background: #091722;
    cursor: pointer;
  }

  .station-nav button:disabled {
    opacity: .3;
    cursor: not-allowed;
  }

  .station-nav span {
    min-width: 44px;
    color: #6e8799;
    font: 750 .62rem "SFMono-Regular", Consolas, monospace;
    text-align: center;
  }

  .check-strip {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    border-bottom: 1px solid #19364d;
    background: #07141f;
  }

  .check-strip > span {
    display: flex;
    align-items: center;
    gap: 7px;
    border-right: 1px solid #19364d;
    padding: 10px 12px;
    color: #637f92;
  }

  .check-strip > span:last-child { border-right: 0; }

  .check-strip i {
    width: 25px;
    height: 25px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 1px solid #2a455a;
    border-radius: 7px;
    color: #708fa3;
    background: #0a1924;
    font-style: normal;
  }

  .check-strip span.done {
    color: #74dacd;
  }

  .check-strip span.done i {
    border-color: #17605b;
    color: #6de5d0;
    background: #09241f;
  }

  .check-strip small {
    font-size: .63rem;
    font-weight: 800;
  }

  .station-form {
    display: grid;
  }

  .form-section {
    border-bottom: 1px solid #19364d;
    padding: 20px;
  }

  .section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 14px;
  }

  .section-heading > span {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .section-heading small {
    color: #01d4a5;
    font: 800 .55rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .08em;
  }

  .section-heading strong {
    font-size: .88rem;
  }

  .section-heading em {
    color: #607d91;
    font-size: .65rem;
    font-style: normal;
  }

  .foundation-grid,
  .listing-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  label {
    display: grid;
    gap: 6px;
  }

  label > span {
    color: #8199ab;
    font-size: .69rem;
    font-weight: 800;
  }

  label > span small,
  label > small {
    color: #5d7a90;
    font-size: .62rem;
    font-weight: 600;
  }

  .copy-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
  }

  .copy-field button {
    width: 42px;
    display: grid;
    place-items: center;
    border: 1px solid #24445f;
    border-radius: 8px;
    color: #72aabc;
    background: #091722;
    cursor: pointer;
  }

  .copy-field button:hover { color: #01d0e9; }

  .copy-field button:disabled {
    opacity: .3;
    cursor: not-allowed;
  }

  .money-field {
    position: relative;
  }

  .money-field i {
    position: absolute;
    top: 11px;
    left: 11px;
    color: #668095;
    font-style: normal;
    font-size: .8rem;
  }

  .money-field input { padding-left: 24px; }

  .context-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 13px;
  }

  .context-row span {
    min-width: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1px 7px;
    border: 1px solid #18364b;
    border-radius: 8px;
    padding: 9px 10px;
    background: #07131e;
  }

  .context-row :global(svg) {
    grid-row: 1 / 3;
    align-self: center;
    color: #4689a4;
  }

  .context-row small {
    color: #5d7b90;
    font-size: .58rem;
  }

  .context-row strong {
    overflow: hidden;
    color: #b9cbd7;
    font-size: .67rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .photo-toggle {
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    border: 1px solid #1e445c;
    border-radius: 9px;
    padding: 11px;
    background: #071722;
    cursor: pointer;
  }

  .photo-toggle input {
    width: 17px;
    height: 17px;
    accent-color: #01d4a5;
  }

  .photo-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid #1b5871;
    border-radius: 8px;
    color: #5fd2df;
    background: #092334;
  }

  .photo-toggle > span:nth-of-type(2) {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .photo-toggle strong { font-size: .74rem; }
  .photo-toggle small { color: #678499; font-size: .64rem; }

  .photo-toggle b {
    border-radius: 999px;
    padding: 4px 7px;
    color: #ddb16b;
    background: #261e12;
    font: 800 .52rem "SFMono-Regular", Consolas, monospace;
  }

  .photo-toggle:has(input:checked) b {
    color: #66dec8;
    background: #09231f;
  }

  .title-field {
    margin-top: 12px;
  }

  .listing-fields {
    margin-top: 12px;
  }

  .station-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 9px;
    padding: 16px 20px;
    background: #07131e;
  }

  .save-button,
  .list-button,
  .listed-dialog button.primary,
  .listed-dialog button.ghost {
    min-height: 41px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    padding: 0 14px;
    font: inherit;
    font-size: .74rem;
    font-weight: 900;
    cursor: pointer;
  }

  .save-button {
    border: 1px solid #24526d;
    color: #c4d8e4;
    background: #0b2030;
  }

  .list-button {
    border: 1px solid #33495b;
    color: #758ea1;
    background: #0a1621;
  }

  .list-button.ready {
    border: 0;
    color: #03131a;
    background: linear-gradient(135deg, #0069e3, #01d0e9 56%, #01d4a5);
  }

  .save-button:disabled,
  .list-button:disabled {
    opacity: .4;
    cursor: not-allowed;
  }

  .station-empty {
    min-height: 600px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 6px;
    color: #607d91;
  }

  .station-empty strong { color: #b4c7d4; font-size: .85rem; }
  .station-empty small { font-size: .68rem; }

  .empty-state {
    min-height: 390px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 8px;
    border: 1px solid #19364d;
    border-radius: 14px;
    color: #668398;
    background: #08141f;
    text-align: center;
  }

  .empty-state > span {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border: 1px solid #17605b;
    border-radius: 12px;
    color: #68e4d5;
    background: #09231f;
  }

  .empty-state strong {
    color: #dceaf2;
    font-size: 1rem;
  }

  .empty-state p {
    max-width: 460px;
    margin: 0;
    font-size: .75rem;
    line-height: 1.5;
  }

  .empty-state a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    color: #64b8ca;
    font-size: .72rem;
    font-weight: 850;
  }

  .modal-backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: #02060bcf;
    backdrop-filter: blur(8px);
  }

  .listed-dialog {
    position: relative;
    width: min(560px, 100%);
    border: 1px solid #1b4966;
    border-radius: 16px;
    padding: 24px;
    background:
      radial-gradient(circle at 90% 0%, #0069e319 0, transparent 16rem),
      linear-gradient(145deg, #0d1b2a, #08131e);
    box-shadow: 0 30px 90px #00000080;
  }

  .listed-dialog h2 {
    margin: 6px 0 7px;
    font-size: 1.45rem;
  }

  .listed-dialog > p {
    margin: 0 34px 16px 0;
    color: #7f93a5;
    font-size: .78rem;
    line-height: 1.5;
  }

  .modal-close {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 33px;
    height: 33px;
    display: grid;
    place-items: center;
    border: 1px solid #24445f;
    border-radius: 8px;
    color: #8298aa;
    background: #091520;
    cursor: pointer;
  }

  .listing-reference {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 15px;
    border: 1px solid #155560;
    border-radius: 9px;
    padding: 10px;
    color: #01d4a5;
    background: #08252b;
  }

  .listing-reference > span {
    display: flex;
    flex-direction: column;
  }

  .listing-reference small {
    color: #6f9aa4;
    font-size: .59rem;
  }

  .listing-reference strong {
    margin-top: 2px;
    font: 900 .78rem "SFMono-Regular", Consolas, monospace;
  }

  .listed-dialog form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .full-field,
  .dialog-note,
  .dialog-actions {
    grid-column: 1 / -1;
  }

  .dialog-note {
    border-radius: 8px;
    padding: 9px 10px;
    color: #71899b;
    background: #07111b;
    font-size: .67rem;
    line-height: 1.45;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
    margin-top: 4px;
  }

  .listed-dialog button.primary {
    border: 0;
    color: #03131a;
    background: linear-gradient(135deg, #0069e3, #01d0e9 56%, #01d4a5);
  }

  .listed-dialog button.ghost {
    border: 1px solid transparent;
    color: #879cad;
    background: transparent;
  }

  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 980px) {
    .prep-workspace {
      grid-template-columns: 280px minmax(0, 1fr);
    }

    .queue-summary span {
      min-width: 88px;
    }

    .check-strip small {
      display: none;
    }
  }

  @media (max-width: 760px) {
    main {
      width: min(100% - 24px, 1380px);
      padding-top: 28px;
    }

    .prep-topbar { padding-inline: 12px; }

    .back-link {
      font-size: 0;
    }

    .back-link :global(svg) {
      width: 20px;
      height: 20px;
    }

    .prep-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .queue-summary {
      width: 100%;
      grid-template-columns: repeat(3, 1fr);
    }

    .queue-summary span {
      min-width: 0;
    }

    .prep-workspace {
      display: block;
      overflow: visible;
    }

    .queue-panel {
      border-right: 0;
      border-bottom: 1px solid #19364d;
    }

    .queue-list {
      max-height: 260px;
    }

    .station-head {
      align-items: flex-start;
      flex-direction: column;
    }

    .station-nav {
      align-self: flex-end;
    }

    .check-strip {
      grid-template-columns: repeat(5, minmax(48px, 1fr));
    }

    .foundation-grid,
    .listing-fields,
    .context-row {
      grid-template-columns: 1fr;
    }

    .section-heading {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  @media (max-width: 520px) {
    .brand small { display: none; }

    h1 { font-size: 2.7rem; }

    .queue-summary {
      grid-template-columns: 1fr 1fr;
    }

    .queue-summary span:last-child {
      grid-column: 1 / -1;
      border-top: 1px solid #19364d;
    }

    .check-strip {
      grid-template-columns: repeat(5, 1fr);
    }

    .check-strip > span {
      justify-content: center;
      border-right: 0;
      padding-inline: 4px;
    }

    .photo-toggle {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .photo-toggle > input {
      position: absolute;
      opacity: 0;
    }

    .station-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .station-actions button {
      width: 100%;
    }

    .listed-dialog form {
      grid-template-columns: 1fr;
    }

    .full-field,
    .dialog-note,
    .dialog-actions {
      grid-column: 1;
    }
  }
</style>
