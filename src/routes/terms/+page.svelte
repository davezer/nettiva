<script lang="ts">
  import { page } from '$app/state';
  import { ArrowLeft, FileText } from '@lucide/svelte';
</script>

<svelte:head>
  <title>Terms of Service · Sellquity</title>
  <meta name="description" content="Terms governing use of Sellquity inventory, sales, marketplace, and reseller reporting tools." />
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
      <FileText size={28} />
      <span>TERMS</span>
      <h1>Terms of Service</h1>
      <p>Last updated September 21, 2026</p>
    </div>

    <article>
      <section><h2>Using Sellquity</h2><p>Sellquity provides tools for reseller inventory, sales tracking, marketplace imports and connections, purchase-cost tracking, and business reporting. By creating or using an account, you agree to use the service lawfully and in accordance with these terms.</p></section>

      <section><h2>Your account</h2><p>You are responsible for safeguarding your login credentials and for activity performed through your account. Information you provide should be accurate enough for Sellquity to operate the account and contact you about security or support matters.</p></section>

      <section><h2>Your business data</h2><p>You retain ownership of the business information you enter or import into Sellquity. You grant Sellquity permission to process that data as necessary to operate, secure, support, and improve the service.</p></section>

      <section><h2>Marketplace connections</h2><p>When you connect a third-party marketplace, you authorize Sellquity to access the marketplace data allowed by the permissions shown during connection. Your use of that marketplace remains subject to the marketplace’s own terms and policies. Sellquity is not responsible for marketplace outages, policy changes, account actions, or data supplied incorrectly by a third party.</p></section>

      <section><h2>Financial and tax information</h2><p>Sellquity provides organizational and reporting tools, not accounting, legal, tax, or investment advice. Profit, fees, costs, and other calculations depend on the completeness and accuracy of the underlying data. You are responsible for reviewing business records and using qualified professionals when appropriate.</p></section>

      <section><h2>Acceptable use</h2><p>You may not use Sellquity to break the law, access another person’s data without authorization, interfere with the service, probe or bypass security controls, distribute malware, abuse marketplace APIs, or submit intentionally harmful or fraudulent content.</p></section>

      <section><h2>Availability and changes</h2><p>Sellquity may add, change, or discontinue features as the product evolves. We aim to preserve user data and communicate material changes, but uninterrupted availability is not guaranteed.</p></section>

      <section><h2>Exports and deletion</h2><p>Eligible workspace owners and admins can export workspace data. Account deletion uses a seven-day hold before permanent deletion becomes available. Deletion can be restricted when other workspace members or ownership relationships must be resolved first.</p></section>

      <section><h2>Suspension</h2><p>Access may be limited or suspended when reasonably necessary to protect users, marketplaces, Sellquity, or the integrity of the service, including suspected abuse, security threats, or violations of these terms.</p></section>

      <section><h2>Disclaimers</h2><p>The service is provided on an “as available” basis. To the extent permitted by law, Sellquity disclaims warranties that are not expressly stated in these terms, including warranties of uninterrupted operation or error-free third-party data.</p></section>

      <section><h2>Limitation of liability</h2><p>To the extent permitted by law, Sellquity will not be responsible for indirect, incidental, special, consequential, or punitive damages, or for losses caused by marketplace actions, user-entered data, lost profits, or business interruption. Nothing here excludes liability that cannot legally be limited.</p></section>

      <section><h2>Changes to these terms</h2><p>If these terms materially change, the updated version and effective date will be posted here. Continued use after an update means you accept the revised terms where permitted by law.</p></section>

      <section><h2>Questions</h2><p>Questions about these terms can be sent through the <a href="/support">Sellquity support form</a>.</p></section>
    </article>

    <footer><a href="/privacy">Privacy Policy</a><a href="/support">Support</a></footer>
  </main>
</div>

<style>
  :global(body){margin:0;background:#070c12;color:#eaf3ef}*{box-sizing:border-box}.policy-page{min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:radial-gradient(circle at 75% -10%,#0069e312 0,transparent 30rem),#070c12}header{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:10px max(20px,calc((100vw - 880px)/2));border-bottom:1px solid #1c2c38;background:#081019e8}.brand,.back{display:inline-flex;align-items:center;gap:8px;color:#dfeae5;text-decoration:none}.brand{letter-spacing:.1em;font-size:.8rem}.back{color:#8297a5;font-size:.72rem;font-weight:800}.mark{width:32px;height:32px;display:grid;place-items:center;overflow:hidden;border:1px solid #185778;border-radius:8px;background:#081b2b}.mark img{width:88%;height:88%;object-fit:contain}main{width:min(880px,calc(100% - 32px));margin:0 auto;padding:52px 0 72px}.policy-head{border-bottom:1px solid #1c3442;padding-bottom:22px;margin-bottom:28px}.policy-head :global(svg){color:#01d4a5}.policy-head>span{display:block;margin-top:10px;color:#01d4a5;font:850 .64rem ui-monospace,monospace;letter-spacing:.12em}.policy-head h1{margin:7px 0 5px;font-size:clamp(2.3rem,5vw,4rem);letter-spacing:-.045em}.policy-head p{margin:0;color:#708592;font-size:.72rem}article{display:grid;gap:28px}section h2{margin:0 0 8px;font-size:1rem}section p{margin:7px 0;color:#8397a4;font-size:.8rem;line-height:1.7}a{color:#62d7df}footer{display:flex;gap:18px;margin-top:36px;border-top:1px solid #1c3442;padding-top:18px}footer a{color:#8da4b1;text-decoration:none;font-size:.72rem;font-weight:800}.back:hover,footer a:hover{color:#01d4a5}@media(max-width:600px){header{padding-inline:14px}.back{font-size:0}.back :global(svg){width:19px;height:19px}main{padding-top:34px}}
</style>
