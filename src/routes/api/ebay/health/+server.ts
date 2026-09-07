import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAccessToken, getEbaySellerIdentity, probeInventoryApi } from '$lib/server/ebay-auth';
import { currentWorkspaceId } from '$lib/server/workspace';

export const POST: RequestHandler = async ({ platform, locals }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  if (locals.workspaceRole === 'member') return json({ error: 'Workspace admin access is required.' }, { status: 403 });

  const workspaceId = currentWorkspaceId(locals);
  const now = new Date().toISOString();

  try {
    const accessToken = await getAccessToken(platform.env, workspaceId);
    const [identity, inventoryApiVersion] = await Promise.all([
      getEbaySellerIdentity(accessToken),
      probeInventoryApi(accessToken)
    ]);

    await platform.env.DB.prepare(`
      UPDATE marketplace_accounts
      SET display_name = ?, status = 'connected', metadata_json = ?, updated_at = ?
      WHERE workspace_id = ? AND provider = 'ebay' AND external_account_id = 'primary'
    `).bind(
      identity.userId || 'eBay',
      JSON.stringify({
        userId: identity.userId,
        eiasToken: identity.eiasToken,
        storeName: identity.storeName,
        qualifiesForSelling: identity.sellerRegistrationCompleted,
        inventoryApiVersion,
        lastHealthCheckAt: now,
        lastHealthError: null
      }),
      now,
      workspaceId
    ).run();

    return json({ ok: true, userId: identity.userId, inventoryApiVersion, verifiedAt: now });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'eBay connection check failed.';
    await platform.env.DB.prepare(`
      UPDATE marketplace_accounts
      SET status = 'error', metadata_json = ?, updated_at = ?
      WHERE workspace_id = ? AND provider = 'ebay' AND external_account_id = 'primary'
    `).bind(JSON.stringify({ lastHealthCheckAt: now, lastHealthError: message }), now, workspaceId).run();
    return json({ error: message }, { status: 502 });
  }
};
