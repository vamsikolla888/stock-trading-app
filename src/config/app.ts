export const appConfig = {
  /** Shown in-app (header, splash, sign-in). The launcher label is app.config.ts `name`. */
  name: 'Stocks',
  scheme: 'stocktrading',
  supportEmail: 'support@example.com',
  api: {
    timeoutMs: 15000,
  },
  query: {
    staleTimeMs: 30_000,
    /** Also the persisted cache's max age — cold starts paint from anything newer. */
    gcTimeMs: 24 * 60 * 60_000,
    retry: 2,
    /**
     * Version of the response shapes the persisted cache holds. BUMP IT whenever a response the
     * app reads changes shape: a restored cache bypasses the API layer's checks and goes straight
     * to the screens, and neither a dev reload nor an OTA update changes the app version.
     * 2 — one paper wallet, strategy runState, screener scan state (2026-10-01).
     */
    cacheSchema: 2,
  },
  market: {
    /** Quote/index refresh while the exchange is open; polling stops outside hours. */
    livePollMs: 15_000,
  },
  auth: {
    accessTokenKey: 'auth.accessToken',
    refreshTokenKey: 'auth.refreshToken',
    /** Refresh proactively when the access token has less than this left, saving a 401 round trip. */
    refreshSkewSeconds: 30,
    /** Mirrors the server's register DTO (server/src/modules/auth/auth.dto.ts). */
    passwordMinLength: 8,
    passwordMaxLength: 128,
    /** Minimum wait before "Resend link" re-enables on the forgot-password screen. */
    resetResendCooldownSeconds: 60,
    /** Server-side reset link lifetime (password-reset.use-case.ts TTL_SECONDS) — shown to the user. */
    resetLinkTtlMinutes: 60,
  },
} as const;
