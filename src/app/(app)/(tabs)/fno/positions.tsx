import { useRouter } from 'expo-router';
import Rocket from 'lucide-react-native/icons/rocket';
import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { IconTile } from '@/components/ui/IconTile';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { ExitSheet } from '@/features/fno/components/ExitSheet';
import { ConnectGroww, Freshness, GrowwAccessBanner } from '@/features/fno/components/FnoChrome';
import { PositionCard } from '@/features/fno/components/PositionCard';
import { useFnoFunds, useFnoPositions, useFnoStatus } from '@/features/fno/hooks';
import { accessProblemFromError } from '@/features/fno/lib/access';
import { livePnl, summarisePositions } from '@/features/fno/lib/chain';
import { chainHref } from '@/features/fno/lib/explore';
import { timeIst } from '@/features/fno/lib/format';
import type { FnoPositionRow } from '@/features/fno/types';
import { liveKey } from '@/features/market/lib/liveQuote';
import { useLiveQuotes } from '@/features/market/live';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatSignedINR } from '@/lib/utils/formatters';

const NUM = { fontVariant: ['tabular-nums' as const] };

const pnlTone = (n: number | null) =>
  n == null || n === 0
    ? 'text-ink dark:text-ink-dark'
    : n > 0
      ? 'text-brand-text dark:text-brand-text-dark'
      : 'text-danger-600 dark:text-danger-dark';

/**
 * Groww F&O positions — the account's real book (Groww's positions API, segment FNO), with
 * MTM P&L and an exit on every open line. Realised is Groww's figure; unrealised is computed
 * from Groww's net average and the latest price, and one unpriced open line makes the total
 * a dash rather than a partial sum presented as the whole.
 */
export default function FnoPositionsScreen() {
  const router = useRouter();
  const positions = useFnoPositions();
  const funds = useFnoFunds(positions.isSuccess);
  const status = useFnoStatus();
  const [exiting, setExiting] = useState<FnoPositionRow | null>(null);

  const problem = accessProblemFromError(positions.error);
  const restData = positions.data;
  // Open lines re-priced at the F&O feed's ticks: each card's LTP and P&L, and the totals.
  const quotes = useLiveQuotes(
    (restData?.positions ?? [])
      .filter((p) => p.netQuantity !== 0)
      .map((p) => ({ exchange: p.exchange, symbol: p.tradingSymbol })),
    { mode: 'fno' },
  );
  const data = useMemo(() => {
    if (!restData || quotes.size === 0) return restData;
    return {
      ...restData,
      positions: restData.positions.map((p) => {
        const quote = p.netQuantity !== 0 ? quotes.get(liveKey(p.exchange, p.tradingSymbol)) : null;
        return quote ? { ...p, ltp: quote.ltp, unrealisedPnl: livePnl(p, quote.ltp) } : p;
      }),
    };
  }, [restData, quotes]);
  const summary = useMemo(
    () => (data ? summarisePositions(data.positions, data.totals.realisedPnl) : null),
    [data],
  );

  const onRefresh = useCallback(
    () =>
      Promise.all([
        positions.refetch(),
        status.refetch(),
        positions.isSuccess ? funds.refetch() : Promise.resolve(),
      ]),
    [positions, status, funds],
  );

  const openChain = useCallback(
    (p: FnoPositionRow) => {
      const c = p.contract;
      if (!c) return;
      router.push(
        chainHref(
          p.exchange,
          c.underlying,
          c.kind === 'FUT' ? { tab: 'futures' } : { expiry: c.expiry },
        ),
      );
    },
    [router],
  );

  // The exit ticket reads the latest refresh of the same line (exchange, symbol and product —
  // the server matches an exit on all three).
  const exitingLive = exiting
    ? (data?.positions.find(
        (p) =>
          p.exchange === exiting.exchange &&
          p.tradingSymbol === exiting.tradingSymbol &&
          p.product === exiting.product,
      ) ?? exiting)
    : null;

  return (
    <GroupScreen onRefresh={onRefresh}>
      {!problem ? <GrowwAccessBanner quietPlan className="mb-4" /> : null}

      {positions.isLoading ? (
        <View className="gap-4">
          <View className="h-[120px] rounded-card bg-surface-sunk dark:bg-surface-sunk-dark" />
          <ListSkeleton rows={3} />
        </View>
      ) : problem ? (
        <ConnectGroww problem={problem} what="positions" />
      ) : positions.isError && !data ? (
        <InlineError
          what="your positions"
          error={positions.error}
          onRetry={() => void positions.refetch()}
        />
      ) : data && summary ? (
        <>
          {data.positions.length > 0 ? (
            <View
              accessible
              accessibilityLabel={`Unrealised P&L ${formatSignedINR(summary.unrealised)}. Realised ${formatSignedINR(summary.realised)}. ${summary.open.length} open positions.`}
              className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
            >
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                Unrealised P&amp;L
              </Text>
              <Text
                className={cn('mt-1 text-[26px] font-bold', pnlTone(summary.unrealised))}
                style={[NUM, { letterSpacing: -0.6 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatSignedINR(summary.unrealised)}
              </Text>
              <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                {summary.unrealised == null
                  ? 'An open line has no price'
                  : 'From Groww’s net average and the latest price'}
              </Text>
              <View className="mt-3 flex-row border-t border-line pt-3 dark:border-line-dark">
                <View className="flex-1">
                  <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                    Realised (Groww)
                  </Text>
                  <Text
                    className={cn('mt-0.5 text-sm font-semibold', pnlTone(summary.realised))}
                    style={NUM}
                  >
                    {formatSignedINR(summary.realised)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                    Open positions
                  </Text>
                  <Text
                    className="mt-0.5 text-sm font-semibold text-ink dark:text-ink-dark"
                    style={NUM}
                  >
                    {summary.open.length}
                    <Text className="text-xs font-normal text-ink-muted dark:text-ink-dark-muted">
                      {' '}
                      · {summary.closed.length} closed today
                    </Text>
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          <Freshness
            className="mt-3"
            source={data.priceSource}
            asOf={data.asOf}
            updatedAt={positions.dataUpdatedAt}
            refreshFailed={positions.isError}
          />
          {data.priceNote ? (
            <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
              {data.priceNote}
            </Text>
          ) : null}

          {summary.open.length === 0 ? (
            <View className="mt-5 items-center gap-3 rounded-card border border-line bg-surface px-5 py-8 dark:border-line-dark dark:bg-surface-dark">
              <IconTile Icon={Rocket} tone="violet" size="lg" />
              <Text className="text-center text-base font-bold text-ink dark:text-ink-dark">
                You have no open positions
              </Text>
              <Text className="text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
                Your trading journey begins here — explore futures and options on Groww.
              </Text>
              <Button
                label="Explore F&O"
                onPress={() => router.push('/fno')}
                className="mt-1 self-stretch"
              />
            </View>
          ) : (
            <Section
              title="Open"
              note={`${summary.open.length} line${summary.open.length === 1 ? '' : 's'}`}
              className="mt-5"
            >
              <ListCard>
                {summary.open.map((p, index) => (
                  <React.Fragment key={`${p.exchange}:${p.tradingSymbol}:${p.product}`}>
                    {index > 0 ? <RowDivider /> : null}
                    <PositionCard position={p} onOpen={openChain} onExit={setExiting} />
                  </React.Fragment>
                ))}
              </ListCard>
            </Section>
          )}

          {summary.closed.length > 0 ? (
            <Section
              title="Closed today"
              note={`${summary.closed.length} line${summary.closed.length === 1 ? '' : 's'}`}
            >
              <ListCard>
                {summary.closed.map((p, index) => (
                  <React.Fragment key={`${p.exchange}:${p.tradingSymbol}:${p.product}`}>
                    {index > 0 ? <RowDivider /> : null}
                    <PositionCard position={p} onOpen={openChain} onExit={null} />
                  </React.Fragment>
                ))}
              </ListCard>
            </Section>
          ) : null}

          {funds.data ? (
            <Section title="F&O margin" note={`as of ${timeIst(funds.data.asOf)} IST`}>
              <View className="rounded-card border border-line bg-surface px-3.5 dark:border-line-dark dark:bg-surface-dark">
                <KeyValueRow
                  label="Margin used"
                  hint={`SPAN ${formatINR(funds.data.spanUsed, 0)} · exposure ${formatINR(funds.data.exposureUsed, 0)}`}
                  value={formatINR(funds.data.netFnoMarginUsed, 0)}
                />
                <KeyValueRow
                  divider
                  label="Option buy available"
                  value={formatINR(funds.data.optionBuyAvailable, 0)}
                />
                <KeyValueRow
                  divider
                  label="Futures available"
                  value={formatINR(funds.data.futuresAvailable, 0)}
                />
                <KeyValueRow
                  divider
                  label="Option sell available"
                  value={formatINR(funds.data.optionSellAvailable, 0)}
                />
              </View>
              <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                Groww’s funds API. An order draws on a different balance by kind and side.
              </Text>
            </Section>
          ) : funds.isError ? (
            <Text className="mt-5 text-xs text-ink-muted dark:text-ink-dark-muted">
              Groww did not return your F&amp;O margin just now.
            </Text>
          ) : null}
        </>
      ) : null}

      <ExitSheet
        position={exitingLive}
        ltp={exitingLive?.ltp ?? null}
        onClose={() => setExiting(null)}
      />
    </GroupScreen>
  );
}
