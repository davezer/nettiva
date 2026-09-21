<script lang="ts">
  import {
    ChevronRight,
    FileSpreadsheet,
    Layers3,
    PlugZap,
    Settings,
    Tag,
    UserRound,
    FileText,
    LifeBuoy,
    ShieldCheck
  } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import type { OrganizedDashboardData } from '$lib/server/organized-dashboard';

  let { data }: { data: OrganizedDashboardData } = $props();

  const unsold = $derived(data.inventory.filter((item) => item.status !== 'sold'));
  const missingInventory = $derived(
    unsold.filter((item) => item.costCents == null || !item.source?.trim() || !item.location?.trim())
  );

  const counts = $derived({
    inventoryAll: data.inventory.length,
    inventoryUnlisted: data.inventory.filter((item) => item.status === 'unlisted').length,
    inventoryScheduled: data.inventory.filter((item) => item.status === 'scheduled').length,
    inventoryActive: data.inventory.filter((item) => item.status === 'active').length,
    inventoryMissing: missingInventory.length,
    soldAll: data.sales.length,
    soldMissingCogs: data.sales.filter((sale) => sale.cogsCents == null).length,
    soldUnmatched: data.sales.filter((sale) => !sale.inventoryItemId).length
  });

  const sections = $derived.by(() => [
    {
      eyebrow: 'CONNECTIONS',
      title: 'Selling channels',
      detail: 'Connect and manage the places where you sell.',
      items: [
        {
          href: '/integrations/ebay',
          title: 'eBay',
          detail: data.connected
            ? 'Connected and syncing listings, sales, and marketplace activity.'
            : 'Connect your eBay seller account to automate Sellquity.',
          icon: PlugZap,
          badge: data.connected ? 'Connected' : 'Not connected'
        },
        {
          href: '/marketplaces',
          title: 'Selling channels',
          detail: 'See how eBay and Whatnot currently connect to Sellquity.',
          icon: Layers3,
          badge: null
        }
      ]
    },
    {
      eyebrow: 'INVENTORY SETUP',
      title: 'How Sellquity organizes your inventory',
      detail: 'Adjust the defaults that help keep inventory consistent.',
      items: [
        {
          href: '/categories',
          title: 'Categories',
          detail: 'Manage the categories and SKU prefixes used when inventory is added.',
          icon: Tag,
          badge: null
        }
      ]
    },
    {
      eyebrow: 'DATA',
      title: 'Imports and recovery tools',
      detail: 'Recovery and backfill tools. These should stay out of the daily workflow when live sync is healthy.',
      items: [
        {
          href: '/import',
          title: 'Imports',
          detail: 'Backfill eBay data or import Whatnot reports when a live connection is not available.',
          icon: FileSpreadsheet,
          badge: null
        },
        {
          href: '/manage/data-health',
          title: 'Data health',
          detail: 'Run structural checks for broken links, cross-workspace references, duplicate SKUs, and cleanup queues.',
          icon: ShieldCheck,
          badge: null
        }
      ]
    },
    {
      eyebrow: 'ACCOUNT',
      title: 'Your Sellquity account',
      detail: 'Profile, security, data export, and account controls.',
      items: [
        {
          href: '/account',
          title: 'Account & security',
          detail: 'Manage your profile, password, data export, and deletion controls.',
          icon: UserRound,
          badge: null
        }
      ]
    },
    {
      eyebrow: 'HELP & POLICIES',
      title: 'Support and trust',
      detail: 'Get help and review how Sellquity handles account and business data.',
      items: [
        {
          href: '/support',
          title: 'Support',
          detail: 'Send a support request for account, marketplace, inventory, sales, or reporting issues.',
          icon: LifeBuoy,
          badge: null
        },
        {
          href: '/privacy',
          title: 'Privacy policy',
          detail: 'How Sellquity collects, uses, exports, protects, and deletes data.',
          icon: ShieldCheck,
          badge: null
        },
        {
          href: '/terms',
          title: 'Terms of service',
          detail: 'The terms that apply when using Sellquity.',
          icon: FileText,
          badge: null
        }
      ]
    }
  ]);
</script>

<svelte:head><title>Sellquity · Settings</title></svelte:head>

<PageChrome
  active="manage"
  eyebrow="SETTINGS"
  title="Settings"
  workspace={data.workspace}
  connected={data.connected}
  lastSyncedAt={data.lastSyncedAt}
  {counts}
>
  <div class="org-stack">
    <section class="org-card pad">
      <span class="org-kicker">KEEP THE DAILY WORKFLOW CLEAN</span>
      <h2 style="margin:6px 0 7px;font-size:1.05rem">Setup lives here. Selling work lives everywhere else.</h2>
      <p style="margin:0;color:#66818f;font-size:.67rem;max-width:760px;line-height:1.55">
        Connections, categories, imports, and account controls stay out of the way until you need them.
      </p>
    </section>

    {#each sections as section}
      <section class="org-card">
        <div class="org-card-head">
          <div>
            <span class="org-kicker">{section.eyebrow}</span>
            <h2>{section.title}</h2>
            <p>{section.detail}</p>
          </div>
          <Settings size={18} />
        </div>

        <div class="org-manage-grid" style="padding:12px">
          {#each section.items as item}
            {@const Icon = item.icon}
            <a class="org-card org-manage-card" href={item.href}>
              <Icon size={20} />
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <span>
                Open
                {#if item.badge}<b style="margin-left:auto">{item.badge}</b>{/if}
                <ChevronRight size={12} />
              </span>
            </a>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</PageChrome>
