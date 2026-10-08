import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { EdgePanel } from '@/features/index-bot/components/DebateView';
import { BotNotice, BotQueryError, NUM, pnlClass } from '@/features/index-bot/components/parts';
import { useResolveFlow } from '@/features/index-bot/components/useResolve';
import { useIndexTrades, useIsAdmin } from '@/features/index-bot/hooks';
import {
  EXIT_LABEL,
  holdTime,
  kindWord,
  modeWord,
  money,
  parseMode,
  parseRange,
  phaseView,
  plural,
  premium,
  reviewPlace,
  signedMoney,
} from '@/features/index-bot/lib/view';
import type { OrderView, TradeRow } from '@/features/index-bot/types';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { formatDateTime } from '@/features/settings/lib/time';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/** "₹120.50 · filled · 5 Oct, 10:35" for a recorded order. */
function orderText(order: OrderView | null, empty: string): string {
  if (!order) return empty;
  return [
    premium(order.price),
    order.status?.toLowerCase() ?? null,
    order.at ? formatDateTime(order.at) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The exit as the bot knows it: a paper exit order, or the broker OCO of a live entry. */
function exitText(row: TradeRow): string {
  if (row.mode === 'live') {
    const oco = `Broker OCO ${row.smartOrderStatus?.toLowerCase() ?? 'not recorded'}`;
    return row.exitPrice != null ? `${oco} · ≈ ${premium(row.exitPrice)}` : oco;
  }
  return orderText(row.exitOrder, 'Not exited');
}

/**
 * One bot entry in full — the plan (entry, stop, target, reward:risk), the fills, the P&L and
 * where that figure comes from, why it traded and the historical edge it cleared. An entry whose
 * outcome is uncertain can be resolved here after the book is checked.
 *
 * The statement is read with the window that opened it (`mode`, `range`), so it is the same
 * cached answer the Trades list holds — no request of its own.
 */
export default function IndexBotTradeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; mode?: string; range?: string }>();
  const isAdmin = useIsAdmin();
  const layout = useScreenLayout();
  const query = useIndexTrades(parseMode(params.mode), parseRange(params.range));
  const { resolve, pendingId } = useResolveFlow();
  const row = query.data?.rows.find((r) => r.intentId === params.id);
  const phase = row ? phaseView(row.phase) : null;

  return (
    <StackScreen
      title={row?.tradingSymbol ?? 'Trade'}
      subtitle={
        row
          ? [row.underlying, kindWord(row.kind), modeWord(row.mode)].filter(Boolean).join(' · ')
          : 'Index bot'
      }
      onRefresh={() => query.refetch()}
      fill
    >
      {!isAdmin ? (
        <BotNotice kind="admin" />
      ) : query.isPending ? (
        <ListSkeleton rows={5} />
      ) : !query.data ? (
        <BotQueryError what="this trade" error={query.error} onRetry={() => void query.refetch()} />
      ) : !row || !phase ? (
        <InlineEmpty
          title="This entry isn’t in the window"
          message="It may be older than the range the list was showing."
          action={{ label: 'Back to trades', onPress: () => router.back() }}
        />
      ) : (
        <View className="gap-3">
          {row.phase === 'review' ? (
            <Banner
              tone="error"
              title="The order outcome is uncertain — new entries are blocked."
              message={`Check the ${reviewPlace(row.mode)}, then resolve this entry once the position is confirmed closed.`}
            />
          ) : null}

          <Panel>
            <View className="flex-row items-start gap-3">
              <View className="flex-1">
                <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                  Net P&amp;L (estimated)
                </Text>
                <Text className={`mt-1 text-[26px] font-bold ${pnlClass(row.net)}`} style={NUM}>
                  {signedMoney(row.net, 2)}
                </Text>
                <Text className="mt-0.5 text-xs text-ink-faint dark:text-ink-dark-faint">
                  {row.exitReason ? EXIT_LABEL[row.exitReason] : phase.label}
                  {row.holdMinutes != null ? ` · held ${holdTime(row.holdMinutes)}` : ''}
                </Text>
              </View>
              <StatusPill tone={phase.tone} label={phase.label} />
            </View>
            {row.phase === 'review' ? (
              <Button
                label="Resolve after review"
                variant="outline"
                size="sm"
                className="mt-3 self-start"
                loading={pendingId === row.intentId}
                disabled={pendingId != null}
                onPress={() => resolve(row)}
              />
            ) : null}
          </Panel>

          <Grid columns={layout.columns} gap={12} equalHeight={false}>
            <Panel title="Plan">
              <KeyValueRow label="Planned entry" value={premium(row.plannedEntry)} />
              <KeyValueRow
                label="Stop · target"
                value={`${premium(row.stop)} · ${premium(row.target)}`}
                divider
              />
              <KeyValueRow
                label="Reward : risk"
                value={row.rewardRisk == null ? '—' : `${row.rewardRisk.toFixed(2)}×`}
                divider
              />
              <KeyValueRow
                label="Size"
                value={`${row.lots == null ? '—' : plural(row.lots, 'lot')}${row.quantity != null ? ` · ${row.quantity} units` : ''}`}
                divider
              />
              <KeyValueRow label="Entered" value={formatDateTime(row.enteredAt)} divider />
              <KeyValueRow label="Exited" value={formatDateTime(row.exitedAt)} divider />
            </Panel>

            <Panel title="Fills and P&L">
              <KeyValueRow
                label="Entry order"
                value={orderText(row.entryOrder, 'No order recorded')}
              />
              <KeyValueRow label="Exit" value={exitText(row)} divider />
              <KeyValueRow
                label="Gross"
                value={signedMoney(row.gross, 2)}
                trend={row.gross}
                divider
              />
              <KeyValueRow
                label="Charges"
                value={row.charges == null ? '—' : money(-row.charges, 2)}
                hint="Estimated Groww charges"
                divider
              />
              <KeyValueRow label="Net" value={signedMoney(row.net, 2)} trend={row.net} divider />
              <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
                {row.pnlSource === 'broker-realised'
                  ? 'Groww’s realised P&L less estimated charges.'
                  : 'Paper fill less estimated Groww charges.'}
                {row.exitPriceDerived
                  ? ' The exit price is derived from that P&L, not a fill.'
                  : ''}
              </Text>
            </Panel>

            <Panel title="Why it traded">
              <Text className="text-[13px] leading-[19px] text-ink dark:text-ink-dark">
                {row.reason || 'No reason recorded.'}
              </Text>
            </Panel>

            <EdgePanel edge={row.edge} />
          </Grid>

          {query.data.caveat ? (
            <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
              {query.data.caveat}
            </Text>
          ) : null}
        </View>
      )}
    </StackScreen>
  );
}
