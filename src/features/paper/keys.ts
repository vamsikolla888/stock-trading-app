import type { CashSegment, PaperOrderInput } from './types';

const profileKey = (profileId?: string) => profileId ?? 'default';

/**
 * Every paper query sits under ['paper'], so one invalidation after an order, a cancel, a
 * reset or a wallet change refreshes the whole account at once — a partial refresh would
 * leave funds, positions and the order log disagreeing on screen. The PROFILE is in every
 * account key: two profiles must never share a cache entry.
 */
export const paperKeys = {
  all: ['paper'] as const,
  profiles: ['paper', 'profiles'] as const,
  segments: (profileId?: string) => ['paper', 'segments', profileKey(profileId)] as const,
  portfolio: (segment: CashSegment, profileId?: string) =>
    ['paper', 'portfolio', segment, profileKey(profileId)] as const,
  orders: (limit: number, profileId?: string) =>
    ['paper', 'orders', limit, profileKey(profileId)] as const,
  preview: (input: PaperOrderInput | null) => ['paper', 'preview', input] as const,
  performance: (days: number, profileId?: string) =>
    ['paper', 'performance', days, profileKey(profileId)] as const,
  analytics: (profileId?: string) => ['paper', 'analytics', profileKey(profileId)] as const,
  wallet: (profileId?: string) => ['paper', 'wallet', profileKey(profileId)] as const,
  autoTradeConfig: ['paper', 'autotrade', 'config'] as const,
  autoTradeActivity: ['paper', 'autotrade', 'activity'] as const,
  quotes: (signature: string) => ['paper', 'quotes', signature] as const,
  strategies: ['paper', 'strategies'] as const,
};
