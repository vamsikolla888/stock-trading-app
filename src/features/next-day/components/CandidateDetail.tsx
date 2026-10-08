import { useRouter } from 'expo-router';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Minus from 'lucide-react-native/icons/minus';
import X from 'lucide-react-native/icons/x';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { Meter } from '@/components/ui/Meter';
import { RowDivider } from '@/components/ui/Section';
import { stockLogoUrl } from '@/features/market/api';
import { stockHref } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import {
  formatINR,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import {
  COMPONENT_LABEL,
  effectiveScore,
  MORNING_VIEW,
  SCANNER_SHORT,
  sizeFor,
  squeezeSides,
  TIER_LABEL,
  verdictHead,
  VERDICT_VIEW,
  voteRows,
  type SizingPrefs,
  type VoteRow,
} from '../lib/view';
import type { Candidate, Compatibility, MorningCandidate } from '../types';
import { Bullets, DirectionChip, NUM, Tag, TonePill } from './parts';

/**
 * Everything behind a candidate: the score, the morning confirmation once it has run, the plan,
 * the size for the reader's capital, the 100-point score component by component (a component
 * with no data says so, never counts as zero), each scanner's vote and whether it counted, the
 * raw figures, and what to watch out for.
 */
export function CandidateDetail({
  c,
  compat,
  morning,
  prefs,
  onChangeSizing,
}: {
  c: Candidate;
  compat: Compatibility[];
  morning: MorningCandidate | null;
  prefs: SizingPrefs;
  onChangeSizing: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const verdict = VERDICT_VIEW[c.verdict];
  const verdictParts = verdictHead(verdict.label);
  const lv = c.levels;
  const size = lv ? sizeFor(lv, prefs, c.fno ? c.lot : null) : null;
  const sides = squeezeSides(c, compat);
  const m = c.metrics;
  const columns = Math.min(layout.columns, 2);

  return (
    <View className="gap-5">
      {/* Who — tap through to the stock. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${c.symbol}, ${c.name}. Open stock`}
        onPress={() => router.push(stockHref(c.symbol, 'NSE'))}
        className="flex-row items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
      >
        <StockLogo symbol={c.symbol} uri={stockLogoUrl(c.symbol)} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-[16px] font-bold text-ink dark:text-ink-dark">{c.symbol}</Text>
            <DirectionChip direction={c.direction} />
            {c.fno ? <Tag label="F&O" /> : null}
            {c.intradayOnly ? <Tag label="Intraday" /> : null}
          </View>
          <Text
            className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
          >
            {[c.name, c.sector?.replace(/^Nifty /, '')].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" style={NUM}>
            {formatINR(c.close)}
          </Text>
          <ChangeText value={c.changePct} className="text-xs" style={NUM}>
            {formatSignedPercent(c.changePct)}
          </ChangeText>
        </View>
        <ChevronRight size={16} color={colors.textFaint} />
      </Pressable>

      <Grid columns={Math.min(layout.kpiColumns, 4)} gap={10}>
        <StatTile
          label="Score"
          value={String(c.score)}
          sub={`of 100 · ${c.measured} pts measurable`}
        />
        <StatTile
          label="After hurdles"
          value={String(effectiveScore(c))}
          sub={c.hurdle ? `−${c.hurdle} for market / sector` : `No hurdle · ${TIER_LABEL[c.tier]}`}
        />
        <StatTile
          label="Verdict"
          // The headline word fits the tile ("Weak"); its qualifier joins the line under it.
          value={verdictParts.head}
          sub={[verdictParts.rest, `${c.tally.consensus} consensus`].filter(Boolean).join(' · ')}
          status={
            verdict.tone === 'good'
              ? 'ok'
              : verdict.tone === 'bad'
                ? 'bad'
                : verdict.tone === 'warn'
                  ? 'warn'
                  : undefined
          }
        />
        <StatTile
          label="Votes counted"
          value={`${c.tally.buy} / ${c.tally.sell}`}
          sub="buy / sell"
        />
      </Grid>

      {morning ? <MorningSection morning={morning} /> : null}

      {sides.length > 0 ? (
        <Panel title="Two-sided setup" meta="The break decides the side">
          <Text className="mb-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
            Arm both; cancel the other once one fills.
          </Text>
          {sides.map((s, index) => (
            <View
              key={s.dir}
              className={cn('py-2.5', index > 0 && 'border-t border-line dark:border-line-dark')}
            >
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
                  {`${s.dir === 'LONG' ? 'Buy above' : 'Sell below'}${s.counted ? '' : ' · history against'}`}
                </Text>
                <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" style={NUM}>
                  {formatINR(s.levels.trigger)}
                </Text>
              </View>
              <Text className="mt-0.5 text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
                {`Stop ${formatINR(s.levels.invalidation)} · T1 ${formatINR(s.levels.target1)} · R:R 1:${s.levels.rewardRisk}`}
              </Text>
            </View>
          ))}
        </Panel>
      ) : null}

      <Grid columns={columns} gap={20} equalHeight={false}>
        {lv ? (
          <Panel
            key="plan"
            title="The plan"
            meta={`${lv.direction === 'LONG' ? 'Long' : 'Short'}${c.intradayOnly ? ' · intraday only' : ''}`}
          >
            <KeyValueRow label="Trigger" value={formatINR(lv.trigger)} />
            <KeyValueRow divider label="Invalidation" value={formatINR(lv.invalidation)} />
            <KeyValueRow divider label="Target 1 · 1.5R" value={formatINR(lv.target1)} />
            <KeyValueRow divider label="Target 2" value={formatINR(lv.target2)} />
            <KeyValueRow
              divider
              label="Risk / share"
              value={`${formatINR(lv.riskPerShare)} · ${lv.riskPct}%`}
            />
            <KeyValueRow divider label="Reward : risk" value={`1 : ${lv.rewardRisk}`} />
            {lv.capNote ? (
              <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                {lv.capNote}
              </Text>
            ) : null}
          </Panel>
        ) : null}

        {size && lv ? (
          <Panel
            key="size"
            title="Size"
            meta={`₹${formatNumber(prefs.capital, 0)} at ${prefs.riskPct}%`}
            right={
              <Pressable accessibilityRole="button" hitSlop={8} onPress={onChangeSizing}>
                <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                  Change
                </Text>
              </Pressable>
            }
          >
            <KeyValueRow label="Shares" value={formatNumber(size.shares, 0)} />
            <KeyValueRow divider label="Value" value={formatINR(size.notional, 0)} />
            <KeyValueRow
              divider
              label="Risk to the stop"
              value={formatINR(size.shares * lv.riskPerShare, 0)}
            />
            {c.fno && size.lot != null ? (
              <KeyValueRow
                divider
                label="Futures"
                value={
                  size.lots
                    ? `${size.lots} × ${size.lot}`
                    : `1 lot risks ${formatINR(size.lotRisk, 0)}`
                }
              />
            ) : null}
            {c.sizing?.option ? (
              <KeyValueRow
                divider
                label="Defined-risk option"
                hint={`Max loss ${formatINR(c.sizing.option.maxLoss, 0)}`}
                value={`${c.sizing.option.strike} ${c.sizing.option.kind} @ ${formatINR(c.sizing.option.premium)}`}
              />
            ) : null}
            {size.cappedByCapital ? (
              <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                Capped at what the capital buys.
              </Text>
            ) : null}
          </Panel>
        ) : null}
      </Grid>

      <Panel
        title={`The score · ${c.direction === 'LONG' ? 'long' : 'short'}`}
        meta={`the other way: ${c.otherScore}`}
      >
        <View className="gap-3.5">
          {c.components.map((k) => (
            <View key={k.key} accessible>
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="flex-1 text-[13px] text-ink dark:text-ink-dark">
                  {COMPONENT_LABEL[k.key] ?? k.key}
                </Text>
                <Text
                  className={cn(
                    'text-[13px] font-semibold',
                    k.measured
                      ? 'text-ink dark:text-ink-dark'
                      : 'text-ink-faint dark:text-ink-dark-faint',
                  )}
                  style={NUM}
                >
                  {k.measured
                    ? `${formatNumber(k.points, k.points % 1 ? 1 : 0)}/${k.max}`
                    : 'no data'}
                </Text>
              </View>
              {k.measured ? (
                <Meter
                  value={(k.points / k.max) * 100}
                  tone="neutral"
                  height={4}
                  className="mt-1.5"
                  accessibilityLabel={`${COMPONENT_LABEL[k.key] ?? k.key}: ${k.points} of ${k.max}`}
                />
              ) : null}
              {k.note ? (
                <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                  {k.note}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Signal strength, never a probability. No data leaves the denominator.
        </Text>
      </Panel>

      <Panel
        title="Scanner votes"
        meta={`${c.tally.buy} buy · ${c.tally.sell} sell counted · ${c.tally.consensus}`}
        flush
      >
        {voteRows(c).map((v, index) => (
          <View key={v.key}>
            {index > 0 ? <RowDivider /> : null}
            <VoteLine v={v} />
          </View>
        ))}
      </Panel>

      <Panel title="Figures">
        <KeyValueRow
          label="Volume vs 20-day"
          value={m.volRatio == null ? '—' : `${formatNumber(m.volRatio)}×`}
        />
        <KeyValueRow
          divider
          label="Delivery"
          value={
            m.deliveryPct == null
              ? '—'
              : `${formatPercent(m.deliveryPct, 1)}${m.deliveryRatio != null ? ` (${formatNumber(m.deliveryRatio)}×)` : ''}`
          }
        />
        <KeyValueRow
          divider
          label="RSI 14 · ADX 14"
          value={`${formatNumber(m.rsi, 1)} · ${formatNumber(m.adx, 1)}`}
        />
        <KeyValueRow
          divider
          label="vs Nifty 1d · 5d"
          value={
            m.rs1 == null ? '—' : `${formatSignedPercent(m.rs1)} · ${formatSignedPercent(m.rs5)}`
          }
        />
        {c.fno ? (
          <>
            <KeyValueRow
              divider
              label="Futures · OI"
              value={`${formatSignedPercent(m.futChangePct)} · ${formatSignedPercent(m.oiChangePct)}`}
            />
            <KeyValueRow
              divider
              label="PCR · ATM IV"
              value={`${formatNumber(m.pcr)} · ${m.atmIvPct == null ? '—' : formatPercent(m.atmIvPct, 1)}`}
            />
          </>
        ) : null}
      </Panel>

      {c.flags.length > 0 ? (
        <Panel title="Watch out">
          <Bullets items={c.flags} />
        </Panel>
      ) : null}
    </View>
  );
}

const VOTE_BOX = {
  buy: 'bg-success-wash dark:bg-success-wash-dark',
  sell: 'bg-danger-wash dark:bg-danger-wash-dark',
  plain: 'bg-surface-sunk dark:bg-surface-sunk-dark',
} as const;
const VOTE_TEXT = {
  buy: 'text-brand-text dark:text-brand-text-dark',
  sell: 'text-danger-600 dark:text-danger-dark',
  plain: 'text-ink-muted dark:text-ink-dark-muted',
} as const;

function VoteLine({ v }: { v: VoteRow }) {
  // Colour only for a vote that counts: green a counted BUY, red a counted SELL.
  const kind =
    v.counted && v.vote === 'BUY' ? 'buy' : v.counted && v.vote === 'SELL' ? 'sell' : 'plain';
  const box = VOTE_BOX[kind];
  const textClass = VOTE_TEXT[kind];
  return (
    <View accessible className="px-4 py-2.5">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
          {SCANNER_SHORT[v.key]}
        </Text>
        <View className={cn('rounded-md px-1.5 py-0.5', box)}>
          <Text className={cn('text-[11px] font-semibold', textClass)}>
            {v.vote === 'NEUTRAL' ? '—' : v.vote}
          </Text>
        </View>
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">{v.state}</Text>
      </View>
      {v.reasons.length > 0 ? (
        <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {v.reasons.join(' · ')}
        </Text>
      ) : null}
      {v.countNote ? (
        <Text className="mt-0.5 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          {v.countNote}
        </Text>
      ) : null}
    </View>
  );
}

function MorningSection({ morning }: { morning: MorningCandidate }) {
  const { colors } = useTheme();
  const view = MORNING_VIEW[morning.status];
  return (
    <Panel title="Morning confirmation" right={<TonePill tone={view.tone} label={view.label} />}>
      {morning.note ? (
        <Text className="mb-2 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          {morning.note}
        </Text>
      ) : null}
      {morning.checks.map((k, index) => {
        const Icon = k.ok === true ? Check : k.ok === false ? X : Minus;
        const color =
          k.ok === true ? colors.success : k.ok === false ? colors.danger : colors.textFaint;
        return (
          <View
            key={k.key}
            accessible
            accessibilityLabel={`${k.label}: ${k.ok === true ? 'pass' : k.ok === false ? 'fail' : 'not measured'}. ${k.detail}`}
            className={cn(
              'flex-row gap-2.5 py-2',
              index > 0 && 'border-t border-line dark:border-line-dark',
            )}
          >
            <Icon size={15} color={color} style={{ marginTop: 2 }} />
            <View className="flex-1">
              <Text className="text-[13px] text-ink dark:text-ink-dark">{k.label}</Text>
              {k.detail ? (
                <Text
                  className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                  style={NUM}
                >
                  {k.detail}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </Panel>
  );
}
