import type { PageServerLoad } from './$types';
import { currentWorkspaceId, getWorkspaceContext } from '$lib/server/workspace';
import {
  loadBuiltInInventoryCategories,
  loadCustomInventoryCategories
} from '$lib/server/inventory-categories';

type PrepDbRow = {
  id: string;
  title: string;
  sku: string | null;
  ebayItemId: string | null;
  conditionName: string | null;
  purchasedAt: string | null;
  category: string;
  costCents: number | null;
  source: string | null;
  location: string | null;
  listingTitleDraft: string | null;
  targetListPriceCents: number | null;
  listingPhotosReady: number;
  listingNotes: string | null;
  createdAt: string;
};

export const load: PageServerLoad = async ({ platform, locals }) => {
  if (!platform) {
    return {
      workspace: null,
      items: [],
      categories: []
    };
  }

  const db = platform.env.DB;
  const workspaceId = currentWorkspaceId(locals);

  const [workspace, itemResult, builtIns, customCategories] = await Promise.all([
    getWorkspaceContext(db, locals),
    db.prepare(`
      SELECT
        id,
        title,
        sku,
        ebay_item_id AS ebayItemId,
        condition_name AS conditionName,
        purchased_at AS purchasedAt,
        inventory_category AS category,
        purchase_cost_cents AS costCents,
        source,
        storage_location AS location,
        listing_title_draft AS listingTitleDraft,
        target_list_price_cents AS targetListPriceCents,
        listing_photos_ready AS listingPhotosReady,
        listing_notes AS listingNotes,
        created_at AS createdAt
      FROM inventory_items
      WHERE workspace_id = ?
        AND status = 'unlisted'
      ORDER BY
        CASE
          WHEN sku IS NOT NULL
            AND purchase_cost_cents IS NOT NULL
            AND listing_photos_ready = 1
            AND listing_title_draft IS NOT NULL
            AND TRIM(listing_title_draft) <> ''
            AND target_list_price_cents IS NOT NULL
            AND target_list_price_cents > 0
          THEN 0
          ELSE 1
        END,
        COALESCE(purchased_at, created_at) ASC,
        created_at ASC
      LIMIT 1000
    `).bind(workspaceId).all<PrepDbRow>(),
    loadBuiltInInventoryCategories(db, workspaceId),
    loadCustomInventoryCategories(db, workspaceId)
  ]);

  return {
    workspace,
    items: itemResult.results.map((row) => ({
      ...row,
      costCents: row.costCents == null ? null : Number(row.costCents),
      targetListPriceCents:
        row.targetListPriceCents == null ? null : Number(row.targetListPriceCents),
      listingPhotosReady: Boolean(row.listingPhotosReady)
    })),
    categories: [...builtIns, ...customCategories]
  };
};
