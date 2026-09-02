/// <reference types="@cloudflare/workers-types" />

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
        ASSETS: Fetcher;
        EBAY_CLIENT_ID?: string;
        EBAY_CLIENT_SECRET?: string;
        EBAY_REDIRECT_URI?: string;
        EBAY_TOKEN_ENCRYPTION_KEY?: string;
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
