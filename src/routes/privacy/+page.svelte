<script lang="ts">
  import { page } from '$app/state';
  import { ArrowLeft, ShieldCheck } from '@lucide/svelte';
</script>

<svelte:head>
  <title>Privacy Policy · Sellquity</title>
  <meta name="description" content="How Sellquity collects, uses, protects, exports, and deletes account and reseller business data." />
</svelte:head>

<div class="policy-page">
  {#if !page.data.shell}
    <header>
      <a class="brand" href="/"><span class="mark"><img src="/s-no-bg.png" alt="" /></span><strong>SELLQUITY</strong></a>
      <a class="back" href="/"><ArrowLeft size={15} /> Back to Sellquity</a>
    </header>
  {/if}

  <main>
    <div class="policy-head">
      <ShieldCheck size={28} />
      <span>PRIVACY</span>
      <h1>Privacy Policy</h1>
      <p>Last updated September 21, 2026</p>
    </div>

    <article>
      <section><h2>What Sellquity collects</h2><p>Sellquity stores the information needed to provide your account and reseller workspace. That can include your name and email address, workspace settings, inventory, purchase costs, listings, sales, marketplace fees, shipping costs, expenses, import history, and support requests.</p><p>When you connect a marketplace such as eBay, Sellquity may receive account identifiers, listings, orders, financial activity, and authorization credentials needed to keep the connection working.</p></section>

      <section><h2>How your data is used</h2><p>We use your information to authenticate your account, organize inventory, calculate business reporting, sync or import marketplace activity, provide support, secure the service, and improve reliability. Sellquity does not use your marketplace connection to modify listings unless a feature clearly tells you it will do so.</p></section>

      <section><h2>Marketplace credentials</h2><p>Marketplace access and refresh tokens are treated as sensitive credentials. They are stored server-side and are not included in normal account data exports. Disconnecting a marketplace removes the live connection without deleting the business history already imported into Sellquity.</p></section>

      <section><h2>Service providers</h2><p>Sellquity may use service providers for hosting, database storage, security, email delivery, and marketplace integrations. Those providers receive only the information reasonably necessary to perform their role for the service.</p></section>

      <section><h2>Data exports</h2><p>Workspace owners and admins can download a JSON export of the current workspace from Account &amp; Security. The export includes business records such as inventory, listings, sales, financial transactions, purchase lots, marketplace connection metadata, and import history. Passwords, sessions, verification secrets, and marketplace tokens are excluded.</p></section>

      <section><h2>Deletion</h2><p>You can request account deletion from Account &amp; Security. Sellquity uses a seven-day hold so accidental deletion can be canceled. After the hold, an eligible workspace owner can permanently delete the account and its workspace data. Deletion may be blocked when the account still owns or participates in another active workspace, or when another active member still depends on the workspace.</p><p>Some limited records may be retained when required for security, fraud prevention, legal obligations, or dispute handling.</p></section>

      <section><h2>Security</h2><p>Sellquity uses authenticated sessions, workspace isolation, server-side marketplace credentials, and other technical controls intended to protect account and business data. No online service can guarantee absolute security, so users should also protect their password and email account.</p></section>

      <section><h2>Cookies and sessions</h2><p>Sellquity uses cookies or similar browser storage when needed to maintain authenticated sessions, remember the active workspace, and protect account access. These are used for product functionality rather than advertising.</p></section>

      <section><h2>Sale of personal information</h2><p>Sellquity does not sell personal information to advertisers or data brokers.</p></section>

      <section><h2>Your choices</h2><p>You can update profile information, change your login email or password, disconnect marketplaces, export workspace data, request deletion, and contact support from within Sellquity.</p></section>

      <section><h2>Questions</h2><p>If you have a privacy question or believe data is incorrect, use the <a href="/support">Sellquity support form</a>.</p></section>
    </article>

    <footer><a href="/terms">Terms of Service</a><a href="/support">Support</a></footer>
  </main>
</div>

<style>
  :global(body){margin:0;background:#070c12;color:#eaf3ef}*{box-sizing:border-box}.policy-page{min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:radial-gradient(circle at 75% -10%,#0069e312 0,transparent 30rem),#070c12}header{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:10px max(20px,calc((100vw - 880px)/2));border-bottom:1px solid #1c2c38;background:#081019e8}.brand,.back{display:inline-flex;align-items:center;gap:8px;color:#dfeae5;text-decoration:none}.brand{letter-spacing:.1em;font-size:.8rem}.back{color:#8297a5;font-size:.72rem;font-weight:800}.mark{width:32px;height:32px;display:grid;place-items:center;overflow:hidden;border:1px solid #185778;border-radius:8px;background:#081b2b}.mark img{width:88%;height:88%;object-fit:contain}main{width:min(880px,calc(100% - 32px));margin:0 auto;padding:52px 0 72px}.policy-head{border-bottom:1px solid #1c3442;padding-bottom:22px;margin-bottom:28px}.policy-head :global(svg){color:#01d4a5}.policy-head>span{display:block;margin-top:10px;color:#01d4a5;font:850 .64rem ui-monospace,monospace;letter-spacing:.12em}.policy-head h1{margin:7px 0 5px;font-size:clamp(2.3rem,5vw,4rem);letter-spacing:-.045em}.policy-head p{margin:0;color:#708592;font-size:.72rem}article{display:grid;gap:28px}section h2{margin:0 0 8px;font-size:1rem}section p{margin:7px 0;color:#8397a4;font-size:.8rem;line-height:1.7}a{color:#62d7df}footer{display:flex;gap:18px;margin-top:36px;border-top:1px solid #1c3442;padding-top:18px}footer a{color:#8da4b1;text-decoration:none;font-size:.72rem;font-weight:800}.back:hover,footer a:hover{color:#01d4a5}@media(max-width:600px){header{padding-inline:14px}.back{font-size:0}.back :global(svg){width:19px;height:19px}main{padding-top:34px}}
</style>
