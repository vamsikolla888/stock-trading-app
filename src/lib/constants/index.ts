export const QUERY_STALE_TIME = {
  realtime: 5_000,
  short: 30_000,
  standard: 5 * 60_000,
  long: 30 * 60_000,
} as const;

export const STORAGE_KEYS = {
  themePreference: 'theme-store',
  authState: 'auth-store',
  preferences: 'preferences-store',
} as const;

export const HAPTICS = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
} as const;
