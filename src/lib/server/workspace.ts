export const DEFAULT_USER_ID = 'user_local_owner';
export const DEFAULT_WORKSPACE_ID = 'workspace_default';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export type WorkspaceContext = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: WorkspaceRole;
};

export function currentWorkspaceId(locals: App.Locals) {
  return locals.workspaceId || DEFAULT_WORKSPACE_ID;
}

export async function getWorkspaceContext(
  db: D1Database,
  locals: App.Locals
): Promise<WorkspaceContext | null> {
  const workspaceId = currentWorkspaceId(locals);
  const row = await db.prepare(`
    SELECT id, name, slug, plan
    FROM workspaces
    WHERE id = ? AND status = 'active'
    LIMIT 1
  `).bind(workspaceId).first<Omit<WorkspaceContext, 'role'>>();

  if (!row) return null;

  return {
    ...row,
    role: locals.workspaceRole || 'member'
  };
}
