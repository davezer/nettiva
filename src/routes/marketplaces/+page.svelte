<script lang="ts">
  import {
    ArrowLeft,
    BadgeDollarSign,
    Check,
    Clock3,
    ExternalLink,
    FileSpreadsheet,
    Layers3,
    PackageCheck,
    PlugZap,
    ShoppingBag
  } from '@lucide/svelte';

  type MarketplaceProviderRow = {
    provider: 'ebay' | 'whatnot';
    label: string;
    connected: boolean;
    status: string;
    connectionMethod: string | null;
    connectedAt: string | null;
    lastSyncedAt: string | null;
    activeListings: number;
    orders: number;
    grossCents: number;
    transactions: number;
  };

  type MarketplacePageData = {
    workspace: {
      id: string;
      name: string;
      slug: string;
      plan: string;
      role: 'owner' | 'admin' | 'member';
    } | null;
    providers: MarketplaceProviderRow[];
  };

  let { data } = $props<{ data: MarketplacePageData }>();

  function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  function provider(provider: 'ebay' | 'whatnot') {
    return data.providers.find((row: MarketplaceProviderRow) => row.provider === provider)!;
  }

  const ebay = $derived(provider('ebay'));
  const whatnot = $derived(provider('whatnot'));
  const totalGross = $derived(data.providers.reduce((sum: number, row: MarketplaceProviderRow) => sum + row.grossCents, 0));
  const totalOrders = $derived(data.providers.reduce((sum: number, row: MarketplaceProviderRow) => sum + row.orders, 0));
</script>

<svelte:head>
  <title>Marketplaces · Nettiva</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="marketplace-shell">
  <header class="marketplace-topbar">
    <a href="/" class="back-link"><ArrowLeft size={16} /> Nettiva</a>
    <div class="workspace-chip">
      <span>WORKSPACE</span>
      <strong>{data.workspace?.name ?? 'Nettiva'}</strong>
    </div>
  </header>

  <main>
    <section class="marketplace-hero">
      <div>
        <span class="eyebrow">MARKETPLACE HUB</span>
        <h1>One reseller business.<br />Multiple sales channels.</h1>
        <p>
          eBay, Whatnot, and future marketplaces normalize into the same Nettiva inventory,
          COGS, accounting, and reporting engine.
        </p>
      </div>

      <div class="hero-summary">
        <span><ShoppingBag size={18} /><small>Orders</small><strong>{totalOrders}</strong></span>
        <span><BadgeDollarSign size={18} /><small>Recorded gross</small><strong>{money(totalGross)}</strong></span>
        <span><Layers3 size={18} /><small>Architecture</small><strong>Multi-channel</strong></span>
      </div>
    </section>

    <section class="provider-grid">
      <article class="provider-card">
        <div class="provider-head">
          <div class="provider-logo ebay-logo">e</div>
          <div>
            <span class="provider-label">MARKETPLACE</span>
            <h2>eBay</h2>
          </div>
          <span class:connected={ebay.connected} class="status">
            {#if ebay.connected}<Check size={13} /> Connected{:else}<Clock3 size={13} /> API pending{/if}
          </span>
        </div>

        <p>
          Existing eBay inventory, orders, fees, labels, payouts, and CSV history now sit behind
          the same provider-neutral identity layer Whatnot will use.
        </p>

        <div class="provider-stats">
          <span><small>Listings</small><strong>{ebay.activeListings}</strong></span>
          <span><small>Orders</small><strong>{ebay.orders}</strong></span>
          <span><small>Gross</small><strong>{money(ebay.grossCents)}</strong></span>
        </div>

        <div class="provider-actions">
          {#if ebay.connected}
            <span class="connection-note"><Check size={15} /> OAuth account linked</span>
          {:else}
            <a class="button secondary" href="/api/ebay/connect">
              <ExternalLink size={16} /> Connect when approved
            </a>
          {/if}
          <small>
            {ebay.lastSyncedAt
              ? `Last sync ${new Date(ebay.lastSyncedAt).toLocaleString()}`
              : 'Nettiva can keep using transaction imports while API access is unavailable.'}
          </small>
        </div>
      </article>

      <article class="provider-card whatnot-card">
        <div class="provider-head">
          <div class="provider-logo whatnot-logo">W</div>
          <div>
            <span class="provider-label">MARKETPLACE</span>
            <h2>Whatnot</h2>
          </div>
          <span class:connected={whatnot.connected} class="status">
            {#if whatnot.connected}<Check size={13} /> Connected{:else}<PlugZap size={13} /> Foundation ready{/if}
          </span>
        </div>

        <p>
          Whatnot will share Nettiva's existing inventory identities instead of creating a second
          copy of every item. A sale on either marketplace can ultimately close the same SKU.
        </p>

        <div class="provider-stats">
          <span><small>Listings</small><strong>{whatnot.activeListings}</strong></span>
          <span><small>Orders</small><strong>{whatnot.orders}</strong></span>
          <span><small>Gross</small><strong>{money(whatnot.grossCents)}</strong></span>
        </div>

        <div class="provider-actions">
          <span class="connection-note upcoming"><FileSpreadsheet size={15} /> Import adapter is next</span>
          <small>Orders / show reports first. API and webhook ingestion can plug into the same adapter later.</small>
        </div>
      </article>
    </section>

    <section class="architecture-card">
      <div class="architecture-head">
        <span class="architecture-icon"><Layers3 size={21} /></span>
        <div>
          <span class="eyebrow">NORMALIZATION LAYER</span>
          <h2>Marketplace-specific data stops here.</h2>
        </div>
      </div>

      <div class="flow">
        <div class="source-stack">
          <div><strong>eBay</strong><small>API / CSV</small></div>
          <div><strong>Whatnot</strong><small>CSV / API / webhooks</small></div>
        </div>
        <span class="flow-arrow">→</span>
        <div><strong>Marketplace adapter</strong><small>Normalize IDs + money + events</small></div>
        <span class="flow-arrow">→</span>
        <div class="nettiva-core"><strong>Nettiva core</strong><small>Inventory · COGS · Accounting</small></div>
      </div>

      <div class="foundation-checks">
        <span><Check size={15} /> Provider-scoped listing IDs</span>
        <span><Check size={15} /> Provider-scoped order IDs</span>
        <span><Check size={15} /> Provider-scoped transaction IDs</span>
        <span><Check size={15} /> Shared inventory identities</span>
        <span><Check size={15} /> Existing eBay compatibility preserved</span>
      </div>
    </section>

    <section class="next-card">
      <div>
        <span class="eyebrow">NEXT ADAPTER</span>
        <h2>Whatnot Import v1</h2>
        <p>
          The next build will take official Whatnot seller exports and normalize orders, fees,
          shipping, and sales into this new marketplace layer.
        </p>
      </div>
      <PackageCheck size={34} />
    </section>
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #080d12; }
  .marketplace-shell { min-height: 100vh; color: #e8eee9; background: #080d12; }
  .marketplace-topbar {
    height: 62px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 max(24px, calc((100vw - 1180px) / 2));
    border-bottom: 1px solid #202a33;
    background: #0b1117;
  }
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #9aa8b3;
    text-decoration: none;
    font-size: .78rem;
    font-weight: 800;
  }
  .back-link:hover { color: #b8f34a; }
  .workspace-chip { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
  .workspace-chip span, .eyebrow, .provider-label {
    color: #788591;
    font: 800 .63rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .13em;
  }
  .workspace-chip strong { font-size: .76rem; }
  main { width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 54px 0 80px; }
  .marketplace-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(320px, .8fr);
    align-items: end;
    gap: 42px;
    margin-bottom: 34px;
  }
  h1 { margin: 8px 0 12px; font-size: clamp(2rem, 4.6vw, 3.75rem); line-height: .98; letter-spacing: -.045em; }
  .marketplace-hero p { max-width: 680px; margin: 0; color: #7e8a95; line-height: 1.65; font-size: .88rem; }
  .hero-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid #28333d;
    border-radius: 14px;
    overflow: hidden;
    background: #0d141a;
  }
  .hero-summary > span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 16px;
    border-right: 1px solid #28333d;
  }
  .hero-summary > span:last-child { border-right: 0; }
  .hero-summary :global(svg) { color: #b8f34a; }
  .hero-summary small, .provider-stats small { color: #687580; font-size: .65rem; }
  .hero-summary strong { overflow: hidden; font-size: .85rem; text-overflow: ellipsis; }
  .provider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .provider-card, .architecture-card, .next-card {
    border: 1px solid #29343e;
    border-radius: 15px;
    background: linear-gradient(150deg, #10171e, #0c1218);
  }
  .provider-card { padding: 24px; }
  .provider-head {
    display: grid;
    grid-template-columns: auto minmax(0,1fr) auto;
    align-items: center;
    gap: 12px;
  }
  .provider-logo {
    width: 43px; height: 43px; display: grid; place-items: center;
    border-radius: 11px; font-weight: 950; font-size: 1.2rem;
  }
  .ebay-logo { background: #edf2f6; color: #16202a; }
  .whatnot-logo { background: #b8f34a; color: #0b1007; }
  .provider-head h2, .architecture-head h2, .next-card h2 { margin: 3px 0 0; }
  .status {
    display: inline-flex; align-items: center; gap: 5px;
    border: 1px solid #4a3f26; border-radius: 999px; padding: 5px 8px;
    color: #c8ad69; background: #211c11; font-size: .65rem; font-weight: 800;
  }
  .status.connected { border-color: #35542a; color: #a6db65; background: #142010; }
  .provider-card > p {
    min-height: 67px; margin: 21px 0; color: #7b8994; font-size: .78rem; line-height: 1.55;
  }
  .provider-stats {
    display: grid; grid-template-columns: repeat(3, 1fr);
    border: 1px solid #25303a; border-radius: 10px; overflow: hidden;
  }
  .provider-stats span {
    display: flex; flex-direction: column; gap: 4px; padding: 11px;
    border-right: 1px solid #25303a;
  }
  .provider-stats span:last-child { border-right: 0; }
  .provider-stats strong { font-size: .82rem; }
  .provider-actions {
    min-height: 73px; display: flex; flex-direction: column; align-items: flex-start;
    justify-content: flex-end; gap: 8px; margin-top: 16px;
  }
  .provider-actions small { color: #5e6b76; font-size: .66rem; line-height: 1.45; }
  .button {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    min-height: 36px; border: 1px solid #35424d; border-radius: 8px;
    padding: 0 12px; color: #dce5df; background: #151e25;
    text-decoration: none; font-size: .72rem; font-weight: 850;
  }
  .button:hover { border-color: #627244; color: #b8f34a; }
  .connection-note {
    display: inline-flex; align-items: center; gap: 6px;
    color: #a5d866; font-size: .7rem; font-weight: 800;
  }
  .connection-note.upcoming { color: #b7c4ce; }
  .architecture-card { margin-top: 18px; padding: 24px; }
  .architecture-head { display: flex; align-items: center; gap: 11px; }
  .architecture-icon {
    width: 40px; height: 40px; display: grid; place-items: center;
    border-radius: 10px; color: #b8f34a; background: #182317;
  }
  .flow {
    display: grid;
    grid-template-columns: minmax(190px, .9fr) auto minmax(260px, 1.25fr) auto minmax(220px, 1fr);
    align-items: center;
    gap: 14px;
    margin-top: 23px;
  }
  .flow > div:not(.source-stack) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid #28343e;
    border-radius: 10px;
    padding: 14px;
    background: #0b1117;
  }
  .source-stack {
    display: grid;
    gap: 10px;
  }
  .source-stack > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid #28343e;
    border-radius: 10px;
    padding: 14px;
    background: #0b1117;
  }
  .flow-arrow {
    color: #52606b;
    font-weight: 900;
    font-size: 1.1rem;
  }
  .flow small { color: #63717c; font-size: .64rem; }
  .nettiva-core { border-color: #526936 !important; background: #121a10 !important; }
  .nettiva-core strong { color: #b8f34a; }
  .foundation-checks {
    display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 18px;
    color: #7f8d97; font-size: .68rem;
  }
  .foundation-checks span { display: inline-flex; align-items: center; gap: 5px; }
  .foundation-checks :global(svg) { color: #8ab84d; }
  .next-card {
    display: flex; align-items: center; justify-content: space-between;
    gap: 24px; margin-top: 18px; padding: 22px 24px;
  }
  .next-card p { max-width: 720px; margin: 6px 0 0; color: #74818c; font-size: .76rem; line-height: 1.5; }
  .next-card > :global(svg) { color: #b8f34a; }
  @media (max-width: 850px) {
    .marketplace-hero, .provider-grid { grid-template-columns: 1fr; }
    .marketplace-hero { gap: 22px; }
    .flow { grid-template-columns: 1fr; }
    .flow-arrow { transform: rotate(90deg); text-align: center; }
  }
  @media (max-width: 560px) {
    main { width: min(100% - 24px, 1180px); padding-top: 34px; }
    .marketplace-topbar { padding: 0 14px; }
    .hero-summary { grid-template-columns: 1fr; }
    .hero-summary > span { border-right: 0; border-bottom: 1px solid #28333d; }
    .hero-summary > span:last-child { border-bottom: 0; }
    .provider-head { grid-template-columns: auto 1fr; }
    .status { grid-column: 1 / -1; justify-self: start; }
  }
</style>
