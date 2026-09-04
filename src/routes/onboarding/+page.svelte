<script lang="ts">
  import {
    ArrowRight,
    Boxes,
    Check,
    ExternalLink,
    LoaderCircle,
    PlugZap,
    RefreshCw,
    ShieldCheck,
    Tag
  } from '@lucide/svelte';

  type Step = 'workspace' | 'ebay' | 'inventory' | 'complete';
  type Workspace = {
    id: string;
    name: string;
    plan: string;
    onboardingStep: Step;
    countryCode: string;
    currencyCode: string;
    ebayConnectDeferred: number;
  };

  let { data } = $props<{
    data: {
      workspace: Workspace | null;
      connected: boolean;
      inventoryCount: number;
      reservationCount: number;
    };
  }>();

  let businessName = $state('');
  let countryCode = $state('US');
  let currencyCode = $state('USD');
  let busy = $state(false);
  let message = $state<string | null>(null);

  $effect(() => {
    businessName = data.workspace?.name ?? '';
    countryCode = data.workspace?.countryCode ?? 'US';
    currencyCode = data.workspace?.currencyCode ?? 'USD';
  });

  const step = $derived(data.workspace?.onboardingStep ?? 'workspace');
  const stepNumber = $derived(step === 'workspace' ? 1 : step === 'ebay' ? 2 : step === 'inventory' ? 3 : 4);

  async function patch(body: Record<string, unknown>) {
    busy = true;
    message = null;
    const response = await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    busy = false;
    if (!response.ok) {
      message = result.error || 'Could not update onboarding.';
      return false;
    }
    window.location.reload();
    return true;
  }

  async function saveWorkspace(event: SubmitEvent) {
    event.preventDefault();
    await patch({ action: 'workspace', name: businessName, countryCode, currencyCode });
  }

  async function continueEbay(skip: boolean) {
    await patch({ action: 'ebay', skip });
  }

  async function finish() {
    busy = true;
    const response = await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'finish' })
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    busy = false;
    if (!response.ok) {
      message = result.error || 'Could not finish onboarding.';
      return;
    }
    window.location.assign('/');
  }

  async function restart() {
    await patch({ action: 'restart' });
  }
</script>

<svelte:head>
  <title>Set up your workspace · Nettiva</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="shell">
  <header>
    <a class="brand" href="/"><span>N</span><strong>NETTIVA</strong></a>
    <a class="account" href="/account">Account & security</a>
  </header>

  <main>
    <section class="intro">
      <span class="kicker">WORKSPACE ONBOARDING</span>
      <h1>{step === 'complete' ? 'Your workspace is ready.' : 'Set Nettiva up around your business.'}</h1>
      <p>This wizard creates the minimum business context Nettiva needs before automated marketplace data starts flowing.</p>
    </section>

    <div class="progress" aria-label="Onboarding progress">
      {#each [1, 2, 3] as number}
        <span class:active={stepNumber === number} class:done={stepNumber > number}>{stepNumber > number ? '✓' : number}</span>
        {#if number < 3}<i class:done={stepNumber > number}></i>{/if}
      {/each}
    </div>

    {#if message}<div class="message">{message}</div>{/if}

    {#if step === 'workspace'}
      <section class="card">
        <div class="icon"><ShieldCheck size={24} /></div>
        <span class="kicker">STEP 1 OF 3</span>
        <h2>Business identity</h2>
        <p>Name the workspace that owns this inventory, accounting, eBay connection, and SKU namespace.</p>
        <form onsubmit={saveWorkspace}>
          <label class="wide"><span>Business / workspace name</span><input bind:value={businessName} maxlength="80" placeholder="Rare Frequency" required /></label>
          <label><span>Country</span><input bind:value={countryCode} maxlength="2" /></label>
          <label><span>Currency</span><input bind:value={currencyCode} maxlength="3" /></label>
          <button class="primary wide" disabled={busy || businessName.trim().length < 2}>
            {#if busy}<LoaderCircle class="spin" size={17} />{:else}<ArrowRight size={17} />{/if}
            Continue to eBay
          </button>
        </form>
      </section>

    {:else if step === 'ebay'}
      <section class="card">
        <div class="icon"><PlugZap size={24} /></div>
        <span class="kicker">STEP 2 OF 3</span>
        <h2>{data.connected ? 'eBay is connected' : 'Connect your eBay seller account'}</h2>
        <p>
          {data.connected
            ? 'This workspace already has an encrypted eBay OAuth connection. You can continue.'
            : 'Connecting eBay will eventually let Nettiva pull listings, scheduled listings, orders, and finances directly. You can skip this while API approval is pending.'}
        </p>

        <div class="ebay-state" class:connected={data.connected}>
          <PlugZap size={18} />
          <span><strong>{data.connected ? 'Connected' : 'Not connected'}</strong>{data.connected ? 'OAuth credentials belong to this workspace.' : 'No eBay OAuth account is attached yet.'}</span>
        </div>

        <div class="actions">
          {#if data.connected}
            <button class="primary" disabled={busy} onclick={() => continueEbay(false)}>
              {#if busy}<LoaderCircle class="spin" size={17} />{:else}<ArrowRight size={17} />{/if}
              Continue
            </button>
          {:else}
            <a class="primary link-button" href="/api/ebay/connect"><ExternalLink size={17} /> Connect eBay</a>
            <button class="secondary" disabled={busy} onclick={() => continueEbay(true)}>
              Do this later
            </button>
          {/if}
        </div>
      </section>

    {:else if step === 'inventory'}
      <section class="card">
        <div class="icon"><Boxes size={24} /></div>
        <span class="kicker">STEP 3 OF 3</span>
        <h2>Inventory identity</h2>
        <p>Nettiva uses stable SKU/custom-label identities so purchase cost survives listing-title changes and future eBay reconciliation.</p>

        <div class="stats">
          <div><Boxes size={18} /><span><strong>{data.inventoryCount}</strong> inventory records</span></div>
          <div><Tag size={18} /><span><strong>{data.reservationCount}</strong> SKU reservations</span></div>
        </div>

        <div class="convention">
          <strong>Current convention</strong>
          <p>Category prefix + permanent sequence, such as AFG-0001, MOV-0001, ELC-0001. Numbers never recycle.</p>
          <small>Custom per-workspace prefix editing comes in the dedicated SKU preferences pass; this wizard confirms the identity model without changing established numbers.</small>
        </div>

        <button class="primary full" disabled={busy} onclick={finish}>
          {#if busy}<LoaderCircle class="spin" size={17} />{:else}<Check size={17} />{/if}
          Finish onboarding
        </button>
      </section>

    {:else}
      <section class="card complete-card">
        <div class="complete-icon"><Check size={30} /></div>
        <span class="kicker">SETUP COMPLETE</span>
        <h2>{data.workspace?.name ?? 'Your workspace'} is ready</h2>
        <p>Authentication, tenant isolation, recovery infrastructure, and workspace onboarding are all in place.</p>
        <div class="actions center">
          <a class="primary link-button" href="/">Open Nettiva</a>
          <button class="secondary" disabled={busy} onclick={restart}><RefreshCw size={16} /> Run wizard again</button>
        </div>
      </section>
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #080c10; }
  .shell { min-height: 100vh; background: #080c10; color: #e7eee8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  header { height: 62px; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; border-bottom: 1px solid #202a33; background: #0b1015; }
  .brand { display: flex; align-items: center; gap: 9px; color: #eaf0eb; text-decoration: none; letter-spacing: .1em; font-size: .8rem; }
  .brand span { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 7px; background: #b8f34a; color: #081006; font-weight: 950; }
  .account { color: #82909c; text-decoration: none; font-size: .72rem; }
  .account:hover { color: #b8f34a; }
  main { width: min(660px, calc(100% - 32px)); margin: 0 auto; padding: 54px 0 80px; }
  .intro { text-align: center; margin-bottom: 24px; }
  .kicker { color: #b8f34a; font: 800 .65rem Consolas, monospace; letter-spacing: .13em; }
  h1 { margin: 8px 0 10px; font-size: clamp(2rem, 6vw, 3.1rem); line-height: 1.02; letter-spacing: -.045em; }
  .intro p, .card > p { color: #7e8a95; font-size: .79rem; line-height: 1.6; }
  .progress { display: flex; align-items: center; justify-content: center; margin: 28px 0; }
  .progress span { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid #35414c; border-radius: 99px; color: #71808c; background: #0d1318; font-size: .72rem; font-weight: 850; }
  .progress span.active, .progress span.done { border-color: #769e3c; color: #0b1208; background: #b8f34a; }
  .progress i { width: 58px; height: 1px; background: #2b363f; }
  .progress i.done { background: #769e3c; }
  .card { position: relative; border: 1px solid #2b3741; border-radius: 16px; padding: 26px; background: #0e141a; box-shadow: 0 30px 90px #0006; }
  .icon, .complete-icon { width: 46px; height: 46px; display: grid; place-items: center; margin-bottom: 18px; border-radius: 11px; color: #b8f34a; background: #1a2814; }
  h2 { margin: 6px 0 8px; font-size: 1.42rem; }
  form { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; margin-top: 20px; }
  label { display: grid; gap: 6px; color: #aab4bd; font-size: .72rem; font-weight: 700; }
  .wide { grid-column: 1 / -1; }
  input { width: 100%; box-sizing: border-box; border: 1px solid #35414c; border-radius: 8px; padding: 10px 11px; outline: 0; background: #090e13; color: #edf3ee; font: inherit; text-transform: none; }
  label:not(.wide) input { text-transform: uppercase; }
  input:focus { border-color: #779f3d; box-shadow: 0 0 0 1px #779f3d55; }
  button, .link-button { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 8px; padding: 0 14px; font: inherit; font-size: .73rem; font-weight: 850; text-decoration: none; cursor: pointer; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .primary { border: 0; background: #b8f34a; color: #091006; }
  .secondary { border: 1px solid #384550; background: #121920; color: #c7d0d7; }
  .actions { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 20px; }
  .actions.center { justify-content: center; }
  .full { width: 100%; margin-top: 18px; }
  .ebay-state, .stats > div, .convention { border: 1px solid #303c46; border-radius: 10px; background: #0a1015; }
  .ebay-state { display: flex; align-items: flex-start; gap: 9px; margin-top: 18px; padding: 12px; color: #8f9aa4; font-size: .72rem; }
  .ebay-state.connected { border-color: #365329; color: #b8d88f; background: #151f12; }
  .ebay-state span { display: flex; flex-direction: column; gap: 2px; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 18px 0 10px; }
  .stats > div { display: flex; align-items: center; gap: 9px; padding: 13px; color: #87949f; font-size: .72rem; }
  .stats :global(svg) { color: #b8f34a; }
  .stats strong { color: #e5ece6; font-size: 1rem; }
  .convention { padding: 14px; }
  .convention > strong { color: #dfe7e1; font-size: .78rem; }
  .convention p { margin: 5px 0; color: #8a97a2; font-size: .73rem; line-height: 1.5; }
  .convention small { color: #65727d; font-size: .66rem; line-height: 1.5; }
  .complete-card { text-align: center; }
  .complete-icon { margin-inline: auto; }
  .message { margin-bottom: 14px; border: 1px solid #5b2d34; border-radius: 9px; padding: 10px 12px; color: #ff9ca3; background: #281419; font-size: .73rem; }
  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 560px) { header { padding: 0 16px; } form { grid-template-columns: 1fr; } .wide { grid-column: auto; } .stats { grid-template-columns: 1fr; } }
</style>
