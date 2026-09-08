import type { LayoutServerLoad } from './$types';
import { loadOrganizedShell } from '$lib/server/organized-dashboard';

export const load: LayoutServerLoad = async ({ platform, locals }) => ({
  shell: await loadOrganizedShell(platform, locals)
});
