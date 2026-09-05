<script lang="ts">
  import { ArrowLeft, ExternalLink, Mail } from '@lucide/svelte';

  let { data } = $props<{
    data: {
      messages: Array<{
        id: string;
        recipient: string;
        kind: string;
        subject: string;
        actionUrl: string;
        createdAt: string;
      }>;
    };
  }>();
</script>

<svelte:head>
  <title>Local auth mailbox · Sellquity</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="shell">
  <header>
    <a href="/login"><ArrowLeft size={15} /> Back</a>
    <span>LOCAL DEVELOPMENT ONLY</span>
  </header>

  <main>
    <div class="intro">
      <span class="icon"><Mail size={22} /></span>
      <div><span class="kicker">AUTH OUTBOX</span><h1>Sellquity mailbox</h1><p>Verification and recovery links are captured here locally so we can test the entire account lifecycle without sending real email.</p></div>
    </div>

    {#if data.messages.length}
      <div class="mail-list">
        {#each data.messages as mail}
          <article>
            <div class="mail-meta"><span>{mail.kind}</span><time>{new Date(mail.createdAt).toLocaleString()}</time></div>
            <h2>{mail.subject}</h2>
            <p>To: {mail.recipient}</p>
            <a href={mail.actionUrl}><ExternalLink size={15} /> Open secure action link</a>
          </article>
        {/each}
      </div>
    {:else}
      <div class="empty"><Mail size={22} /><strong>No auth email yet.</strong><span>Request verification or a password reset, then refresh this page.</span></div>
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #080c10; }
  .shell { min-height: 100vh; background: #080c10; color: #e7eee8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  header { height: 58px; display: flex; align-items: center; justify-content: space-between; padding: 0 26px; border-bottom: 1px solid #202a33; background: #0b1015; }
  header a { display: inline-flex; align-items: center; gap: 5px; color: #84919c; text-decoration: none; font-size: .72rem; }
  header span { color: #d6ad62; font: 800 .62rem Consolas, monospace; letter-spacing: .1em; }
  main { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 42px 0 70px; }
  .intro { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 22px; }
  .icon { width: 42px; height: 42px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 10px; color: #01d4a5; background: #0c2730; }
  .kicker { color: #01d4a5; font: 800 .65rem Consolas, monospace; letter-spacing: .13em; }
  h1 { margin: 4px 0 6px; font-size: 1.7rem; }
  .intro p { margin: 0; color: #7d8995; font-size: .76rem; line-height: 1.55; }
  .mail-list { display: grid; gap: 10px; }
  article { border: 1px solid #2d3943; border-radius: 12px; padding: 16px; background: #0e141a; }
  .mail-meta { display: flex; justify-content: space-between; gap: 12px; color: #687581; font-size: .65rem; }
  .mail-meta span { color: #01d4a5; font: 800 .62rem Consolas, monospace; text-transform: uppercase; letter-spacing: .08em; }
  h2 { margin: 9px 0 4px; font-size: .95rem; }
  article p { margin: 0 0 12px; color: #7f8c97; font-size: .7rem; }
  article a { display: inline-flex; align-items: center; gap: 6px; color: #c8e89e; text-decoration: none; font-size: .71rem; font-weight: 800; }
  .empty { display: grid; place-items: center; gap: 7px; border: 1px dashed #33404a; border-radius: 12px; padding: 42px 20px; color: #6f7d88; text-align: center; font-size: .72rem; }
  .empty :global(svg) { color: #01d4a5; }
  .empty strong { color: #d9e1dc; }
</style>
