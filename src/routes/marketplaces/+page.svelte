<script lang="ts">
  import { ArrowLeft, Check, FileSpreadsheet, PlugZap, RefreshCw, ShoppingBag } from '@lucide/svelte';

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
    workspace: { id: string; name: string; slug: string; plan: string; role: 'owner' | 'admin' | 'member' } | null;
    providers: MarketplaceProviderRow[];
  };

  let { data } = $props<{ data: MarketplacePageData }>();

  function money(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }

  function provider(name: 'ebay' | 'whatnot') {
    return data.providers.find((row: MarketplaceProviderRow) => row.provider === name)!;
  }

  function shortDateTime(value: string | null) {
    if (!value) return 'Not yet';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Not yet';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  }

  const ebay = $derived(provider('ebay'));
  const whatnot = $derived(provider('whatnot'));
</script>

<svelte:head><title>Selling channels · Sellquity</title></svelte:head>

<div class="channels-shell">
  <header class="topbar">
    <a href="/manage"><ArrowLeft size={16} /> Settings</a>
    <span><ShoppingBag size={14} /> SELLING CHANNELS</span>
  </header>

  <main>
    <section class="hero">
      <span class="eyebrow">CONNECTIONS</span>
      <h1>Selling channels</h1>
      <p>eBay is Sellquity's primary live connection. Whatnot currently works through file imports so both channels can still feed the same inventory and accounting system.</p>
    </section>

    <section class="provider-grid">
      <article class="provider-card primary-provider">
        <div class="provider-head">
          <div class="logo ebay">e</div>
          <div><span class="eyebrow">PRIMARY CHANNEL</span><h2>eBay</h2></div>
          <span class:connected={ebay.connected} class="status">{#if ebay.connected}<Check size={13} /> Connected{:else}<PlugZap size={13} /> Not connected{/if}</span>
        </div>

        <p>Connect eBay for the normal Sellquity workflow: listings, sales, fees, and shipping activity kept in sync.</p>

        <div class="stats">
          <span><small>Active listings</small><strong>{ebay.activeListings}</strong></span>
          <span><small>Orders</small><strong>{ebay.orders}</strong></span>
          <span><small>Recorded gross</small><strong>{money(ebay.grossCents)}</strong></span>
        </div>

        <div class="provider-footer">
          <div>
            {#if ebay.connected}<strong>Last sync {shortDateTime(ebay.lastSyncedAt)}</strong><small>Manual imports are still available for backfills.</small>{:else}<strong>Connect when you're ready.</strong><small>You can still use eBay CSV imports before connecting.</small>{/if}
          </div>
          <a class="button primary" href="/integrations/ebay">{#if ebay.connected}<RefreshCw size={15} /> Manage eBay{:else}<PlugZap size={15} /> Connect eBay{/if}</a>
        </div>
      </article>

      <article class="provider-card">
        <div class="provider-head">
          <div class="logo whatnot">W</div>
          <div><span class="eyebrow">IMPORT SUPPORT</span><h2>Whatnot</h2></div>
          <span class:connected={whatnot.orders > 0 || whatnot.connected} class="status">{#if whatnot.orders > 0 || whatnot.connected}<Check size={13} /> In use{:else}<FileSpreadsheet size={13} /> Import available{/if}</span>
        </div>

        <p>Whatnot support is import-based today. Orders and ledger exports feed Sellquity without pretending there is a live API connection that does not exist yet.</p>

        <div class="stats">
          <span><small>Tracked orders</small><strong>{whatnot.orders}</strong></span>
          <span><small>Transactions</small><strong>{whatnot.transactions}</strong></span>
          <span><small>Recorded gross</small><strong>{money(whatnot.grossCents)}</strong></span>
        </div>

        <div class="provider-footer">
          <div><strong>CSV import workflow</strong><small>Import Orders Reports for sales and Ledger exports for balance activity.</small></div>
          <a class="button" href="/import#whatnot"><FileSpreadsheet size={15} /> Import Whatnot</a>
        </div>
      </article>
    </section>

    <section class="note-card">
      <Check size={18} />
      <div><strong>One inventory system underneath both channels.</strong><p>Sellquity keeps marketplace-specific order and listing data separate while tying sales back to the same inventory records whenever possible.</p></div>
    </section>
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #080d12; }
  * { box-sizing: border-box; }
  .channels-shell { min-height: 100vh; color: #e8eee9; background: #080d12; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .topbar { height: 62px; display: flex; align-items: center; justify-content: space-between; padding: 0 max(24px, calc((100vw - 1080px) / 2)); border-bottom: 1px solid #202a33; background: #0b1117; }
  .topbar a, .topbar > span { display: inline-flex; align-items: center; gap: 7px; }
  .topbar a { color: #9aa8b3; text-decoration: none; font-size: .78rem; font-weight: 800; }
  .topbar > span { color: #01d4a5; font: 800 .63rem Consolas, monospace; letter-spacing: .12em; }
  main { width: min(1080px, calc(100% - 40px)); margin: 0 auto; padding: 48px 0 80px; }
  .hero { max-width: 760px; margin-bottom: 25px; }
  .eyebrow { color: #01d4a5; font: 800 .64rem Consolas, monospace; letter-spacing: .12em; }
  h1 { margin: 7px 0 9px; font-size: clamp(2.4rem, 6vw, 4rem); letter-spacing: -.05em; }
  h2 { margin: 4px 0 0; }
  .hero p, .provider-card > p, .note-card p { margin: 0; color: #7e8a95; font-size: .8rem; line-height: 1.6; }
  .provider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .provider-card, .note-card { border: 1px solid #29343e; border-radius: 14px; background: #0e151c; }
  .provider-card { padding: 22px; }
  .primary-provider { border-color: #245047; }
  .provider-head { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 11px; }
  .logo { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 10px; font-size: 1.15rem; font-weight: 950; }
  .logo.ebay { color: #16202a; background: #edf2f6; }
  .logo.whatnot { color: #07110d; background: #01d4a5; }
  .status { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #4a3f26; border-radius: 999px; padding: 5px 8px; color: #c8ad69; background: #211c11; font-size: .64rem; font-weight: 800; }
  .status.connected { border-color: #35542a; color: #a6db65; background: #142010; }
  .provider-card > p { min-height: 64px; margin: 18px 0; }
  .stats { display: grid; grid-template-columns: repeat(3,1fr); border: 1px solid #28343e; border-radius: 10px; overflow: hidden; }
  .stats span { min-width: 0; display: flex; flex-direction: column; gap: 4px; padding: 11px; border-right: 1px solid #28343e; }
  .stats span:last-child { border-right: 0; }
  .stats small { color: #687580; font-size: .62rem; }
  .stats strong { overflow: hidden; font-size: .78rem; text-overflow: ellipsis; }
  .provider-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-top: 17px; }
  .provider-footer > div { display: flex; flex-direction: column; gap: 3px; }
  .provider-footer > div strong { font-size: .7rem; }
  .provider-footer > div small { color: #65727c; font-size: .63rem; line-height: 1.4; }
  .button { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: 0 0 auto; border: 1px solid #35424d; border-radius: 8px; padding: 0 11px; color: #dce5df; background: #151e25; text-decoration: none; font-size: .68rem; font-weight: 850; }
  .button.primary { border: 0; color: #03131a; background: #01d4a5; }
  .note-card { display: flex; align-items: flex-start; gap: 10px; margin-top: 14px; padding: 18px; }
  .note-card > :global(svg) { color: #01d4a5; }
  .note-card strong { display: block; margin-bottom: 4px; font-size: .76rem; }
  @media (max-width: 800px) { .provider-grid { grid-template-columns: 1fr; } }
  @media (max-width: 560px) { main { width: min(100% - 24px,1080px); padding-top: 30px; } .topbar { padding: 0 13px; } .provider-head { grid-template-columns: auto 1fr; } .status { grid-column: 1 / -1; justify-self: start; } .stats { grid-template-columns: 1fr; } .stats span { border-right: 0; border-bottom: 1px solid #28343e; } .stats span:last-child { border-bottom: 0; } .provider-footer { align-items: stretch; flex-direction: column; } .button { width: 100%; } }
</style>
