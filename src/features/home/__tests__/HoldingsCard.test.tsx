import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { HoldingsCard } from '@/features/home/components/HoldingsCard';
import type { PortfolioOverview } from '@/features/portfolio/hooks';
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

function overview(overrides: Partial<PortfolioOverview> = {}): PortfolioOverview {
  return {
    source: 'broker',
    brokerState: 'connected',
    brokerId: 'mstock',
    brokerName: 'mStock',
    holdings: [
      {
        key: 'NSE:RELIANCE',
        symbol: 'RELIANCE',
        exchange: 'NSE',
        qty: 10,
        avg: 1200,
        ltp: 1285.6,
        invested: 12000,
        value: 12856,
        pnl: 856,
        pnlPct: 7.13,
        dayChange: 157.5,
        dayChangePct: 1.24,
        sector: 'Energy',
      },
    ],
    positions: [],
    totals: { invested: 12000, value: 12856, pnl: 856, pnlPct: 7.13 },
    day: { abs: 157.5, pct: 1.24 },
    availableCash: null,
    stale: false,
    asOf: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  usePreferencesStore.setState({ hideValues: false });
});

describe('HoldingsCard', () => {
  it('shows a placeholder while the book loads', () => {
    render(
      <HoldingsCard
        overview={overview({ source: 'none', holdings: [], totals: null, isLoading: true })}
      />,
    );
    expect(screen.getByLabelText('Loading your holdings')).toBeTruthy();
  });

  it('shows value and returns, and hides cash it does not know', () => {
    render(<HoldingsCard overview={overview()} />);

    expect(screen.getByText('Holdings (1)')).toBeTruthy();
    expect(screen.getByText('₹12,856.00')).toBeTruthy();
    expect(screen.getByText('+₹157.50 (1.24%)')).toBeTruthy();
    expect(screen.getByText('+₹856.00 (7.13%)')).toBeTruthy();
    expect(screen.getByText('₹12,000.00')).toBeTruthy();
    expect(screen.queryByText('Available funds')).toBeNull();
  });

  it('masks every amount behind the eye toggle', () => {
    render(<HoldingsCard overview={overview({ availableCash: 2500 })} />);

    fireEvent.press(screen.getByLabelText('Hide portfolio values'));

    expect(screen.queryByText('₹12,856.00')).toBeNull();
    expect(screen.queryByText('₹2,500.00')).toBeNull();
    expect(screen.getAllByText('••••••').length).toBeGreaterThanOrEqual(4);
    expect(usePreferencesStore.getState().hideValues).toBe(true);
  });

  it('opens Portfolio from the card', () => {
    render(<HoldingsCard overview={overview()} />);
    fireEvent.press(screen.getByText('₹12,856.00'));
    expect(mockNavigate).toHaveBeenCalledWith('/trade/mstock');
  });

  it('invites a connection when no broker is set up', () => {
    render(
      <HoldingsCard
        overview={overview({
          source: 'none',
          brokerState: 'not-connected',
          holdings: [],
          totals: null,
        })}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Connect broker' }));
    expect(mockPush).toHaveBeenCalledWith('/brokers');
  });

  it('does not ask a connected user with no stocks to connect again', () => {
    render(<HoldingsCard overview={overview({ source: 'none', holdings: [], totals: null })} />);
    expect(screen.getByText('No holdings yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect broker' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Explore stocks' }));
    expect(mockNavigate).toHaveBeenCalledWith('/explore');
  });

  it('asks to reconnect a lapsed session', () => {
    render(
      <HoldingsCard
        overview={overview({
          source: 'none',
          brokerState: 'session-expired',
          holdings: [],
          totals: null,
        })}
      />,
    );
    expect(screen.getByText('Reconnect to see your holdings')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reconnect broker' })).toBeTruthy();
  });

  it('labels hand-tracked holdings without a live price as cost', () => {
    render(
      <HoldingsCard
        overview={overview({
          source: 'manual',
          day: null,
          totals: { invested: 7500, value: null, pnl: null, pnlPct: null },
        })}
      />,
    );
    expect(screen.getByText('Invested value')).toBeTruthy();
    expect(screen.getByText('₹7,500.00')).toBeTruthy();
    expect(screen.getByText('Price unavailable')).toBeTruthy();
    expect(screen.queryByText('1D returns')).toBeNull();
  });
});
