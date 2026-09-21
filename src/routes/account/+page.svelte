<script lang="ts">
  import {
    AlertTriangle,
    Check,
    Download,
    KeyRound,
    LifeBuoy,
    LoaderCircle,
    LogOut,
    Mail,
    RefreshCw,
    ShieldCheck,
    Trash2,
    UserRound
  } from '@lucide/svelte';
  import { authClient } from '$lib/auth-client';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

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

  function deletionReady() {
    if (!data.deletionRequest?.scheduledFor) return false;
    const when = Date.parse(data.deletionRequest.scheduledFor);
    return Number.isFinite(when) && when <= Date.now();
  }

  function deletionDate() {
    if (!data.deletionRequest?.scheduledFor) return '';
    const date = new Date(data.deletionRequest.scheduledFor);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date)
      : data.deletionRequest.scheduledFor;
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
    const result = await authClient.changeEmail({ newEmail: email, callbackURL: '/account?emailChanged=1' });
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
    notify('Password changed. Other active sessions were signed out.');
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
    if (!response.ok) return notify(result.error || 'Could not restart setup.', 'error');
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
    notify('Deletion requested. You can cancel during the 7-day hold.');
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

  async function deleteNow() {
    if (!confirm('Permanently delete this Sellquity account and workspace data? This cannot be undone.')) return;

    busy = 'delete-now';
    const response = await fetch('/api/account/delete-now', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' })
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    busy = null;

    if (!response.ok) return notify(result.error || 'Could not permanently delete the account.', 'error');
    window.location.assign('/login?deleted=1');
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

<div class="account-page">
  <section class="hero">
    <span class="kicker">ACCOUNT & SECURITY</span>
    <h1>Your account</h1>
    <p>Manage your profile, sign-in security, data export, support, and account controls.</p>
  </section>

  {#if message}
    <div class:bad={messageTone === 'error'} class="notice">{message}</div>
  {/if}

  <section class="grid">
    <article class="card identity-card">
      <div class="card-head"><UserRound size={20} /><div><span class="kicker">PROFILE</span><h2>Profile</h2></div></div>
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
      <p class="card-copy">We verify the new address before changing the email used to sign in.</p>
      <form onsubmit={changeEmail}>
        <label><span>New email</span><input bind:value={newEmail} type="email" autocomplete="email" placeholder="new@example.com" /></label>
        <button class="primary" disabled={busy === 'email'}>
          {#if busy === 'email'}<LoaderCircle class="spin" size={15} />{:else}<Mail size={15} />{/if}
          Change email
        </button>
      </form>
    </article>

    <article class="card">
      <div class="card-head"><KeyRound size={20} /><div><span class="kicker">PASSWORD</span><h2>Change password</h2></div></div>
      <p class="card-copy">Changing your password signs out other active Sellquity sessions.</p>
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
      <div class="card-head"><RefreshCw size={20} /><div><span class="kicker">SETUP</span><h2>Run setup again</h2></div></div>
      <p class="card-copy">Use this if you want to revisit the workspace and eBay connection setup for <strong>{data.workspace?.name ?? 'this workspace'}</strong>.</p>
      <button class="secondary full" type="button" disabled={busy === 'onboarding'} onclick={restartOnboarding}>
        {#if busy === 'onboarding'}<LoaderCircle class="spin" size={15} />{:else}<RefreshCw size={15} />{/if}
        Run setup again
      </button>
    </article>

    <article class="card data-card">
      <div class="card-head"><Download size={20} /><div><span class="kicker">YOUR DATA</span><h2>Export your workspace</h2></div></div>
      <p class="card-copy">Download a JSON copy of your inventory, listings, sales, financial transactions, purchase lots, categories, marketplace metadata, and import history. Passwords and marketplace tokens are never included.</p>
      {#if data.workspace?.role === 'member'}
        <div class="info-note">Ask a workspace owner or admin to export business data.</div>
      {:else}
        <a class="primary export-link" href="/api/account/export"><Download size={15} /> Download data export</a>
      {/if}
    </article>

    <article class="card help-card">
      <div class="card-head"><LifeBuoy size={20} /><div><span class="kicker">HELP & POLICIES</span><h2>Need something?</h2></div></div>
      <div class="link-list">
        <a href="/support">Contact support <span>→</span></a>
        <a href="/privacy">Privacy policy <span>→</span></a>
        <a href="/terms">Terms of service <span>→</span></a>
      </div>
    </article>

    <article class="card danger-card">
      <div class="card-head"><Trash2 size={20} /><div><span class="kicker">DANGER ZONE</span><h2>Delete account</h2></div></div>

      {#if data.workspace?.role !== 'owner'}
        <p class="card-copy">Self-service permanent deletion is available to workspace owners. If you are an admin or member and want your account removed, contact support so workspace access can be resolved without deleting another seller’s data.</p>
        <a class="secondary export-link" href="/support"><LifeBuoy size={15} /> Contact support</a>
      {:else if data.deletionRequest}
        <div class:ready={deletionReady()} class="deletion-pending">
          <AlertTriangle size={17} />
          <span>
            <strong>{deletionReady() ? 'Deletion hold complete' : 'Deletion requested'}</strong>
            {#if deletionReady()}
              The 7-day hold ended on {deletionDate()}. You can permanently delete the account now.
            {:else}
              The account is scheduled to become eligible for permanent deletion on {deletionDate()}. Nothing is deleted during the hold.
            {/if}
          </span>
        </div>

        <p class="card-copy">Download an export before continuing if you want to keep a copy of your Sellquity records.</p>
        <div class="danger-actions">
          <button class="secondary" type="button" disabled={busy === 'delete-cancel' || busy === 'delete-now'} onclick={cancelDeletion}>Cancel deletion request</button>
          {#if deletionReady()}
            <button class="danger" type="button" disabled={busy === 'delete-now'} onclick={deleteNow}>
              {#if busy === 'delete-now'}<LoaderCircle class="spin" size={15} />{:else}<Trash2 size={15} />{/if}
              Permanently delete account
            </button>
          {/if}
        </div>
      {:else}
        <p class="card-copy">Deletion starts with a 7-day hold. You can cancel during that time. After the hold, permanent deletion is available to an eligible workspace owner. Sellquity will block deletion if other active members or workspace ownership relationships still need to be resolved.</p>
        <form onsubmit={requestDeletion}>
          <label><span>Reason <small>optional</small></span><textarea bind:value={deletionReason} maxlength="500" rows="3"></textarea></label>
          <label><span>Type DELETE to start the 7-day hold</span><input bind:value={deletionConfirm} autocomplete="off" /></label>
          <button class="danger" disabled={busy === 'delete' || deletionConfirm !== 'DELETE'}>
            {#if busy === 'delete'}<LoaderCircle class="spin" size={15} />{:else}<Trash2 size={15} />{/if}
            Request account deletion
          </button>
        </form>
      {/if}
    </article>
  </section>

  <button class="signout" type="button" onclick={signOut}><LogOut size={16} /> Sign out of Sellquity</button>
</div>

<style>
  .account-page { width:min(1080px,calc(100% - 40px)); margin:0 auto; padding:42px 0 72px; color:#e8f0eb; }
  .hero { max-width:720px; margin-bottom:24px; }
  .kicker { color:#01d4a5; font:800 .64rem ui-monospace,monospace; letter-spacing:.12em; }
  h1 { margin:8px 0 8px; font-size:clamp(2.2rem,5vw,3.5rem); letter-spacing:-.045em; }
  .hero p,.card-copy { color:#7e929f; font-size:.78rem; line-height:1.6; }
  .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
  .card { border:1px solid #273946; border-radius:14px; padding:20px; background:#0b141d; }
  .card-head { display:flex; align-items:center; gap:9px; margin-bottom:14px; }
  .card-head > :global(svg) { color:#01d4a5; }
  h2 { margin:3px 0 0; font-size:1.02rem; }
  form { display:grid; gap:11px; }
  label { display:grid; gap:6px; color:#a9bac3; font-size:.7rem; font-weight:800; }
  label small { color:#647b88; font-weight:600; }
  input,textarea { width:100%; box-sizing:border-box; border:1px solid #314755; border-radius:8px; padding:10px 11px; outline:0; background:#071019; color:#edf6f1; font:inherit; }
  input:focus,textarea:focus { border-color:#137c91; box-shadow:0 0 0 3px #01d0e90d; }
  input:disabled { color:#7b8d97; background:#0a1219; }
  button,.primary,.secondary,.danger { min-height:39px; display:inline-flex; align-items:center; justify-content:center; gap:7px; border-radius:8px; padding:0 13px; font:inherit; font-size:.71rem; font-weight:900; cursor:pointer; text-decoration:none; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  .primary { border:0; background:#01d4a5; color:#03131a; }
  .secondary { border:1px solid #384f5d; background:#0d1922; color:#c7d4da; }
  .danger { border:1px solid #66323a; background:#2a1419; color:#ff9ba2; }
  .full { width:100%; }
  .actions,.danger-actions { display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
  .verification-pill { width:fit-content; display:inline-flex; align-items:center; gap:5px; border:1px solid #604d27; border-radius:99px; padding:5px 8px; color:#dbbd73; background:#211b10; font-size:.66rem; font-weight:800; }
  .verification-pill.verified { border-color:#15545a; color:#9de5d5; background:#0c2424; }
  .dev-link { display:inline-block; margin-top:12px; color:#748a96; text-decoration:none; font-size:.67rem; }
  .data-card,.help-card { min-height:190px; }
  .export-link { width:fit-content; margin-top:6px; }
  .info-note { border:1px solid #3e4b53; border-radius:8px; padding:10px; color:#8899a3; background:#0a1117; font-size:.7rem; }
  .link-list { display:grid; gap:7px; }
  .link-list a { display:flex; justify-content:space-between; gap:12px; border:1px solid #263d4b; border-radius:8px; padding:10px 11px; color:#b8c9d1; text-decoration:none; font-size:.72rem; font-weight:800; }
  .link-list a:hover { border-color:#17605b; color:#01d4a5; }
  .danger-card { grid-column:1 / -1; border-color:#4b282e; }
  .deletion-pending { display:flex; align-items:flex-start; gap:8px; margin:10px 0 14px; border:1px solid #5c4722; border-radius:9px; padding:11px; color:#d7bb79; background:#221b10; font-size:.72rem; line-height:1.5; }
  .deletion-pending.ready { border-color:#73333b; color:#ffabb1; background:#261317; }
  .deletion-pending span { display:flex; flex-direction:column; gap:2px; }
  .notice { margin-bottom:16px; border:1px solid #15545a; border-radius:9px; padding:10px 12px; color:#78f6dd; background:#0b252a; font-size:.75rem; }
  .notice.bad { border-color:#5b2d34; color:#ff9ca3; background:#281419; }
  .signout { margin-top:18px; border:0; background:transparent; color:#718691; }
  .signout:hover { color:#ff9ba2; }
  :global(.spin) { animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media(max-width:760px){ .grid{grid-template-columns:1fr}.danger-card{grid-column:auto}.account-page{width:min(100% - 28px,1080px);padding-top:28px}.danger-actions{align-items:stretch;flex-direction:column}.danger-actions button{width:100%} }
</style>
