import { formatINR } from '@/lib/utils/formatters';

import type { WalletPool } from '../types';

/** One-tap wallet sizes, as on the web's Settings → Paper wallet. */
export const WALLET_PRESETS = [100_000, 500_000, 1_000_000, 2_500_000] as const;

export interface WalletDraft {
  amount: number | null;
  /** Positive deposits, negative withdraws — from free cash only. */
  delta: number;
  tooLow: boolean;
  tooHigh: boolean;
  canSave: boolean;
  /** What saving would do, in words — the part people get wrong. */
  message: string;
}

/** Whole rupees from whatever was typed ("5,00,000" → 500000); null when nothing numeric. */
export function rupeesOnly(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/**
 * What a new wallet figure would do to a pool. Raising it deposits the difference and
 * lowering it withdraws it, from free cash only; positions, orders and booked P&L stay as they
 * are. The bounds are the server's (`minCapital` knows what's invested or blocked).
 */
export function walletDraft(
  pool: Pick<WalletPool, 'capital' | 'cash' | 'minCapital' | 'maxCapital'>,
  text: string,
): WalletDraft {
  const amount = rupeesOnly(text);
  const delta = amount !== null ? amount - pool.capital : 0;
  const tooLow = amount !== null && amount < pool.minCapital;
  const tooHigh = amount !== null && amount > pool.maxCapital;
  let message: string;
  if (amount === null) message = 'Enter an amount in rupees.';
  else if (tooLow)
    message = `The lowest it can be right now is ${formatINR(pool.minCapital, 0)} — only free cash can be withdrawn. Sell positions or cancel buy orders to go lower.`;
  else if (tooHigh) message = `A paper wallet holds at most ${formatINR(pool.maxCapital, 0)}.`;
  else if (delta > 0)
    message = `Deposits ${formatINR(delta, 0)}: cash rises to ${formatINR(pool.cash + delta)}. Positions and history stay as they are.`;
  else if (delta < 0)
    message = `Withdraws ${formatINR(-delta, 0)} of free cash: cash falls to ${formatINR(pool.cash + delta)}. Positions and history stay as they are.`;
  else
    message = `Can be set between ${formatINR(pool.minCapital, 0)} and ${formatINR(pool.maxCapital, 0)}.`;

  return {
    amount,
    delta,
    tooLow,
    tooHigh,
    canSave: amount !== null && delta !== 0 && !tooLow && !tooHigh,
    message,
  };
}
