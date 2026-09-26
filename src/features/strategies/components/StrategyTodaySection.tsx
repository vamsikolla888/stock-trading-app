import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { StockRow } from '@/components/market/StockRow';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { barDate } from '@/features/insights/lib/dates';
import { stockLogoUrl } from '@/features/market/api';
import { metricSummary } from '@/features/screeners/lib/metrics';
import { stockHref } from '@/lib/navigation';
import { formatINR, formatNumber, formatPercent } from '@/lib/utils/formatters';

import { useStrategyMatches, useStrategyPairing } from '../hooks';
import type { PairingResult, StrategyMatch } from '../types';

const PREVIEW = 8;

/** Matches as stock rows: live price on the right, the signal close and evidence underneath. */
export function StrategyMatchRows({
  matches,
  limit,
}: {
  matches: readonly StrategyMatch[];
  limit?: number;
}) {
  const router = useRouter();
  const shown = limit ? matches.slice(0, limit) : matches;
  return (
    <ListCard>
      {shown.map((match, index) => {
        const evidence = metricSummary(match.metrics, 2);
        return (
          <View key={`${match.exchange}:${match.symbol}`}>
            {index > 0 ? <RowDivider /> : null}
            <StockRow
              symbol={match.symbol}
              name={match.companyName}
              exchange={match.exchange}
              price={match.ltp}
              changePercent={match.changePct}
              logoUri={stockLogoUrl(match.symbol)}
              subtitle={`Signal close ${formatINR(match.signalClose)}${evidence ? ` · ${evidence}` : ''}`}
              onPress={() => router.push(stockHref(match.symbol, match.exchange))}
            />
          </View>
        );
      })}
    </ListCard>
  );
}

/**
 * What the strategy points at today, and which screeners agree. A backtest says "this rule
 * worked"; a match says "it fires on these names now" — the section keeps the two apart and
 * never presents the live price as the entry.
 */
export function StrategyTodaySection({ strategyId }: { strategyId: string }) {
  const [showAll, setShowAll] = useState(false);
  const [wantPairing, setWantPairing] = useState(false);
  // Loads on arrival — it is the one part of this screen anyone can act on today.
  const matches = useStrategyMatches(strategyId, true);
  const pairing = useStrategyPairing(strategyId, wantPairing);
  const data = matches.data;

  return (
    <Section
      title="Today"
      note={data?.asOfBarTime ? `${barDate(data.asOfBarTime)} close` : undefined}
    >
      <Text className="mb-3 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        The backtest says whether this rule has worked. This says what it points at now.
      </Text>

      {matches.isPending ? (
        <ListSkeleton rows={3} />
      ) : matches.error ? (
        <InlineError
          what="today's matches"
          error={matches.error}
          onRetry={() => void matches.refetch()}
        />
      ) : data ? (
        <>
          <Text className="mb-2 text-xs font-semibold text-ink dark:text-ink-dark">
            {formatNumber(data.matches.length, 0)} of {formatNumber(data.universeSize, 0)} stocks
            match
          </Text>
          {data.matches.length === 0 ? (
            <InlineEmpty
              title="Nothing matches on the latest close"
              message={`Normal for a crossover rule, which only fires on the bar it crosses.${
                data.skippedForInsufficientBars > 0
                  ? ` ${formatNumber(data.skippedForInsufficientBars, 0)} stocks had too little history to evaluate.`
                  : ''
              }`}
            />
          ) : (
            <>
              <StrategyMatchRows matches={data.matches} limit={showAll ? undefined : PREVIEW} />
              {data.matches.length > PREVIEW ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowAll((v) => !v)}
                  className="mt-2 self-center px-3 py-2 active:opacity-60"
                >
                  <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                    {showAll ? 'Show fewer' : `Show all ${data.matches.length}`}
                  </Text>
                </Pressable>
              ) : null}
              <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
                The setup fired at that close. The backtest fills at the next open, so that — not
                buying at the live price now — is what its numbers describe.
              </Text>
            </>
          )}
        </>
      ) : null}

      <View className="mt-4">
        {!wantPairing ? (
          <Button
            label="Which screeners agree?"
            variant="outline"
            size="sm"
            onPress={() => setWantPairing(true)}
          />
        ) : pairing.isPending ? (
          <Text className="text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
            Comparing screeners…
          </Text>
        ) : pairing.error ? (
          <InlineError
            what="the screener comparison"
            error={pairing.error}
            onRetry={() => void pairing.refetch()}
          />
        ) : pairing.data ? (
          <PairingResultView data={pairing.data} />
        ) : null}
      </View>
    </Section>
  );
}

function PairingResultView({ data }: { data: PairingResult }) {
  const router = useRouter();
  const candidates = data.candidates.slice(0, 8);
  return (
    <View>
      <Text className="text-[15px] font-bold text-ink dark:text-ink-dark">
        Screeners closest to this strategy
      </Text>
      <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
        Ranked by shared indicators, direction agreement and each screener&apos;s measured hit rate.
        The ranking is computed; the model only writes the one-line reasons.
      </Text>
      {candidates.length === 0 ? (
        <Text className="mt-3 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No screener shares anything with this rule.
        </Text>
      ) : (
        <ListCard className="mt-3">
          {candidates.map((c, index) => (
            <View key={c.key}>
              {index > 0 ? <RowDivider /> : null}
              <View className="px-3.5 py-3">
                <View className="flex-row items-start gap-2">
                  <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
                    {c.name}
                  </Text>
                  <Badge label={`Score ${c.score}`} variant="primary" />
                </View>
                {c.why ? (
                  <Text className="mt-1 text-xs leading-[17px] text-ink dark:text-ink-dark">
                    {c.why}
                  </Text>
                ) : null}
                <Text className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted">
                  Hit rate {c.hitRatePct != null ? formatPercent(c.hitRatePct, 1) : 'not measured'}
                  {c.sampleTrades != null
                    ? ` (${formatNumber(c.sampleTrades, 0)} trades)`
                    : ''} · {formatNumber(c.currentMatches, 0)} matching now
                </Text>
                <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                  Shared: {c.sharedIndicators.join(', ') || 'nothing in common'}
                </Text>
              </View>
            </View>
          ))}
        </ListCard>
      )}

      <Text className="mt-5 text-[15px] font-bold text-ink dark:text-ink-dark">Best stocks</Text>
      {data.bestStocks.length === 0 ? (
        <Text className="mt-2 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          The entry accepts nothing on the latest close, so there is nothing for a screener to agree
          with.
        </Text>
      ) : (
        <ListCard className="mt-3">
          {data.bestStocks.map((stock, index) => (
            <View key={`${stock.exchange}:${stock.symbol}`}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(stockHref(stock.symbol, stock.exchange))}
                className="px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
                    {stock.symbol}
                    <Text className="text-xs font-normal text-ink-muted dark:text-ink-dark-muted">
                      {stock.companyName ? `  ${stock.companyName}` : ''}
                    </Text>
                  </Text>
                  <Text
                    className="text-xs text-ink-muted dark:text-ink-dark-muted"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    Signal {formatINR(stock.signalClose)}
                  </Text>
                </View>
                <View className="mt-1.5 flex-row flex-wrap gap-1.5">
                  {stock.alsoFlaggedBy.length === 0 ? (
                    <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
                      Only this strategy
                    </Text>
                  ) : (
                    stock.alsoFlaggedBy.map((name) => (
                      <Badge key={name} label={name} variant="success" />
                    ))
                  )}
                </View>
              </Pressable>
            </View>
          ))}
        </ListCard>
      )}
    </View>
  );
}
