import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { HoldingsCard } from '@/features/home/components/HoldingsCard';
import type { HomeBook } from '@/features/portfolio/hooks';
import { bookFigures, SESSION_EXPIRED_MESSAGE } from '@/features/portfolio/lib/books';
import type { HoldingView } from '@/features/portfolio/lib/portfolio';
import { usePreferencesStore } from '@/store/preferencesStore';

const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
}));

jest.mock('@/theme/ThemeProvider', () => {
  const { lightColors, palette } = jest.requireActual('@/theme/tokens');
  return { useTheme: () => ({ colors: lightColors, palette, isDark: false }) };
});

const reliance: HoldingView = {
  key: 'NSE:RELIANCE',
  symbol: 'RELIANCE',
  exchange: 'NSE',
  qty: 10,
  avg: 1200,
  ltp: 1285.6,
  invested: 12000,
  value: 12856,
  pnl: 856,
  pnlPct: 7.133333,
  dayChange: 157.5,
  dayChangePct: 1.24,
  sector: 'Energy',
};

function book(overrides: Partial<Omit<HomeBook, 'figures'>> = {}): HomeBook {
  const base = {
    id: 'mstock' as const,
    label: 'mStock',
    state: 'ready' as const,
    message: null,
    sessionExpired: false,
    asOf: null,
    stale: false,
    holdings: [reliance],
    availableCash: null,
    ...overrides,
  };
  return { ...base, figures: bookFigures(base.holdings) };
}

const onRetry = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  usePreferencesStore.setState({ hideValues: false });
});

describe('HoldingsCard', () => {
  it('shows a placeholder until the broker reads have answered', () => {
    render(<HoldingsCard books={[]} isLoading onRetry={onRetry} />);
    expect(screen.getByLabelText('Loading your holdings')).toBeTruthy();
  });

  it('shows value and returns, names the book, and hides cash it does not know', () => {
    render(<HoldingsCard books={[book()]} isLoading={false} onRetry={onRetry} />);

    expect(screen.getByText('Holdings (1)')).toBeTruthy();
    expect(screen.getByText('mStock')).toBeTruthy();
    expect(screen.getByText('₹12,856.00')).toBeTruthy();
    expect(screen.getByText('+₹157.50 (1.24%)')).toBeTruthy();
    expect(screen.getByText('+₹856.00 (7.13%)')).toBeTruthy();
    expect(screen.getByText('₹12,000.00')).toBeTruthy();
    expect(screen.queryByText('Available funds')).toBeNull();
  });

  it('masks every amount behind the eye toggle', () => {
    render(
      <HoldingsCard books={[book({ availableCash: 2500 })]} isLoading={false} onRetry={onRetry} />,
    );

    fireEvent.press(screen.getByLabelText('Hide portfolio values'));

    expect(screen.queryByText('₹12,856.00')).toBeNull();
    expect(screen.queryByText('₹2,500.00')).toBeNull();
    expect(screen.getAllByText('••••••').length).toBeGreaterThanOrEqual(4);
    expect(usePreferencesStore.getState().hideValues).toBe(true);
  });

  it('opens the book’s own portfolio from the card', () => {
    render(
      <HoldingsCard
        books={[book({ id: 'groww', label: 'Groww' })]}
        isLoading={false}
        onRetry={onRetry}
      />,
    );
    fireEvent.press(screen.getByText('₹12,856.00'));
    expect(mockNavigate).toHaveBeenCalledWith('/trade/groww');
  });

  it('pages between books with dash-and-dot tabs, first book selected', () => {
    render(
      <HoldingsCard
        books={[book({ id: 'groww', label: 'Groww' }), book()]}
        isLoading={false}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Groww, 1 holding', selected: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'mStock, 1 holding', selected: false })).toBeTruthy();
  });

  it('invites a connection when there is no book at all', () => {
    render(<HoldingsCard books={[]} isLoading={false} onRetry={onRetry} />);
    expect(screen.getByText('Your investments show up here')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Connect broker' }));
    expect(mockPush).toHaveBeenCalledWith('/brokers');
  });

  it('does not ask a connected user with no stocks to connect again', () => {
    render(<HoldingsCard books={[book({ holdings: [] })]} isLoading={false} onRetry={onRetry} />);
    expect(screen.getByText('No holdings in mStock')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect broker' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Explore stocks' }));
    expect(mockNavigate).toHaveBeenCalledWith('/explore');
  });

  it('asks to reconnect a lapsed session that has nothing cached', () => {
    render(
      <HoldingsCard
        books={[
          book({
            holdings: [],
            state: 'error',
            sessionExpired: true,
            message: SESSION_EXPIRED_MESSAGE,
          }),
        ]}
        isLoading={false}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Reconnect mStock')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Reconnect' }));
    expect(mockPush).toHaveBeenCalledWith('/brokers');
  });

  it('keeps last known figures for an unreadable book, with the reason and a retry', () => {
    render(
      <HoldingsCard
        books={[book({ state: 'error', message: 'Broker down' })]}
        isLoading={false}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Last known value')).toBeTruthy();
    expect(screen.getByText('₹12,856.00')).toBeTruthy();
    expect(screen.getByText('Broker down')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('labels hand-tracked holdings without a live price as cost', () => {
    const unpriced = {
      ...reliance,
      key: 'm1',
      value: null,
      pnl: null,
      pnlPct: null,
      dayChange: null,
    };
    render(
      <HoldingsCard
        books={[book({ id: 'manual', label: 'Added by hand', holdings: [unpriced] })]}
        isLoading={false}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Invested value')).toBeTruthy();
    expect(screen.getByText('₹12,000.00')).toBeTruthy();
    expect(screen.getByText('Price unavailable')).toBeTruthy();
    expect(screen.queryByText('1D returns')).toBeNull();
    // Hand-added holdings have no screen of their own on the phone.
    expect(screen.queryByText('View all')).toBeNull();
  });
});
