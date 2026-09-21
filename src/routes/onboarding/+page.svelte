<script lang="ts">
  import {
    ArrowRight,
    Check,
    ExternalLink,
    LoaderCircle,
    PlugZap,
    RefreshCw,
    ShieldCheck,
    Sparkles
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
      message = result.error || 'Could not update setup.';
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
    message = null;
    const response = await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'finish' })
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    busy = false;
    if (!response.ok) {
      message = result.error || 'Could not finish setup.';
      return;
    }
    window.location.assign('/');
  }

  async function restart() {
    await patch({ action: 'restart' });
  }
</script>

<svelte:head>
  <title>Set up Sellquity</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="shell">
  <header>
    <a class="brand" href="/"><span class="sellquity-icon-mark"><img src="/s-no-bg.png" alt="" aria-hidden="true" /></span><strong>SELLQUITY</strong></a>
    <a class="account" href="/account">Account & security</a>
  </header>

  <main>
    <section class="intro">
      <span class="kicker">GET STARTED</span>
      <h1>{step === 'complete' ? 'You’re ready to go.' : 'Set up Sellquity in a couple of minutes.'}</h1>
      <p>Tell us about your business, connect eBay if you want automatic syncing, and start tracking what you own and what you make.</p>
    </section>

    <div class="progress" aria-label="Setup progress">
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
        <h2>Tell us about your business</h2>
        <p>This is the name you’ll see throughout Sellquity. You can change your setup later.</p>

        <form onsubmit={saveWorkspace}>
          <label class="wide">
            <span>Business name</span>
            <input bind:value={businessName} maxlength="80" placeholder="Dave's Collectibles" required />
          </label>

          <label>
            <span>Country</span>
            <select bind:value={countryCode}>
              <option value="US">United States</option>
            </select>
          </label>

          <label>
            <span>Currency</span>
            <select bind:value={currencyCode}>
              <option value="USD">US Dollar (USD)</option>
            </select>
          </label>

          <button class="primary wide" disabled={busy || businessName.trim().length < 2}>
            {#if busy}<LoaderCircle class="spin" size={17} />{:else}<ArrowRight size={17} />{/if}
            Continue
          </button>
        </form>
      </section>

    {:else if step === 'ebay'}
      <section class="card">
        <div class="icon"><PlugZap size={24} /></div>
        <span class="kicker">STEP 2 OF 3</span>
        <h2>{data.connected ? 'eBay is connected' : 'Connect your eBay account'}</h2>
        <p>
          {data.connected
            ? 'Sellquity can now keep your eBay listings and sales data up to date.'
            : 'Connect eBay to automatically bring in listings, sales, fees, and marketplace activity. Sellquity does not edit your live listings.'}
        </p>

        <div class="ebay-state" class:connected={data.connected}>
          <PlugZap size={18} />
          <span>
            <strong>{data.connected ? 'Connected' : 'Not connected yet'}</strong>
            {data.connected ? 'Automatic eBay syncing is available.' : 'You can also skip this and connect eBay later from Settings.'}
          </span>
        </div>

        <div class="actions">
          {#if data.connected}
            <button class="primary" disabled={busy} onclick={() => continueEbay(false)}>
              {#if busy}<LoaderCircle class="spin" size={17} />{:else}<ArrowRight size={17} />{/if}
              Continue
            </button>
          {:else}
            <a class="primary link-button" href="/api/ebay/connect"><ExternalLink size={17} /> Connect eBay</a>
            <button class="secondary" disabled={busy} onclick={() => continueEbay(true)}>I’ll do this later</button>
          {/if}
        </div>
      </section>

    {:else if step === 'inventory'}
      <section class="card ready-card">
        <div class="icon"><Sparkles size={24} /></div>
        <span class="kicker">STEP 3 OF 3</span>
        <h2>Sellquity is ready</h2>
        <p>We’ll handle the behind-the-scenes inventory IDs and bookkeeping structure for you. You can just start using the app.</p>

        <div class="stats">
          <div><span><strong>{data.inventoryCount}</strong> inventory item{data.inventoryCount === 1 ? '' : 's'} ready</span></div>
          <div><span><strong>{data.connected ? 'On' : 'Off'}</strong> eBay sync</span></div>
        </div>

        <div class="convention">
          <strong>What happens next?</strong>
          <p>Start with Home to see your business at a glance, add purchases from Inventory, or connect eBay later from Settings.</p>
        </div>

        <button class="primary full" disabled={busy} onclick={finish}>
          {#if busy}<LoaderCircle class="spin" size={17} />{:else}<Check size={17} />{/if}
          Open Sellquity
        </button>
      </section>

    {:else}
      <section class="card complete-card">
        <div class="complete-icon"><Check size={30} /></div>
        <span class="kicker">SETUP COMPLETE</span>
        <h2>{data.workspace?.name ?? 'Your workspace'} is ready</h2>
        <p>You’re all set. Head to Home to see the current state of your resale business.</p>
        <div class="actions center">
          <a class="primary link-button" href="/">Open Sellquity</a>
          <button class="secondary" disabled={busy} onclick={restart}><RefreshCw size={16} /> Run setup again</button>
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
  .brand span { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 7px; background: #01d4a5; color: #03131a; font-weight: 950; }
  .account { color: #82909c; text-decoration: none; font-size: .72rem; }
  .account:hover { color: #01d4a5; }
  main { width: min(660px, calc(100% - 32px)); margin: 0 auto; padding: 54px 0 80px; }
  .intro { text-align: center; margin-bottom: 24px; }
  .kicker { color: #01d4a5; font: 800 .65rem Consolas, monospace; letter-spacing: .13em; }
  h1 { margin: 8px 0 10px; font-size: clamp(2rem, 6vw, 3.1rem); line-height: 1.02; letter-spacing: -.045em; }
  .intro p, .card > p { color: #7e8a95; font-size: .79rem; line-height: 1.6; }
  .progress { display: flex; align-items: center; justify-content: center; margin: 28px 0; }
  .progress span { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid #35414c; border-radius: 99px; color: #71808c; background: #0d1318; font-size: .72rem; font-weight: 850; }
  .progress span.active, .progress span.done { border-color: #0a8fc4; color: #0b1208; background: #01d4a5; }
  .progress i { width: 58px; height: 1px; background: #2b363f; }
  .progress i.done { background: #0a8fc4; }
  .card { position: relative; border: 1px solid #2b3741; border-radius: 16px; padding: 26px; background: #0e141a; box-shadow: 0 30px 90px #0006; }
  .icon, .complete-icon { width: 46px; height: 46px; display: grid; place-items: center; margin-bottom: 18px; border-radius: 11px; color: #01d4a5; background: #0c2730; }
  h2 { margin: 6px 0 8px; font-size: 1.42rem; }
  form { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; margin-top: 20px; }
  label { display: grid; gap: 6px; color: #aab4bd; font-size: .72rem; font-weight: 700; }
  .wide { grid-column: 1 / -1; }
  input, select { width: 100%; box-sizing: border-box; border: 1px solid #35414c; border-radius: 8px; padding: 10px 11px; outline: 0; background: #090e13; color: #edf3ee; font: inherit; }
  input:focus, select:focus { border-color: #0a8fc4; box-shadow: 0 0 0 1px #0a8fc455; }
  button, .link-button { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 8px; padding: 0 14px; font: inherit; font-size: .73rem; font-weight: 850; text-decoration: none; cursor: pointer; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .primary { border: 0; background: #01d4a5; color: #03131a; }
  .secondary { border: 1px solid #384550; background: #121920; color: #c7d0d7; }
  .actions { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 20px; }
  .actions.center { justify-content: center; }
  .full { width: 100%; margin-top: 18px; }
  .ebay-state, .stats > div, .convention { border: 1px solid #303c46; border-radius: 10px; background: #0a1015; }
  .ebay-state { display: flex; align-items: flex-start; gap: 9px; margin-top: 18px; padding: 12px; color: #8f9aa4; font-size: .72rem; }
  .ebay-state.connected { border-color: #15545a; color: #b8d88f; background: #151f12; }
  .ebay-state span { display: flex; flex-direction: column; gap: 2px; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 18px 0 10px; }
  .stats > div { display: flex; align-items: center; gap: 9px; padding: 13px; color: #87949f; font-size: .72rem; }
  .stats strong { color: #e5ece6; font-size: 1rem; }
  .convention { padding: 14px; }
  .convention > strong { color: #dfe7e1; font-size: .78rem; }
  .convention p { margin: 5px 0; color: #8a97a2; font-size: .73rem; line-height: 1.5; }
  .complete-card { text-align: center; }
  .complete-icon { margin-inline: auto; }
  .message { margin-bottom: 14px; border: 1px solid #5b2d34; border-radius: 9px; padding: 10px 12px; color: #ff9ca3; background: #281419; font-size: .73rem; }
  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 560px) { header { padding: 0 16px; } form { grid-template-columns: 1fr; } .wide { grid-column: auto; } .stats { grid-template-columns: 1fr; } }

  .sellquity-icon-mark {
    overflow: hidden;
    padding: 0 !important;
    background: linear-gradient(145deg, #071c31, #0b2840) !important;
    border: 1px solid #185778 !important;
    box-shadow: 0 8px 24px #0069e326 !important;
  }

  .sellquity-icon-mark img {
    width: 88%;
    height: 88%;
    display: block;
    object-fit: contain;
  }
</style>
