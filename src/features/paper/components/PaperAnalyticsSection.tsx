import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { PriceChart, type ChartPoint } from '@/components/market/PriceChart';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { RangeSelector } from '@/components/ui/Tabs';
import { Caveats, Disclosure } from '@/features/fno/components/primitives';
import { useMask } from '@/features/portfolio/components/BookSummaryCard';
import { plural } from '@/features/portfolio/lib/dates';
import { cn } from '@/lib/utils/cn';
import {
  formatINR,
  formatNumber,
  formatPercent,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';

import { usePaperAnalytics, usePaperPerformance } from '../hooks';
import { CHARGE_LINES, equityPoints, exitReasonText, POOL_LABEL } from '../lib/book';
import type { PaperAnalytics, ReconcileStatus } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

const STATUS: Record<ReconcileStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  exact: { label: 'Exact to the paisa', tone: 'success' },
  rounding: { label: 'Within a paisa', tone: 'warning' },
  mismatch: { label: 'Mismatch', tone: 'danger' },
};

const CURVE_DAYS = [
  { key: '30', label: '1M' },
  { key: '90', label: '3M' },
  { key: '180', label: '6M' },
  { key: '365', label: '1Y' },
] as const;
type CurveDays = (typeof CURVE_DAYS)[number]['key'];

const LEDGER_PAGE = 15;

/**
 * Analytics — every rupee of this profile's wallet (web: Paper trading › Analytics). Read-only
 * and REPLAYED: the bridge walks from the capital put in to today's wallet value one charge
 * line and one product at a time; the cash check rebuilds the cash from the ledger alone and
 * can genuinely disagree with the stored balance. Then the reconstructed equity curve.
 */
export function PaperAnalyticsSection({ profileId }: { profileId: string | undefined }) {
  const analytics = usePaperAnalytics(profileId, true);
  const a = analytics.data;

  if (analytics.isPending) return <ListSkeleton rows={5} />;
  if (!a) {
    return (
      <InlineError
        what="your paper analytics"
        error={analytics.error}
        onRetry={() => void analytics.refetch()}
      />
    );
  }

  return (
    <View>
      <Headline a={a} />
      <BridgeCard a={a} />
      <AllocationCard a={a} />
      <DistributionCard a={a} />
      <TradesCard a={a} />
      <ChargesCard a={a} />
      <CashCheck a={a} />
      <EquityCurve profileId={profileId} />
      <Ledger a={a} />
      {a.methodology.length > 0 ? (
        <Disclosure
          className="mt-6"
          title="How these numbers are worked out"
          meta={plural(a.methodology.length, 'note')}
        >
          <Caveats items={a.methodology} />
        </Disclosure>
      ) : null}
    </View>
  );
}

function Headline({ a }: { a: PaperAnalytics }) {
  const mask = useMask();
  const status = STATUS[a.reconciliation.status];
  return (
    <View className="flex-row flex-wrap rounded-card border border-line bg-surface p-1.5 dark:border-line-dark dark:bg-surface-dark">
      <Stat
        label="Net P&L"
        value={mask(formatSignedINR(a.wallet.netPnl))}
        tone={a.wallet.netPnl}
        sub={
          a.wallet.returnPct != null
            ? `${formatSignedPercent(a.wallet.returnPct)} of capital`
            : 'after charges'
        }
      />
      <Stat
        label="Win rate"
        value={a.trades.winRatePct == null ? '—' : formatPercent(a.trades.winRatePct, 1)}
        sub={
          a.trades.closingFills === 0
            ? 'nothing closed yet'
            : `${a.trades.winners}W · ${a.trades.losers}L`
        }
      />
      <Stat
        label="Charges paid"
        value={mask(formatINR(a.charges.total))}
        sub={`buy ${formatINR(a.charges.buy, 0)} · sell ${formatINR(a.charges.sell, 0)}`}
      />
      <Stat
        label="Cash check"
        value={status.label}
        sub={
          a.reconciliation.status === 'exact'
            ? 'replayed independently'
            : `diff ${formatINR(a.reconciliation.difference)}`
        }
      />
    </View>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: number;
}) {
  return (
    <View className="w-1/2 px-2.5 py-2">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{label}</Text>
      {tone !== undefined ? (
        <ChangeText
          value={tone}
          className="mt-0.5 text-base"
          style={NUM}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </ChangeText>
      ) : (
        <Text
          className="mt-0.5 text-base font-bold text-ink dark:text-ink-dark"
          style={NUM}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
      )}
      {sub ? (
        <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** Capital → every charge → P&L by product → wallet value, one step at a time. */
function BridgeCard({ a }: { a: PaperAnalytics }) {
  const mask = useMask();
  const { bridge } = a;
  const scale = Math.max(
    1,
    ...bridge.steps
      .filter((s) => s.kind !== 'start' && s.kind !== 'end')
      .map((s) => Math.abs(s.amount)),
  );
  return (
    <Section
      title="From capital to wallet value"
      right={<Badge label={STATUS[bridge.status].label} variant={STATUS[bridge.status].tone} />}
    >
      <ListCard className="px-3.5 py-1.5">
        {bridge.steps.map((step, index) => {
          const level = step.kind === 'start' || step.kind === 'end';
          return (
            <View
              key={step.key}
              className={cn('py-2', index > 0 && 'border-t border-line dark:border-line-dark')}
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text
                  className={cn(
                    'flex-1 text-[13px]',
                    level
                      ? 'font-bold text-ink dark:text-ink-dark'
                      : 'text-ink-muted dark:text-ink-dark-muted',
                  )}
                  numberOfLines={2}
                >
                  {step.label}
                  {step.segment ? (
                    <Text className="text-ink-faint dark:text-ink-dark-faint">
                      {' '}
                      · {POOL_LABEL[step.segment]}
                    </Text>
                  ) : null}
                </Text>
                {level ? (
                  <Text className="text-[13px] font-bold text-ink dark:text-ink-dark" style={NUM}>
                    {mask(formatINR(step.amount))}
                  </Text>
                ) : (
                  <ChangeText value={step.amount} className="text-[13px]" style={NUM}>
                    {mask(formatSignedINR(step.amount))}
                  </ChangeText>
                )}
              </View>
              {!level && step.amount !== 0 ? (
                <View className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-sunk dark:bg-surface-sunk-dark">
                  <View
                    className={
                      step.amount >= 0
                        ? 'h-1 rounded-full bg-brand'
                        : 'h-1 rounded-full bg-danger-500'
                    }
                    style={{ width: `${Math.max(2, (Math.abs(step.amount) / scale) * 100)}%` }}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </ListCard>
      {bridge.status !== 'exact' ? (
        <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          The steps land {formatINR(Math.abs(bridge.residual))}{' '}
          {bridge.residual >= 0 ? 'short of' : 'past'} the wallet value
          {bridge.status === 'rounding'
            ? ' — ordinary rounding on averages stored to the paisa.'
            : '.'}
        </Text>
      ) : null}
    </Section>
  );
}

function AllocationCard({ a }: { a: PaperAnalytics }) {
  const mask = useMask();
  const { allocation } = a;
  return (
    <Section title="Where the capital went" note={mask(formatINR(allocation.capital, 0))}>
      <ListCard className="px-3.5">
        {allocation.lines.map((line, index) => (
          <KeyValueRow
            key={line.key}
            label={line.label}
            hint={line.hint}
            value={mask(formatSignedINR(line.amount))}
            divider={index > 0}
          />
        ))}
        <KeyValueRow
          label="Accounted for"
          value={mask(formatINR(allocation.accountedFor))}
          divider
        />
      </ListCard>
      <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Realised profit shows as a negative line: it came back into the cash above it.
      </Text>
    </Section>
  );
}

const DIST_COLORS = ['bg-brand', 'bg-info', 'bg-warning-500', 'bg-danger-500'];

function DistributionCard({ a }: { a: PaperAnalytics }) {
  const mask = useMask();
  const { distribution } = a;
  const [open, setOpen] = useState<string | null>(null);
  const positive = distribution.categories.filter((c) => c.pct != null && c.pct > 0);
  return (
    <Section title="Where the wallet is now" note={mask(formatINR(distribution.total, 0))}>
      <View className="mb-3 h-3 flex-row overflow-hidden rounded-full bg-surface-sunk dark:bg-surface-sunk-dark">
        {positive.map((c, index) => (
          <View
            key={c.category}
            className={DIST_COLORS[index % DIST_COLORS.length]}
            style={{ width: `${c.pct ?? 0}%` }}
          />
        ))}
      </View>
      <ListCard>
        {distribution.categories.map((c, index) => {
          const expanded = open === c.category;
          const colorIndex = positive.indexOf(c);
          return (
            <View key={c.category}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                disabled={c.lines.length === 0}
                onPress={() => setOpen(expanded ? null : c.category)}
                className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <View
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    colorIndex >= 0
                      ? DIST_COLORS[colorIndex % DIST_COLORS.length]
                      : 'bg-line-strong',
                  )}
                />
                <View className="flex-1">
                  <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                    {c.label}
                  </Text>
                  <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                    {c.pct == null ? 'negative — a shortfall' : `${formatNumber(c.pct, 2)}%`}
                    {c.lines.length > 0 ? ` · ${plural(c.lines.length, 'line')}` : ''}
                  </Text>
                </View>
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
                  {mask(formatINR(c.value))}
                </Text>
              </Pressable>
              {expanded ? (
                <View className="gap-1.5 px-3.5 pb-3">
                  {c.lines.map((line) => (
                    <View key={line.key} className="flex-row items-center justify-between gap-3">
                      <Text
                        className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
                        numberOfLines={1}
                      >
                        {line.symbol ?? line.label}
                        {line.quantity != null ? ` · ${line.quantity} qty` : ''}
                        {!line.priced ? ' · at cost' : ''}
                      </Text>
                      <Text className="text-xs text-ink dark:text-ink-dark" style={NUM}>
                        {mask(formatINR(line.value))}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </ListCard>
      {distribution.unpricedPositions > 0 ? (
        <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {plural(distribution.unpricedPositions, 'position')} with no price yet, carried at cost.
        </Text>
      ) : null}
    </Section>
  );
}

function TradesCard({ a }: { a: PaperAnalytics }) {
  const mask = useMask();
  const t = a.trades;
  return (
    <Section title="How the trading went" note="closing fills">
      <ListCard className="px-3.5">
        {a.categories.map((c, index) => (
          <KeyValueRow
            key={c.segment}
            label={`${c.label} (${c.product})`}
            hint={`${plural(c.sells, 'sell')} · ${c.winRatePct == null ? 'no win rate yet' : `${formatPercent(c.winRatePct, 1)} winners`} · ${mask(formatSignedINR(c.realisedNetPnl))} after charges`}
            value={mask(formatSignedINR(c.netPnl))}
            trend={c.netPnl}
            divider={index > 0}
          />
        ))}
        <KeyValueRow label="Closing fills" value={String(t.closingFills)} divider />
        <KeyValueRow
          label="Profit factor"
          hint="Gross profit ÷ gross loss"
          value={
            t.profitFactor == null
              ? t.closingFills > 0
                ? 'No losses yet'
                : '—'
              : formatNumber(t.profitFactor, 2)
          }
          divider
        />
        <KeyValueRow
          label="Average win / loss"
          value={`${t.avgWin == null ? '—' : mask(formatINR(t.avgWin))} / ${t.avgLoss == null ? '—' : mask(formatINR(Math.abs(t.avgLoss)))}`}
          divider
        />
        <KeyValueRow
          label="Expectancy"
          hint="Per closing fill"
          value={t.expectancy == null ? '—' : mask(formatSignedINR(t.expectancy))}
          trend={t.expectancy}
          divider
        />
        {t.chargesPctOfGrossProfit != null ? (
          <KeyValueRow
            label="Charges vs gross profit"
            value={formatPercent(t.chargesPctOfGrossProfit, 1)}
            divider
          />
        ) : null}
      </ListCard>
    </Section>
  );
}

function ChargesCard({ a }: { a: PaperAnalytics }) {
  const mask = useMask();
  const c = a.charges;
  return (
    <Section title="Charges paid" note="like a contract note">
      <ListCard className="px-3.5">
        {CHARGE_LINES.map((line, index) => (
          <KeyValueRow
            key={line.key}
            label={line.label}
            value={mask(formatINR(c.byComponent[line.key] ?? 0))}
            divider={index > 0}
          />
        ))}
        {c.unitemised > 0 ? (
          <KeyValueRow
            label="Before itemisation"
            hint="Total exact, split never recorded"
            value={mask(formatINR(c.unitemised))}
            divider
          />
        ) : null}
        <KeyValueRow label="Total" value={mask(formatINR(c.total))} divider />
      </ListCard>
    </Section>
  );
}

function CashCheck({ a }: { a: PaperAnalytics }) {
  const mask = useMask();
  const r = a.reconciliation;
  const status = STATUS[r.status];
  return (
    <Section title="Cash check" right={<Badge label={status.label} variant={status.tone} />}>
      <ListCard className="px-3.5">
        <KeyValueRow label="Replayed from the ledger" value={mask(formatINR(r.replayedCash))} />
        <KeyValueRow label="Stored balance" value={mask(formatINR(r.storedCash))} divider />
        <KeyValueRow label="Difference" value={formatINR(r.difference)} divider />
        {r.excludedBeforeReset > 0 ? (
          <KeyValueRow
            label="Excluded (before reset)"
            value={String(r.excludedBeforeReset)}
            divider
          />
        ) : null}
      </ListCard>
      {r.positionMismatches.length > 0 ? (
        <Banner
          className="mt-3"
          tone="warning"
          title={`${plural(r.positionMismatches.length, 'position')} disagree with the replay`}
          message={r.positionMismatches
            .map((m) => `${m.key}: stored ${m.storedQuantity}, replayed ${m.replayedQuantity}`)
            .join(' · ')}
        />
      ) : null}
    </Section>
  );
}

/** The reconstructed wallet value per day, in rupees — a day with no close is a gap, not zero. */
function EquityCurve({ profileId }: { profileId: string | undefined }) {
  const mask = useMask();
  const [days, setDays] = useState<CurveDays>('90');
  const [active, setActive] = useState<ChartPoint | null>(null);
  const performance = usePaperPerformance(Number(days), profileId, true);
  const p = performance.data;
  const points = useMemo(() => (p ? equityPoints(p.equityCurve) : []), [p]);
  const last = points[points.length - 1] ?? null;

  return (
    <Section title="Wallet value over time">
      <Card>
        {performance.isPending ? (
          <View className="h-[190px] rounded-xl bg-surface-sunk dark:bg-surface-sunk-dark" />
        ) : !p ? (
          <InlineError
            what="the equity curve"
            error={performance.error}
            onRetry={() => void performance.refetch()}
          />
        ) : p.curveUnavailableReason || points.length < 2 ? (
          <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
            {p.curveUnavailableReason ?? 'Not enough history to draw a curve yet.'}
          </Text>
        ) : (
          <>
            <View className="flex-row items-start justify-between gap-3">
              <View>
                <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                  {active
                    ? new Date(active.time).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })
                    : 'Latest close'}
                </Text>
                <Text
                  className="mt-0.5 text-[18px] font-bold text-ink dark:text-ink-dark"
                  style={NUM}
                >
                  {mask(formatINR((active ?? last)?.value ?? null, 0))}
                </Text>
              </View>
              {p.past.netPnl != null ? (
                <View className="items-end">
                  <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                    Over this window
                  </Text>
                  <ChangeText value={p.past.netPnl} className="mt-0.5 text-sm" style={NUM}>
                    {mask(formatSignedINR(p.past.netPnl, 0))}
                    {p.past.netPnlPct != null ? ` (${formatSignedPercent(p.past.netPnlPct)})` : ''}
                  </ChangeText>
                </View>
              ) : null}
            </View>
            <View className="mt-3">
              <PriceChart
                points={points}
                height={180}
                baseline={p.past.startingCapital}
                onScrub={setActive}
              />
            </View>
            {p.past.drawdown ? (
              <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                Deepest drawdown {formatPercent(p.past.drawdown.depthPct, 1)} over{' '}
                {plural(p.past.drawdown.durationDays, 'day')}
                {p.past.drawdown.recoveryDays == null
                  ? ', not yet recovered'
                  : `, recovered in ${plural(p.past.drawdown.recoveryDays, 'day')}`}
                .
              </Text>
            ) : null}
          </>
        )}
        <RangeSelector
          items={CURVE_DAYS}
          value={days}
          onChange={setDays}
          className="mt-3 justify-center"
        />
      </Card>
    </Section>
  );
}

function Ledger({ a }: { a: PaperAnalytics }) {
  const mask = useMask();
  const [shown, setShown] = useState(LEDGER_PAGE);
  // The server sends it oldest first; the newest matters most on a phone.
  const entries = useMemo(() => [...a.ledger].reverse(), [a.ledger]);
  if (entries.length === 0) return null;
  return (
    <Section title="Every rupee, in order" note={plural(entries.length, 'entry', 'entries')}>
      <ListCard>
        {entries.slice(0, shown).map((e, index) => {
          const title =
            e.kind === 'OPENING'
              ? 'Opening capital'
              : e.kind === 'CAPITAL'
                ? e.cashChange >= 0
                  ? 'Deposit'
                  : 'Withdrawal'
                : `${e.kind} ${e.quantity ?? ''} ${e.symbol ?? ''}`.trim();
          const reason = exitReasonText(e.exitReason);
          return (
            <View key={e.id}>
              {index > 0 ? <RowDivider /> : null}
              <View className="flex-row items-center gap-3 px-3.5 py-2.5">
                <View className="min-w-0 flex-1">
                  <Text
                    className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  <Text
                    className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
                    numberOfLines={1}
                  >
                    {e.at
                      ? new Date(e.at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: 'Asia/Kolkata',
                        })
                      : '—'}
                    {e.segment ? ` · ${POOL_LABEL[e.segment]}` : ''}
                    {e.price != null ? ` · at ${formatINR(e.price)}` : ''}
                    {e.chargesTotal > 0 ? ` · charges ${formatINR(e.chargesTotal)}` : ''}
                    {reason ? ` · ${reason}` : ''}
                  </Text>
                  {e.realisedPnl != null ? (
                    <ChangeText value={e.realisedPnl} className="text-[11px]" style={NUM}>
                      Realised {mask(formatSignedINR(e.realisedPnl))}
                    </ChangeText>
                  ) : null}
                </View>
                <View className="items-end">
                  <ChangeText value={e.cashChange} className="text-[13px]" style={NUM}>
                    {mask(formatSignedINR(e.cashChange))}
                  </ChangeText>
                  <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
                    {mask(formatINR(e.cashAfter, 0))}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </ListCard>
      {shown < entries.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShown((n) => n + LEDGER_PAGE * 2)}
          className="mt-3 self-center active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Show more ({entries.length - shown} older)
          </Text>
        </Pressable>
      ) : null}
    </Section>
  );
}
