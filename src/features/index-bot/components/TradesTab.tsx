import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { RowDivider } from '@/components/ui/Section';

import { useIndexTrades } from '../hooks';
import {
  filterTrades,
  holdTime,
  money,
  PHASE_FILTERS,
  phaseCounts,
  plural,
  pct,
  pnlTone,
  signedMoney,
  type PhaseFilter,
} from '../lib/view';
import type { ModeFilter, RangeKey } from '../types';
import { BotQueryError, Caveat, ChipRow, TextLink } from './parts';
import { TradeItem } from './rows';

/** Rows drawn per step — a long range can hold thousands of entries. */
const PAGE = 40;

/**
 * Index trading › Trades — the P&L statement: one row per entry the bot made, entry to exit,
 * newest first, totals on top. Every figure is an estimate (paper fills, or Groww's realised P&L
 * less estimated charges), and the server's caveat says so under the list.
 */
export function TradesTab({
  mode,
  range,
  phase,
  onPhase,
}: {
  mode: ModeFilter;
  range: RangeKey;
  phase: PhaseFilter;
  onPhase: (phase: PhaseFilter) => void;
}) {
  const router = useRouter();
  const layout = useScreenLayout();
  const query = useIndexTrades(mode, range);
  const [shown, setShown] = useState(PAGE);
  const data = query.data;
  const rows = useMemo(() => (data ? filterTrades(data.rows, phase) : []), [data, phase]);

  if (query.isPending) return <ListSkeleton rows={6} />;
  if (!data) {
    return (
      <BotQueryError
        what="the bot’s trades"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const s = data.stats;
  const counts = phaseCounts(data.rows, s);
  const visible = rows.slice(0, shown);

  return (
    <View className="gap-3" style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
      <Grid columns={Math.min(layout.kpiColumns, 6)} gap={12}>
        <StatTile
          label="Closed trades"
          value={String(s.closed)}
          sub={`${plural(s.entries, 'entry', 'entries')} in this window`}
        />
        <StatTile
          label="Net"
          value={signedMoney(s.net)}
          sub={s.expectancy != null ? `${signedMoney(s.expectancy)} per trade` : 'after charges'}
          status={pnlTone(s.net)}
        />
        <StatTile label="Gross" value={signedMoney(s.gross)} sub="at trade prices" />
        <StatTile
          label="Charges"
          value={s.charges == null ? '—' : money(-s.charges)}
          sub="estimated Groww charges"
        />
        <StatTile
          label="Win rate"
          value={pct(s.winRate)}
          sub={`${s.wins} won · ${s.losses} lost`}
        />
        <StatTile
          label="Average hold"
          value={holdTime(s.avgHoldMinutes)}
          sub={`${s.exits.target} target · ${s.exits.stop} stop · ${s.exits.time} time`}
        />
      </Grid>

      {data.truncated ? (
        <Banner
          tone="warning"
          title="Only the newest 5,000 entries are shown."
          message="Pick a shorter range to see everything in it."
        />
      ) : null}

      <ChipRow
        items={PHASE_FILTERS}
        value={phase}
        counts={counts}
        label="Show"
        onChange={(next) => {
          onPhase(next);
          setShown(PAGE);
        }}
      />

      {rows.length === 0 ? (
        <InlineEmpty
          title={
            data.rows.length === 0 ? 'No entries in this window' : 'No entry matches this filter'
          }
          message={
            data.rows.length === 0
              ? 'The bot has not entered a position in this window.'
              : undefined
          }
        />
      ) : (
        <Panel title="P&L statement" meta={`${plural(rows.length, 'row')} · newest first`} flush>
          {visible.map((row, index) => (
            <View key={row.intentId}>
              {index > 0 ? <RowDivider /> : null}
              <TradeItem
                row={row}
                onPress={() =>
                  router.push({
                    pathname: '/index-bot/trade/[id]',
                    params: { id: row.intentId, mode, range },
                  })
                }
              />
            </View>
          ))}
          {rows.length > visible.length ? (
            <View className="border-t border-line p-3 dark:border-line-dark">
              <Button
                label={`Show ${Math.min(PAGE, rows.length - visible.length)} more`}
                variant="ghost"
                size="sm"
                onPress={() => setShown((n) => n + PAGE)}
              />
            </View>
          ) : null}
        </Panel>
      )}

      <Caveat>{data.caveat}</Caveat>
      <View className="flex-row flex-wrap items-center gap-x-1">
        <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Test-mode entries are also in the paper F&amp;O book, labelled “Index bot · test”.
        </Text>
        <TextLink
          label="Open paper orders"
          onPress={() => router.push({ pathname: '/fno/paper', params: { view: 'orders' } })}
        />
      </View>
    </View>
  );
}
