import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({
  token: url.searchParams.get('token') ?? '',
  invalid: url.searchParams.get('error') === 'INVALID_TOKEN'
});
