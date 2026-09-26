import type { PortfolioHistoryScope } from './types';

// Query keys live apart from the hooks so other features (trading) can invalidate the
// book without importing portfolio/hooks, which itself reads broker connections.
export const portfolioKeys = {
  /** Prefix of every book below — invalidate this after an order. */
  all: ['portfolio'] as const,
  broker: ['portfolio', 'broker'] as const,
  linked: (broker: string) => ['portfolio', 'linked', broker] as const,
  manual: ['portfolio', 'manual'] as const,
  orders: (broker: string, page: number) => ['portfolio', 'orders', broker, page] as const,
  trades: (broker: string) => ['portfolio', 'trades', broker] as const,
  history: (days: number, scope: PortfolioHistoryScope) =>
    ['portfolio', 'history', days, scope] as const,
  pnl: (broker: string, days: number) => ['portfolio', 'linked', broker, 'pnl', days] as const,
  analytics: (broker: string, days: number) =>
    ['portfolio', 'linked', broker, 'analytics', days] as const,
  lifetime: (broker: string) => ['portfolio', 'linked', broker, 'lifetime'] as const,
  statement: (broker: string, page: number, sym: string | null) =>
    ['portfolio', 'linked', broker, 'lifetime', 'statement', page, sym] as const,
};
