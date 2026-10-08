import { formatINR } from '@/lib/utils/formatters';

/** The bounds and balances a wallet draft is checked against — the cash wallet's or F&O's. */
export interface WalletLimits {
  capital: number;
  cash: number;
  minCapital: number;
  maxCapital: number;
}

/** One-tap sizes for the cash paper wallet — the web's Settings → Paper wallet chips. */
export const CASH_WALLET_PRESETS = [500_000, 1_000_000, 2_500_000, 5_000_000] as const;
/** One-tap sizes for the F&O sandbox's own wallet — the web's F&O paper wallet chips. */
export const FNO_WALLET_PRESETS = [250_000, 500_000, 1_000_000, 2_500_000] as const;
/** The editor's default chips (the cash wallet's). Kept for existing callers. */
export const WALLET_PRESETS = CASH_WALLET_PRESETS;

/** A preset chip's label: "₹2.5L", "₹10L", "₹1Cr" (the figures above the chips stay exact). */
export function presetLabel(amount: number): string {
  return amount >= 10_000_000 ? `₹${amount / 10_000_000}Cr` : `₹${amount / 100_000}L`;
}

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
 * What a new wallet figure would do. Raising it deposits the difference and lowering it
 * withdraws it, from free cash only; positions, orders and booked P&L stay as they are. The
 * bounds are the server's (`minCapital` knows what's invested or blocked). Shared by the cash
 * paper wallet and the F&O sandbox's, which follow the same rule.
 */
export function walletDraft(pool: WalletLimits, text: string): WalletDraft {
  const amount = rupeesOnly(text);
  const delta = amount !== null ? amount - pool.capital : 0;
  const tooLow = amount !== null && amount < pool.minCapital;
  const tooHigh = amount !== null && amount > pool.maxCapital;
  let message: string;
  if (amount === null) message = 'Enter an amount in rupees.';
  else if (tooLow)
    message = `The lowest it can be right now is ${formatINR(pool.minCapital, 0)} — only free cash can be withdrawn. Close positions or cancel buy orders to go lower.`;
  else if (tooHigh) message = `A paper wallet holds at most ${formatINR(pool.maxCapital, 0)}.`;
  else if (delta > 0)
    message = `Deposits ${formatINR(delta, 0)}: cash rises to ${formatINR(pool.cash + delta)}. Positions and history stay as they are.`;
  else if (delta < 0)
    message = `Withdraws ${formatINR(-delta, 0)} of free cash: cash falls to ${formatINR(pool.cash + delta)}. Positions and history stay as they are.`;
  else
    message = `Between ${formatINR(pool.minCapital, 0)} and ${formatINR(pool.maxCapital, 0)}. Raising deposits the difference; lowering withdraws free cash.`;

  return {
    amount,
    delta,
    tooLow,
    tooHigh,
    canSave: amount !== null && delta !== 0 && !tooLow && !tooHigh,
    message,
  };
}
