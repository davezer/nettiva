export const DEFAULT_USER_ID = 'user_local_owner';
export const DEFAULT_WORKSPACE_ID = 'workspace_default';

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type OnboardingStep = 'workspace' | 'ebay' | 'inventory' | 'complete';

export type WorkspaceContext = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: WorkspaceRole;
  onboardingStep: OnboardingStep;
};

export type AuthIdentity = {
  id: string;
  name: string;
  email: string;
};

export type ResolvedTenant = {
  userId: string;
  workspace: WorkspaceContext;
};

export function currentWorkspaceId(locals: App.Locals) {
  if (!locals.workspaceId) {
    throw new Error('Authenticated workspace context is unavailable.');
  }
  return locals.workspaceId;
}

export function workspaceEntityId(workspaceId: string, legacyId: string) {
  return workspaceId === DEFAULT_WORKSPACE_ID
    ? legacyId
    : `${workspaceId}:${legacyId}`;
}

function slugBase(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 42) || 'workspace';
}

async function linkedUser(db: D1Database, authUserId: string) {
  return db.prepare(`
    SELECT id
    FROM users
    WHERE auth_user_id = ? AND status = 'active'
    LIMIT 1
  `).bind(authUserId).first<{ id: string }>();
}

async function syncApplicationIdentity(
  db: D1Database,
  appUserId: string,
  identity: AuthIdentity
) {
  await db.prepare(`
    UPDATE users
    SET email = ?, display_name = ?, updated_at = ?
    WHERE id = ? AND status = 'active'
  `).bind(
    identity.email,
    identity.name || identity.email,
    new Date().toISOString(),
    appUserId
  ).run();
}

async function provisionApplicationUser(
  db: D1Database,
  identity: AuthIdentity
) {
  const existing = await linkedUser(db, identity.id);
  if (existing) {
    await syncApplicationIdentity(db, existing.id, identity);
    return existing.id;
  }

  const linkedCount = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM users
    WHERE auth_user_id IS NOT NULL
  `).first<{ count: number }>();

  const founder = await db.prepare(`
    SELECT id
    FROM users
    WHERE id = ?
      AND auth_user_id IS NULL
      AND status = 'active'
    LIMIT 1
  `).bind(DEFAULT_USER_ID).first<{ id: string }>();

  // First authenticated account claims the pre-auth founder workspace.
  if (founder && Number(linkedCount?.count ?? 0) === 0) {
    await db.prepare(`
      UPDATE users
      SET
        auth_user_id = ?,
        email = ?,
        display_name = ?,
        updated_at = ?
      WHERE id = ?
        AND auth_user_id IS NULL
    `).bind(
      identity.id,
      identity.email,
      identity.name || identity.email,
      new Date().toISOString(),
      DEFAULT_USER_ID
    ).run();

    const claimed = await linkedUser(db, identity.id);
    if (claimed) return claimed.id;
  }

  // Future open signups get a fresh isolated trial workspace. Migration 0008
  // gives new workspaces an onboarding_step default of `workspace`, so they are
  // routed through the setup wizard before business data is exposed.
  const appUserId = `user:${identity.id}`;
  const workspaceId = `workspace:${crypto.randomUUID()}`;
  const suffix = crypto.randomUUID().slice(0, 8);
  const workspaceName = identity.name?.trim()
    ? `${identity.name.trim()}'s Workspace`
    : 'New Workspace';
  const workspaceSlug = `${slugBase(workspaceName)}-${suffix}`;
  const now = new Date().toISOString();

  await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO users (
        id, auth_user_id, email, display_name, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      appUserId,
      identity.id,
      identity.email,
      identity.name || identity.email,
      now,
      now
    ),
    db.prepare(`
      INSERT OR IGNORE INTO workspaces (
        id, name, slug, plan, status, created_by_user_id, created_at, updated_at
      )
      VALUES (?, ?, ?, 'trial', 'active', ?, ?, ?)
    `).bind(workspaceId, workspaceName, workspaceSlug, appUserId, now, now),
    db.prepare(`
      INSERT OR IGNORE INTO workspace_members (
        workspace_id, user_id, role, status, created_at, updated_at
      )
      VALUES (?, ?, 'owner', 'active', ?, ?)
    `).bind(workspaceId, appUserId, now, now)
  ]);

  const created = await linkedUser(db, identity.id);
  if (!created) {
    throw new Error('Could not provision the Nettiva application user.');
  }
  return created.id;
}

export async function resolveTenantForAuthUser(
  db: D1Database,
  identity: AuthIdentity,
  preferredWorkspaceId?: string | null
): Promise<ResolvedTenant | null> {
  const userId = await provisionApplicationUser(db, identity);

  const row = await db.prepare(`
    SELECT
      w.id,
      w.name,
      w.slug,
      w.plan,
      w.onboarding_step AS onboardingStep,
      wm.role
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ?
      AND wm.status = 'active'
      AND w.status = 'active'
    ORDER BY
      CASE WHEN w.id = ? THEN 0 ELSE 1 END,
      CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      wm.created_at ASC
    LIMIT 1
  `).bind(userId, preferredWorkspaceId ?? '').first<WorkspaceContext>();

  if (!row) return null;

  return {
    userId,
    workspace: {
      ...row,
      role: row.role as WorkspaceRole,
      onboardingStep: row.onboardingStep as OnboardingStep
    }
  };
}

export async function getWorkspaceContext(
  db: D1Database,
  locals: App.Locals
): Promise<WorkspaceContext | null> {
  const workspaceId = currentWorkspaceId(locals);
  if (!locals.userId) return null;

  const row = await db.prepare(`
    SELECT
      w.id,
      w.name,
      w.slug,
      w.plan,
      w.onboarding_step AS onboardingStep,
      wm.role
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ?
      AND wm.workspace_id = ?
      AND wm.status = 'active'
      AND w.status = 'active'
    LIMIT 1
  `).bind(locals.userId, workspaceId).first<WorkspaceContext>();

  return row
    ? {
        ...row,
        role: row.role as WorkspaceRole,
        onboardingStep: row.onboardingStep as OnboardingStep
      }
    : null;
}
