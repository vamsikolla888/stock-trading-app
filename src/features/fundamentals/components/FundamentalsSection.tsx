import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import React, { memo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { Sparkline } from '@/components/market/Sparkline';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage, isApiError } from '@/types/api';

import {
  useFundamentalAnalysis,
  useFundamentalHistory,
  useFundamentalJob,
  useRefreshFundamentals,
} from '../hooks';
import {
  BAND_TEXT,
  BAND_TONE,
  checkValue,
  CONFIDENCE_TEXT,
  crore,
  etaText,
  isJobActive,
  istDate,
  jobProgressText,
  jobTakingLong,
  knockoutText,
  pct,
  points,
  quarterLabel,
  rupees,
  STAGE_TEXT,
  STAGES,
  times,
  VERDICT_TEXT,
  VERDICT_TONE,
  WORKING_STATES,
} from '../lib/format';
import type {
  AnalysisView,
  JobView,
  KeyNumbersRow,
  SectionResult,
  ShareholdingRow,
} from '../types';

import { ScoreRing } from './ScoreRing';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * The stock's fundamental analysis (web: the stock page's "Analysis" section) — financials from
 * Groww scored against the platform's framework, rated weekly. It is served, attached to, or
 * started by one GET: a fresh analysis shows at once; one being produced is followed job-first,
 * so the screen moves through its stages instead of spinning.
 */
export function FundamentalsSection({
  symbol,
  exchange,
}: {
  symbol: string;
  exchange: 'NSE' | 'BSE';
}) {
  const now = useNow(15_000);
  const response = useFundamentalAnalysis(symbol, exchange);
  const data = response.data;
  const state = data?.state ?? null;
  const analysis = data?.analysis ?? null;
  const working = state != null && WORKING_STATES.has(state);
  const job = useFundamentalJob(symbol, exchange, data?.job?.id ?? null, working);
  const liveJob: JobView | null = job.data?.job ?? data?.job ?? null;
  const history = useFundamentalHistory(symbol, Boolean(analysis));
  const refresh = useRefreshFundamentals(symbol, exchange);

  const runRefresh = () =>
    refresh.mutate(undefined, {
      onSuccess: () => toast.info('Fresh analysis started', 'It takes a minute or two.'),
      onError: (error) =>
        toast.error(
          isApiError(error) && error.status === 429
            ? 'Already refreshed today'
            : 'Couldn’t refresh',
          getErrorMessage(error),
        ),
    });

  if (response.isPending) {
    return (
      <View className="mt-4 gap-3" accessibilityLabel="Loading the fundamental analysis">
        <View className="h-36 rounded-card bg-surface-sunk dark:bg-surface-sunk-dark" />
        <View className="h-24 rounded-card bg-surface-sunk dark:bg-surface-sunk-dark" />
      </View>
    );
  }
  if (!data) {
    return (
      <InlineError
        className="mt-4"
        what="the fundamental analysis"
        error={response.error}
        onRetry={() => void response.refetch()}
      />
    );
  }

  const stillWorking = liveJob != null && isJobActive(liveJob);

  return (
    <View className="mt-4">
      {/* ── Where the analysis stands ── */}
      {state === 'refreshing' && stillWorking ? (
        <Banner
          tone="info"
          className="mb-3"
          title="A fresh analysis is on its way"
          message={`${jobProgressText(liveJob!)} The last one is shown until it lands.`}
        />
      ) : null}
      {!analysis && stillWorking ? (
        <JobProgress job={liveJob!} takingLong={jobTakingLong(liveJob, now)} />
      ) : null}
      {!analysis && !stillWorking ? (
        <NoAnalysis
          state={state}
          message={data.message ?? liveJob?.message ?? null}
          onRetry={() => void response.refetch()}
        />
      ) : null}
      {state === 'partial' ? (
        <Banner
          tone="warning"
          className="mb-3"
          message={`${
            analysis?.message ?? 'The qualitative review is not available yet.'
          } Those rows are left out of the rating until then.`}
        />
      ) : null}
      {analysis?.isStale ? (
        <Banner
          tone="warning"
          className="mb-3"
          message={`This analysis is from ${istDate(analysis.generatedAt)} and is past its refresh date.`}
        />
      ) : null}

      {analysis ? (
        <AnalysisBody
          analysis={analysis}
          trend={
            history.data?.points.map((p) => p.ratingPct).filter((v): v is number => v != null) ?? []
          }
        />
      ) : null}

      {/* ── Refresh + provenance ── */}
      {analysis || state === 'failed' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh the fundamental analysis"
          disabled={refresh.isPending || stillWorking}
          onPress={runRefresh}
          className="mt-6 flex-row items-center justify-center gap-2 self-center rounded-full border border-line px-4 py-2 active:bg-surface-sunk disabled:opacity-50 dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          {refresh.isPending ? <ActivityIndicator size="small" /> : <RefreshIcon />}
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
            {stillWorking ? 'Refreshing…' : 'Refresh analysis'}
          </Text>
        </Pressable>
      ) : null}
      {analysis ? (
        <Text className="mt-4 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          {analysis.financialsBasis === 'consolidated' ? 'Consolidated' : 'Standalone'} financials ·{' '}
          {analysis.dataCoverage.annualYears} years · framework {analysis.frameworkVersion} · rated{' '}
          {istDate(analysis.generatedAt)}
          {'\n'}
          {analysis.disclaimer}
        </Text>
      ) : null}
    </View>
  );
}

function RefreshIcon() {
  const { colors } = useTheme();
  return <RefreshCw size={14} color={colors.text} />;
}

/** The job's stages as a checklist, so the wait reads as progress, not a spinner. */
function JobProgress({ job, takingLong }: { job: JobView; takingLong: boolean }) {
  const { colors } = useTheme();
  const current = STAGES.indexOf(job.stage);
  const eta = etaText(job.etaSeconds);
  return (
    <Card className="mb-3">
      <View className="flex-row items-center gap-2.5">
        <ActivityIndicator size="small" color={colors.accent} />
        <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
          Analysing the fundamentals
        </Text>
        {eta ? (
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{eta}</Text>
        ) : null}
      </View>
      <Text className="mt-1.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {takingLong ? 'Taking longer than usual — it keeps running.' : jobProgressText(job)}
      </Text>
      <View className="mt-3 gap-1.5">
        {STAGES.map((stage, index) => {
          const done = job.status === 'running' && index < current;
          const active = job.status === 'running' && index === current;
          return (
            <View key={stage} className="flex-row items-center gap-2.5">
              <View
                className={cn(
                  'h-2 w-2 rounded-full',
                  done
                    ? 'bg-brand'
                    : active
                      ? 'bg-warning-500'
                      : 'bg-line-strong dark:bg-line-dark-strong',
                )}
              />
              <Text
                className={cn(
                  'text-xs',
                  done || active
                    ? 'text-ink dark:text-ink-dark'
                    : 'text-ink-faint dark:text-ink-dark-faint',
                )}
              >
                {STAGE_TEXT[stage]}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function NoAnalysis({
  state,
  message,
  onRetry,
}: {
  state: string | null;
  message: string | null;
  onRetry: () => void;
}) {
  const copy: Record<string, { title: string; body: string }> = {
    insufficient_data: {
      title: 'Financials not yet available',
      body: 'Re-checked daily.',
    },
    not_applicable: {
      title: 'Not rated by this framework',
      body: 'This kind of company (an ETF, a fund or a trust, for example) isn’t scored on fundamentals.',
    },
    delisted: {
      title: 'Delisted',
      body: 'This listing is no longer traded, so it isn’t analysed.',
    },
    rate_limited: {
      title: 'Analysis limit reached',
      body: 'Too many new analyses this hour — try again later.',
    },
    failed: { title: 'The analysis didn’t finish', body: 'Something went wrong producing it.' },
  };
  const entry = (state ? copy[state] : undefined) ?? {
    title: 'No analysis yet',
    body: 'An analysis for this stock hasn’t been produced.',
  };
  return (
    <Card className="mb-3 items-center gap-1.5 py-6">
      <Text className="text-center text-sm font-semibold text-ink dark:text-ink-dark">
        {entry.title}
      </Text>
      <Text className="text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {/* The server's own reason, and — for missing financials — when it is looked at again. */}
        {message
          ? `${message}${state === 'insufficient_data' ? ` ${entry.body}` : ''}`
          : entry.body}
      </Text>
      {state === 'failed' || state === 'rate_limited' ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          hitSlop={8}
          className="mt-1 active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Try again
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

/* ── The analysis ─────────────────────────────────────────────────────────────────────── */

function AnalysisBody({ analysis: a, trend }: { analysis: AnalysisView; trend: number[] }) {
  const { colors } = useTheme();
  const tone = VERDICT_TONE[a.verdict];
  const report = a.report;
  return (
    <View>
      <Card>
        <View className="flex-row items-center gap-4">
          <ScoreRing value={a.ratingPct} tone={tone} />
          <View className="min-w-0 flex-1 gap-2">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Badge label={VERDICT_TEXT[a.verdict]} variant={tone} />
            </View>
            <Meter label="Quality" value={a.qualityPct} />
            <Meter label="Valuation" value={a.valuationPct} />
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
              {points(a.earned)} of {points(a.availableMax)} points · confidence{' '}
              {CONFIDENCE_TEXT[a.confidence].toLowerCase()}
            </Text>
          </View>
        </View>
        {a.ratingDelta != null && a.ratingDelta !== 0 ? (
          <Text
            className={cn(
              'mt-3 text-xs',
              a.ratingDelta > 0
                ? 'text-brand-text dark:text-brand-text-dark'
                : 'text-danger-600 dark:text-danger-dark',
            )}
            style={NUM}
          >
            {a.ratingDelta > 0 ? '▲' : '▼'} {Math.abs(a.ratingDelta).toFixed(1)} points since last
            week
          </Text>
        ) : null}
        {trend.length >= 2 ? (
          <View className="mt-3 flex-row items-center gap-3">
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
              {trend.length}-week trend
            </Text>
            <View className="flex-1">
              <Sparkline data={trend} height={28} color={colors.accent} />
            </View>
          </View>
        ) : null}
        {a.knockouts.length > 0 ? (
          <View className="mt-3 rounded-field bg-danger-wash p-3 dark:bg-danger-wash-dark">
            <Text className="text-xs font-semibold text-danger-600 dark:text-danger-dark">
              Capped by a red flag{a.knockouts.length > 1 ? 's' : ''}
            </Text>
            {a.knockouts.map((k) => (
              <Text
                key={k.rule}
                className="mt-1 text-xs leading-[17px] text-ink dark:text-ink-dark"
              >
                {knockoutText(k.rule)} — {k.evidence}
              </Text>
            ))}
          </View>
        ) : null}
        {a.tags.length > 0 ? (
          <View className="mt-3 flex-row flex-wrap gap-1.5">
            {a.tags.map((tag) => (
              <Badge key={tag} label={tag} />
            ))}
          </View>
        ) : null}
      </Card>

      {report?.business ? (
        <Section title="About the business">
          <Text className="text-[13px] leading-[20px] text-ink-muted dark:text-ink-dark-muted">
            {report.business}
          </Text>
        </Section>
      ) : null}

      <Section title="How it scored" note={`${a.sections.length} areas`}>
        <ListCard>
          {a.sections.map((section, index) => (
            <React.Fragment key={section.key}>
              {index > 0 ? <RowDivider /> : null}
              <SectionRow section={section} />
            </React.Fragment>
          ))}
        </ListCard>
      </Section>

      {report && report.keyNumbers.length > 0 ? <KeyNumbers rows={report.keyNumbers} /> : null}

      {report ? (
        <Section title="Valuation">
          <ListCard className="px-3.5">
            <KeyValueRow
              label="P/E"
              hint={`5-yr median ${times(report.valuation.peMedian, 1)} · industry ${times(report.valuation.industryPe, 1)}`}
              value={times(report.valuation.pe, 1)}
            />
            <KeyValueRow label="Price to book" value={times(report.valuation.pb, 2)} divider />
            <KeyValueRow label="PEG" value={times(report.valuation.peg, 2)} divider />
            <KeyValueRow
              label="EV / EBITDA"
              value={times(report.valuation.evToEbitda, 1)}
              divider
            />
            <KeyValueRow
              label="Intrinsic value"
              hint="Two-stage DCF — an estimate, not a target"
              value={rupees(report.valuation.intrinsicValue, 0)}
              divider
            />
            <KeyValueRow
              label="Margin of safety"
              value={pct(report.valuation.marginOfSafetyPct)}
              trend={report.valuation.marginOfSafetyPct}
              divider
            />
            <KeyValueRow
              label="Growth the price implies"
              hint={`vs ${pct(report.valuation.historicalGrowthPct)} achieved`}
              value={pct(report.valuation.impliedGrowthPct)}
              divider
            />
            <KeyValueRow
              label="Earnings yield"
              hint={`10-yr G-Sec ${pct(report.valuation.gsec10y, 2)}`}
              value={pct(report.valuation.earningsYieldPct, 2)}
              divider
            />
          </ListCard>
          {report.valuation.expensiveByReverseDcf ? (
            <Text className="mt-2 text-xs leading-[17px] text-warning-600 dark:text-warning-dark">
              The price assumes faster growth than the company has delivered.
            </Text>
          ) : null}
        </Section>
      ) : null}

      {report && report.shareholding.length > 0 ? (
        <Shareholding rows={report.shareholding} />
      ) : null}

      {report ? (
        <>
          <Bullets title="Strengths" items={report.strengths} tone="success" />
          <Bullets title="Risks" items={report.risks} tone="danger" />
          <Bullets title="What to watch" items={report.triggers} tone="neutral" />
          <Bullets
            title="What would change the view"
            items={report.whatWouldChange}
            tone="neutral"
          />
        </>
      ) : null}

      {report && report.redFlags.length > 0 ? (
        <Section title="Red flags">
          <View className="gap-2">
            {report.redFlags.map((flag) => (
              <Banner
                key={`${flag.type}:${flag.description}`}
                tone="warning"
                title={flag.type.replace(/_/g, ' ')}
                message={flag.description}
              />
            ))}
          </View>
        </Section>
      ) : null}

      {report && report.peers.length > 0 ? (
        <Section title="Peers">
          <ListCard className="px-3.5">
            {report.peers.map((peer, index) => (
              <KeyValueRow
                key={`${peer.name}-${index}`}
                label={peer.name}
                hint={`M-cap ${crore(peer.marketCapCr)}`}
                value={`P/E ${times(peer.pe, 1)}`}
                divider={index > 0}
              />
            ))}
          </ListCard>
        </Section>
      ) : null}
    </View>
  );
}

function Meter({ label, value }: { label: string; value: number | null }) {
  return (
    <View>
      <View className="flex-row justify-between">
        <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
        <Text className="text-[11px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
          {pct(value, 0)}
        </Text>
      </View>
      <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunk dark:bg-surface-sunk-dark">
        <View
          className="h-1.5 rounded-full bg-brand"
          style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
        />
      </View>
    </View>
  );
}

const SectionRow = memo(function SectionRow({ section }: { section: SectionResult }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const share = section.available > 0 ? (section.earned / section.available) * 100 : null;
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${section.title}, ${points(section.earned)} of ${points(section.available)} points`}
        onPress={() => setOpen((v) => !v)}
        className="px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
            {section.title}
          </Text>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
            {points(section.earned)}/{points(section.available)}
            {section.available < section.max ? ` of ${points(section.max)}` : ''}
          </Text>
          <Chevron size={16} color={colors.textMuted} />
        </View>
        <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunk dark:bg-surface-sunk-dark">
          <View
            className={cn(
              'h-1.5 rounded-full',
              share == null
                ? ''
                : share >= 66
                  ? 'bg-brand'
                  : share >= 40
                    ? 'bg-warning-500'
                    : 'bg-danger-500',
            )}
            style={{ width: `${share ?? 0}%` }}
          />
        </View>
      </Pressable>
      {open ? (
        <View className="gap-3 px-3.5 pb-3.5">
          {section.checks.map((check) => (
            <View key={check.key}>
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
                  {check.label}
                  {check.period ? (
                    <Text className="font-normal text-ink-faint dark:text-ink-dark-faint">
                      {' '}
                      · {check.period}
                    </Text>
                  ) : null}
                </Text>
                <Text className="text-[13px] text-ink dark:text-ink-dark" style={NUM}>
                  {checkValue(check.value, check.unit)}
                </Text>
                <Badge
                  label={
                    check.status === 'scored'
                      ? BAND_TEXT[check.band]
                      : check.status === 'not_meaningful'
                        ? 'N/M'
                        : 'No data'
                  }
                  variant={BAND_TONE[check.band]}
                />
              </View>
              <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                {check.rationale}
                {check.status === 'scored'
                  ? ` (${points(check.points)}/${points(check.maxPoints)})`
                  : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const KEY_ROWS: readonly { label: string; value: (row: KeyNumbersRow) => string }[] = [
  { label: 'Sales', value: (r) => crore(r.sales) },
  { label: 'EBITDA', value: (r) => crore(r.ebitda) },
  { label: 'Op. margin', value: (r) => pct(r.opmPct) },
  { label: 'Net profit', value: (r) => crore(r.pat) },
  { label: 'EPS', value: (r) => rupees(r.eps) },
  { label: 'ROCE', value: (r) => pct(r.rocePct) },
  { label: 'ROE', value: (r) => pct(r.roePct) },
  { label: 'Debt / equity', value: (r) => times(r.debtToEquity) },
  { label: 'Cash from ops', value: (r) => crore(r.cfo) },
  { label: 'Free cash flow', value: (r) => crore(r.fcf) },
];

/** The last five years as a sideways-scrolling table — a phone's width holds two columns. */
function KeyNumbers({ rows }: { rows: KeyNumbersRow[] }) {
  const years = [...rows].sort((a, b) => b.fiscalYear - a.fiscalYear).slice(0, 5);
  return (
    <Section title="Key numbers" note="₹ crore · fiscal years">
      <ListCard>
        <View className="flex-row">
          <View className="border-r border-line py-2 dark:border-line-dark">
            <Text className="h-7 px-3 text-[11px] font-semibold uppercase text-ink-faint dark:text-ink-dark-faint">
              {' '}
            </Text>
            {KEY_ROWS.map((row) => (
              <Text
                key={row.label}
                className="h-7 px-3 text-xs text-ink-muted dark:text-ink-dark-muted"
                numberOfLines={1}
              >
                {row.label}
              </Text>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {years.map((year) => (
              <View key={year.fiscalYear} className="min-w-[88px] py-2">
                <Text className="h-7 px-3 text-right text-[11px] font-semibold text-ink dark:text-ink-dark">
                  FY{String(year.fiscalYear).slice(2)}
                  {year.preListing ? '*' : ''}
                </Text>
                {KEY_ROWS.map((row) => (
                  <Text
                    key={row.label}
                    className="h-7 px-3 text-right text-xs text-ink dark:text-ink-dark"
                    style={NUM}
                    numberOfLines={1}
                  >
                    {row.value(year)}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </ListCard>
      {years.some((y) => y.preListing) ? (
        <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          * before the company listed.
        </Text>
      ) : null}
    </Section>
  );
}

function Shareholding({ rows }: { rows: ShareholdingRow[] }) {
  const sorted = [...rows].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const latest = sorted[0]!;
  const yearAgo = sorted[4] ?? sorted[sorted.length - 1]!;
  const change = (now: number | null, then: number | null) =>
    now != null && then != null && latest !== yearAgo
      ? ` (${now - then >= 0 ? '+' : '−'}${Math.abs(now - then).toFixed(1)} pp since ${quarterLabel(yearAgo.periodEnd)})`
      : '';
  return (
    <Section title="Shareholding" note={quarterLabel(latest.periodEnd)}>
      <ListCard className="px-3.5">
        <KeyValueRow
          label="Promoters"
          hint={change(latest.promoter, yearAgo.promoter) || undefined}
          value={pct(latest.promoter)}
        />
        <KeyValueRow
          label="Promoter pledge"
          value={pct(latest.pledge)}
          trend={latest.pledge != null && latest.pledge > 0 ? -1 : undefined}
          divider
        />
        <KeyValueRow
          label="Foreign institutions"
          hint={change(latest.fii, yearAgo.fii) || undefined}
          value={pct(latest.fii)}
          divider
        />
        <KeyValueRow
          label="Domestic institutions"
          hint={change(latest.dii, yearAgo.dii) || undefined}
          value={pct(latest.dii)}
          divider
        />
        <KeyValueRow label="Public" value={pct(latest.public)} divider />
      </ListCard>
    </Section>
  );
}

function Bullets({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'success' | 'danger' | 'neutral';
}) {
  if (items.length === 0) return null;
  const dot =
    tone === 'success'
      ? 'bg-brand'
      : tone === 'danger'
        ? 'bg-danger-500'
        : 'bg-line-strong dark:bg-line-dark-strong';
  return (
    <Section title={title}>
      <View className="gap-2">
        {items.map((item) => (
          <View key={item} className="flex-row gap-2.5">
            <View className={cn('mt-[7px] h-1.5 w-1.5 rounded-full', dot)} />
            <Text className="flex-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              {item}
            </Text>
          </View>
        ))}
      </View>
    </Section>
  );
}
