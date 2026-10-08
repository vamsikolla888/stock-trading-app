import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import { Badge } from '@/components/ui/Badge';
import { Meter } from '@/components/ui/Meter';
import { ModalSheet } from '@/features/home/components/ModalSheet';
import { stockLogoUrl } from '@/features/market/api';
import { openArticleLink } from '@/features/news/lib/openLink';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { formatDateTime } from '@/features/settings/lib/time';
import { SWING_KEY } from '@/features/strategies/types';
import { stockHref } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import {
  formatINR,
  formatNumber,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import {
  CATEGORY_META,
  CONCENTRATION_FLAG_PCT,
  contractLabel,
  entryReference,
  horizonLabel,
  isSwingSource,
  moveFromEntry,
  pickPosition,
  pickStatus,
  settledResult,
  sizeFor,
  sourceChip,
} from '../lib/picksView';
import {
  formatRewardRisk,
  monitorSampleNote,
  SEGMENT_LABEL,
  STRUCTURE_LABEL,
} from '../lib/strongPicks';
import type { StrongPick } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };
const RISK_PCT = 1;

/**
 * One strong pick as a trade ticket: who it is and where it stands now (status, move, day of its
 * horizon, progress to target), the plan in four numbers, the F&O contract when there is one,
 * what to buy for the reader's own capital — or, once settled, what it made — and the evidence
 * one tap down. Levels and reasoning are the server's, rendered as given; the card computes only
 * position size and the move.
 */
export const StrongPickCard = memo(function StrongPickCard({
  pick,
  capital,
}: {
  pick: StrongPick;
  capital: number;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const [more, setMore] = useState(false);
  const meta = pick.category ? CATEGORY_META[pick.category] : null;
  const entry = entryReference(pick);
  const status = pickStatus(pick);
  const position = pickPosition(pick);
  const stopPct = moveFromEntry(pick.stopPrice, entry);
  const targetPct = moveFromEntry(pick.targetPrice, entry);
  const open = () => router.push(stockHref(pick.symbol, pick.exchange));
  const Chevron = more ? ChevronDown : ChevronRight;

  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Rank ${pick.rank}, ${pick.name || pick.symbol}${meta ? `, ${meta.label}` : ''}. Open stock`}
        onPress={open}
        className="flex-row items-center gap-3 active:opacity-70"
      >
        <StockLogo symbol={pick.symbol} uri={stockLogoUrl(pick.symbol)} />
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
            {pick.symbol}
          </Text>
          <Text
            className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
          >
            {[pick.name, pick.exchange].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View className="items-end gap-1">
          {meta ? <Badge label={meta.label} /> : null}
          <Text className="text-[11px] font-semibold text-ink-faint dark:text-ink-dark-faint">
            #{pick.rank}
          </Text>
        </View>
      </Pressable>

      <View className="mt-3 flex-row flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <StatusPill tone={status.tone} label={status.label} />
        {position.movePct != null ? (
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            <ChangeText value={position.movePct} className="text-xs" style={NUM}>
              {formatSignedPercent(position.movePct, 2)}
            </ChangeText>
            {position.settled ? ' result' : ' from entry'}
          </Text>
        ) : null}
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
          {horizonLabel(pick)}
        </Text>
      </View>

      <View className="mt-3 flex-row gap-2 rounded-xl bg-surface-sunk p-3 dark:bg-surface-sunk-dark">
        <Level
          label={pick.entryMode === 'trigger' ? 'Buy above' : 'Entry zone'}
          value={formatINR(pick.entryLow ?? pick.entryHigh)}
          sub={
            pick.entryHigh != null && pick.entryLow != null
              ? `${pick.entryMode === 'trigger' ? '≤ ' : 'to '}${formatINR(pick.entryHigh)}`
              : undefined
          }
        />
        <Level
          label="Stop"
          value={formatINR(pick.stopPrice)}
          sub={stopPct != null ? formatSignedPercent(stopPct, 1) : undefined}
          subTone="loss"
        />
        <Level
          label="Target"
          value={formatINR(pick.targetPrice)}
          sub={targetPct != null ? formatSignedPercent(targetPct, 1) : undefined}
          subTone="gain"
        />
        <Level label="Reward:risk" value={formatRewardRisk(pick.rewardRisk)} />
      </View>

      {position.progressPct != null ? (
        <View className="mt-3">
          <View className="mb-1.5 flex-row justify-between">
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
              Toward target · best price
            </Text>
            <Text className="text-[11px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
              {position.progressPct}%
            </Text>
          </View>
          <Meter
            value={position.progressPct}
            tone={pick.outcome?.status === 'stop' ? 'loss' : 'gain'}
            accessibilityLabel={`${position.progressPct}% of the way from entry to target, at the best price seen`}
          />
        </View>
      ) : null}

      {pick.contract ? <ContractLine pick={pick} /> : null}

      {position.settled ? (
        <ResultLine pick={pick} entry={entry} capital={capital} />
      ) : (
        <SizeLine pick={pick} entry={entry} capital={capital} />
      )}

      {!position.settled ? <MonitorLine pick={pick} /> : null}
      {pick.monitor?.verdict.spannedBothLevels ? (
        <Text className="mt-2 text-xs text-warning-600 dark:text-warning-dark">
          Price reached both the target and the stop; the stop is counted first.
        </Text>
      ) : null}

      {pick.rationale ? (
        <Text className="mt-3 text-[13px] leading-[20px] text-ink dark:text-ink-dark">
          {pick.rationale}
        </Text>
      ) : null}
      {pick.riskNote ? (
        <Text className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          <Text className="font-semibold">Risk · </Text>
          {pick.riskNote}
        </Text>
      ) : null}

      <SourceChips pick={pick} />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: more }}
        onPress={() => setMore((value) => !value)}
        className="mt-3 flex-row items-center gap-1 self-start py-1 active:opacity-60"
      >
        <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
          {more ? 'Hide the evidence' : 'Why this pick, and what would prove it wrong'}
        </Text>
        <Chevron size={15} color={colors.link} />
      </Pressable>
      {more ? <Evidence pick={pick} /> : null}

      {pick.caveat ? (
        <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          {pick.caveat}
        </Text>
      ) : null}
    </View>
  );
});

function Level({
  label,
  value,
  sub,
  subTone,
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: 'gain' | 'loss';
}) {
  return (
    <View
      className="min-w-0 flex-1"
      accessible
      accessibilityLabel={`${label} ${value}${sub ? `, ${sub}` : ''}`}
    >
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className="mt-0.5 text-xs font-semibold text-ink dark:text-ink-dark"
        style={NUM}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? (
        <Text
          className={cn(
            'text-[11px]',
            subTone === 'loss'
              ? 'text-danger-600 dark:text-danger-dark'
              : subTone === 'gain'
                ? 'text-brand-text dark:text-brand-text-dark'
                : 'text-ink-faint dark:text-ink-dark-faint',
          )}
          style={NUM}
          numberOfLines={1}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** The F&O contract the pick is expressed through, with its lot size and a lot's value. */
function ContractLine({ pick }: { pick: StrongPick }) {
  const c = pick.contract!;
  const priced =
    c.ltp != null ? (c.kind === 'FUT' ? formatINR(c.ltp) : `premium ${formatINR(c.ltp)}`) : null;
  return (
    <View className="mt-3 rounded-xl border border-line px-3 py-2.5 dark:border-line-dark">
      <View className="flex-row items-baseline gap-2">
        <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
          {c.kind === 'FUT' ? 'Future' : 'Option'}
        </Text>
        <Text className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
          {contractLabel(c)}
        </Text>
      </View>
      <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
        {[
          `lot ${formatNumber(c.lotSize, 0)}`,
          priced,
          c.lotValue != null ? `${formatINR(c.lotValue, 0)} a lot` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
        Levels are read on the stock; leverage magnifies both the target and the stop.
      </Text>
    </View>
  );
}

/** What to buy at 1% risk of the reader's capital — the one number they may act on directly. */
function SizeLine({
  pick,
  entry,
  capital,
}: {
  pick: StrongPick;
  entry: number | null;
  capital: number;
}) {
  const size = sizeFor({
    category: pick.category,
    capital,
    riskPct: RISK_PCT,
    entry,
    stop: pick.stopPrice,
    contract: pick.contract,
  });
  if (!size) return null;
  const budget = `At ${RISK_PCT}% of ${formatINR(capital, 0)}`;
  if (size.qty === 0) {
    return (
      <Text className="mt-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
        {budget}: {size.note}.
      </Text>
    );
  }
  const what =
    size.unit === 'shares'
      ? `${formatNumber(size.qty, 0)} shares`
      : `${size.qty} lot${size.qty === 1 ? '' : 's'}`;
  const value =
    size.unit === 'shares' && entry != null
      ? ` (${formatINR(size.qty * entry, 0)}${size.exposurePct != null ? `, ${size.exposurePct}% of capital` : ''})`
      : '';
  return (
    <>
      <Text
        className="mt-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
        style={NUM}
      >
        {budget}: <Text className="font-semibold text-ink dark:text-ink-dark">{what}</Text>
        {value} · {formatINR(size.risk, 0)} {size.note}
      </Text>
      {size.exposurePct != null && size.exposurePct > CONCENTRATION_FLAG_PCT ? (
        <Text className="mt-1 text-xs leading-[17px] text-warning-600 dark:text-warning-dark">
          A tight stop makes this a large position — {size.exposurePct}% of your capital in one
          stock. Many traders cap one position near {CONCENTRATION_FLAG_PCT}%.
        </Text>
      ) : null}
    </>
  );
}

/** A settled pick: what it made or lost at the reader's 1%-risk size, before charges. Options
 *  are read on the stock (no premium history is kept), so they get the stock's move only. */
function ResultLine({
  pick,
  entry,
  capital,
}: {
  pick: StrongPick;
  entry: number | null;
  capital: number;
}) {
  const o = pick.outcome!;
  if (o.status === 'not-triggered') {
    return (
      <Text className="mt-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
        No trade — the buy-above level was never reached, so nothing was bought.
      </Text>
    );
  }
  const size =
    pick.category === 'options'
      ? null
      : sizeFor({
          category: pick.category,
          capital,
          riskPct: RISK_PCT,
          entry,
          stop: pick.stopPrice,
          contract: pick.contract,
        });
  const result = settledResult(
    size ? { qty: size.qty, unit: size.unit, lotSize: pick.contract?.lotSize } : null,
    o,
  );
  return (
    <Text
      className="mt-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
      style={NUM}
    >
      Result{' '}
      <ChangeText value={o.returnPct} className="text-xs" style={NUM}>
        {formatSignedPercent(o.returnPct, 2)}
      </ChangeText>
      {result && size && size.qty > 0 ? (
        <>
          {' · '}
          <ChangeText value={result.pnl} className="text-xs" style={NUM}>
            {formatSignedINR(result.pnl, 0)}
          </ChangeText>
          {` on ${size.unit === 'shares' ? `${formatNumber(size.qty, 0)} shares` : `${size.qty} lot${size.qty === 1 ? '' : 's'}`} at ${RISK_PCT}% risk, before charges`}
        </>
      ) : pick.category === 'options' ? (
        ' on the stock — the option’s premium is not tracked'
      ) : null}
    </Text>
  );
}

/** The live watch: the monitor's own sentence, verbatim, and whether it is still sampling. */
function MonitorLine({ pick }: { pick: StrongPick }) {
  const monitor = pick.monitor;
  if (!monitor) return null;
  const note = monitorSampleNote(monitor.minutesSinceSample);
  return (
    <View className="mt-3 rounded-xl bg-surface-sunk px-3 py-2.5 dark:bg-surface-sunk-dark">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">Now</Text>
        <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
          {formatINR(monitor.lastPrice)}
        </Text>
      </View>
      {monitor.verdict.detail ? (
        <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {monitor.verdict.detail}
          {monitor.verdict.stale ? ' The latest price is stale.' : ''}
        </Text>
      ) : null}
      {note ? (
        <Text
          className={cn(
            'mt-1 text-[11px]',
            note.tone === 'warning'
              ? 'text-warning-600 dark:text-warning-dark'
              : 'text-ink-faint dark:text-ink-dark-faint',
          )}
        >
          {note.text}
        </Text>
      ) : null}
    </View>
  );
}

/** Where the pick came from. The swing setup opens the strategy that found it. */
function SourceChips({ pick }: { pick: StrongPick }) {
  const router = useRouter();
  const score =
    pick.winProbability != null
      ? `Calibrated ${pick.winProbability}% · n=${pick.probabilitySampleSize}`
      : `AI score ${pick.modelSetupScore}`;
  return (
    <View className="mt-3 flex-row flex-wrap gap-1.5">
      {pick.sources.map((source) =>
        isSwingSource(source) ? (
          <Pressable
            key={source}
            accessibilityRole="link"
            accessibilityLabel="Found by the Institutional Breakout Swing strategy. Open it"
            onPress={() =>
              router.push({ pathname: '/house-strategy/[key]', params: { key: SWING_KEY } })
            }
            className="rounded-full bg-brand-wash px-2.5 py-1 active:opacity-70 dark:bg-brand-wash-dark"
          >
            <Text className="text-xs font-semibold text-brand-text dark:text-brand-text-dark">
              {sourceChip(source, pick.swing?.grade)} ›
            </Text>
          </Pressable>
        ) : (
          <View
            key={source}
            className="rounded-full bg-surface-sunk px-2.5 py-1 dark:bg-surface-sunk-dark"
          >
            <Text className="text-xs font-medium text-ink-muted dark:text-ink-dark-muted">
              {sourceChip(source, pick.swing?.grade)}
            </Text>
          </View>
        ),
      )}
      <View
        accessible
        accessibilityLabel={`${score}. An ordinal AI ranking among the day's picks — not a probability of success.`}
        className="rounded-full border border-line px-2.5 py-1 dark:border-line-dark"
      >
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {score}
        </Text>
      </View>
    </View>
  );
}

function SubHeading({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
      {children}
    </Text>
  );
}

/** The evidence behind a pick, one tap down — each part only when the server sent it. */
function Evidence({ pick }: { pick: StrongPick }) {
  const swing = pick.swing;
  return (
    <View className="mt-2 gap-4 border-t border-line pt-3 dark:border-line-dark">
      {pick.invalidation ? (
        <View>
          <SubHeading>What would prove it wrong</SubHeading>
          <Text className="text-[13px] leading-[19px] text-ink dark:text-ink-dark">
            {pick.invalidation}
          </Text>
          <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
            Only the stop and the target are watched automatically.
          </Text>
        </View>
      ) : null}

      {pick.observationSummary ? (
        <View>
          <SubHeading>The open, 09:15–09:30</SubHeading>
          <View className="flex-row flex-wrap items-baseline gap-x-2">
            <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
              {STRUCTURE_LABEL[pick.structure]}
            </Text>
            {pick.openMovePct != null ? (
              <ChangeText value={pick.openMovePct} className="text-xs" style={NUM}>
                {formatSignedPercent(pick.openMovePct)} in the first 15 min
              </ChangeText>
            ) : null}
          </View>
          <Text className="mt-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            {pick.observationSummary}
          </Text>
        </View>
      ) : null}

      {swing ? (
        <View>
          <SubHeading>
            {`Swing checklist · grade ${swing.grade || '—'}${swing.score != null ? ` · score ${formatNumber(swing.score, 0)}` : ''} · ${swing.trigger === 'pullback' ? 'EMA bounce' : 'breakout'}`}
          </SubHeading>
          <CheckList title={`Met · ${swing.passed.length}`} items={swing.passed} mark="✓" />
          {swing.warnings.length > 0 ? (
            <CheckList
              title={`Not fully met · ${swing.warnings.length}`}
              items={swing.warnings}
              mark="!"
              warn
            />
          ) : null}
        </View>
      ) : null}

      {pick.fundamentals?.verdict ? (
        <View>
          <SubHeading>Fundamentals</SubHeading>
          <Text className="text-[13px] text-ink dark:text-ink-dark">
            {pick.fundamentals.verdict.replace(/_/g, ' ')}
            {pick.fundamentals.ratingPct != null ? (
              <Text className="text-ink-muted dark:text-ink-dark-muted">
                {` · rated ${formatNumber(pick.fundamentals.ratingPct, 0)}%`}
              </Text>
            ) : null}
          </Text>
        </View>
      ) : null}

      {pick.news.length > 0 ? (
        <View>
          <SubHeading>News</SubHeading>
          <View className="gap-2">
            {pick.news.map((item) => {
              const line = [item.publisher, item.at ? formatDateTime(item.at) : null]
                .filter(Boolean)
                .join(' · ');
              const body = (
                <>
                  <Text
                    className={cn(
                      'text-[13px] leading-[19px]',
                      item.url
                        ? 'text-brand-text dark:text-brand-text-dark'
                        : 'text-ink dark:text-ink-dark',
                    )}
                  >
                    {item.title}
                  </Text>
                  {line ? (
                    <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                      {line}
                    </Text>
                  ) : null}
                </>
              );
              return item.url ? (
                <Pressable
                  key={item.title}
                  accessibilityRole="link"
                  accessibilityLabel={`${item.title}. Open article`}
                  onPress={() => void openArticleLink(item.url)}
                  className="active:opacity-60"
                >
                  {body}
                </Pressable>
              ) : (
                <View key={item.title}>{body}</View>
              );
            })}
          </View>
        </View>
      ) : null}

      {!pick.category && pick.segmentVerdicts.length > 0 ? <SegmentNotes pick={pick} /> : null}
    </View>
  );
}

function CheckList({
  title,
  items,
  mark,
  warn = false,
}: {
  title: string;
  items: readonly string[];
  mark: string;
  warn?: boolean;
}) {
  return (
    <View className="mb-2">
      <Text className="mb-1 text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
        {title}
      </Text>
      {items.map((item) => (
        <View key={item} className="flex-row gap-2 py-0.5">
          <Text
            className={cn(
              'w-3 text-xs font-bold',
              warn
                ? 'text-warning-600 dark:text-warning-dark'
                : 'text-ink-muted dark:text-ink-dark-muted',
            )}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {mark}
          </Text>
          <Text className="flex-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Picks from before categories existed carry the per-segment verdicts instead. */
function SegmentNotes({ pick }: { pick: StrongPick }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <SubHeading>Where it can be traded</SubHeading>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Segments: ${pick.segmentVerdicts
          .map((v) => `${SEGMENT_LABEL[v.segment]} ${v.suitable ? 'suitable' : 'not suitable'}`)
          .join(', ')}. Show why`}
        onPress={() => setOpen(true)}
        className="flex-row flex-wrap gap-1.5 active:opacity-70"
      >
        {pick.segmentVerdicts.map((v) => (
          <Badge
            key={v.segment}
            label={`${SEGMENT_LABEL[v.segment]}${v.suitable ? (v.confidence === 'inferred' ? ' · inferred' : '') : ' · no'}`}
            variant={v.suitable ? 'primary' : 'neutral'}
          />
        ))}
      </Pressable>
      <ModalSheet
        visible={open}
        title={`Where ${pick.symbol} can be traded`}
        onClose={() => setOpen(false)}
      >
        {pick.segmentVerdicts.map((v) => (
          <View key={v.segment} className="border-b border-line py-3 dark:border-line-dark">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-[15px] font-semibold text-ink dark:text-ink-dark">
                {SEGMENT_LABEL[v.segment]}
              </Text>
              <Badge
                label={v.suitable ? 'Suitable' : 'Not suitable'}
                variant={v.suitable ? 'success' : 'neutral'}
              />
            </View>
            <Text className="mt-1.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              {v.reason}
            </Text>
            {v.confidence === 'inferred' ? (
              <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                Inferred from daily bars — this platform holds no intraday history.
              </Text>
            ) : null}
          </View>
        ))}
      </ModalSheet>
    </View>
  );
}
