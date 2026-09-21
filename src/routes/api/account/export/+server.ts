import type { RequestHandler } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

function safeFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'workspace';
}

export const GET: RequestHandler = async ({ platform, locals }) => {
  if (!platform || !locals.authUserId || !locals.userId || !locals.workspaceId) {
    return new Response('Authentication required.', { status: 401 });
  }

  if (locals.workspaceRole === 'member') {
    return new Response('Only workspace owners and admins can export business data.', { status: 403 });
  }

  const db = platform.env.DB;
  const workspaceId = currentWorkspaceId(locals);

  const results = await db.batch([
    db.prepare(`
      SELECT id, name, slug, plan, status, country_code AS countryCode,
             currency_code AS currencyCode, created_at AS createdAt,
             updated_at AS updatedAt
      FROM workspaces
      WHERE id = ?
      LIMIT 1
    `).bind(workspaceId),
    db.prepare(`SELECT * FROM inventory_items WHERE workspace_id = ? ORDER BY created_at`).bind(workspaceId),
    db.prepare(`SELECT * FROM listings WHERE workspace_id = ? ORDER BY created_at`).bind(workspaceId),
    db.prepare(`SELECT * FROM orders WHERE workspace_id = ? ORDER BY created_at_ebay`).bind(workspaceId),
    db.prepare(`SELECT * FROM order_items WHERE workspace_id = ? ORDER BY sold_at`).bind(workspaceId),
    db.prepare(`SELECT * FROM financial_transactions WHERE workspace_id = ? ORDER BY transaction_date`).bind(workspaceId),
    db.prepare(`SELECT * FROM purchase_lots WHERE workspace_id = ? ORDER BY created_at`).bind(workspaceId),
    db.prepare(`
      SELECT id, workspace_id, provider, external_account_id, display_name,
             status, connection_method, connected_at, last_synced_at,
             metadata_json, created_at, updated_at
      FROM marketplace_accounts
      WHERE workspace_id = ?
      ORDER BY provider, created_at
    `).bind(workspaceId),
    db.prepare(`SELECT * FROM marketplace_balance_entries WHERE workspace_id = ? ORDER BY created_at_external`).bind(workspaceId),
    db.prepare(`SELECT * FROM custom_inventory_categories WHERE workspace_id = ? ORDER BY created_at`).bind(workspaceId),
    db.prepare(`SELECT * FROM inventory_category_preferences WHERE workspace_id = ? ORDER BY category_key`).bind(workspaceId),
    db.prepare(`SELECT * FROM sku_sequences WHERE workspace_id = ? ORDER BY prefix`).bind(workspaceId),
    db.prepare(`SELECT * FROM sku_reservations WHERE workspace_id = ? ORDER BY reserved_at`).bind(workspaceId),
    db.prepare(`SELECT * FROM import_batches WHERE workspace_id = ? ORDER BY imported_at`).bind(workspaceId),
    db.prepare(`SELECT * FROM sync_jobs WHERE workspace_id = ? ORDER BY started_at`).bind(workspaceId)
  ]);

  const workspace = (results[0].results[0] ?? null) as Record<string, unknown> | null;
  const workspaceName = typeof workspace?.name === 'string' ? workspace.name : 'workspace';
  const exportedAt = new Date().toISOString();

  const payload = {
    exportVersion: 1,
    exportedAt,
    account: {
      name: locals.authName,
      email: locals.authEmail,
      role: locals.workspaceRole
    },
    workspace,
    data: {
      inventory: results[1].results,
      listings: results[2].results,
      orders: results[3].results,
      orderItems: results[4].results,
      financialTransactions: results[5].results,
      purchaseLots: results[6].results,
      marketplaceConnections: results[7].results,
      marketplaceBalanceEntries: results[8].results,
      customInventoryCategories: results[9].results,
      inventoryCategoryPreferences: results[10].results,
      skuSequences: results[11].results,
      skuReservations: results[12].results,
      importHistory: results[13].results,
      syncHistory: results[14].results
    },
    notes: [
      'eBay access and refresh tokens are intentionally excluded from exports.',
      'Passwords, sessions, verification tokens, and other authentication secrets are intentionally excluded.'
    ]
  };

  const date = exportedAt.slice(0, 10);
  const filename = `sellquity-${safeFilename(workspaceName)}-${date}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store, private'
    }
  });
};
