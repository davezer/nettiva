<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    ArrowLeft,
    Camera,
    Check,
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

  type PageData = {
    workspace: {
      id: string;
      name: string;
      slug: string;
      plan: string;
      role: 'owner' | 'admin' | 'member';
    } | null;
    items: PrepItem[];
  };

  type QueueFilter = 'all' | 'ready' | 'needs-work';

  let { data } = $props<{ data: PageData }>();

  let query = $state('');
  let queueFilter = $state<QueueFilter>('all');
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
    return ({
      action_figures: 'Action Figures',
      baseball_cards: 'Baseball Cards',
      electronics: 'Electronics',
      movies: 'Movies / Blu-ray',
      video_games: 'Video Games',
      trading_cards: 'Trading Cards',
      collectibles: 'Collectibles',
      other: 'Other'
    } as Record<string, string>)[value] ?? 'Other';
  }

  function readiness(item: PrepItem) {
    const checks = [
      { key: 'sku', label: 'SKU assigned', done: Boolean(item.sku?.trim()), icon: Tag },
      { key: 'cogs', label: 'COGS entered', done: item.costCents !== null, icon: CircleDollarSign },
      { key: 'photos', label: 'Photos ready', done: item.listingPhotosReady, icon: Camera },
      { key: 'title', label: 'Title ready', done: Boolean(item.listingTitleDraft?.trim()), icon: FileText },
      {
        key: 'price',
        label: 'Price decided',
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

  async function savePrep(event: SubmitEvent, item: PrepItem) {
    event.preventDefault();
    if (savingId || listingSaving) return;

    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const title = String(formData.get('listingTitleDraft') ?? '').trim();
    const notes = String(formData.get('listingNotes') ?? '').trim();
    const priceRaw = String(formData.get('targetListPrice') ?? '').trim();
    const parsedPrice = priceRaw ? Number(priceRaw) : null;

    if (title.length > 80) {
      messageKind = 'error';
      message = `${item.title}: eBay titles can be at most 80 characters.`;
      return;
    }

    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      messageKind = 'error';
      message = `${item.title}: enter a valid target list price.`;
      return;
    }

    savingId = item.id;
    lastListed = null;
    message = null;

    const response = await fetch(`/api/listing-prep/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        listingTitleDraft: title || null,
        targetListPriceCents: parsedPrice === null ? null : Math.round(parsedPrice * 100),
        listingPhotosReady: formData.get('listingPhotosReady') === 'on',
        listingNotes: notes || null
      })
    });

    savingId = null;

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      messageKind = 'error';
      message = result?.error ?? 'Could not save listing prep.';
      return;
    }

    messageKind = 'success';
    message = `Saved listing prep for ${item.title}.`;
    await invalidateAll();
  }

  async function copyListingTitle(item: PrepItem) {
    const title = item.listingTitleDraft?.trim();
    if (!title) {
      messageKind = 'error';
      message = 'Save a listing title first.';
      return;
    }

    try {
      await navigator.clipboard.writeText(title);
      lastListed = null;
      messageKind = 'success';
      message = 'Listing title copied.';
    } catch {
      messageKind = 'error';
      message = 'Could not copy the listing title.';
    }
  }

  function itemInitials(title: string) {
    return title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word: string) => word[0])
      .join('')
      .toUpperCase();
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
    lastListed = null;
    await invalidateAll();
  }
</script>

<svelte:head>
  <title>Listing Prep · Sellquity</title>
  <meta
    name="description"
    content="Prepare and manually track eBay listings in Sellquity while API access is pending."
  />
</svelte:head>

<div class="prep-shell">
  <header class="prep-topbar">
    <a class="brand" href="/">
      <span><img src="/s-no-bg.png" alt="" aria-hidden="true" /></span>
      <div><strong>SELLQUITY</strong><small>Listing Prep</small></div>
    </a>

    <a class="back-link" href="/"><ArrowLeft size={16} /> Back to command center</a>
  </header>

  <main>
    <section class="hero">
      <div>
        <span class="eyebrow">EBAY PERSONAL WORKFLOW</span>
        <h1>Listing Prep</h1>
        <p>
          Turn unlisted inventory into clean, trackable eBay listings. Finish the five checks,
          list the item on eBay, then mark it active here so Sellquity can track price and age
          without waiting for API access.
        </p>
      </div>

      <div class="hero-callout">
        <ClipboardCheck size={22} />
        <span><strong>{readyItems.length} ready to list</strong><small>of {data.items.length} unlisted items</small></span>
      </div>
    </section>

    <section class="summary-grid">
      <article>
        <span>Prep queue</span>
        <strong>{data.items.length}</strong>
        <small>unlisted inventory</small>
      </article>
      <article>
        <span>Ready now</span>
        <strong>{readyItems.length}</strong>
        <small>all 5 checks complete</small>
      </article>
      <article>
        <span>Needs work</span>
        <strong>{data.items.length - readyItems.length}</strong>
        <small>at least one check missing</small>
      </article>
      <article>
        <span>Queue cost basis</span>
        <strong>{money(costBasis)}</strong>
        <small>purchase cost waiting to list</small>
      </article>
    </section>

    {#if message}
      <section class:success={messageKind === 'success'} class:error={messageKind === 'error'} class="message">
        <span>{message}</span>
        {#if lastListed && messageKind === 'success'}
          <button type="button" disabled={undoing} onclick={undoLastListed}>
            {#if undoing}<LoaderCircle class="spin" size={14} />{/if}
            Undo last listing
          </button>
        {/if}
      </section>
    {/if}

    <section class="toolbar">
      <label class="search">
        <Search size={16} />
        <input bind:value={query} placeholder="Search title, SKU, location, source…" />
      </label>

      <div class="tabs" role="group" aria-label="Filter listing prep">
        <button class:active={queueFilter === 'all'} onclick={() => queueFilter = 'all'}>All</button>
        <button class:active={queueFilter === 'ready'} onclick={() => queueFilter = 'ready'}>Ready</button>
        <button class:active={queueFilter === 'needs-work'} onclick={() => queueFilter = 'needs-work'}>Needs work</button>
      </div>
    </section>

    {#if filtered.length}
      <section class="queue">
        {#each filtered as item}
          {@const status = readiness(item)}
          <article class:ready={status.complete} class="prep-card">
            <div class="card-head">
              <div class="item-identity">
                <span class="item-avatar">{itemInitials(item.title)}</span>
                <div>
                  <div class="title-row">
                    <h2>{item.title}</h2>
                    {#if status.complete}<span class="ready-pill"><Check size={12} /> Ready</span>{/if}
                  </div>
                  <p>
                    <span>{categoryLabel(item.category)}</span>
                    <i>·</i>
                    <span>{item.sku ?? 'No SKU'}</span>
                    <i>·</i>
                    <span>bought {shortDate(item.purchasedAt ?? item.createdAt)}</span>
                  </p>
                </div>
              </div>

              <div class="progress">
                <strong>{status.done}/{status.total}</strong>
                <span>checks complete</span>
                <div><i style:width={`${status.done / status.total * 100}%`}></i></div>
              </div>
            </div>

            <div class="details-strip">
              <span><CircleDollarSign size={14} /> COGS <strong>{item.costCents == null ? 'Missing' : money(item.costCents)}</strong></span>
              <span><PackageCheck size={14} /> Condition <strong>{item.conditionName ?? 'Not set'}</strong></span>
              <span><MapPin size={14} /> Location <strong>{item.location ?? 'Not set'}</strong></span>
              <span><Tag size={14} /> Source <strong>{item.source ?? 'Not set'}</strong></span>
            </div>

            <div class="checklist">
              {#each status.checks as check}
                {@const CheckIcon = check.icon}
                <span class:done={check.done}>
                  {#if check.done}<Check size={13} />{:else}<CheckIcon size={13} />{/if}
                  {check.label}
                </span>
              {/each}
            </div>

            <form class="prep-form" onsubmit={(event) => savePrep(event, item)}>
              <label class="title-field">
                <span>eBay listing title <small>{item.listingTitleDraft?.length ?? 0}/80 saved</small></span>
                <input
                  name="listingTitleDraft"
                  maxlength="80"
                  value={item.listingTitleDraft ?? ''}
                  placeholder="1991 WWF Hasbro Undertaker Action Figure…"
                />
              </label>

              <label class="price-field">
                <span>Target price</span>
                <div class="money-field">
                  <i>$</i>
                  <input
                    name="targetListPrice"
                    inputmode="decimal"
                    value={item.targetListPriceCents ? (item.targetListPriceCents / 100).toFixed(2) : ''}
                    placeholder="0.00"
                  />
                </div>
              </label>

              <label class="photo-check">
                <input
                  name="listingPhotosReady"
                  type="checkbox"
                  checked={item.listingPhotosReady}
                />
                <span><Camera size={16} /><strong>Photos ready</strong><small>Listing photos are shot and ready</small></span>
              </label>

              <label class="notes-field">
                <span>Prep notes <small>optional</small></span>
                <input
                  name="listingNotes"
                  maxlength="1000"
                  value={item.listingNotes ?? ''}
                  placeholder="Measurements, flaws, comps, shipping notes…"
                />
              </label>

              <div class="form-actions">
                <button class="secondary" type="submit" disabled={savingId === item.id}>
                  {#if savingId === item.id}<LoaderCircle class="spin" size={15} />{:else}<Check size={15} />{/if}
                  Save prep
                </button>

                <button
                  class="ghost"
                  type="button"
                  disabled={!item.listingTitleDraft}
                  onclick={() => copyListingTitle(item)}
                >
                  <Copy size={15} /> Copy title
                </button>

                <button
                  class="primary"
                  type="button"
                  disabled={!status.complete}
                  title={status.complete ? 'Track this as an active eBay listing' : 'Finish all five checks first'}
                  onclick={() => openMarkListed(item)}
                >
                  Mark as listed <ChevronRight size={15} />
                </button>
              </div>
            </form>
          </article>
        {/each}
      </section>
    {:else}
      <section class="empty">
        <ClipboardCheck size={28} />
        {#if data.items.length === 0}
          <strong>Your listing-prep queue is empty.</strong>
          <span>Add unlisted inventory in Sellquity and it will appear here automatically.</span>
        {:else}
          <strong>No items match this view.</strong>
          <span>Try another filter or search.</span>
        {/if}
      </section>
    {/if}
  </main>
</div>

{#if markListedItem}
  <div class="modal-backdrop" role="presentation" onclick={closeListedFromBackdrop}>
    <div
      class="listed-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="listed-dialog-title"
    >
      <button class="modal-close" type="button" onclick={() => markListedItem = null} aria-label="Close">
        <X size={18} />
      </button>

      <span class="eyebrow">MANUAL EBAY TRACKING</span>
      <h2 id="listed-dialog-title">Mark as listed</h2>
      <p>
        Sellquity will treat <strong>{markListedItem.title}</strong> as active inventory immediately.
        This does not create or edit the listing on eBay.
      </p>

      <div class="listing-reference">
        <Tag size={16} />
        <span>
          <small>Use this as the eBay custom label</small>
          <strong>{markListedItem.sku}</strong>
        </span>
      </div>

      <form onsubmit={markListed}>
        <label>
          <span>List price</span>
          <div class="money-field">
            <i>$</i>
            <input bind:value={listingPrice} inputmode="decimal" placeholder="0.00" required />
          </div>
        </label>

        <label>
          <span>Listed date</span>
          <input type="date" bind:value={listedDate} required />
        </label>

        <label class="full-field">
          <span>eBay Item ID <small>recommended, but optional</small></span>
          <input
            bind:value={ebayItemId}
            inputmode="numeric"
            maxlength="20"
            placeholder="Paste the eBay item number"
          />
        </label>

        <div class="dialog-note">
          Entering the Item ID gives Sellquity another durable link to the eBay listing.
          Your SKU/custom label remains the primary inventory identity.
        </div>

        <div class="dialog-actions">
          <button class="ghost" type="button" onclick={() => markListedItem = null}>Cancel</button>
          <button class="primary" disabled={listingSaving}>
            {#if listingSaving}<LoaderCircle class="spin" size={15} />{:else}<Check size={15} />{/if}
            Mark active
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    background: #050b14;
    color: #f4f8ff;
    font-family: "Arial Narrow", "Roboto Condensed", Inter, ui-sans-serif, system-ui, sans-serif;
  }

  * { box-sizing: border-box; }

  .prep-shell { min-height: 100vh; }

  .prep-topbar {
    min-height: 66px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 10px max(22px, calc((100vw - 1240px) / 2));
    border-bottom: 1px solid #17304a;
    background: linear-gradient(180deg, #081422, #060d16);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
  }

  .brand > span {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid #1b5b7d;
    border-radius: 11px;
    background: linear-gradient(145deg, #071c31, #0b2840);
    box-shadow: 0 8px 24px #0069e326;
  }

  .brand img { width: 90%; height: 90%; object-fit: contain; }
  .brand div { display: flex; flex-direction: column; }
  .brand strong { color: #fff; font-size: .85rem; letter-spacing: .13em; }
  .brand small { margin-top: 2px; color: #6f8daa; font-size: .67rem; letter-spacing: .09em; text-transform: uppercase; }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #90a5b8;
    font-size: .76rem;
    font-weight: 800;
    text-decoration: none;
  }

  .back-link:hover { color: #01d0e9; }

  main {
    width: min(1240px, calc(100% - 40px));
    margin: 0 auto;
    padding: 46px 0 80px;
  }

  .hero {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 30px;
    margin-bottom: 22px;
  }

  .eyebrow {
    color: #01d4a5;
    font: 800 .65rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .14em;
  }

  h1 {
    margin: 7px 0 8px;
    color: #fff;
    font-size: clamp(2.25rem, 5vw, 4rem);
    line-height: .95;
    letter-spacing: -.045em;
  }

  .hero p {
    max-width: 780px;
    margin: 0;
    color: #8196aa;
    font-size: .83rem;
    line-height: 1.6;
  }

  .hero-callout {
    flex: 0 0 auto;
    min-width: 210px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid #176174;
    border-radius: 12px;
    padding: 13px 15px;
    background: linear-gradient(145deg, #09242d, #081922);
  }

  .hero-callout > :global(svg) { color: #01d4a5; }
  .hero-callout span { display: flex; flex-direction: column; }
  .hero-callout strong { font-size: .82rem; }
  .hero-callout small { margin-top: 2px; color: #7693a6; font-size: .67rem; }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin-bottom: 14px;
    border: 1px solid #19314f;
    border-radius: 13px;
    overflow: hidden;
    background: #09131f;
  }

  .summary-grid article {
    padding: 15px 17px;
    border-right: 1px solid #19314f;
  }

  .summary-grid article:last-child { border-right: 0; }
  .summary-grid span { display: block; color: #8298ad; font-size: .68rem; }
  .summary-grid strong { display: block; margin: 5px 0 2px; color: #fff; font-size: 1.2rem; }
  .summary-grid small { color: #61798d; font-size: .63rem; }

  .message {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 14px;
    border: 1px solid #176174;
    border-radius: 10px;
    padding: 10px 12px;
    color: #80edde;
    background: #08242b;
    font-size: .72rem;
  }

  .message.error {
    border-color: #64323a;
    color: #ffadb5;
    background: #2a151a;
  }

  .message button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }

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
    left: 12px;
    color: #60798e;
  }

  input {
    width: 100%;
    height: 40px;
    border: 1px solid #24445f;
    border-radius: 8px;
    padding: 0 11px;
    outline: 0;
    color: #eef8ff;
    background: #07111b;
    font: inherit;
    font-size: .76rem;
  }

  input:focus {
    border-color: #1985a8;
    box-shadow: 0 0 0 3px #01d0e910;
  }

  .search input { padding-left: 37px; }

  .tabs {
    display: flex;
    gap: 4px;
    border: 1px solid #1c3a52;
    border-radius: 8px;
    padding: 3px;
    background: #07111b;
  }

  .tabs button {
    border: 0;
    border-radius: 5px;
    padding: 0 12px;
    color: #788da0;
    background: transparent;
    font: inherit;
    font-size: .7rem;
    font-weight: 800;
    cursor: pointer;
  }

  .tabs button.active {
    color: #03131a;
    background: linear-gradient(135deg, #0069e3, #01d0e9 56%, #01d4a5);
  }

  .queue { display: grid; gap: 12px; }

  .prep-card {
    overflow: hidden;
    border: 1px solid #19314f;
    border-radius: 13px;
    background: linear-gradient(145deg, #0d1928, #09131f);
    box-shadow: 0 10px 32px #00000024;
  }

  .prep-card.ready {
    border-color: #176174;
    box-shadow: 0 10px 34px #00000024, inset 3px 0 #01d4a5;
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 15px 17px;
  }

  .item-identity {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .item-avatar {
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 1px solid #1b617d;
    border-radius: 8px;
    color: #72f2df;
    background: linear-gradient(145deg, #092842, #071a2c);
    font-size: .67rem;
    font-weight: 950;
  }

  .item-identity > div { min-width: 0; }

  .title-row {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .title-row h2 {
    max-width: 620px;
    overflow: hidden;
    margin: 0;
    color: #f5faff;
    font-size: .92rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .ready-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: 999px;
    padding: 3px 6px;
    color: #68ead7;
    background: #09282c;
    font: 800 .55rem "SFMono-Regular", Consolas, monospace;
    text-transform: uppercase;
  }

  .item-identity p {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin: 4px 0 0;
    color: #71899c;
    font-size: .66rem;
  }

  .item-identity p span:first-child { color: #01d4a5; font-weight: 800; }
  .item-identity p i { color: #3d566b; font-style: normal; }

  .progress {
    width: 145px;
    flex: 0 0 auto;
    text-align: right;
  }

  .progress strong { color: #fff; font-size: .78rem; }
  .progress > span { margin-left: 4px; color: #678093; font-size: .6rem; }

  .progress > div {
    height: 5px;
    margin-top: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: #162b3c;
  }

  .progress i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #0069e3, #01d0e9, #01d4a5);
  }

  .details-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-top: 1px solid #172b3d;
    border-bottom: 1px solid #172b3d;
    background: #07111b99;
  }

  .details-strip > span {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-right: 1px solid #172b3d;
    color: #698095;
    font-size: .63rem;
  }

  .details-strip > span:last-child { border-right: 0; }
  .details-strip :global(svg) { flex: 0 0 auto; color: #2885a5; }
  .details-strip strong { overflow: hidden; color: #b8c7d3; white-space: nowrap; text-overflow: ellipsis; }

  .checklist {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 11px 17px 0;
  }

  .checklist span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #283e50;
    border-radius: 999px;
    padding: 5px 8px;
    color: #718698;
    background: #0a1621;
    font-size: .62rem;
    font-weight: 800;
  }

  .checklist span.done {
    border-color: #155560;
    color: #64e7d5;
    background: #08252b;
  }

  .prep-form {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) 150px 180px;
    gap: 10px;
    padding: 11px 17px 16px;
  }

  .prep-form label {
    display: grid;
    gap: 5px;
  }

  .prep-form label > span,
  .listed-dialog label > span {
    color: #7d92a5;
    font-size: .63rem;
    font-weight: 800;
  }

  .prep-form label small,
  .listed-dialog label small {
    color: #536f84;
    font-weight: 600;
  }

  .notes-field { grid-column: 1 / -1; }

  .money-field { position: relative; }
  .money-field i {
    position: absolute;
    top: 11px;
    left: 10px;
    color: #668095;
    font-style: normal;
    font-size: .72rem;
  }

  .money-field input { padding-left: 22px; }

  .photo-check {
    display: flex !important;
    align-items: center;
    gap: 9px !important;
    border: 1px solid #24445f;
    border-radius: 8px;
    padding: 7px 10px;
    background: #07111b;
    cursor: pointer;
  }

  .photo-check input {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    accent-color: #01d4a5;
  }

  .photo-check > span {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 1px 5px;
  }

  .photo-check :global(svg) { grid-row: 1 / 3; color: #01d0e9; }
  .photo-check strong { color: #c8d6df; font-size: .67rem; }
  .photo-check small { color: #60788b !important; font-size: .58rem; }

  .form-actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 7px;
  }

  button.primary,
  button.secondary,
  button.ghost {
    min-height: 35px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 7px;
    padding: 0 11px;
    font: inherit;
    font-size: .67rem;
    font-weight: 900;
    cursor: pointer;
  }

  button.primary {
    border: 0;
    color: #03131a;
    background: linear-gradient(135deg, #0069e3, #01d0e9 56%, #01d4a5);
  }

  button.secondary {
    border: 1px solid #21506d;
    color: #bbcfdd;
    background: #0c1d2b;
  }

  button.ghost {
    border: 1px solid transparent;
    color: #879cad;
    background: transparent;
  }

  button:disabled { opacity: .38; cursor: not-allowed; }

  .empty {
    min-height: 260px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 7px;
    border: 1px solid #19314f;
    border-radius: 13px;
    color: #698095;
    background: #09131f;
    text-align: center;
  }

  .empty :global(svg) { color: #01d4a5; }
  .empty strong { color: #d7e3eb; }
  .empty span { font-size: .73rem; }

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
    color: #fff;
    font-size: 1.45rem;
  }

  .listed-dialog > p {
    margin: 0 34px 16px 0;
    color: #7f93a5;
    font-size: .75rem;
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

  .listing-reference > span { display: flex; flex-direction: column; }
  .listing-reference small { color: #6f9aa4; font-size: .59rem; }
  .listing-reference strong { margin-top: 2px; font: 900 .75rem "SFMono-Regular", Consolas, monospace; }

  .listed-dialog form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .listed-dialog label { display: grid; gap: 5px; }
  .full-field, .dialog-note, .dialog-actions { grid-column: 1 / -1; }

  .dialog-note {
    border-radius: 8px;
    padding: 9px 10px;
    color: #71899b;
    background: #07111b;
    font-size: .65rem;
    line-height: 1.45;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
    margin-top: 4px;
  }

  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 900px) {
    .summary-grid { grid-template-columns: 1fr 1fr; }
    .summary-grid article:nth-child(2) { border-right: 0; }
    .summary-grid article:nth-child(-n+2) { border-bottom: 1px solid #19314f; }
    .hero { align-items: flex-start; flex-direction: column; }
    .details-strip { grid-template-columns: 1fr 1fr; }
    .details-strip > span:nth-child(2) { border-right: 0; }
    .details-strip > span:nth-child(-n+2) { border-bottom: 1px solid #172b3d; }
    .prep-form { grid-template-columns: 1fr 1fr; }
    .title-field { grid-column: 1 / -1; }
    .photo-check { min-height: 58px; }
  }

  @media (max-width: 640px) {
    main { width: min(100% - 24px, 1240px); padding-top: 28px; }
    .prep-topbar { padding: 10px 12px; }
    .back-link { font-size: 0; }
    .back-link :global(svg) { width: 20px; height: 20px; }
    .summary-grid { grid-template-columns: 1fr; }
    .summary-grid article { border-right: 0; border-bottom: 1px solid #19314f; }
    .summary-grid article:last-child { border-bottom: 0; }
    .toolbar { grid-template-columns: 1fr; }
    .tabs button { min-height: 34px; flex: 1; }
    .card-head { align-items: flex-start; flex-direction: column; }
    .progress { width: 100%; text-align: left; }
    .details-strip { grid-template-columns: 1fr; }
    .details-strip > span { border-right: 0; border-bottom: 1px solid #172b3d; }
    .details-strip > span:last-child { border-bottom: 0; }
    .prep-form { grid-template-columns: 1fr; }
    .title-field, .notes-field, .form-actions { grid-column: 1; }
    .form-actions { align-items: stretch; flex-direction: column; }
    .form-actions button { width: 100%; }
    .listed-dialog form { grid-template-columns: 1fr; }
    .full-field, .dialog-note, .dialog-actions { grid-column: 1; }
  }
</style>
