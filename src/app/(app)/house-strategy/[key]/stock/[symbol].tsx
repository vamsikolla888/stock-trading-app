import { IntradayStockScreen } from '@/features/strategies/components/intraday/IntradayStockScreen';

// A render failure here shows the error page with a retry, not a crashed app.
export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/**
 * Intelligence › Strategies › Bollinger Mid-Band Thrust › one stock: every trade the latest
 * backtest made in it. Params: `u` (nifty50 | nifty500) and `v` (improved | base).
 */
export default IntradayStockScreen;
