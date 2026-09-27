import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reconcileRecentEbayFinances } from '$lib/server/ebay-finance-reconcile';
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
    // Existing live/history sync keeps inventory, orders and the raw finance
    // ledger current.
    const result = await syncEbayAutomated(
      platform.env,
      workspaceId
    );

    // Re-read the recent Finances feed with stricter normalization. This writes
    // canonical order/line IDs directly and repairs selling-fee/shipping-label
    // attribution before the sold-item pages calculate profit.
    const financeReconcile = await reconcileRecentEbayFinances(
      platform.env,
      workspaceId
    );

    // When eBay's newer Order Earnings API is available for this seller, it is
    // the final authority for seller expenses and replaces the fee rows above.
    // If it is unavailable or has not populated yet, the Finances repair stays
    // in place as the fallback.
    const orderEarnings = await syncRecentEbayOrderEarnings(
      platform.env,
      workspaceId
    );

    return json({
      ok: true,
      ...result,
      financeReconcile,
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
