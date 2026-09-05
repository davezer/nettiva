<script lang="ts">
  import { Check, KeyRound, LoaderCircle } from '@lucide/svelte';
  import { authClient } from '$lib/auth-client';

  let { data } = $props<{ data: { token: string; invalid: boolean } }>();
  let password = $state('');
  let confirm = $state('');
  let busy = $state(false);
  let complete = $state(false);
  let message = $state<string | null>(null);
  let initialStateApplied = $state(false);

  $effect(() => {
    if (!initialStateApplied) {
      message = data.invalid ? 'This reset link is invalid or expired.' : null;
      initialStateApplied = true;
    }
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = null;

    if (!data.token) {
      message = 'This reset link is missing its security token.';
      return;
    }
    if (password.length < 12) {
      message = 'Use a password of at least 12 characters.';
      return;
    }
    if (password !== confirm) {
      message = 'The two passwords do not match.';
      return;
    }

    busy = true;
    const result = await authClient.resetPassword({
      newPassword: password,
      token: data.token
    });
    busy = false;

    if (result.error) {
      message = result.error.message || 'Could not reset the password.';
      return;
    }

    complete = true;
    password = '';
    confirm = '';
    message = 'Password changed. Other Sellquity sessions were revoked.';
  }
</script>

<svelte:head>
  <title>Choose a new password · Sellquity</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="shell">
  <main class="card">
    <span class="mark sellquity-icon-mark"><img src="/s-no-bg.png" alt="" aria-hidden="true" /></span>
    <span class="kicker">SECURE RESET</span>
    <h1>Choose a new password</h1>
    <p>Use at least 12 characters. Resetting your password revokes other active sessions.</p>

    {#if complete}
      <div class="success"><Check size={18} /> <span>{message}</span></div>
      <a class="primary-link" href="/login">Return to sign in</a>
    {:else}
      <form onsubmit={submit}>
        <label><span>New password</span><div class="input-wrap"><KeyRound size={17} /><input bind:value={password} type="password" autocomplete="new-password" /></div></label>
        <label><span>Confirm password</span><div class="input-wrap"><KeyRound size={17} /><input bind:value={confirm} type="password" autocomplete="new-password" /></div></label>
        {#if message}<div class="message">{message}</div>{/if}
        <button disabled={busy || data.invalid || !data.token}>
          {#if busy}<LoaderCircle class="spin" size={17} />{:else}<Check size={17} />{/if}
          Reset password
        </button>
      </form>
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; }
  .shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #070b10; color: #e8eee9; }
  .card { width: min(420px, 100%); border: 1px solid #303b46; border-radius: 18px; padding: 28px; background: #0e141a; box-shadow: 0 32px 90px #0008; }
  .mark { width: 38px; height: 38px; display: grid; place-items: center; margin-bottom: 18px; border-radius: 9px; background: #01d4a5; color: #03131a; font-weight: 950; }
  .kicker { color: #01d4a5; font: 800 .67rem Consolas, monospace; letter-spacing: .14em; }
  h1 { margin: 7px 0 8px; font-size: 1.65rem; }
  p { margin: 0 0 22px; color: #7d8995; font-size: .79rem; line-height: 1.55; }
  form { display: grid; gap: 13px; }
  label { display: grid; gap: 6px; color: #aeb8c1; font-size: .75rem; font-weight: 700; }
  .input-wrap { height: 43px; display: flex; align-items: center; gap: 9px; border: 1px solid #34404b; border-radius: 9px; padding: 0 11px; background: #090e13; }
  .input-wrap :global(svg) { color: #697682; }
  input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: #eff5f0; font: inherit; }
  button, .primary-link { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 9px; background: #01d4a5; color: #03131a; font-weight: 900; text-decoration: none; cursor: pointer; }
  button:disabled { opacity: .45; }
  .message { border: 1px solid #5b2d34; border-radius: 8px; padding: 9px 10px; color: #ff9ca3; background: #281419; font-size: .72rem; }
  .success { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; border: 1px solid #15545a; border-radius: 9px; padding: 11px; color: #78f6dd; background: #0b252a; font-size: .75rem; }
  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }


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
