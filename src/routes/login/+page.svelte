<script lang="ts">
  import {
    Check,
    KeyRound,
    LoaderCircle,
    LockKeyhole,
    Mail,
    UserRound
  } from '@lucide/svelte';
  import { authClient } from '$lib/auth-client';

  let { data } = $props<{
    data: {
      returnTo: string;
      canSignUp: boolean;
      signupMode: 'closed' | 'founder' | 'open';
      authConfigured: boolean;
      requiresEmailVerification: boolean;
      devMailbox: boolean;
    };
  }>();

  let createMode = $state(false);
  let name = $state('');
  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let message = $state<string | null>(null);
  let success = $state(false);

  $effect(() => {
    if (data.canSignUp && data.signupMode === 'founder') {
      createMode = true;
    }
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = null;
    success = false;

    if (!data.authConfigured) {
      message = 'Auth is not configured yet. Add BETTER_AUTH_SECRET to .dev.vars.';
      return;
    }

    if (!email.trim() || password.length < 12 || (createMode && name.trim().length < 2)) {
      message = createMode
        ? 'Enter your name, email, and a password of at least 12 characters.'
        : 'Enter your email and password.';
      return;
    }

    busy = true;

    const result = createMode
      ? await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: data.returnTo
        })
      : await authClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: data.returnTo
        });

    busy = false;

    if (result.error) {
      message = result.error.message || 'Authentication failed.';
      return;
    }

    if (createMode && data.requiresEmailVerification) {
      success = true;
      message = 'Account created. Verify your email, then sign in.';
      createMode = false;
      password = '';
      return;
    }

    window.location.assign(data.returnTo || '/');
  }
</script>

<svelte:head>
  <title>Sign in · Nettiva</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="auth-shell">
  <div class="auth-ambient ambient-one"></div>
  <div class="auth-ambient ambient-two"></div>

  <main class="auth-card">
    <header class="auth-brand">
      <span class="auth-mark">N</span>
      <div>
        <strong>NETTIVA</strong>
        <small>Resale intelligence</small>
      </div>
    </header>

    <section class="auth-copy">
      <span class="auth-kicker">{createMode ? 'FOUNDER SETUP' : 'SECURE ACCESS'}</span>
      <h1>{createMode ? 'Create your Nettiva account' : 'Welcome back'}</h1>
      <p>
        {createMode
          ? 'This account will claim the existing founder workspace and become its owner.'
          : 'Sign in to your private seller workspace.'}
      </p>
    </section>

    {#if !data.authConfigured}
      <div class="auth-alert">
        <LockKeyhole size={18} />
        <span>
          <strong>Local auth needs one secret.</strong>
          Add <code>BETTER_AUTH_SECRET</code> to <code>.dev.vars</code>, then restart Nettiva.
        </span>
      </div>
    {/if}

    <form onsubmit={submit}>
      {#if createMode}
        <label>
          <span>Name</span>
          <div class="auth-input">
            <UserRound size={17} />
            <input bind:value={name} autocomplete="name" placeholder="Dave" />
          </div>
        </label>
      {/if}

      <label>
        <span>Email</span>
        <div class="auth-input">
          <Mail size={17} />
          <input
            bind:value={email}
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
          />
        </div>
      </label>

      <label>
        <span class="password-label">
          Password
          {#if !createMode}<a href="/forgot-password">Forgot password?</a>{/if}
        </span>
        <div class="auth-input">
          <KeyRound size={17} />
          <input
            bind:value={password}
            type="password"
            autocomplete={createMode ? 'new-password' : 'current-password'}
            placeholder="12+ characters"
          />
        </div>
      </label>

      {#if message}
        <p class:success class="auth-message">{message}</p>
      {/if}

      <button disabled={busy || !data.authConfigured}>
        {#if busy}<LoaderCircle class="spin" size={18} />{:else}<Check size={18} />{/if}
        {createMode ? 'Create founder account' : 'Sign in'}
      </button>
    </form>

    {#if data.devMailbox}
      <a class="mailbox-link" href="/dev/mailbox">Open local auth mailbox →</a>
    {/if}

    {#if data.signupMode === 'open' && data.canSignUp}
      <button
        class="mode-switch"
        onclick={() => {
          createMode = !createMode;
          message = null;
          success = false;
        }}
        type="button"
      >
        {createMode ? 'Already have an account? Sign in' : 'New to Nettiva? Create an account'}
      </button>
    {:else if data.signupMode === 'founder' && data.canSignUp}
      <p class="founder-note">Founder setup is enabled for the first account only.</p>
    {:else}
      <p class="founder-note">New account creation is currently closed.</p>
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; }
  .auth-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    position: relative;
    overflow: hidden;
    padding: 24px;
    background: #070b10;
    color: #eaf0eb;
  }
  .auth-ambient {
    position: absolute;
    width: 420px;
    height: 420px;
    border-radius: 999px;
    filter: blur(100px);
    opacity: .13;
    pointer-events: none;
  }
  .ambient-one { top: -180px; right: 8%; background: #b8f34a; }
  .ambient-two { bottom: -220px; left: 5%; background: #35c9ff; }
  .auth-card {
    position: relative;
    width: min(430px, 100%);
    border: 1px solid #303b46;
    border-radius: 18px;
    padding: 28px;
    background: linear-gradient(145deg, rgba(18,24,32,.98), rgba(12,17,23,.98));
    box-shadow: 0 35px 100px #0009;
  }
  .auth-brand {
    display: flex;
    align-items: center;
    gap: 11px;
    padding-bottom: 22px;
    border-bottom: 1px solid #25303a;
  }
  .auth-mark {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: #081007;
    background: #b8f34a;
    font-weight: 950;
    font-size: 1.15rem;
  }
  .auth-brand > div { display: flex; flex-direction: column; gap: 1px; }
  .auth-brand strong { letter-spacing: .12em; font-size: .85rem; }
  .auth-brand small { color: #687581; font-size: .67rem; }
  .auth-copy { padding: 24px 0 18px; }
  .auth-kicker {
    color: #b8f34a;
    font: 800 .67rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .14em;
  }
  h1 { margin: 7px 0 6px; font-size: 1.65rem; line-height: 1.12; }
  .auth-copy p { margin: 0; color: #7d8995; font-size: .79rem; line-height: 1.5; }
  form { display: grid; gap: 13px; }
  label { display: grid; gap: 6px; color: #aeb8c1; font-size: .75rem; font-weight: 700; }
  .password-label { display: flex; justify-content: space-between; gap: 12px; }
  .password-label a { color: #8fa2b0; font-size: .68rem; text-decoration: none; }
  .password-label a:hover { color: #b8f34a; }
  .auth-input {
    height: 43px;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid #34404b;
    border-radius: 9px;
    padding: 0 11px;
    background: #090e13;
  }
  .auth-input:focus-within { border-color: #7ba837; box-shadow: 0 0 0 1px #7ba83744; }
  .auth-input :global(svg) { flex: 0 0 auto; color: #697682; }
  input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: #eff5f0;
    font: inherit;
  }
  form > button {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 3px;
    border: 0;
    border-radius: 9px;
    background: #b8f34a;
    color: #091006;
    font-weight: 900;
    cursor: pointer;
  }
  form > button:disabled { opacity: .45; cursor: not-allowed; }
  .auth-alert {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin: 0 0 15px;
    border: 1px solid #59471f;
    border-radius: 9px;
    padding: 10px 11px;
    color: #d8ba73;
    background: #221d11;
    font-size: .72rem;
    line-height: 1.45;
  }
  .auth-alert :global(svg) { flex: 0 0 auto; }
  .auth-alert span { display: flex; flex-direction: column; gap: 2px; }
  code { color: #e8d28e; }
  .auth-message {
    margin: 0;
    border: 1px solid #5b2d34;
    border-radius: 8px;
    padding: 9px 10px;
    color: #ff9ca3;
    background: #281419;
    font-size: .72rem;
  }
  .auth-message.success {
    border-color: #355327;
    color: #c5e99a;
    background: #172313;
  }
  .mailbox-link,
  .mode-switch {
    width: 100%;
    display: block;
    margin-top: 14px;
    border: 0;
    background: transparent;
    color: #8fa2b0;
    text-align: center;
    text-decoration: none;
    font-size: .72rem;
    cursor: pointer;
  }
  .mailbox-link:hover,
  .mode-switch:hover { color: #b8f34a; }
  .founder-note { margin: 15px 0 0; color: #5f6c78; text-align: center; font-size: .68rem; }
  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
