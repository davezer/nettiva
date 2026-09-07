<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    AlertTriangle, ArrowLeft, Check, Clipboard, KeyRound, Link2,
    LoaderCircle, LockKeyhole, PlugZap, RefreshCw, ShieldCheck, Unplug
  } from '@lucide/svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let checking = $state(false);
  let disconnecting = $state(false);
  let message = $state<string | null>(null);
  let error = $state<string | null>(null);
  let copied = $state(false);

  function shortDate(value: string | number | null | undefined) {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Not available';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  function scopeLabel(scope: string) {
    if (scope.endsWith('/api_scope')) return 'eBay identity';
    if (scope.endsWith('/sell.inventory.readonly')) return 'Inventory read';
    if (scope.endsWith('/sell.fulfillment.readonly')) return 'Orders read';
    if (scope.endsWith('/sell.finances')) return 'Finances';
    return scope;
  }

  async function copyCallback() {
    try {
      await navigator.clipboard.writeText(data.callbackUrl);
      copied = true;
      setTimeout(() => copied = false, 1500);
    } catch { error = 'Could not copy the callback URL.'; }
  }

  async function verifyConnection() {
    checking = true; message = null; error = null;
    try {
      const response = await fetch('/api/ebay/health', { method: 'POST' });
      const result = await response.json() as { error?: string; userId?: string | null };
      if (!response.ok) { error = result.error ?? 'Connection check failed.'; return; }
      message = result.userId ? `Connected to ${result.userId}. eBay API access verified.` : 'eBay API access verified.';
      await invalidateAll();
    } catch { error = 'Sellquity could not verify the eBay connection.'; }
    finally { checking = false; }
  }

  async function disconnect() {
    if (!confirm('Disconnect eBay? Inventory, sales, COGS and accounting history will stay intact.')) return;
    disconnecting = true; message = null; error = null;
    try {
      const response = await fetch('/api/ebay/disconnect', { method: 'POST' });
      const result = await response.json() as { error?: string };
      if (!response.ok) { error = result.error ?? 'Could not disconnect eBay.'; return; }
      message = 'eBay disconnected. Business data was preserved.';
      await invalidateAll();
    } catch { error = 'Could not disconnect eBay.'; }
    finally { disconnecting = false; }
  }
</script>

<svelte:head><title>eBay connection · Sellquity</title></svelte:head>

<div class="shell">
  <header><a href="/"><ArrowLeft size={16}/> Sellquity</a><span><PlugZap size={14}/> EBAY AUTOMATION</span></header>

  <main>
    <section class="hero">
      <div><span class="eyebrow">STEP 01 · CONNECTION</span><h1>Connect the seller account.</h1><p>OAuth gives Sellquity a secure server-side connection to eBay. Tokens are encrypted and refreshed automatically.</p></div>
      <div class:connected={Boolean(data.connection)} class="state-card">
        {#if data.connection}<Link2 size={22}/><span><small>EBAY ACCOUNT</small><strong>{data.connection.displayName}</strong><em>{data.connection.status === 'error' ? 'Needs attention' : 'Connected'}</em></span>
        {:else}<Unplug size={22}/><span><small>EBAY ACCOUNT</small><strong>Not connected</strong><em>{data.configured ? 'Ready to authorize' : 'Configuration needed'}</em></span>{/if}
      </div>
    </section>

    {#if message}<div class="notice ok"><Check size={16}/>{message}</div>{/if}
    {#if error}<div class="notice bad"><AlertTriangle size={16}/>{error}</div>{/if}

    {#if data.connection}
      <section class="grid">
        <article class="card primary">
          <div class="card-head"><div><span class="eyebrow">LIVE CONNECTION</span><h2>{data.connection.displayName}</h2></div><span class:bad={data.connection.status === 'error'} class="pill">{data.connection.status === 'error' ? 'Attention' : 'Connected'}</span></div>
          <div class="facts">
            <span><small>eBay user</small><strong>{String(data.connection.metadata.userId ?? data.connection.displayName)}</strong></span>
            <span><small>Inventory API</small><strong>{String(data.connection.metadata.inventoryApiVersion ?? 'Ready')}</strong></span>
            <span><small>Connected</small><strong>{shortDate(data.connection.connectedAt)}</strong></span>
            <span><small>Refresh token</small><strong>{shortDate(data.connection.refreshTokenExpiresAt)}</strong></span>
          </div>
          <div class="token"><RefreshCw size={18}/><span><small>AUTOMATIC TOKEN REFRESH</small><strong>Sellquity renews short-lived access tokens for you.</strong><em>No copy/paste token maintenance.</em></span></div>
          <div class="actions">
            <button class="primary-btn" disabled={checking || data.role === 'member'} onclick={verifyConnection}>{#if checking}<LoaderCircle class="spin" size={16}/>{:else}<ShieldCheck size={16}/>{/if}{checking ? 'Verifying…' : 'Verify connection'}</button>
            <a class="secondary-btn" href="/api/ebay/connect"><RefreshCw size={15}/> Reauthorize</a>
            <button class="danger-btn" disabled={disconnecting || data.role === 'member'} onclick={disconnect}>{#if disconnecting}<LoaderCircle class="spin" size={15}/>{:else}<Unplug size={15}/>{/if} Disconnect</button>
          </div>
        </article>

        <aside class="card"><span class="eyebrow">STEP 1 SAFETY</span><h3>Read and verify. Nothing destructive.</h3><ul><li><Check size={15}/>Identify the connected seller</li><li><Check size={15}/>Refresh OAuth tokens automatically</li><li><Check size={15}/>Verify Inventory API access</li><li><Check size={15}/>Prepare orders + finances sync</li></ul><p class="safe"><ShieldCheck size={17}/><span>Step 1 does <strong>not</strong> create, revise, end, refund, fulfill, or otherwise modify anything on eBay.</span></p></aside>
      </section>
    {:else}
      <section class="grid">
        <article class="card primary">
          <div class="card-head"><div><span class="eyebrow">CONFIGURATION</span><h2>Production OAuth</h2></div><span class:ready={data.configured} class="pill">{data.configured ? 'Configured' : 'Needs secrets'}</span></div>
          <div class="checks">
            <span class:done={data.config.clientId}>{#if data.config.clientId}<Check size={15}/>{:else}<KeyRound size={15}/>{/if}<strong>EBAY_CLIENT_ID</strong></span>
            <span class:done={data.config.clientSecret}>{#if data.config.clientSecret}<Check size={15}/>{:else}<KeyRound size={15}/>{/if}<strong>EBAY_CLIENT_SECRET</strong></span>
            <span class:done={data.config.redirectUri}>{#if data.config.redirectUri}<Check size={15}/>{:else}<Link2 size={15}/>{/if}<strong>EBAY_REDIRECT_URI</strong><small>RuName</small></span>
            <span class:done={data.config.encryptionKey}>{#if data.config.encryptionKey}<Check size={15}/>{:else}<LockKeyhole size={15}/>{/if}<strong>EBAY_TOKEN_ENCRYPTION_KEY</strong></span>
          </div>
          <div class="callback"><span><small>AUTH ACCEPTED URL</small><strong>{data.callbackUrl}</strong></span><button onclick={copyCallback}>{#if copied}<Check size={15}/> Copied{:else}<Clipboard size={15}/> Copy{/if}</button></div>
          <p class="help">In eBay Developer Portal, use the URL above for both <strong>Auth Accepted URL</strong> and <strong>Auth Declined URL</strong>. Put the generated <strong>RuName itself</strong> in <code>EBAY_REDIRECT_URI</code>. For local development, set <code>EBAY_CALLBACK_URL</code> to your deployed HTTPS callback before copying this value.</p>
          {#if data.configured}<a class="connect" href="/api/ebay/connect"><PlugZap size={17}/> Connect eBay</a>{:else}<button class="connect" disabled><KeyRound size={17}/> Finish configuration first</button>{/if}
        </article>

        <aside class="card"><span class="eyebrow">SECURITY MODEL</span><h3>The browser never stores your eBay tokens.</h3><ul><li><LockKeyhole size={15}/>AES-GCM encrypted before D1 storage</li><li><ShieldCheck size={15}/>OAuth state checked against CSRF</li><li><RefreshCw size={15}/>Refresh token handled server-side</li></ul></aside>
      </section>
    {/if}

    <section class="card permissions"><div><span class="eyebrow">AUTHORIZATION</span><h2>Read-only automation scopes</h2></div><div class="scope-list">{#each data.requestedScopes as scope}<span><Check size={14}/>{scopeLabel(scope)}</span>{/each}</div><p>We are deliberately starting read-only. Listing writes come later, after sync reconciliation is proven.</p></section>
  </main>
</div>

<style>
  :global(body){margin:0;background:radial-gradient(circle at 75% -10%,#0069e31a 0,transparent 34rem),#050b14;color:#f4f8ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.shell{min-height:100vh}*{box-sizing:border-box}header{min-height:66px;display:flex;align-items:center;justify-content:space-between;padding:10px max(22px,calc((100vw - 1240px)/2));border-bottom:1px solid #17304a;background:#06101bd9}header a,header span{display:inline-flex;align-items:center;gap:7px}header a{color:#9ab0c2;font-size:.82rem;font-weight:800}header>span{border:1px solid #1c4a62;border-radius:999px;padding:6px 10px;color:#68e4d5;background:#08212b;font:800 .64rem ui-monospace,monospace;letter-spacing:.07em}main{width:min(1240px,calc(100% - 42px));margin:0 auto;padding:48px 0 80px}.eyebrow{color:#01d4a5;font:850 .69rem ui-monospace,monospace;letter-spacing:.12em}.hero{display:grid;grid-template-columns:1fr auto;gap:40px;align-items:end;margin-bottom:22px}h1{margin:8px 0 10px;font-size:clamp(2.9rem,5.5vw,5rem);line-height:.92;letter-spacing:-.055em}.hero p{max-width:700px;margin:0;color:#8399ac;font-size:.92rem;line-height:1.65}.state-card{min-width:260px;display:flex;align-items:center;gap:11px;border:1px solid #28435a;border-radius:12px;padding:14px;background:#0a1722;color:#7891a4}.state-card.connected{border-color:#176051;background:#08231f;color:#68e3d1}.state-card span{display:flex;flex-direction:column}.state-card small{font:800 .52rem ui-monospace,monospace;letter-spacing:.08em}.state-card strong{margin-top:2px;color:#eef8ff;font-size:.84rem}.state-card em{margin-top:2px;font-size:.65rem;font-style:normal}.notice{display:flex;align-items:center;gap:8px;margin-bottom:12px;border-radius:9px;padding:10px 12px;font-size:.75rem}.notice.ok{border:1px solid #17605b;color:#74e2d0;background:#08231f}.notice.bad{border:1px solid #663840;color:#efa1a8;background:#281419}.grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,.65fr);gap:13px;align-items:start}.card{border:1px solid #19364d;border-radius:14px;padding:20px;background:linear-gradient(145deg,#0c1927,#09131f)}.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.card-head>div{display:flex;flex-direction:column;gap:4px}h2{margin:0;font-size:1.35rem;letter-spacing:-.025em}h3{margin:7px 0 15px;font-size:1.05rem}.pill{border:1px solid #315067;border-radius:999px;padding:5px 8px;color:#7e96a9;background:#0b1924;font:850 .54rem ui-monospace,monospace;text-transform:uppercase}.pill.ready,.pill:not(.bad){border-color:#176051;color:#66dec8;background:#09231f}.pill.bad{border-color:#63363d;color:#e98b94;background:#251419}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:18px}.facts span{display:flex;flex-direction:column;gap:4px;border:1px solid #18364b;border-radius:8px;padding:10px;background:#07131e}.facts small{color:#5e7c91;font-size:.61rem}.facts strong{overflow:hidden;font-size:.76rem;text-overflow:ellipsis;white-space:nowrap}.token{display:flex;gap:10px;align-items:center;margin-top:12px;border:1px solid #1a4658;border-radius:9px;padding:12px;background:#071923;color:#64d5df}.token span{display:flex;flex-direction:column;gap:3px}.token small{font:800 .55rem ui-monospace,monospace;letter-spacing:.07em}.token strong{color:#e8f3f9;font-size:.76rem}.token em{color:#678398;font-size:.64rem;font-style:normal}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}.actions button,.actions a,.connect{min-height:41px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:8px;padding:0 13px;font:inherit;font-size:.73rem;font-weight:900;cursor:pointer}.primary-btn,.connect{border:0;color:#03131a;background:linear-gradient(135deg,#0069e3,#01d0e9 56%,#01d4a5)}.secondary-btn{border:1px solid #24526d;color:#bfd4e0;background:#0b2030}.danger-btn{border:1px solid #4d343a;color:#c88890;background:#1d1418}.actions button:disabled,.connect:disabled{opacity:.4;cursor:not-allowed}.card ul{display:grid;gap:0;margin:0;padding:0;list-style:none}.card li{display:flex;align-items:center;gap:8px;border-bottom:1px solid #173047;padding:10px 0;color:#a6bbc9;font-size:.71rem}.card li:last-child{border-bottom:0}.card li :global(svg){color:#01d4a5}.safe{display:flex;gap:8px;margin:14px 0 0;border:1px solid #175661;border-radius:9px;padding:10px;color:#6fd8cd;background:#08242b;font-size:.67rem;line-height:1.5}.safe :global(svg){flex:0 0 auto}.safe strong{color:#d9f3f0}.checks{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:18px}.checks span{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:center;border:1px solid #273b4d;border-radius:8px;padding:10px;color:#748da0;background:#0a151f}.checks span.done{border-color:#17554f;color:#6fd9c8;background:#09201d}.checks :global(svg){grid-row:1/3}.checks strong{font:800 .62rem ui-monospace,monospace}.checks small{font-size:.58rem}.callback{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-top:12px;border:1px solid #1b4b61;border-radius:9px;padding:10px;background:#071923}.callback span{min-width:0;display:flex;flex-direction:column;gap:3px}.callback small{color:#5c8092;font:800 .52rem ui-monospace,monospace}.callback strong{overflow:hidden;color:#a7c2cf;font:700 .67rem ui-monospace,monospace;text-overflow:ellipsis;white-space:nowrap}.callback button{min-height:34px;display:flex;align-items:center;gap:5px;border:1px solid #24526d;border-radius:7px;color:#9dc7d6;background:#0b2030;font-size:.64rem;font-weight:800}.help{color:#71899c;font-size:.7rem;line-height:1.55}.help strong{color:#b6cad7}code{border-radius:4px;padding:2px 4px;color:#78e3d3;background:#08242b;font-family:ui-monospace,monospace}.permissions{margin-top:13px}.permissions>div:first-child{display:flex;flex-direction:column;gap:4px}.scope-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}.scope-list span{display:flex;align-items:center;gap:6px;border:1px solid #1b4b58;border-radius:999px;padding:6px 9px;color:#91b7bd;background:#081d25;font-size:.65rem}.scope-list :global(svg){color:#01d4a5}.permissions p{margin:13px 0 0;color:#71899c;font-size:.68rem}:global(.spin){animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:900px){.hero,.grid{grid-template-columns:1fr}.state-card{width:fit-content}.facts{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){main{width:min(100% - 24px,1240px);padding-top:32px}header{padding-inline:12px}header>span{display:none}h1{font-size:2.8rem}.facts,.checks{grid-template-columns:1fr}}
</style>
