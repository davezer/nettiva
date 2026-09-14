import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncEbayAutomated } from '$lib/server/ebay-history-sync';
import { syncRecentEbayOrderEarnings } from '$lib/server/ebay-order-earnings';
import { currentWorkspaceId } from '$lib/server/workspace';

export const POST: RequestHandler = async ({ platform, locals }) => {
  if (!platform) {
    return json(
      { error: 'Cloudflare runtime unavailable.' },
      { status: 500 }
    );
  }

  if (locals.workspaceRole === 'member') {
    return json(
      { error: 'You do not have permission to run an eBay sync.' },
      { status: 403 }
    );
  }

  const workspaceId = currentWorkspaceId(locals);

  try {
    // Keep the existing sync for listings, orders, labels, refunds, payouts,
    // and the full ledger.
    const result = await syncEbayAutomated(
      platform.env,
      workspaceId
    );

    // Then let eBay's dedicated Order Earnings resource replace only the
    // order-level selling-fee calculation. This is authoritative for recent
    // seller expenses and avoids the old $0 selling-fee problem.
    const orderEarnings = await syncRecentEbayOrderEarnings(
      platform.env,
      workspaceId
    );

    return json({
      ok: true,
      ...result,
      orderEarnings
    });
  } catch (error) {
    console.error('Sellquity eBay sync failed', error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'eBay sync failed.'
      },
      { status: 500 }
    );
  }
};

// #nothing here just saving to commit
