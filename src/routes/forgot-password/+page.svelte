<script lang="ts">
  import { ArrowLeft, Check, LoaderCircle, Mail } from '@lucide/svelte';
  import { authClient } from '$lib/auth-client';

  let { data } = $props<{ data: { devMailbox: boolean } }>();

  let email = $state('');
  let busy = $state(false);
  let sent = $state(false);
  let message = $state<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = null;

    if (!email.trim()) {
      message = 'Enter the email address on your Nettiva account.';
      return;
    }

    busy = true;
    const result = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/reset-password`
    });
    busy = false;

    // Keep the response deliberately generic so this page never becomes an
    // account-enumeration oracle.
    sent = true;
    message = result.error
      ? 'If that email belongs to a Nettiva account, a reset link will be sent.'
      : 'If that email belongs to a Nettiva account, a reset link has been sent.';
  }
</script>

<svelte:head>
  <title>Reset password · Nettiva</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="shell">
  <main class="card">
    <a class="back" href="/login"><ArrowLeft size={15} /> Back to sign in</a>
    <span class="mark">N</span>
    <span class="kicker">ACCOUNT RECOVERY</span>
    <h1>Forgot your password?</h1>
    <p>Enter your login email. Nettiva will send a one-time reset link if the account exists.</p>

    <form onsubmit={submit}>
      <label>
        <span>Email</span>
        <div class="input-wrap"><Mail size={17} /><input bind:value={email} type="email" autocomplete="email" placeholder="you@example.com" /></div>
      </label>
      {#if message}<div class:success={sent} class="message">{message}</div>{/if}
      <button disabled={busy}>
        {#if busy}<LoaderCircle class="spin" size={17} />{:else if sent}<Check size={17} />{:else}<Mail size={17} />{/if}
        {sent ? 'Send another link' : 'Send reset link'}
      </button>
    </form>

{#if data.devMailbox}<a class="mailbox" href="/dev/mailbox">Local development mailbox →</a>{/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; }
  .shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #070b10; color: #e8eee9; }
  .card { width: min(420px, 100%); border: 1px solid #303b46; border-radius: 18px; padding: 28px; background: #0e141a; box-shadow: 0 32px 90px #0008; }
  .back { display: inline-flex; align-items: center; gap: 5px; color: #82909c; text-decoration: none; font-size: .72rem; }
  .back:hover, .mailbox:hover { color: #b8f34a; }
  .mark { width: 38px; height: 38px; display: grid; place-items: center; margin: 26px 0 18px; border-radius: 9px; background: #b8f34a; color: #081006; font-weight: 950; }
  .kicker { color: #b8f34a; font: 800 .67rem Consolas, monospace; letter-spacing: .14em; }
  h1 { margin: 7px 0 8px; font-size: 1.65rem; }
  p { margin: 0 0 22px; color: #7d8995; font-size: .79rem; line-height: 1.55; }
  form { display: grid; gap: 13px; }
  label { display: grid; gap: 6px; color: #aeb8c1; font-size: .75rem; font-weight: 700; }
  .input-wrap { height: 43px; display: flex; align-items: center; gap: 9px; border: 1px solid #34404b; border-radius: 9px; padding: 0 11px; background: #090e13; }
  .input-wrap :global(svg) { color: #697682; }
  input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: #eff5f0; font: inherit; }
  button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 9px; background: #b8f34a; color: #091006; font-weight: 900; cursor: pointer; }
  button:disabled { opacity: .45; }
  .message { border: 1px solid #5b2d34; border-radius: 8px; padding: 9px 10px; color: #ff9ca3; background: #281419; font-size: .72rem; line-height: 1.45; }
  .message.success { border-color: #355327; color: #c5e99a; background: #172313; }
  .mailbox { display: block; margin-top: 16px; color: #6e7b86; text-align: center; text-decoration: none; font-size: .68rem; }
  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
