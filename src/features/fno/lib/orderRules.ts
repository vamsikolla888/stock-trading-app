/**
 * The contract rules an F&O order must satisfy — freeze limit, tick grid, expiry, allowed
 * side, price/trigger shape — for INSTANT feedback on the ticket.
 *
 * A DELIBERATE COPY of server/src/modules/fno/fno-order-rules.ts (via the web client's
 * lib/orderRules.ts). The server's copy is authoritative — it refuses the order — so any
 * change there must be mirrored here, or the ticket will approve what the server refuses.
 */

export interface ContractFacts {
  kind: 'CE' | 'PE' | 'FUT';
  expiry: string;
  lotSize: number;
  tickSize: number | null;
  freezeQuantity: number | null;
  buyAllowed: boolean;
  sellAllowed: boolean;
}

export interface ContractOrderInput {
  contract: ContractFacts;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  lots: number;
  price: number | null;
  triggerPrice: number | null;
  /** IST calendar date, YYYY-MM-DD. */
  today: string;
}

export interface ContractRuleIssue {
  field: 'quantity' | 'price' | 'triggerPrice' | 'side' | 'expiry';
  message: string;
}

/**
 * The request schema's own ceiling (server fno.dto.ts `lots`: 1–10,000), separate from the
 * contract rules: with no freeze limit published, nothing else would stop a typed 20000
 * reaching the confirm step only to come back a 422.
 */
export const MAX_LOTS_PER_REQUEST = 10_000;

export function requestLimitIssues(lots: number): ContractRuleIssue[] {
  return Number.isInteger(lots) && lots > MAX_LOTS_PER_REQUEST
    ? [
        {
          field: 'quantity',
          message: `At most ${MAX_LOTS_PER_REQUEST.toLocaleString('en-IN')} lots can be sent in one order`,
        },
      ]
    : [];
}

export const needsLimitPrice = (t: ContractOrderInput['orderType']) => t === 'LIMIT' || t === 'SL';
export const needsTriggerPrice = (t: ContractOrderInput['orderType']) => t === 'SL' || t === 'SL-M';

/** True when `price` sits on the tick grid, compared in integer paise. */
export function isOnTick(price: number, tick: number | null): boolean {
  if (tick == null || !(tick > 0)) return true;
  const p = Math.round(price * 100);
  const t = Math.round(tick * 100);
  if (t <= 0 || Math.abs(p - price * 100) > 1e-6) return false;
  return p % t === 0;
}

/** Largest number of LOTS one order may carry, or null when no freeze limit is published. */
export function maxLotsPerOrder(
  contract: Pick<ContractFacts, 'lotSize' | 'freezeQuantity'>,
): number | null {
  if (contract.freezeQuantity == null || !(contract.lotSize > 0)) return null;
  return Math.max(0, Math.floor((contract.freezeQuantity - 1) / contract.lotSize));
}

export function checkContractOrder(input: ContractOrderInput): ContractRuleIssue[] {
  const issues: ContractRuleIssue[] = [];
  const { contract: c } = input;

  if (c.expiry < input.today) {
    issues.push({ field: 'expiry', message: `This contract expired on ${c.expiry}` });
  }
  if (input.side === 'BUY' && !c.buyAllowed) {
    issues.push({
      field: 'side',
      message: 'The exchange is not accepting buy orders in this contract right now',
    });
  }
  if (input.side === 'SELL' && !c.sellAllowed) {
    issues.push({
      field: 'side',
      message: 'The exchange is not accepting sell orders in this contract right now',
    });
  }

  if (!Number.isInteger(input.lots) || input.lots < 1) {
    issues.push({ field: 'quantity', message: 'Enter a whole number of lots (1 or more)' });
  } else {
    const maxLots = maxLotsPerOrder(c);
    if (maxLots != null && input.lots > maxLots) {
      issues.push({
        field: 'quantity',
        message: `${input.lots} lots (${(input.lots * c.lotSize).toLocaleString('en-IN')} qty) is over the exchange's per-order freeze limit — at most ${maxLots} lots per order; split it into smaller orders`,
      });
    }
  }

  const needsPrice = needsLimitPrice(input.orderType);
  const needsTrigger = needsTriggerPrice(input.orderType);
  if (needsPrice) {
    if (input.price == null || !(input.price > 0)) {
      issues.push({ field: 'price', message: 'Enter a limit price' });
    } else if (!isOnTick(input.price, c.tickSize)) {
      issues.push({
        field: 'price',
        message: `Price must be a multiple of the ₹${c.tickSize} tick`,
      });
    }
  } else if (input.price != null) {
    issues.push({ field: 'price', message: `A ${input.orderType} order takes no limit price` });
  }
  if (needsTrigger) {
    if (input.triggerPrice == null || !(input.triggerPrice > 0)) {
      issues.push({ field: 'triggerPrice', message: 'Enter a trigger price' });
    } else if (!isOnTick(input.triggerPrice, c.tickSize)) {
      issues.push({
        field: 'triggerPrice',
        message: `Trigger must be a multiple of the ₹${c.tickSize} tick`,
      });
    }
  } else if (input.triggerPrice != null) {
    issues.push({
      field: 'triggerPrice',
      message: `A ${input.orderType} order takes no trigger price`,
    });
  }
  if (input.orderType === 'SL' && input.price != null && input.triggerPrice != null) {
    const ok =
      input.side === 'SELL' ? input.price <= input.triggerPrice : input.price >= input.triggerPrice;
    if (!ok) {
      issues.push({
        field: 'price',
        message:
          input.side === 'SELL'
            ? 'A sell stop-loss needs its limit at or below the trigger'
            : 'A buy stop-loss needs its limit at or above the trigger',
      });
    }
  }
  return issues;
}

/** A typed price: blank → null, anything not a positive finite number → NaN (an issue). */
export function parsePriceInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : Number.NaN;
}
