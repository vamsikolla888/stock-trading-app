import { describeLiveOrder, describePaperOrder } from '@/features/trading/lib/orderOutcome';
import type { LiveOrder, PaperOrder } from '@/features/trading/types';

function liveOrder(overrides: Partial<LiveOrder>): LiveOrder {
  return {
    id: 'o1',
    category: 'equity_delivery',
    product: 'CNC',
    exchange: 'NSE',
    tradingsymbol: 'RELIANCE',
    side: 'BUY',
    orderType: 'MARKET',
    quantity: 10,
    price: null,
    triggerPrice: null,
    status: 'FILLED',
    riskDecision: null,
    brokerOrderId: 'b1',
    filledQuantity: 10,
    averageFillPrice: 1285.6,
    rejectionReason: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('describeLiveOrder', () => {
  it('reports an execution with its fill price', () => {
    const outcome = describeLiveOrder(liveOrder({}));
    expect(outcome.tone).toBe('success');
    expect(outcome.message).toBe('Bought 10 × RELIANCE at an average of ₹1,285.60.');
  });

  it('never presents a risk rejection (a 2xx response) as success', () => {
    const outcome = describeLiveOrder(
      liveOrder({
        status: 'RISK_REJECTED',
        riskDecision: {
          approved: false,
          reason: 'Market is closed',
          decidedAt: '',
          checks: [
            { name: 'kill_switch', passed: true, detail: 'Clear' },
            { name: 'market_session', passed: false, detail: 'Outside 09:15–15:30 IST' },
          ],
        },
      }),
    );
    expect(outcome.tone).toBe('danger');
    expect(outcome.message).toBe('Market is closed');
    expect(outcome.details).toEqual(['Outside 09:15–15:30 IST']);
  });

  it('tells the user not to resubmit when the broker didn’t confirm', () => {
    const outcome = describeLiveOrder(liveOrder({ status: 'UNKNOWN' }));
    expect(outcome.tone).toBe('warning');
    expect(outcome.message).toMatch(/do not place this order a second time/);
  });

  it('surfaces the broker’s rejection reason', () => {
    const outcome = describeLiveOrder(
      liveOrder({ status: 'REJECTED', rejectionReason: 'Insufficient margin' }),
    );
    expect(outcome.tone).toBe('danger');
    expect(outcome.message).toBe('Insufficient margin');
  });
});

describe('describePaperOrder', () => {
  const paper: PaperOrder = {
    id: 'p1',
    segment: 'equity',
    exchange: 'NSE',
    symbol: 'TCS',
    companyName: null,
    side: 'SELL',
    type: 'MARKET',
    quantity: 2,
    limitPrice: null,
    triggerPrice: null,
    status: 'REJECTED',
    filledPrice: null,
    filledAt: null,
    charges: 0,
    realisedPnl: null,
    note: 'You hold 0 shares',
    createdAt: '',
  };

  it('explains a paper rejection from its note', () => {
    expect(describePaperOrder(paper)).toMatchObject({
      tone: 'danger',
      message: 'You hold 0 shares',
    });
  });

  it('labels a paper fill as virtual', () => {
    const outcome = describePaperOrder({
      ...paper,
      status: 'FILLED',
      filledPrice: 3912.1,
      note: null,
    });
    expect(outcome.message).toBe('Sold 2 × TCS at ₹3,912.10. No real money moved.');
  });
});
