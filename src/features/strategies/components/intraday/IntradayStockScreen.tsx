import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { stockHref } from '@/lib/navigation';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { isServerOutdated } from '@/services/api/contract';
import { isApiError } from '@/types/api';

import { houseKeys, useHouseStockTrades } from '../../hooks';
import { isUniverseKey, UNIVERSE_LABEL } from '../../lib/intradayNormalize';
import { minutes, signedRupees, stockSummary, VERDICT_VIEW } from '../../lib/intradayView';
import { formatProfitFactor } from '../../lib/ranking';
import { BB_KEY, type IntradayStrategyDetail, type VariantKey } from '../../types';
import { IntradayTradeRow } from './IntradayTrades';

const PAGE = 50;
const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * Every trade the latest backtest made in one stock, newest first — the intraday strategy's
 * per-stock drill-down. The universe (`u`) and rules (`v`) are the ones the page had selected.
 * The verdict and the half-by-half figures come from the strategy page already in the cache;
 * the rest is computed from these trades with the server's own definitions.
 */
export function IntradayStockScreen() {
  const router = useRouter();
  const layout = useScreenLayout();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ key: string; symbol: string; u?: string; v?: string }>();
  const symbol = (params.symbol ?? '').toUpperCase();
  const supported = params.key === BB_KEY;
  const universe = isUniverseKey(params.u) ? params.u : 'nifty50';
  const variant: VariantKey = params.v === 'base' ? 'base' : 'improved';
  const query = useHouseStockTrades(BB_KEY, supported ? symbol : '', variant, universe);
  const [limit, setLimit] = useState(PAGE);
  const trades = useMemo(() => query.data?.trades ?? [], [query.data]);
  const summary = useMemo(() => stockSummary(trades), [trades]);
  const cached = queryClient.getQueryData<IntradayStrategyDetail>(
    houseKeys.intraday(BB_KEY, universe),
  );
  const row = cached?.variants[variant]?.stocks.find((r) => r.symbol === symbol) ?? null;
  const refresh = useCallback(() => query.refetch(), [query]);

  let body: React.ReactNode;
  if (!supported || !symbol) {
    body = (
      <InlineEmpty
        title="No per-stock trades"
        message="Per-stock trades are kept for the intraday strategy only."
      />
    );
  } else if (query.isPending) {
    body = <ListSkeleton rows={6} />;
  } else if (query.error && !query.data) {
    body = isServerOutdated(query.error) ? (
      <InlineEmpty
        title="Needs a newer server"
        message="Per-stock trades aren’t available on the server this app is connected to yet."
      />
    ) : isApiError(query.error) && query.error.status === 404 ? (
      <InlineEmpty
        title="No backtested trades"
        message={`The latest backtest made no trades in ${symbol}.`}
      />
    ) : (
      <InlineError
        what="this stock’s trades"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  } else if (!summary) {
    body = (
      <InlineEmpty
        title="No backtested trades"
        message={`The latest backtest made no trades in ${symbol}.`}
      />
    );
  } else {
    const visible = trades.slice(0, limit);
    body = (
      <View className="gap-4">
        <View className="flex-row flex-wrap items-center gap-2">
          {row ? (
            <StatusPill
              tone={VERDICT_VIEW[row.verdict].tone}
              label={VERDICT_VIEW[row.verdict].label}
            />
          ) : null}
          <View className="flex-1" />
          <Button
            label="Open stock"
            size="sm"
            variant="secondary"
            onPress={() => router.push(stockHref(symbol, 'NSE'))}
          />
        </View>
        {row ? (
          <Text className="-mt-2 text-xs text-ink-muted dark:text-ink-dark-muted">
            {VERDICT_VIEW[row.verdict].title}
          </Text>
        ) : null}

        <Grid columns={Math.min(layout.kpiColumns, 4)}>
          <StatTile
            label="Per trade"
            value={formatSignedPercent(summary.avgReturnPct, 3)}
            sub="after costs"
            status={summary.avgReturnPct > 0 ? 'ok' : summary.avgReturnPct < 0 ? 'bad' : undefined}
          />
          <StatTile label="Win rate" value={formatPercent(summary.winRate, 1)} />
          <StatTile label="Trades" value={formatNumber(summary.trades, 0)} />
          <StatTile
            label="Net P&L"
            value={signedRupees(summary.netPnl)}
            sub="₹1 lakh a trade"
            status={summary.netPnl > 0 ? 'ok' : summary.netPnl < 0 ? 'bad' : undefined}
          />
          <StatTile label="Profit factor" value={formatProfitFactor(summary.profitFactor)} />
          <StatTile label="Avg hold" value={minutes(summary.avgHoldMinutes)} />
          {row ? (
            <StatTile
              label="1st / 2nd half"
              value={`${formatSignedPercent(row.firstHalfPct, 2)} / ${formatSignedPercent(row.secondHalfPct, 2)}`}
              sub="average a trade"
            />
          ) : null}
          {row ? (
            <StatTile
              label="Worst run"
              value={`${formatNumber(row.maxLosingStreak, 0)} losses`}
              sub="in a row"
            />
          ) : null}
        </Grid>

        <View>
          <View className="mb-2.5 flex-row items-baseline gap-2">
            <Text
              accessibilityRole="header"
              className="text-[15px] font-semibold text-ink dark:text-ink-dark"
            >
              Every trade
            </Text>
            <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
              {`newest first · ${formatNumber(trades.length, 0)}`}
            </Text>
          </View>
          <ListCard>
            {visible.map((t, index) => (
              <View key={`${t.entryTime}:${index}`}>
                {index > 0 ? <RowDivider /> : null}
                <IntradayTradeRow trade={t} showSymbol={false} />
              </View>
            ))}
          </ListCard>
          {trades.length > visible.length ? (
            <Button
              label={`Show ${Math.min(PAGE, trades.length - visible.length)} more`}
              variant="link"
              className="mt-2 self-center"
              onPress={() => setLimit((n) => n + PAGE)}
            />
          ) : null}
        </View>

        <Text className="text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Backtest on stored 5-minute candles, net of costs. A backtest is not a forecast. Research,
          not investment advice.
        </Text>
      </View>
    );
  }

  return (
    <StackScreen
      title={symbol || 'Stock'}
      subtitle={`${cached?.name ?? 'Bollinger Mid-Band Thrust'} · ${UNIVERSE_LABEL[universe]} · ${variant === 'base' ? 'Your rules' : 'Improved'}`}
      onRefresh={supported && symbol ? refresh : undefined}
      fill
    >
      {body}
    </StackScreen>
  );
}
