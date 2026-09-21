<script lang="ts">
  import { ArrowLeft, Check, LifeBuoy, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from '@lucide/svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let email = $state('');
  let emailSeeded = $state(false);
  let category = $state('general');
  let subject = $state('');
  let message = $state('');
  let website = $state('');
  let saving = $state(false);
  let notice = $state<string | null>(null);
  let bad = $state(false);
  let sent = $state(false);

  $effect(() => {
    if (emailSeeded) return;
    email = data.email ?? '';
    emailSeeded = true;
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    notice = null;
    bad = false;

    const response = await fetch('/api/support', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, category, subject, message, website })
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    saving = false;

    if (!response.ok) {
      bad = true;
      notice = result.error ?? 'Could not send your support request.';
      return;
    }

    sent = true;
    notice = 'Your support request was sent.';
    subject = '';
    message = '';
  }
</script>

<svelte:head>
  <title>Support · Sellquity</title>
  <meta name="description" content="Get help with your Sellquity account, marketplace connection, imports, inventory, or reporting." />
</svelte:head>

<div class="public-page">
  {#if !data.signedIn}
    <header>
      <a class="brand" href="/"><span class="mark"><img src="/s-no-bg.png" alt="" /></span><strong>SELLQUITY</strong></a>
      <a class="back" href="/login"><ArrowLeft size={15} /> Sign in</a>
    </header>
  {/if}

  <main>
    <section class="hero">
      <span class="eyebrow">SUPPORT</span>
      <h1>Tell us what’s getting in your way.</h1>
      <p>Account trouble, eBay sync questions, imports, inventory, or numbers that don’t look right — send the details here and keep the request tied to one place.</p>
    </section>

    <section class="layout">
      <article class="card form-card">
        <div class="card-head"><LifeBuoy size={20} /><div><span class="eyebrow">CONTACT SUPPORT</span><h2>Send a request</h2></div></div>

        {#if notice}
          <div class:bad class="notice">{#if !bad}<Check size={15} />{/if}{notice}</div>
        {/if}

        {#if !sent}
          <form onsubmit={submit}>
            <label><span>Email</span><input type="email" bind:value={email} autocomplete="email" required /></label>
            <label><span>What do you need help with?</span>
              <select bind:value={category}>
                <option value="general">General question</option>
                <option value="account">Account & sign in</option>
                <option value="ebay">eBay connection or sync</option>
                <option value="imports">Imports</option>
                <option value="inventory">Inventory & listing prep</option>
                <option value="sales">Sales & purchase costs</option>
                <option value="money">Money & reporting</option>
                <option value="bug">Something looks broken</option>
              </select>
            </label>
            <label><span>Subject</span><input bind:value={subject} maxlength="140" placeholder="Short summary" required /></label>
            <label><span>Details</span><textarea bind:value={message} maxlength="4000" rows="7" placeholder="What happened? What did you expect? Include an order ID or SKU if it helps." required></textarea></label>
            <label class="honeypot" aria-hidden="true"><span>Website</span><input bind:value={website} tabindex="-1" autocomplete="off" /></label>
            <button class="primary" disabled={saving}>
              {#if saving}<LoaderCircle class="spin" size={16} />{:else}<Mail size={16} />{/if}
              {saving ? 'Sending…' : 'Send support request'}
            </button>
          </form>
        {:else}
          <div class="sent-state"><Check size={28} /><strong>Request received.</strong><p>You can head back to Sellquity. Your message is stored with the workspace context available at the time you sent it.</p><a class="secondary" href={data.signedIn ? '/' : '/login'}>{data.signedIn ? 'Back to Sellquity' : 'Return to sign in'}</a></div>
        {/if}
      </article>

      <aside class="stack">
        <article class="card"><div class="card-head"><ShieldCheck size={19} /><div><span class="eyebrow">GOOD TO INCLUDE</span><h2>Help us reproduce it</h2></div></div><p>For data questions, include the marketplace, order ID, SKU, date range, and what number or status looks wrong. Never send passwords or eBay tokens.</p></article>
        <article class="card"><div class="card-head"><LockKeyhole size={19} /><div><span class="eyebrow">ACCOUNT SAFETY</span><h2>Locked out?</h2></div></div><p>This page works without signing in. Use the email address attached to your Sellquity account so the request can be matched safely.</p></article>
        <article class="card links"><a href="/privacy">Privacy policy</a><a href="/terms">Terms of service</a></article>
      </aside>
    </section>
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #070c12; color: #eef6f3; }
  * { box-sizing: border-box; }
  .public-page { min-height: 100vh; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: radial-gradient(circle at 75% -10%, #0069e315 0, transparent 32rem), #070c12; }
  header { min-height: 64px; display:flex; align-items:center; justify-content:space-between; gap:20px; padding:10px max(20px, calc((100vw - 1100px)/2)); border-bottom:1px solid #1c2c38; background:#081019e8; }
  .brand,.back { display:inline-flex; align-items:center; gap:8px; color:#dfeae5; text-decoration:none; }
  .brand { letter-spacing:.1em; font-size:.8rem; }
  .back { color:#8297a5; font-size:.72rem; font-weight:800; }
  .mark { width:32px; height:32px; display:grid; place-items:center; overflow:hidden; border:1px solid #185778; border-radius:8px; background:#081b2b; }
  .mark img { width:88%; height:88%; object-fit:contain; }
  main { width:min(1100px, calc(100% - 32px)); margin:0 auto; padding:52px 0 76px; }
  .hero { max-width:760px; margin-bottom:24px; }
  .eyebrow { color:#01d4a5; font:850 .64rem ui-monospace, monospace; letter-spacing:.12em; }
  h1 { margin:8px 0 10px; font-size:clamp(2.3rem,5vw,4rem); line-height:.98; letter-spacing:-.045em; }
  .hero p,.card p { color:#7d919e; line-height:1.6; font-size:.8rem; }
  .layout { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(280px,.7fr); gap:14px; align-items:start; }
  .stack { display:grid; gap:14px; }
  .card { border:1px solid #223746; border-radius:14px; padding:20px; background:#0b141d; }
  .card-head { display:flex; align-items:center; gap:9px; margin-bottom:15px; }
  .card-head :global(svg) { color:#01d4a5; }
  h2 { margin:3px 0 0; font-size:1rem; }
  form { display:grid; gap:12px; }
  label { display:grid; gap:6px; color:#adbbc4; font-size:.7rem; font-weight:800; }
  input,select,textarea { width:100%; border:1px solid #294457; border-radius:9px; padding:10px 11px; outline:0; color:#eff8f5; background:#071019; font:inherit; }
  input:focus,select:focus,textarea:focus { border-color:#147a91; box-shadow:0 0 0 3px #01d0e90e; }
  textarea { resize:vertical; }
  button,.secondary { min-height:40px; display:inline-flex; align-items:center; justify-content:center; gap:7px; border-radius:8px; padding:0 14px; font:inherit; font-size:.72rem; font-weight:900; cursor:pointer; text-decoration:none; }
  .primary { border:0; color:#041319; background:#01d4a5; }
  .secondary { width:fit-content; border:1px solid #344b5a; color:#c6d4da; background:#0e1a23; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  .notice { display:flex; align-items:center; gap:7px; margin-bottom:13px; border:1px solid #17605b; border-radius:9px; padding:10px 11px; color:#7be6d5; background:#08231f; font-size:.73rem; }
  .notice.bad { border-color:#663840; color:#efa1a8; background:#281419; }
  .sent-state { min-height:260px; display:grid; place-items:center; align-content:center; gap:8px; text-align:center; color:#738b98; }
  .sent-state :global(svg) { color:#01d4a5; }
  .sent-state strong { color:#e8f4ef; }
  .sent-state p { max-width:520px; margin:0 0 8px; }
  .links { display:flex; flex-direction:column; gap:8px; }
  .links a { color:#91a9b7; text-decoration:none; font-size:.72rem; font-weight:800; }
  .links a:hover,.back:hover { color:#01d4a5; }
  .honeypot { position:absolute; left:-10000px; width:1px; height:1px; overflow:hidden; }
  :global(.spin) { animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media(max-width:760px){ .layout{grid-template-columns:1fr;} main{padding-top:34px;} header{padding-inline:14px;} }
</style>
