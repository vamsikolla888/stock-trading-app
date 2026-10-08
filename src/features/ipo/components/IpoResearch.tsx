import ExternalLink from 'lucide-react-native/icons/external-link';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Meter, type MeterTone } from '@/components/ui/Meter';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import { formatIstDate } from '@/features/home/lib/istTime';
import { openArticleLink } from '@/features/news/lib/openLink';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatNumber, formatQuantity } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { useRequestIpoReport } from '../hooks';
import {
  AGENT_LABEL,
  ENTRY_VERDICT,
  LISTING_VIEW,
  madeAt,
  pctChange,
  scheduleLine,
  scoreChange,
  SETUP_VERDICT,
  STAGE_LABEL,
  TIER_LABEL,
  VALUATION_VIEW,
  verifiedCategories,
  type Tone,
} from '../lib/format';
import type {
  IpoReportKind,
  IpoReports,
  IpoReportView,
  PostListingContent,
  PreListingContent,
  ReportBase,
  ReportEvidence,
  ReportFactor,
  TradePlan,
} from '../types';

import { Bullets, Collapsible, Muted, NUM, Prose, TONE_TEXT, TonePill } from './IpoParts';

/**
 * The IPO's research panel (server: modules/ipo/ipo-report.*): the pre-listing note and the
 * post-listing entry report. Everything a number rests on is on the screen — the factors behind
 * the score, the computed levels, and every source a sentence cites. The long-form parts open on
 * tap, so the verdict and its reasons read first.
 */

const KINDS: readonly { key: IpoReportKind; label: string }[] = [
  { key: 'pre-listing', label: 'Before listing' },
  { key: 'post-listing', label: 'After listing' },
];

const METER_TONE: Record<Tone, MeterTone> = {
  ok: 'gain',
  warn: 'warning',
  err: 'loss',
  info: 'info',
  neutral: 'neutral',
};

const signedPct = (value: number | null) =>
  value == null
    ? '—'
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value), 1)}%`;

/* ───────────────────────── small pieces ───────────────────────── */

function ScoreCard({
  label,
  report,
  verdict,
}: {
  label: string;
  report: IpoReportView<ReportBase>;
  verdict: { word: string; tone: Tone };
}) {
  const c = report.content!;
  const change = scoreChange(c.composite, report.previous);
  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <View className="mt-1 flex-row items-baseline gap-1.5">
        <Text className="text-[30px] font-bold text-ink dark:text-ink-dark" style={NUM}>
          {c.composite ?? '—'}
        </Text>
        <Text className="text-sm text-ink-muted dark:text-ink-dark-muted">/100</Text>
        <Text className={cn('ml-1 flex-1 text-sm font-semibold', TONE_TEXT[verdict.tone])}>
          {verdict.word}
        </Text>
      </View>
      <Meter
        className="mt-2"
        value={c.composite}
        tone={METER_TONE[verdict.tone]}
        accessibilityLabel={`${label}: ${c.composite ?? 'no score'} out of 100, ${verdict.word}`}
      />
      <Muted className="mt-2">
        Measured {c.quant.score ?? '—'} · Analyst view {c.analystScore ?? '—'} (
        {Math.round(c.methodology.analystWeight * 100)}% weight) · Data coverage{' '}
        {Math.round(c.quant.coverage * 100)}%
      </Muted>
      {change ? (
        <Text className="mt-1 text-xs font-medium text-ink dark:text-ink-dark">{change}</Text>
      ) : null}
    </View>
  );
}

function Thesis({
  headline,
  summary,
  aiError,
}: {
  headline?: string;
  summary?: string;
  aiError: string | null;
}) {
  if (headline || summary) {
    return (
      <View className="mt-4">
        {headline ? (
          <Text className="text-[15px] font-semibold leading-[21px] text-ink dark:text-ink-dark">
            {headline}
          </Text>
        ) : null}
        {summary ? (
          <Text
            selectable
            className="mt-1.5 text-[13px] leading-[20px] text-ink dark:text-ink-dark"
          >
            {summary}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <Banner
      className="mt-4"
      tone="warning"
      title="Written analysis missing"
      message={`${aiError ? `The AI provider did not answer (${aiError.slice(0, 140)}). ` : ''}The next run retries it.`}
    />
  );
}

function FactorRow({ factor }: { factor: ReportFactor }) {
  const missing = factor.score == null;
  return (
    <View
      accessible
      accessibilityLabel={`${factor.label}: ${missing ? 'not measured' : `${factor.score} out of 100`}, weight ${Math.round(factor.weight * 100)}%. ${factor.detail}`}
      className="px-3.5 py-3"
    >
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
          {factor.label}
        </Text>
        <Text
          className={cn(
            'text-[13px] font-semibold',
            missing ? 'text-ink-faint dark:text-ink-dark-faint' : 'text-ink dark:text-ink-dark',
          )}
          style={NUM}
        >
          {missing ? 'n/a' : factor.score}
        </Text>
        <Text
          className="w-12 text-right text-[11px] text-ink-faint dark:text-ink-dark-faint"
          style={NUM}
        >
          {Math.round(factor.weight * 100)}% wt
        </Text>
      </View>
      <Meter className="mt-1.5" value={factor.score} tone="neutral" height={4} />
      {factor.detail ? <Muted className="mt-1.5">{factor.detail}</Muted> : null}
    </View>
  );
}

function Factors({ factors }: { factors: ReportFactor[] }) {
  if (factors.length === 0) return null;
  return (
    <Section title="What the score is made of" className="mt-5">
      <ListCard>
        {factors.map((factor, index) => (
          <View key={factor.key}>
            {index > 0 ? <RowDivider /> : null}
            <FactorRow factor={factor} />
          </View>
        ))}
      </ListCard>
    </Section>
  );
}

function SourceRow({ source }: { source: ReportEvidence }) {
  const { colors } = useTheme();
  const published = formatIstDate(source.publishedAt);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Source ${source.id}: ${source.title}`}
      onPress={() => void openArticleLink(source.url)}
      className="flex-row gap-2.5 py-2.5 active:opacity-70"
    >
      <Text
        className="w-6 text-xs font-semibold text-ink-muted dark:text-ink-dark-muted"
        style={NUM}
      >
        {source.id}
      </Text>
      <View className="flex-1">
        <Text className="text-[13px] font-semibold leading-[18px] text-brand-text dark:text-brand-text-dark">
          {source.title}
        </Text>
        <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {[
            source.publisher ?? source.domain,
            published,
            source.origin === 'agent'
              ? `Research agent (${source.confidence ?? 'low'} confidence)`
              : TIER_LABEL[source.tier],
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {source.snippet ? (
          <Text
            className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={3}
          >
            {source.snippet}
          </Text>
        ) : null}
      </View>
      <ExternalLink size={14} color={colors.textFaint} style={{ marginTop: 2 }} />
    </Pressable>
  );
}

const SOURCES_SHOWN = 8;

function Sources({ evidence }: { evidence: ReportEvidence[] }) {
  const [all, setAll] = useState(false);
  if (evidence.length === 0) return null;
  const shown = all ? evidence : evidence.slice(0, SOURCES_SHOWN);
  return (
    <Collapsible divider title={`Sources · ${evidence.length}`}>
      {shown.map((source) => (
        <SourceRow key={source.id} source={source} />
      ))}
      {evidence.length > SOURCES_SHOWN ? (
        <Button
          label={all ? 'Show fewer sources' : `Show all ${evidence.length} sources`}
          variant="ghost"
          size="sm"
          onPress={() => setAll((value) => !value)}
        />
      ) : null}
    </Collapsible>
  );
}

function Method({ content }: { content: ReportBase }) {
  const r = content.research;
  const lines = [
    `Web search: ${r.searches} searches, ${r.results} results, ${r.kept} kept as evidence${r.failedSearches ? ` (${r.failedSearches} failed)` : ''}.${r.searchError ? ` ${r.searchError}.` : ''}`,
    `${AGENT_LABEL[r.agent.status] ?? r.agent.status}${r.agent.findings ? ` — ${r.agent.findings} verified findings` : ''}${r.agent.detail ? `: ${r.agent.detail}` : '.'}`,
    `Analysis: ${content.model ? `${content.provider ?? 'AI'} · ${content.model}` : 'not produced'} · scores withheld below ${Math.round(content.methodology.minCoverage * 100)}% data coverage · made in ${Math.round(content.durationMs / 1000)} s.`,
    content.band.note ? `Listing segment: ${content.band.note}` : null,
  ].filter((line): line is string => line !== null);
  return (
    <Collapsible divider title="How this report was made">
      {content.methodology.note ? <Prose text={content.methodology.note} /> : null}
      <View className="mt-2">
        <Bullets items={lines.map((text) => ({ text }))} empty="" />
      </View>
    </Collapsible>
  );
}

const cites = (items: { point: string; sources: number[] }[]) =>
  items.map((item) => ({ text: item.point, sources: item.sources }));
const plain = (items: string[]) => items.map((text) => ({ text }));

/* ───────────────────────── report bodies ───────────────────────── */

function PreListing({ report }: { report: IpoReportView<PreListingContent> }) {
  const c = report.content!;
  const ai = c.ai;
  const verdict = SETUP_VERDICT[c.verdict] ?? SETUP_VERDICT.insufficient;
  const sub = c.subscription;
  const subRows = verifiedCategories(sub);
  const valuation = ai ? (VALUATION_VIEW[ai.valuationView] ?? VALUATION_VIEW.unclear!) : null;
  const newsTone: Tone =
    ai?.newsSentiment === 'Positive' ? 'ok' : ai?.newsSentiment === 'Negative' ? 'err' : 'neutral';

  return (
    <View>
      <ScoreCard label="Listing-gain setup" report={report} verdict={verdict} />
      {ai ? (
        <View className="mt-3 rounded-card bg-surface-sunk p-3.5 dark:bg-surface-sunk-dark">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Listing view</Text>
          <Text className="mt-0.5 text-sm font-semibold text-ink dark:text-ink-dark">
            {LISTING_VIEW[ai.listingView] ?? ai.listingView}
          </Text>
          {ai.listingViewReason ? (
            <Text className="mt-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
              {ai.listingViewReason}
            </Text>
          ) : null}
          <Muted className="mt-1.5">Analyst confidence: {ai.confidence}</Muted>
        </View>
      ) : null}
      <Thesis headline={ai?.headline} summary={ai?.summary} aiError={c.aiError} />
      <Factors factors={c.quant.factors} />

      {ai ? (
        <Section title="The analysis" className="mt-5">
          <ListCard>
            <Collapsible title="Strengths" tag={<Count n={ai.strengths.length} />}>
              <Bullets items={cites(ai.strengths)} empty="None stated." />
            </Collapsible>
            <Collapsible divider title="Risks" tag={<Count n={ai.risks.length} />}>
              <Bullets items={cites(ai.risks)} empty="None stated." />
            </Collapsible>
            <Collapsible
              divider
              title="Red flags"
              tag={
                ai.redFlags.length ? (
                  <TonePill tone="err" label={`${ai.redFlags.length} found`} />
                ) : (
                  <TonePill tone="ok" label="None evidenced" />
                )
              }
            >
              <Bullets items={cites(ai.redFlags)} empty="None found in the sources." />
            </Collapsible>
            <Collapsible divider title="Business">
              <Prose text={ai.business} />
            </Collapsible>
            <Collapsible divider title="Issue structure">
              <Prose text={ai.issueStructure} />
            </Collapsible>
            <Collapsible divider title="Financials">
              <Prose text={ai.financials} />
            </Collapsible>
            <Collapsible
              divider
              title="Valuation"
              tag={valuation ? <TonePill tone={valuation.tone} label={valuation.word} /> : null}
            >
              <Prose text={ai.valuation} />
            </Collapsible>
            <Collapsible divider title="Demand">
              <Prose text={ai.demandRead} />
              {subRows.length > 0 ? (
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {subRows.map(([label, value]) => (
                    <View
                      key={label}
                      className="min-w-[72px] rounded-lg bg-surface-sunk px-2.5 py-2 dark:bg-surface-sunk-dark"
                    >
                      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                        {label}
                      </Text>
                      <Text
                        className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                        style={NUM}
                      >
                        {formatNumber(value, 2)}×
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {sub && sub.unverified.length > 0 ? (
                <Muted className="mt-2">Unverified, not shown: {sub.unverified.join(', ')}.</Muted>
              ) : null}
              {sub?.stale && sub.stale.length > 0 ? (
                <Muted className="mt-2">
                  Earlier-day figures, not shown: {sub.stale.join(', ')}.
                </Muted>
              ) : null}
            </Collapsible>
            <Collapsible divider title="Anchor book">
              <Prose text={ai.anchorRead} />
            </Collapsible>
            <Collapsible divider title="Grey market">
              <Prose text={ai.greyMarketRead} />
            </Collapsible>
            <Collapsible
              divider
              title="News flow"
              tag={<TonePill tone={newsTone} label={ai.newsSentiment} />}
            >
              <Prose text={ai.newsRead} />
            </Collapsible>
            <Collapsible divider title="After listing — entry playbook">
              <Prose text={ai.afterListingPlaybook} />
              <Text className="mb-1.5 mt-3 text-xs font-semibold text-ink dark:text-ink-dark">
                Supports an entry
              </Text>
              <Bullets items={plain(ai.enterIf)} empty="None stated." />
              <Text className="mb-1.5 mt-3 text-xs font-semibold text-ink dark:text-ink-dark">
                Argues against one
              </Text>
              <Bullets items={plain(ai.avoidIf)} empty="None stated." />
            </Collapsible>
            {ai.dataGaps.length > 0 ? (
              <Collapsible divider title="Could not be established">
                <Bullets items={plain(ai.dataGaps)} empty="" />
              </Collapsible>
            ) : null}
            <Sources evidence={c.evidence} />
            <Method content={c} />
          </ListCard>
        </Section>
      ) : (
        <ListCard className="mt-5">
          <Sources evidence={c.evidence} />
          <Method content={c} />
        </ListCard>
      )}
    </View>
  );
}

function Count({ n }: { n: number }) {
  return (
    <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted" style={NUM}>
      {n}
    </Text>
  );
}

function PlanCard({ plan, lotSize }: { plan: TradePlan; lotSize: number | null }) {
  const s = plan.sizing;
  const cells: [string, string, string][] = [
    [
      'Entry zone',
      `${formatINR(plan.entryLow)}–${formatNumber(plan.entryHigh, 2)}`,
      plan.trigger === 'pullback'
        ? 'On a pullback toward the listing price'
        : 'Only after a close back above the listing price',
    ],
    [
      'Stop',
      formatINR(plan.stop),
      `${formatNumber(plan.riskPct, 1)}% risk · ${plan.stopBasis === 'max-risk' ? 'maximum-loss cap' : 'below the listing-day low'}`,
    ],
    ['Target 1 · 1.5R', formatINR(plan.target1), 'Book part here'],
    ['Target 2 · 3R', formatINR(plan.target2), 'If momentum holds'],
    [
      'Time stop',
      `${plan.timeStopSessions} sessions`,
      `Out by the close of session ${plan.timeStopSessions}`,
    ],
    [
      'Size example',
      `${formatQuantity(s.quantity)} shares`,
      `${formatNumber(s.riskPct, 1)}% of ${formatINR(s.capital, 0)} at risk (≈${formatINR(s.maxLoss, 0)})${s.boundBy === 'lot' && lotSize ? ` · whole lots of ${lotSize}` : s.boundBy === 'capital' ? ' · capital-bound' : ''}`,
    ],
  ];
  return (
    <View>
      <ListCard>
        {cells.map(([label, value, hint], index) => (
          <View key={label}>
            {index > 0 ? <RowDivider /> : null}
            <View accessible className="flex-row items-start gap-3 px-3.5 py-3">
              <View className="flex-1">
                <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
                <Text className="mt-0.5 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
                  {hint}
                </Text>
              </View>
              <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
                {value}
              </Text>
            </View>
          </View>
        ))}
      </ListCard>
      {plan.notes.length > 0 ? (
        <View className="mt-2">
          <Bullets items={plain(plan.notes)} empty="" />
        </View>
      ) : null}
    </View>
  );
}

function PostListing({ report }: { report: IpoReportView<PostListingContent> }) {
  const c = report.content!;
  const ai = c.ai;
  const m = c.market;
  const verdict = ENTRY_VERDICT[c.verdict] ?? ENTRY_VERDICT.insufficient;
  const ltp = m.quote?.ltp ?? null;
  const rows: [string, string][] = [
    ['vs listing price', signedPct(pctChange(m.listingPrice, ltp))],
    [
      'Listed at',
      `${formatINR(m.listingPrice)}${m.listingPriceSource === 'reported' ? ' (reported)' : ''}`,
    ],
    ['Listing vs issue', signedPct(pctChange(c.facts.priceMax, m.listingPrice))],
    ['Listing vs GMP-implied', signedPct(pctChange(m.expectedListingPrice, m.listingPrice))],
  ];
  return (
    <View>
      <ScoreCard label="Entry after listing" report={report} verdict={verdict} />
      <View className="mt-3 rounded-card bg-surface-sunk p-3.5 dark:bg-surface-sunk-dark">
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {m.listed ? `${m.listed.exchange}: ${m.listed.symbol}` : 'Listed share'}
        </Text>
        <Text className="mt-0.5 text-[20px] font-bold text-ink dark:text-ink-dark" style={NUM}>
          {ltp != null ? formatINR(ltp) : 'No live price'}
        </Text>
        <View className="mt-2 gap-1">
          {rows.map(([label, value]) => (
            <View key={label} className="flex-row justify-between gap-3">
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</Text>
              <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={NUM}>
                {value}
              </Text>
            </View>
          ))}
        </View>
        {m.circuit.lockedUp ? (
          <View className="mt-2">
            <TonePill
              tone="warn"
              label={`Locked at upper band ${formatINR(m.circuit.upperBand)}`}
            />
          </View>
        ) : null}
        {m.circuit.lockedDown ? (
          <View className="mt-2">
            <TonePill tone="err" label={`Locked at lower band ${formatINR(m.circuit.lowerBand)}`} />
          </View>
        ) : null}
        <Muted className="mt-2">
          {m.quote
            ? `${m.quote.provider} · ${madeAt(m.quote.asOf) ?? ''}`
            : m.listed
              ? 'No quote from the price feed.'
              : 'Symbol not in the instrument master yet.'}
        </Muted>
      </View>
      <Thesis headline={ai?.headline} summary={ai?.summary} aiError={c.aiError} />

      <Section title="Entry plan" note="From the live quote, not the model" className="mt-5">
        {c.plan ? (
          <PlanCard plan={c.plan} lotSize={c.facts.lotSize} />
        ) : (
          <Muted>No live price yet — no levels.</Muted>
        )}
      </Section>

      <Factors factors={c.quant.factors} />

      <Section title="The analysis" className="mt-5">
        <ListCard>
          {ai ? (
            <>
              <Collapsible title="The listing">
                <Prose text={ai.listingRead} />
              </Collapsible>
              <Collapsible divider title="Trading since">
                <Prose text={ai.priceActionRead} />
              </Collapsible>
              <Collapsible divider title="Why this view">
                <Prose text={ai.entryReason} />
              </Collapsible>
              <Collapsible divider title="On the plan">
                <Prose text={ai.planCommentary} />
              </Collapsible>
              <Collapsible divider title="Supports entering" tag={<Count n={ai.enterIf.length} />}>
                <Bullets items={plain(ai.enterIf)} empty="None stated." />
              </Collapsible>
              <Collapsible
                divider
                title="Ends the trade early"
                tag={<Count n={ai.exitIf.length} />}
              >
                <Bullets items={plain(ai.exitIf)} empty="None stated." />
              </Collapsible>
              <Collapsible divider title="Session by session">
                <Bullets items={plain(ai.weekPlan)} empty="None stated." ordered />
              </Collapsible>
              <Collapsible divider title="Risks this week" tag={<Count n={ai.risks.length} />}>
                <Bullets items={cites(ai.risks)} empty="None stated." />
              </Collapsible>
            </>
          ) : null}
          <Sources evidence={c.evidence} />
          <Method content={c} />
        </ListCard>
      </Section>
    </View>
  );
}

/* ───────────────────────── the panel ───────────────────────── */

export function IpoResearch({
  ipoId,
  reports,
  isPending,
  error,
  onRetry,
}: {
  ipoId: string;
  reports: IpoReports | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  const [picked, setPicked] = useState<IpoReportKind | null>(null);
  const request = useRequestIpoReport(ipoId);

  // Until the reader picks one, open on the report that matters now: after listing, once that
  // report exists or can be made.
  const kind: IpoReportKind =
    picked ??
    (reports?.postListing?.content || reports?.eligibility.postListing.available
      ? 'post-listing'
      : 'pre-listing');

  const view = kind === 'pre-listing' ? reports?.preListing : reports?.postListing;
  const eligibility =
    kind === 'pre-listing' ? reports?.eligibility.preListing : reports?.eligibility.postListing;
  const busy = view?.status === 'queued' || view?.status === 'running';
  const schedule = reports ? scheduleLine(reports, kind) : null;
  const lastResult = request.data && request.variables === kind ? request.data : null;
  const made = madeAt(view?.generatedAt);

  const statusLines = [
    made
      ? `Prepared ${made} · ${view?.trigger === 'scheduled' ? 'scheduled run' : 'on request'}`
      : null,
    schedule,
    eligibility && !eligibility.available ? eligibility.reason : null,
  ].filter((line): line is string => Boolean(line));

  return (
    <Section title="Research report" note="Listing gains · up to a week">
      <SegmentedControl
        items={KINDS}
        value={kind}
        onChange={(next) => {
          setPicked(next);
          request.reset();
        }}
      />

      {statusLines.length > 0 ? (
        <View className="mt-3 gap-1">
          {statusLines.map((line) => (
            <Muted key={line}>{line}</Muted>
          ))}
        </View>
      ) : null}

      {reports ? (
        <Button
          className="mt-3"
          label={
            request.isPending ? 'Requesting…' : view?.content ? 'Refresh report' : 'Generate report'
          }
          variant="outline"
          size="sm"
          leftIcon={<RefreshCw size={15} color={colors.text} />}
          disabled={!eligibility?.available || busy || request.isPending}
          onPress={() => request.mutate(kind)}
        />
      ) : null}

      <View className="mt-3 gap-3">
        {busy ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={`${STAGE_LABEL[view?.stage ?? ''] ?? 'Queued'}`}
            className="flex-row gap-3 rounded-field bg-info-wash p-3 dark:bg-info-wash-dark"
          >
            <ActivityIndicator size="small" color={colors.info} />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-info dark:text-info-dark">
                {STAGE_LABEL[view?.stage ?? ''] ?? 'Queued'}…
              </Text>
              <Text className="mt-0.5 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
                Usually a few minutes.{view?.content ? ' Previous report shown below.' : ''}
              </Text>
            </View>
          </View>
        ) : null}
        {view?.status === 'failed' ? (
          <Banner
            tone="error"
            title={`The last ${view.content ? 'refresh' : 'attempt'} failed`}
            message={`${view.error ?? 'Unknown error.'}${view.content ? ' Showing the previous report.' : ''}`}
          />
        ) : null}
        {lastResult && !lastResult.queued && lastResult.reason === 'fresh' ? (
          <Banner tone="info" message="Already up to date — no new run started." />
        ) : null}
        {request.error ? <Banner tone="error" message={getErrorMessage(request.error)} /> : null}
      </View>

      <View className="mt-4">
        {isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : error && !reports ? (
          <View className="rounded-card border border-line p-4 dark:border-line-dark">
            <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
              Research reports couldn’t be loaded
            </Text>
            <Muted className="mt-1">{getErrorMessage(error)}</Muted>
            <Button
              className="mt-3 self-start"
              label="Try again"
              variant="outline"
              size="sm"
              onPress={onRetry}
            />
          </View>
        ) : !view?.content && !busy ? (
          <View className="items-center gap-1.5 rounded-card border border-dashed border-line-strong px-4 py-6 dark:border-line-dark-strong">
            <Text className="text-center text-sm font-semibold text-ink dark:text-ink-dark">
              {kind === 'pre-listing' ? 'No pre-listing report yet' : 'No after-listing report yet'}
            </Text>
            <Text className="text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              {kind === 'pre-listing'
                ? 'Written from cited web sources.'
                : 'Available once the shares trade.'}
            </Text>
          </View>
        ) : view?.content ? (
          kind === 'pre-listing' ? (
            <PreListing report={view as IpoReportView<PreListingContent>} />
          ) : (
            <PostListing report={view as IpoReportView<PostListingContent>} />
          )
        ) : null}
      </View>

      <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Model-assisted research, not investment advice. Produced by software from public web sources
        and an AI model — not by a SEBI-registered research analyst or adviser. Grey-market premiums
        are unofficial.
      </Text>
    </Section>
  );
}
