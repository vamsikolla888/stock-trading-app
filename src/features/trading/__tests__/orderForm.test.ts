import {
  referencePrice,
  validateOrder,
  type OrderFormState,
} from '@/features/trading/lib/orderForm';

const base: OrderFormState = {
  side: 'BUY',
  orderType: 'MARKET',
  quantity: '10',
  limitPrice: '',
  triggerPrice: '',
};

describe('validateOrder', () => {
  it('accepts a market order and ignores stray price fields', () => {
    const { order, errors } = validateOrder({ ...base, limitPrice: '100', triggerPrice: '90' });
    expect(errors).toEqual({});
    expect(order).toEqual({ quantity: 10, price: null, triggerPrice: null });
  });

  it('requires a whole, positive, bounded quantity', () => {
    expect(validateOrder({ ...base, quantity: '' }).errors.quantity).toBeDefined();
    expect(validateOrder({ ...base, quantity: '0' }).errors.quantity).toBeDefined();
    expect(validateOrder({ ...base, quantity: '100001' }).errors.quantity).toBeDefined();
  });

  it('requires a price for limit orders', () => {
    expect(validateOrder({ ...base, orderType: 'LIMIT' }).errors.limitPrice).toBe('Enter a price');
    expect(validateOrder({ ...base, orderType: 'LIMIT', limitPrice: '1285.5' }).order?.price).toBe(
      1285.5,
    );
  });

  it('requires only a trigger for SL-M', () => {
    const { order } = validateOrder({ ...base, orderType: 'SL-M', triggerPrice: '1200' });
    expect(order).toEqual({ quantity: 10, price: null, triggerPrice: 1200 });
  });

  it('keeps an SL limit on the correct side of its trigger', () => {
    expect(
      validateOrder({ ...base, orderType: 'SL', limitPrice: '99', triggerPrice: '100' }).errors
        .limitPrice,
    ).toMatch(/at or above/);
    expect(
      validateOrder({
        ...base,
        side: 'SELL',
        orderType: 'SL',
        limitPrice: '101',
        triggerPrice: '100',
      }).errors.limitPrice,
    ).toMatch(/at or below/);
    expect(
      validateOrder({ ...base, orderType: 'SL', limitPrice: '101', triggerPrice: '100' }).order,
    ).not.toBeNull();
  });
});

describe('referencePrice', () => {
  it('prefers the limit, then the trigger, then the live price', () => {
    expect(referencePrice({ quantity: 1, price: 105, triggerPrice: 100 }, 'SL', 99)).toBe(105);
    expect(referencePrice({ quantity: 1, price: null, triggerPrice: 100 }, 'SL-M', 99)).toBe(100);
    expect(referencePrice({ quantity: 1, price: null, triggerPrice: null }, 'MARKET', 99)).toBe(99);
  });
});
