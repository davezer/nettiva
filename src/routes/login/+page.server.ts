import type { PageServerLoad } from './$types';
import { signupAvailability } from '$lib/server/auth';

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export const load: PageServerLoad = async ({ platform, url }) => {
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));

  if (!platform) {
    return {
      returnTo,
      canSignUp: false,
      signupMode: 'closed' as const,
      authConfigured: false
    };
  }

  const authConfigured = Boolean(platform.env.BETTER_AUTH_SECRET?.trim());

  if (!authConfigured) {
    return {
      returnTo,
      canSignUp: false,
      signupMode: 'closed' as const,
      authConfigured: false
    };
  }

  const availability = await signupAvailability(platform.env);

  return {
    returnTo,
    canSignUp: availability.canSignUp,
    signupMode: availability.mode,
    authConfigured: true
  };
};
