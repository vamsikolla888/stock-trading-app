import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { formatReturn, useMask } from '@/features/portfolio/components/BookSummaryCard';
import { plural } from '@/features/portfolio/lib/dates';
import { formatINR, formatSignedINR, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import type { PaperKpis } from '../lib/book';
import type { PaperPortfolio, WalletSummary } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

const HEADLINE: Record<PaperKpis['scope'], string> = {
  equity: 'Current value',
  intraday: 'Margin in use',
  account: 'Wallet value',
};

const SCOPE_NOTE: Record<PaperKpis['scope'], string> = {
  equity: 'Delivery (CNC)',
  intraday: 'Intraday (MIS)',
  account: 'Whole wallet',
};

/**
 * The paper account at a glance, for the tab being looked at: Holdings show delivery only,
 * Positions intraday only, everything else the whole wallet. Every P&L is at the price bought
 * at, BEFORE charges — the charges, and the P&L once they are out, sit on their own line below.
 * The wallet balance is always the wallet's, because every order draws on the one wallet.
 */
export function PaperSummaryCard({
  kpis,
  wallet,
  portfolio,
  onOpenFunds,
}: {
  kpis: PaperKpis;
  wallet: WalletSummary | null;
  /** The product the scope reads (Holdings / Positions), for its sub-line. */
  portfolio: PaperPortfolio | undefined;
  onOpenFunds: () => void;
}) {
  const { colors } = useTheme();
  const mask = useMask();
  const { scope } = kpis;
  const count = portfolio?.positions.length ?? 0;

  const sub =
    scope === 'equity'
      ? portfolio
        ? count === 0
          ? 'No holdings yet'
          : `Invested ${mask(formatINR(portfolio.book.investedValue))} · ${plural(count, 'holding')}`
        : 'Delivery holdings'
      : scope === 'intraday'
        ? portfolio
          ? count === 0
            ? 'No open intraday positions'
            : `${count} open${portfolio.book.borrowed > 0 ? ` · ${mask(formatINR(portfolio.book.borrowed, 0))} borrowed at ${portfolio.leverage}×` : ''}`
          : 'Own money in MIS positions'
        : wallet
          ? `Capital put in ${mask(formatINR(wallet.capital))}`
          : 'Cash + positions − borrowing';

  const walletNotes: string[] = [];
  if (wallet) {
    if (scope === 'intraday') {
      walletNotes.push(`Buying power ${mask(formatINR(wallet.intradayBuyingPower, 0))}`);
    }
    if (wallet.blockedCash > 0) {
      walletNotes.push(`${mask(formatINR(wallet.blockedCash))} held by open orders`);
    }
    if (wallet.marginShortfall > 0) {
      walletNotes.push(
        `${mask(formatINR(wallet.marginShortfall))} short after a forced square-off`,
      );
    }
  }

  return (
    <View>
      <View
        accessible
        accessibilityLabel={`${HEADLINE[scope]} ${kpis.headline == null ? 'unknown' : formatINR(kpis.headline)}. Today's P&L ${formatReturn(kpis.today, kpis.todayPct)}. Total P&L ${formatReturn(kpis.total, kpis.totalPct)}.`}
        className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
            {HEADLINE[scope]}
          </Text>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-ink-dark-faint">
            {SCOPE_NOTE[scope]}
          </Text>
        </View>
        <Text
          className="mt-1 text-[28px] font-bold text-ink dark:text-ink-dark"
          style={[NUM, { letterSpacing: -0.8 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {kpis.headline == null ? '—' : mask(formatINR(kpis.headline))}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {sub}
        </Text>

        <View className="mt-4 flex-row gap-4 border-t border-line pt-3.5 dark:border-line-dark">
          <Metric
            label="Today’s P&L"
            value={kpis.today}
            pct={kpis.todayPct}
            note={
              kpis.today == null
                ? count === 0 && scope !== 'account'
                  ? 'Nothing open'
                  : 'A position has no previous close yet'
                : scope === 'equity' && kpis.bookedToday
                  ? `${mask(formatSignedINR(kpis.bookedToday))} booked today`
                  : undefined
            }
          />
          <Metric
            label="Total P&L"
            value={kpis.total}
            pct={kpis.totalPct}
            note={scope === 'equity' ? 'On open holdings' : 'Of capital'}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Wallet balance ${wallet ? formatINR(wallet.availableCash) : 'unknown'}. Opens funds`}
          onPress={onOpenFunds}
          className="-mx-4 -mb-4 mt-4 flex-row items-center gap-3 rounded-b-card border-t border-line bg-surface-sunk/60 px-4 py-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-sunk-dark/60 dark:active:bg-surface-sunk-dark"
        >
          <View className="flex-1">
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Wallet balance</Text>
            <Text className="mt-0.5 text-[15px] font-bold text-ink dark:text-ink-dark" style={NUM}>
              {kpis.available == null ? '—' : mask(formatINR(kpis.available))}
            </Text>
            <Text
              className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
              numberOfLines={2}
            >
              {walletNotes.length > 0 ? walletNotes.join(' · ') : 'Free to trade'}
            </Text>
          </View>
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Funds
          </Text>
          <ChevronRight size={16} color={colors.link} />
        </Pressable>
      </View>

      {kpis.charges != null ? (
        <Text
          className="mt-2.5 px-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
          style={NUM}
        >
          Charges paid {mask(formatINR(kpis.charges))}
          {kpis.openBuyCharges
            ? ` (${mask(formatINR(kpis.openBuyCharges))} on open positions)`
            : ''}{' '}
          · {scope === 'account' ? 'Net P&L' : `${SCOPE_NOTE[scope].split(' ')[0]} P&L`} after
          charges{' '}
          <ChangeText value={kpis.net} className="text-xs">
            {kpis.net == null
              ? '—'
              : `${mask(formatSignedINR(kpis.net))}${kpis.netPct != null ? ` (${formatSignedPercent(kpis.netPct)})` : ''}`}
          </ChangeText>
        </Text>
      ) : null}
    </View>
  );
}

function Metric({
  label,
  value,
  pct,
  note,
}: {
  label: string;
  value: number | null;
  pct: number | null;
  note?: string;
}) {
  const mask = useMask();
  return (
    <View className="flex-1">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <ChangeText
        value={value}
        className="mt-1 text-[15px]"
        style={NUM}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value == null ? '—' : mask(formatSignedINR(value))}
      </ChangeText>
      {pct != null ? (
        <ChangeText value={value} className="text-xs" style={NUM}>
          {formatSignedPercent(pct)}
        </ChangeText>
      ) : null}
      {note ? (
        <Text
          className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
          numberOfLines={2}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
