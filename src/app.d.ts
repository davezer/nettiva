/// <reference types="@cloudflare/workers-types" />

declare global {
  namespace App {
    interface Locals {
      authUserId: string | null;
      authName: string | null;
      authEmail: string | null;
      userId: string | null;
      workspaceId: string | null;
      workspaceRole: 'owner' | 'admin' | 'member' | null;
    }

    interface Platform {
      env: {
        DB: D1Database;
        ASSETS: Fetcher;
        EBAY_CLIENT_ID?: string;
        EBAY_CLIENT_SECRET?: string;
        EBAY_REDIRECT_URI?: string;
        EBAY_TOKEN_ENCRYPTION_KEY?: string;

        BETTER_AUTH_SECRET?: string;
        BETTER_AUTH_URL?: string;
        NETTIVA_SIGNUP_MODE?: string;
        NETTIVA_FOUNDER_EMAIL?: string;

        // Legacy deployment gate. Kept typed during migration but no longer
        // used by Auth & Tenant Enforcement v2.
        NETTIVA_USERNAME?: string;
        NETTIVA_PASSWORD?: string;
      };
      context: ExecutionContext;
      caches: CacheStorage;
      cf?: IncomingRequestCfProperties;
    }
  }
}

export {};
