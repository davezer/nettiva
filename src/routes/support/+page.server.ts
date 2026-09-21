import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
  email: locals.authEmail ?? '',
  signedIn: Boolean(locals.authUserId),
  workspaceId: locals.workspaceId ?? null
});
