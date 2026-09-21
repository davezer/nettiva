<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    AlertTriangle,
    ArrowLeft,
    Check,
    Clipboard,
    LoaderCircle,
    LockKeyhole,
    PlugZap,
    RefreshCw,
    ShieldCheck,
    Unplug
  } from '@lucide/svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let checking = $state(false);
  let disconnecting = $state(false);
  let syncing = $state(false);
  let copied = $state(false);
  let message = $state<string | null>(null);
  let error = $state<string | null>(null);

  function shortDateTime(value: string | number | null | undefined) {
    if (!value) return 'Not yet';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Not yet';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  }

  async function copyCallback() {
    try {
      await navigator.clipboard.writeText(data.callbackUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      error = 'Could not copy the callback URL.';
    }
  }

  async function verifyConnection() {
    checking = true;
    message = null;
    error = null;
    try {
      const response = await fetch('/api/ebay/health', { method: 'POST' });
      const result = await response.json() as { error?: string; userId?: string | null };
      if (!response.ok) {
        error = result.error ?? 'Connection check failed.';
        return;
      }
      message = result.userId ? `eBay connection verified for ${result.userId}.` : 'eBay connection verified.';
      await invalidateAll();
    } catch {
      error = 'Sellquity could not verify the eBay connection.';
    } finally {
      checking = false;
    }
  }

  async function syncLiveData() {
    syncing = true;
    message = null;
    error = null;
    try {
      const response = await fetch('/api/ebay/sync', { method: 'POST' });
      if (!response.ok) {
        error = 'Sellquity could not sync eBay right now.';
        return;
      }
      message = 'eBay data synced successfully.';
      await invalidateAll();
    } catch {
      error = 'Sellquity could not sync eBay right now.';
    } finally {
      syncing = false;
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect eBay? Your imported inventory, sales, purchase costs, and accounting history will stay in Sellquity.')) return;
    disconnecting = true;
    message = null;
    error = null;
    try {
      const response = await fetch('/api/ebay/disconnect', { method: 'POST' });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        error = result?.error ?? 'Could not disconnect eBay.';
        return;
      }
      message = 'eBay disconnected. Your Sellquity data was kept.';
      await invalidateAll();
    } catch {
      error = 'Could not disconnect eBay.';
    } finally {
      disconnecting = false;
    }
  }
</script>

<svelte:head><title>eBay connection · Sellquity</title></svelte:head>

<div class="connection-shell">
  <header class="topbar">
    <a href="/manage"><ArrowLeft size={16} /> Settings</a>
    <span><PlugZap size={14} /> EBAY</span>
  </header>

  <main>
    <section class="hero">
      <div>
        <span class="eyebrow">SELLING CHANNEL</span>
        <h1>eBay</h1>
        <p>Connect your seller account so Sellquity can keep listings, sales, fees, and shipping costs up to date.</p>
      </div>

      <div class:connected={Boolean(data.connection)} class="connection-state">
        {#if data.connection}
          <Check size={20} />
          <span><small>STATUS</small><strong>{data.connection.status === 'error' ? 'Needs attention' : 'Connected'}</strong></span>
        {:else}
          <Unplug size={20} />
          <span><small>STATUS</small><strong>Not connected</strong></span>
        {/if}
      </div>
    </section>

    {#if message}<div class="notice ok"><Check size={16} /> {message}</div>{/if}
    {#if error}<div class="notice bad"><AlertTriangle size={16} /> {error}</div>{/if}

    {#if data.connection}
      <section class="grid">
        <article class="card main-card">
          <div class="card-head">
            <div><span class="eyebrow">CONNECTED ACCOUNT</span><h2>{data.connection.displayName}</h2></div>
            <span class:bad={data.connection.status === 'error'} class="pill">{data.connection.status === 'error' ? 'Attention needed' : 'Connected'}</span>
          </div>

          <div class="facts">
            <span><small>Last synced</small><strong>{shortDateTime(data.connection.lastSyncedAt)}</strong></span>
            <span><small>Connected</small><strong>{shortDateTime(data.connection.connectedAt)}</strong></span>
          </div>

          <div class="trust-box">
            <ShieldCheck size={19} />
            <span>
              <strong>Sellquity reads your eBay business data.</strong>
              <small>It does not create, edit, end, refund, or fulfill listings and orders from this connection.</small>
            </span>
          </div>

          <div class="actions">
            <button class="primary" disabled={syncing || data.role === 'member'} onclick={syncLiveData}>
              {#if syncing}<LoaderCircle class="spin" size={16} />{:else}<RefreshCw size={16} />{/if}
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button class="secondary" disabled={checking || data.role === 'member'} onclick={verifyConnection}>
              {#if checking}<LoaderCircle class="spin" size={16} />{:else}<ShieldCheck size={16} />{/if}
              {checking ? 'Checking…' : 'Check connection'}
            </button>
            <a class="secondary" href="/api/ebay/connect"><RefreshCw size={15} /> Reconnect</a>
            <button class="danger" disabled={disconnecting || data.role === 'member'} onclick={disconnect}>
              {#if disconnecting}<LoaderCircle class="spin" size={15} />{:else}<Unplug size={15} />{/if}
              Disconnect
            </button>
          </div>
        </article>

        <aside class="card side-card">
          <span class="eyebrow">WHAT SELLQUITY USES</span>
          <h3>Your day-to-day eBay data</h3>
          <ul>
            <li><Check size={15} /> Active listings and asking prices</li>
            <li><Check size={15} /> Orders and sold items</li>
            <li><Check size={15} /> Selling fees and shipping labels</li>
            <li><Check size={15} /> Marketplace financial activity</li>
          </ul>
          <a class="text-link" href="/import">Need to backfill data? Open imports →</a>
        </aside>
      </section>
    {:else if data.configured}
      <section class="grid">
        <article class="card main-card connect-card">
          <span class="eyebrow">GET STARTED</span>
          <h2>Connect your eBay seller account</h2>
          <p>eBay will ask you to sign in and approve Sellquity. Once connected, Sellquity can import and sync the business data it needs.</p>
          <a class="connect-button" href="/api/ebay/connect"><PlugZap size={17} /> Connect eBay</a>
        </article>

        <aside class="card side-card">
          <ShieldCheck size={22} />
          <h3>Your eBay account stays yours.</h3>
          <p>Sellquity uses the approved connection to read seller data. Your eBay password is never stored by Sellquity.</p>
        </aside>
      </section>
    {:else}
      <section class="card setup-card">
        <div class="setup-copy">
          <AlertTriangle size={20} />
          <div>
            <span class="eyebrow">SETUP NEEDED</span>
            <h2>eBay connections are not available in this environment yet.</h2>
            <p>The Sellquity installation still needs its eBay app credentials configured. Regular users should never need to deal with this setup.</p>
          </div>
        </div>

        <details>
          <summary>Developer setup details</summary>
          <div class="dev-details">
            <div class="checks">
              <span class:done={data.config.clientId}>{data.config.clientId ? '✓' : '○'} Client ID</span>
              <span class:done={data.config.clientSecret}>{data.config.clientSecret ? '✓' : '○'} Client secret</span>
              <span class:done={data.config.redirectUri}>{data.config.redirectUri ? '✓' : '○'} Redirect / RuName</span>
              <span class:done={data.config.encryptionKey}>{data.config.encryptionKey ? '✓' : '○'} Token encryption key</span>
            </div>
            <div class="callback">
              <span><small>CALLBACK URL</small><strong>{data.callbackUrl}</strong></span>
              <button type="button" onclick={copyCallback}>{#if copied}<Check size={15} /> Copied{:else}<Clipboard size={15} /> Copy{/if}</button>
            </div>
            <p><LockKeyhole size={14} /> These details are for the Sellquity operator, not sellers using the product.</p>
          </div>
        </details>
      </section>
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #080d12; }
  * { box-sizing: border-box; }
  .connection-shell { min-height: 100vh; color: #e8eee9; background: #080d12; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .topbar { height: 62px; display: flex; align-items: center; justify-content: space-between; padding: 0 max(24px, calc((100vw - 1080px) / 2)); border-bottom: 1px solid #202a33; background: #0b1117; }
  .topbar a, .topbar > span { display: inline-flex; align-items: center; gap: 7px; }
  .topbar a { color: #9aa8b3; text-decoration: none; font-size: .78rem; font-weight: 800; }
  .topbar > span { color: #01d4a5; font: 800 .63rem Consolas, monospace; letter-spacing: .12em; }
  main { width: min(1080px, calc(100% - 40px)); margin: 0 auto; padding: 48px 0 80px; }
  .hero { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: end; gap: 30px; margin-bottom: 22px; }
  .eyebrow { color: #01d4a5; font: 800 .64rem Consolas, monospace; letter-spacing: .12em; }
  h1 { margin: 7px 0 9px; font-size: clamp(2.4rem, 6vw, 4rem); letter-spacing: -.05em; }
  h2, h3 { margin: 5px 0 0; }
  .hero p, .card p { max-width: 700px; margin: 0; color: #7e8a95; font-size: .82rem; line-height: 1.6; }
  .connection-state { min-width: 180px; display: flex; align-items: center; gap: 10px; border: 1px solid #39434c; border-radius: 12px; padding: 13px 15px; color: #8b98a2; background: #0e151b; }
  .connection-state.connected { border-color: #245543; color: #75e1c7; background: #0c1e19; }
  .connection-state span { display: flex; flex-direction: column; gap: 2px; }
  .connection-state small { color: #697780; font: 800 .56rem Consolas, monospace; letter-spacing: .09em; }
  .connection-state strong { color: #e8eee9; font-size: .8rem; }
  .notice { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; border-radius: 9px; padding: 10px 12px; font-size: .74rem; }
  .notice.ok { border: 1px solid #235847; color: #7be6ce; background: #0d211b; }
  .notice.bad { border: 1px solid #61343b; color: #efa1a8; background: #281519; }
  .grid { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(280px,.75fr); gap: 14px; }
  .card { border: 1px solid #29343e; border-radius: 14px; padding: 22px; background: #0e151c; }
  .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; }
  .pill { border: 1px solid #315844; border-radius: 999px; padding: 5px 8px; color: #8ee3c9; background: #10211a; font-size: .64rem; font-weight: 800; }
  .pill.bad { border-color: #62343b; color: #efa1a8; background: #251418; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; margin: 18px 0; border: 1px solid #28343e; border-radius: 10px; overflow: hidden; }
  .facts span { display: flex; flex-direction: column; gap: 4px; padding: 12px; border-right: 1px solid #28343e; }
  .facts span:last-child { border-right: 0; }
  .facts small { color: #6b7882; font-size: .63rem; }
  .facts strong { font-size: .76rem; }
  .trust-box { display: flex; align-items: flex-start; gap: 10px; border: 1px solid #214d42; border-radius: 10px; padding: 12px; color: #75e1c7; background: #0b1c18; }
  .trust-box span { display: flex; flex-direction: column; gap: 3px; }
  .trust-box strong { color: #dceae4; font-size: .75rem; }
  .trust-box small { color: #6f978a; font-size: .66rem; line-height: 1.45; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
  button, .primary, .secondary, .danger, .connect-button { min-height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 8px; padding: 0 12px; font: inherit; font-size: .7rem; font-weight: 850; cursor: pointer; text-decoration: none; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .primary, .connect-button { border: 0; color: #03131a; background: #01d4a5; }
  .secondary { border: 1px solid #35424d; color: #dce5df; background: #151e25; }
  .danger { border: 1px solid #5f333a; color: #ef9ba3; background: #261418; }
  .side-card ul { display: grid; gap: 10px; margin: 17px 0; padding: 0; list-style: none; color: #8b999f; font-size: .72rem; }
  .side-card li { display: flex; align-items: center; gap: 7px; }
  .side-card li :global(svg) { color: #01d4a5; }
  .text-link { color: #6dbbc8; text-decoration: none; font-size: .69rem; font-weight: 800; }
  .connect-card p { margin: 10px 0 18px; }
  .connect-button { width: fit-content; }
  .setup-card { display: grid; gap: 18px; }
  .setup-copy { display: flex; align-items: flex-start; gap: 11px; }
  .setup-copy > :global(svg) { color: #d8b36a; }
  details { border-top: 1px solid #26323b; padding-top: 14px; }
  summary { color: #89969f; font-size: .72rem; font-weight: 800; cursor: pointer; }
  .dev-details { display: grid; gap: 12px; margin-top: 14px; }
  .checks { display: flex; flex-wrap: wrap; gap: 7px; }
  .checks span { border: 1px solid #3b4148; border-radius: 999px; padding: 5px 8px; color: #8a949c; font-size: .64rem; }
  .checks span.done { border-color: #28533f; color: #7fd8bc; }
  .callback { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: center; }
  .callback span { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .callback small { color: #65727c; font-size: .58rem; }
  .callback strong { overflow: hidden; color: #b9c5cc; font: 700 .66rem Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
  .callback button { border: 1px solid #35424d; color: #c9d3d9; background: #121a20; }
  .dev-details p { display: flex; align-items: center; gap: 6px; }
  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) { main { width: min(100% - 24px,1080px); padding-top: 30px; } .topbar { padding: 0 13px; } .hero, .grid { grid-template-columns: 1fr; } .connection-state { justify-self: start; } .facts { grid-template-columns: 1fr; } .facts span { border-right: 0; border-bottom: 1px solid #28343e; } .facts span:last-child { border-bottom: 0; } }
</style>
