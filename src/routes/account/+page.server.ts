import type { PageServerLoad } from './$types';
import { authEmailMode } from '$lib/server/email';
import { getWorkspaceContext } from '$lib/server/workspace';

function localHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

type VerificationRow = { emailVerified: number };
type DeletionRow = {
  id: string;
  status: string;
  requestedAt: string;
  scheduledFor: string;
};

export const load: PageServerLoad = async ({ platform, locals, url }) => {
  if (!platform || !locals.authUserId) {
    return {
      user: null,
      workspace: null,
      deletionRequest: null,
      devMailbox: false
    };
  }

  const [workspace, verification, deletionRequest] = await Promise.all([
    getWorkspaceContext(platform.env.DB, locals),
    platform.env.DB.prepare(`
      SELECT emailVerified
      FROM "user"
      WHERE id = ?
      LIMIT 1
    `).bind(locals.authUserId).first<VerificationRow>(),
    platform.env.DB.prepare(`
      SELECT
        id,
        status,
        requested_at AS requestedAt,
        scheduled_for AS scheduledFor
      FROM account_deletion_requests
      WHERE auth_user_id = ? AND status = 'requested'
      ORDER BY requested_at DESC
      LIMIT 1
    `).bind(locals.authUserId).first<DeletionRow>()
  ]);

  return {
    user: {
      name: locals.authName ?? locals.authEmail ?? 'Sellquity user',
      email: locals.authEmail ?? '',
      emailVerified: Boolean(verification?.emailVerified)
    },
    workspace,
    deletionRequest: deletionRequest ?? null,
    devMailbox:
      localHost(url.hostname) && authEmailMode(platform.env) === 'outbox'
  };
};
