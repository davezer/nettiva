<script lang="ts">
  import {
    AlertTriangle,
    ArrowLeft,
    Check,
    KeyRound,
    LoaderCircle,
    LogOut,
    Mail,
    RefreshCw,
    ShieldCheck,
    Trash2,
    UserRound
  } from '@lucide/svelte';
  import { authClient } from '$lib/auth-client';

  type Workspace = {
    id: string;
    name: string;
    slug: string;
    plan: string;
    role: 'owner' | 'admin' | 'member';
    onboardingStep: 'workspace' | 'ebay' | 'inventory' | 'complete';
  };

  type DeletionRequest = {
    id: string;
    status: string;
    requestedAt: string;
    scheduledFor: string;
  };

  let { data } = $props<{
    data: {
      user: { name: string; email: string; emailVerified: boolean } | null;
      workspace: Workspace | null;
      deletionRequest: DeletionRequest | null;
      devMailbox: boolean;
    };
  }>();

  let profileName = $state('');
  let newEmail = $state('');
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let deletionConfirm = $state('');
  let deletionReason = $state('');
  let busy = $state<string | null>(null);
  let message = $state<string | null>(null);
  let messageTone = $state<'success' | 'error'>('success');

  $effect(() => {
    profileName = data.user?.name ?? '';
  });

  function notify(text: string, tone: 'success' | 'error' = 'success') {
    message = text;
    messageTone = tone;
  }

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault();
    if (profileName.trim().length < 2) return notify('Enter a name of at least 2 characters.', 'error');
    busy = 'profile';
    const result = await authClient.updateUser({ name: profileName.trim() });
    busy = null;
    if (result.error) return notify(result.error.message || 'Could not update your profile.', 'error');
    notify('Profile updated.');
    window.setTimeout(() => window.location.reload(), 350);
  }

  async function sendVerification() {
    if (!data.user?.email) return;
    busy = 'verify';
    const result = await authClient.sendVerificationEmail({
      email: data.user.email,
      callbackURL: '/account?verified=1'
    });
    busy = null;
    if (result.error) return notify(result.error.message || 'Could not send verification email.', 'error');
    notify('Verification email sent.');
  }

  async function changeEmail(event: SubmitEvent) {
    event.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return notify('Enter a valid new email address.', 'error');
    busy = 'email';
    const result = await authClient.changeEmail({
      newEmail: email,
      callbackURL: '/account?emailChanged=1'
    });
    busy = null;
    if (result.error) return notify(result.error.message || 'Could not start the email change.', 'error');
    newEmail = '';
    notify('Email change started. Check the security emails Sellquity sent.');
  }

  async function changePassword(event: SubmitEvent) {
    event.preventDefault();
    if (newPassword.length < 12) return notify('New password must be at least 12 characters.', 'error');
    if (newPassword !== confirmPassword) return notify('The new passwords do not match.', 'error');

    busy = 'password';
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true
    });
    busy = null;
    if (result.error) return notify(result.error.message || 'Could not change your password.', 'error');

    currentPassword = '';
    newPassword = '';
    confirmPassword = '';
    notify('Password changed. Other active sessions were revoked.');
  }

  async function restartOnboarding() {
    busy = 'onboarding';
    const response = await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'restart' })
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    busy = null;
    if (!response.ok) return notify(result.error || 'Could not restart onboarding.', 'error');
    window.location.assign('/onboarding');
  }

  async function requestDeletion(event: SubmitEvent) {
    event.preventDefault();
    if (deletionConfirm !== 'DELETE') return notify('Type DELETE exactly to continue.', 'error');

    busy = 'delete';
    const response = await fetch('/api/account/deletion-request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: deletionConfirm, reason: deletionReason })
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    busy = null;
    if (!response.ok) return notify(result.error || 'Could not create the deletion request.', 'error');
    notify('Deletion request recorded. No data has been deleted.');
    window.setTimeout(() => window.location.reload(), 350);
  }

  async function cancelDeletion() {
    busy = 'delete-cancel';
    const response = await fetch('/api/account/deletion-request', { method: 'DELETE' });
    const result = await response.json().catch(() => ({})) as { error?: string };
    busy = null;
    if (!response.ok) return notify(result.error || 'Could not cancel the deletion request.', 'error');
    notify('Deletion request canceled.');
    window.setTimeout(() => window.location.reload(), 350);
  }

  async function signOut() {
    await authClient.signOut();
    window.location.assign('/login');
  }
</script>

<svelte:head>
  <title>Account & security · Sellquity</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="account-shell">
  <header class="account-topbar">
    <a href="/" class="brand"><span class="sellquity-icon-mark"><img src="/s-no-bg.png" alt="" aria-hidden="true" /></span><strong>SELLQUITY</strong></a>
    <a href="/" class="back"><ArrowLeft size={15} /> Back to workspace</a>
  </header>

  <main>
    <section class="hero">
      <span class="kicker">ACCOUNT & SECURITY</span>
      <h1>Your Sellquity identity</h1>
      <p>Authentication controls who you are. Workspace membership controls which seller data you are allowed to touch.</p>
    </section>

    {#if message}
      <div class:bad={messageTone === 'error'} class="notice">{message}</div>
    {/if}

    <section class="grid">
      <article class="card identity-card">
        <div class="card-head"><UserRound size={20} /><div><span class="kicker">PROFILE</span><h2>Personal identity</h2></div></div>
        <form onsubmit={saveProfile}>
          <label><span>Name</span><input bind:value={profileName} maxlength="80" /></label>
          <label><span>Login email</span><input value={data.user?.email ?? ''} disabled /></label>
          <div class:verified={data.user?.emailVerified} class="verification-pill">
            {#if data.user?.emailVerified}<Check size={14} /> Verified email{:else}<AlertTriangle size={14} /> Email not verified{/if}
          </div>
          <div class="actions">
            {#if !data.user?.emailVerified}
              <button class="secondary" type="button" disabled={busy === 'verify'} onclick={sendVerification}>
                {#if busy === 'verify'}<LoaderCircle class="spin" size={15} />{:else}<Mail size={15} />{/if}
                Send verification
              </button>
            {/if}
            <button class="primary" disabled={busy === 'profile'}>
              {#if busy === 'profile'}<LoaderCircle class="spin" size={15} />{:else}<Check size={15} />{/if}
              Save profile
            </button>
          </div>
        </form>
        {#if data.devMailbox}<a class="dev-link" href="/dev/mailbox">Open local auth mailbox →</a>{/if}
      </article>

      <article class="card">
        <div class="card-head"><Mail size={20} /><div><span class="kicker">EMAIL</span><h2>Change login email</h2></div></div>
        <p class="card-copy">Sellquity verifies email changes instead of silently rebinding your account identity.</p>
        <form onsubmit={changeEmail}>
          <label><span>New email</span><input bind:value={newEmail} type="email" autocomplete="email" placeholder="new@example.com" /></label>
          <button class="primary" disabled={busy === 'email'}>
            {#if busy === 'email'}<LoaderCircle class="spin" size={15} />{:else}<Mail size={15} />{/if}
            Start email change
          </button>
        </form>
      </article>

      <article class="card">
        <div class="card-head"><KeyRound size={20} /><div><span class="kicker">PASSWORD</span><h2>Change password</h2></div></div>
        <p class="card-copy">Changing your password revokes every other active Sellquity session.</p>
        <form onsubmit={changePassword}>
          <label><span>Current password</span><input bind:value={currentPassword} type="password" autocomplete="current-password" /></label>
          <label><span>New password</span><input bind:value={newPassword} type="password" autocomplete="new-password" placeholder="12+ characters" /></label>
          <label><span>Confirm new password</span><input bind:value={confirmPassword} type="password" autocomplete="new-password" /></label>
          <button class="primary" disabled={busy === 'password'}>
            {#if busy === 'password'}<LoaderCircle class="spin" size={15} />{:else}<ShieldCheck size={15} />{/if}
            Change password
          </button>
        </form>
      </article>

      <article class="card">
        <div class="card-head"><RefreshCw size={20} /><div><span class="kicker">ONBOARDING</span><h2>Workspace setup</h2></div></div>
        <p class="card-copy"><strong>{data.workspace?.name ?? 'Workspace'}</strong> is currently <code>{data.workspace?.onboardingStep ?? 'unknown'}</code>.</p>
        <button class="secondary full" type="button" disabled={busy === 'onboarding'} onclick={restartOnboarding}>
          {#if busy === 'onboarding'}<LoaderCircle class="spin" size={15} />{:else}<RefreshCw size={15} />{/if}
          Run onboarding again
        </button>
      </article>

      <article class="card danger-card">
        <div class="card-head"><Trash2 size={20} /><div><span class="kicker">DANGER ZONE</span><h2>Account deletion</h2></div></div>
        {#if data.deletionRequest}
          <div class="deletion-pending">
            <AlertTriangle size={17} />
            <span>
              <strong>Deletion requested</strong>
              Scheduled hold date: {new Date(data.deletionRequest.scheduledFor).toLocaleDateString()}.
              Nothing is deleted automatically in v3.
            </span>
          </div>
          <button class="secondary full" type="button" disabled={busy === 'delete-cancel'} onclick={cancelDeletion}>
            Cancel deletion request
          </button>
        {:else}
          <p class="card-copy">This release records a seven-day deletion request but deliberately does not purge seller data yet. Export, billing, retention, and owned-workspace rules must be finalized first.</p>
          <form onsubmit={requestDeletion}>
            <label><span>Reason <small>optional</small></span><textarea bind:value={deletionReason} maxlength="500" rows="3"></textarea></label>
            <label><span>Type DELETE to request deletion</span><input bind:value={deletionConfirm} autocomplete="off" /></label>
            <button class="danger" disabled={busy === 'delete' || deletionConfirm !== 'DELETE'}>
              {#if busy === 'delete'}<LoaderCircle class="spin" size={15} />{:else}<Trash2 size={15} />{/if}
              Request account deletion
            </button>
          </form>
        {/if}
      </article>
    </section>

    <button class="signout" type="button" onclick={signOut}><LogOut size={16} /> Sign out of Sellquity</button>
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #080c10; }
  .account-shell { min-height: 100vh; background: #080c10; color: #e7eee8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .account-topbar { height: 62px; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; border-bottom: 1px solid #202a33; background: #0b1015; }
  .brand { display: flex; align-items: center; gap: 9px; color: #eaf0eb; text-decoration: none; letter-spacing: .1em; font-size: .8rem; }
  .brand span { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 7px; background: #01d4a5; color: #03131a; font-weight: 950; }
  .back { display: inline-flex; align-items: center; gap: 5px; color: #82909c; text-decoration: none; font-size: .72rem; }
  .back:hover, .dev-link:hover { color: #01d4a5; }
  main { width: min(1040px, calc(100% - 40px)); margin: 0 auto; padding: 42px 0 70px; }
  .hero { max-width: 650px; margin-bottom: 25px; }
  .kicker { color: #01d4a5; font: 800 .65rem Consolas, monospace; letter-spacing: .13em; }
  h1 { margin: 8px 0 8px; font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -.04em; }
  .hero p, .card-copy { color: #7e8a95; font-size: .78rem; line-height: 1.55; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .card { border: 1px solid #28333d; border-radius: 14px; padding: 20px; background: #0e141a; }
  .card-head { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
  .card-head > :global(svg) { color: #01d4a5; }
  h2 { margin: 3px 0 0; font-size: 1.05rem; }
  form { display: grid; gap: 11px; }
  label { display: grid; gap: 6px; color: #aab4bd; font-size: .72rem; font-weight: 700; }
  label small { color: #67747f; font-weight: 500; }
  input, textarea { width: 100%; box-sizing: border-box; border: 1px solid #35414c; border-radius: 8px; padding: 10px 11px; outline: 0; background: #090e13; color: #edf3ee; font: inherit; }
  input:focus, textarea:focus { border-color: #0a8fc4; box-shadow: 0 0 0 1px #0a8fc455; }
  input:disabled { color: #788590; background: #0c1116; }
  button, .secondary, .primary { min-height: 39px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 8px; padding: 0 13px; font: inherit; font-size: .72rem; font-weight: 850; cursor: pointer; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .primary { border: 0; background: #01d4a5; color: #03131a; }
  .secondary { border: 1px solid #384550; background: #121920; color: #c7d0d7; }
  .danger { border: 1px solid #66323a; background: #2a1419; color: #ff9ba2; }
  .full { width: 100%; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .verification-pill { width: fit-content; display: inline-flex; align-items: center; gap: 5px; border: 1px solid #604d27; border-radius: 99px; padding: 5px 8px; color: #dbbd73; background: #211b10; font-size: .66rem; font-weight: 800; }
  .verification-pill.verified { border-color: #15545a; color: #c4e99a; background: #172314; }
  .dev-link { display: inline-block; margin-top: 12px; color: #74818c; text-decoration: none; font-size: .67rem; }
  .danger-card { grid-column: 1 / -1; border-color: #4b282e; }
  .deletion-pending { display: flex; align-items: flex-start; gap: 8px; margin: 10px 0 14px; border: 1px solid #5c4722; border-radius: 9px; padding: 11px; color: #d7bb79; background: #221b10; font-size: .72rem; line-height: 1.5; }
  .deletion-pending span { display: flex; flex-direction: column; gap: 2px; }
  .notice { margin-bottom: 16px; border: 1px solid #15545a; border-radius: 9px; padding: 10px 12px; color: #78f6dd; background: #0b252a; font-size: .75rem; }
  .notice.bad { border-color: #5b2d34; color: #ff9ca3; background: #281419; }
  code { color: #01d4a5; }
  .signout { margin-top: 18px; border: 0; background: transparent; color: #71808c; }
  .signout:hover { color: #ff9ba2; }
  :global(.spin) { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .danger-card { grid-column: auto; } .account-topbar { padding: 0 18px; } main { width: min(100% - 28px, 1040px); } }


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
