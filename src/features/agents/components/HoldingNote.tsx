import ExternalLink from 'lucide-react-native/icons/external-link';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { SplitColumns } from '@/components/layout/Grid';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { formatDateTime, relativeTime } from '@/features/settings/lib/time';
import {
  formatINR,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { hostOf } from '../lib/normalize';
import {
  brokersLabel,
  capitalise,
  confidenceTone,
  holdingReturnPct,
  inFlightLabel,
  levelsOf,
  stanceTone,
  TREND_WORD,
  VERDICT,
} from '../lib/view';
import type { HoldingSummary, ReviewEvidence, ReviewResult } from '../types';

import { Bullets, Disclosure, Muted, NUM, openSource, Para, SubHead } from './Parts';
import { VerdictChip, VerdictTrail } from './Verdict';

/**
 * One holding's review, laid out the way a research desk writes a note for a client who already
 * owns the stock (web: components/HoldingNote.tsx): the rating and conviction, the call in two
 * sentences, the plan, the technical / fundamental / news picture, the case for and against, then
 * the levels, the evidence and the sources. Sections an older review does not carry (the analyst
 * note arrived later) are simply left out. A wide window puts the evidence beside the note.
 */
export function HoldingNote({
  holding,
  now,
  pendingDeadlineMinutes,
  wide,
  footnote,
}: {
  holding: HoldingSummary;
  now: number;
  pendingDeadlineMinutes: number | null;
  wide: boolean;
  footnote: string | null;
}) {
  const result = holding.current?.result ?? null;
  const evidence = holding.current?.evidence ?? null;

  const head = (
    <>
      <Header holding={holding} result={result} />
      {holding.inFlight ? (
        <Banner
          tone="info"
          className="mt-3"
          title={`${inFlightLabel(holding.inFlight.status)} · since ${relativeTime(holding.inFlight.at, now)}`}
          message={
            pendingDeadlineMinutes
              ? `A fresh review is on its way. It is cancelled and retried if it is not done within ${pendingDeadlineMinutes} min.`
              : 'A fresh review is on its way; this note updates by itself.'
          }
        />
      ) : null}
      {holding.lastFailure ? (
        <Banner
          tone="warning"
          className="mt-3"
          title={`The latest review failed ${relativeTime(holding.lastFailure.at, now)}`}
          message={`${holding.lastFailure.error ?? 'No reason recorded.'} ${
            result ? 'The note below is the last one that completed.' : 'The next run tries again.'
          }`}
        />
      ) : null}
    </>
  );

  if (!result) {
    return (
      <View>
        {head}
        <InlineEmpty
          className="mt-4"
          title={holding.inFlight ? 'The first note is being written' : 'No completed review yet'}
          message={
            holding.inFlight
              ? 'Reading daily patterns, company news and web sources — the note appears here when it is done.'
              : 'Run a review from Portfolio review, or switch on the hourly schedule.'
          }
        />
        {holding.history.length > 0 ? (
          <Panel title="Rating trail" meta="oldest → newest" className="mt-4">
            <VerdictTrail history={holding.history} />
          </Panel>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      {head}
      <View className="mt-4">
        <SplitColumns
          split={wide}
          gap={16}
          left={<NoteColumn result={result} evidence={evidence} />}
          right={
            <EvidenceColumn
              holding={holding}
              result={result}
              evidence={evidence}
              footnote={footnote}
              topGap={!wide}
            />
          }
        />
      </View>
    </View>
  );
}

function Header({ holding, result }: { holding: HoldingSummary; result: ReviewResult | null }) {
  const tags = [
    result?.conviction ? `${capitalise(result.conviction)} conviction` : null,
    result?.riskLevel ? `${capitalise(result.riskLevel)} risk` : null,
    result?.horizon && result.horizon !== 'unclear' ? `Horizon: ${result.horizon}` : null,
    result?.evidenceQuality ? `${capitalise(result.evidenceQuality)} evidence` : null,
  ].filter((tag): tag is string => tag !== null);
  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      {holding.current ? (
        <VerdictChip action={holding.current.action} large />
      ) : (
        <Text className="text-sm font-semibold text-ink-muted dark:text-ink-dark-muted">
          No verdict yet
        </Text>
      )}
      {tags.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} label={tag} />
          ))}
        </View>
      ) : null}
      <Muted className="mt-3">
        {holding.current
          ? `Note of ${formatDateTime(holding.current.at)}${
              holding.current.asOf ? ` · data as of ${formatDateTime(holding.current.asOf)}` : ''
            }`
          : 'No completed review yet'}
        {holding.lastChange
          ? ` · was ${VERDICT[holding.lastChange.from].label} until ${formatDateTime(holding.lastChange.at)}`
          : ''}
      </Muted>
    </View>
  );
}

function NoteColumn({
  result,
  evidence,
}: {
  result: ReviewResult;
  evidence: ReviewEvidence | null;
}) {
  const lead = result.executiveSummary ?? result.thesis;
  return (
    <View className="gap-4">
      {lead ? (
        <Panel title="The call">
          <Text selectable className="text-[15px] leading-[22px] text-ink dark:text-ink-dark">
            {lead}
          </Text>
          {result.executiveSummary && result.thesis ? (
            <View className="-mx-4 -mb-4 mt-3">
              <Disclosure title="The full argument" divider>
                <Para>{result.thesis}</Para>
              </Disclosure>
            </View>
          ) : null}
        </Panel>
      ) : null}

      {result.positionView ? (
        <Panel title="Your position">
          <Para>{result.positionView}</Para>
        </Panel>
      ) : null}

      {result.actionPlan.length > 0 ? (
        <Panel title="Plan">
          <Bullets items={result.actionPlan} ordered />
        </Panel>
      ) : null}

      {result.technicalView || result.fundamentalView || result.newsFlow ? (
        <Panel title="The picture">
          <View className="gap-4">
            {result.technicalView ? (
              <View>
                <View className="mb-1.5 flex-row items-center gap-2">
                  <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                    Technical
                  </Text>
                  {result.technicalView.stance ? (
                    <StatusPill
                      tone={stanceTone(result.technicalView.stance)}
                      label={capitalise(result.technicalView.stance)}
                    />
                  ) : null}
                </View>
                <Para>{result.technicalView.summary}</Para>
              </View>
            ) : null}
            {result.fundamentalView ? (
              <View>
                <SubHead>Fundamentals & filings</SubHead>
                <Para>{result.fundamentalView.summary}</Para>
              </View>
            ) : null}
            {result.newsFlow ? (
              <View>
                <View className="mb-1.5 flex-row items-center gap-2">
                  <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                    News flow
                  </Text>
                  {result.newsFlow.tone ? (
                    <StatusPill
                      tone={stanceTone(result.newsFlow.tone)}
                      label={capitalise(result.newsFlow.tone)}
                    />
                  ) : null}
                </View>
                <Para>{result.newsFlow.summary}</Para>
              </View>
            ) : null}
          </View>
        </Panel>
      ) : evidence?.technical || evidence?.holding ? (
        // Older reviews carry no written views — show the measured picture instead.
        <Panel title="The picture" meta="measured">
          <KeyValueRow
            label="Portfolio weight"
            value={formatPercent(evidence.holding?.portfolioWeightPct, 1)}
          />
          <KeyValueRow
            divider
            label="Trend"
            value={TREND_WORD[evidence.technical?.trend ?? 'unknown'] ?? '—'}
          />
          <KeyValueRow
            divider
            label="RSI (14 d)"
            value={formatNumber(evidence.technical?.rsi14, 0)}
          />
          <KeyValueRow
            divider
            label="Volume vs 20 d"
            value={
              evidence.technical?.volumeRatio20 == null
                ? '—'
                : `${formatNumber(evidence.technical.volumeRatio20, 2)}×`
            }
          />
        </Panel>
      ) : null}

      <Panel title="Bull vs bear">
        <SubHead>Bull case</SubHead>
        <Bullets items={result.bullCase} empty="No strong supporting case recorded." />
        <SubHead className="mt-4">Bear case</SubHead>
        <Bullets items={result.bearCase} empty="No counter-case recorded." />
      </Panel>

      <Panel title="What would change our mind">
        <Bullets items={result.whatWouldChangeMind} empty="Not stated." />
      </Panel>

      {result.catalysts.length > 0 ? (
        <Panel title="Upcoming catalysts">
          <Bullets items={result.catalysts} />
        </Panel>
      ) : null}

      {result.riskNotes.length > 0 ||
      result.limitations.length > 0 ||
      (evidence?.dataWarnings.length ?? 0) > 0 ? (
        <Panel title="Risks and gaps">
          {result.riskNotes.length > 0 ? (
            <>
              <SubHead>Risks</SubHead>
              <Bullets items={result.riskNotes} />
            </>
          ) : null}
          {result.limitations.length > 0 ? (
            <>
              <SubHead className={result.riskNotes.length > 0 ? 'mt-4' : undefined}>
                Limitations
              </SubHead>
              <Bullets items={result.limitations} />
            </>
          ) : null}
          {evidence && evidence.dataWarnings.length > 0 ? (
            <>
              <SubHead
                className={
                  result.riskNotes.length > 0 || result.limitations.length > 0 ? 'mt-4' : undefined
                }
              >
                Data warnings
              </SubHead>
              <Bullets items={evidence.dataWarnings} />
            </>
          ) : null}
        </Panel>
      ) : null}
    </View>
  );
}

function EvidenceColumn({
  holding,
  result,
  evidence,
  footnote,
  topGap,
}: {
  holding: HoldingSummary;
  result: ReviewResult;
  evidence: ReviewEvidence | null;
  footnote: string | null;
  topGap: boolean;
}) {
  const levels = levelsOf(result, evidence);
  const ret = holdingReturnPct(levels?.averagePrice, levels?.lastPrice);
  const tech = evidence?.technical;
  const own = evidence?.holding;
  return (
    <View className={topGap ? 'mt-4 gap-4' : 'gap-4'}>
      {levels ? (
        <Panel title="Key levels">
          <KeyValueRow label="Last price" value={formatINR(levels.lastPrice)} />
          <KeyValueRow
            divider
            label="Your average cost"
            hint={ret != null ? `${formatSignedPercent(ret)} on cost` : undefined}
            value={formatINR(levels.averagePrice)}
          />
          <KeyValueRow divider label="Support · 20-day low" value={formatINR(levels.support)} />
          <KeyValueRow
            divider
            label="Resistance · 20-day high"
            value={formatINR(levels.resistance)}
          />
          <KeyValueRow divider label="20-day average" value={formatINR(levels.sma20)} />
          <KeyValueRow divider label="50-day average" value={formatINR(levels.sma50)} />
        </Panel>
      ) : null}

      {holding.history.length > 0 ? (
        <Panel title="Rating trail" meta="oldest → newest">
          <VerdictTrail history={holding.history} />
        </Panel>
      ) : null}

      {own || tech || (evidence?.news.length ?? 0) > 0 ? (
        <Panel title="Evidence" flush>
          {own ? (
            <Disclosure title="Your holding" initiallyOpen>
              <KeyValueRow label="Quantity" value={formatNumber(own.quantity, 0)} />
              <KeyValueRow divider label="Average price" value={formatINR(own.averagePrice)} />
              <KeyValueRow divider label="Last price" value={formatINR(own.lastPrice)} />
              <KeyValueRow divider label="Invested" value={formatINR(own.invested, 0)} />
              <KeyValueRow divider label="Value" value={formatINR(own.value, 0)} />
              <KeyValueRow
                divider
                label="Portfolio weight"
                hint={holding.brokers.length > 1 ? 'across both books' : undefined}
                value={formatPercent(own.portfolioWeightPct, 1)}
              />
              {holding.brokers.length > 0 ? (
                <KeyValueRow
                  divider
                  label="Held in"
                  hint={
                    holding.brokers.length > 1 ? 'one review of the combined position' : undefined
                  }
                  value={brokersLabel(holding.brokers) ?? '—'}
                />
              ) : null}
            </Disclosure>
          ) : null}
          {tech ? (
            <Disclosure title="Technical stats" divider={Boolean(own)}>
              <KeyValueRow label="Trend" value={TREND_WORD[tech.trend] ?? tech.trend} />
              <KeyValueRow divider label="RSI (14 d)" value={formatNumber(tech.rsi14, 0)} />
              <KeyValueRow
                divider
                label="20-day return"
                value={formatSignedPercent(tech.return20dPct)}
                trend={tech.return20dPct}
              />
              <KeyValueRow
                divider
                label="Volume vs 20-day average"
                value={tech.volumeRatio20 == null ? '—' : `${formatNumber(tech.volumeRatio20, 2)}×`}
              />
              <KeyValueRow divider label="20-day high" value={formatINR(tech.high20)} />
              <KeyValueRow divider label="20-day low" value={formatINR(tech.low20)} />
              {tech.dailyBars != null ? (
                <KeyValueRow
                  divider
                  label="Daily bars read"
                  value={formatNumber(tech.dailyBars, 0)}
                />
              ) : null}
              {tech.patternNotes.length > 0 ? (
                <View className="mt-2 border-t border-line pt-3 dark:border-line-dark">
                  <SubHead>Measured patterns</SubHead>
                  <Bullets items={tech.patternNotes} />
                </View>
              ) : null}
            </Disclosure>
          ) : null}
          {evidence && evidence.news.length > 0 ? (
            <Disclosure
              title="Company news"
              meta={String(evidence.news.length)}
              divider={Boolean(own || tech)}
            >
              {evidence.news.map((item, index) => (
                <LinkLine
                  key={`${item.url ?? item.title}-${index}`}
                  url={item.url}
                  title={item.title}
                  meta={[
                    item.publishedAt ? formatDateTime(item.publishedAt) : null,
                    item.sentiment,
                    item.eventType,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  divider={index > 0}
                />
              ))}
            </Disclosure>
          ) : null}
        </Panel>
      ) : null}

      <Panel title="Research">
        {result.research.summary ? <Para>{result.research.summary}</Para> : null}
        {result.research.findings.length > 0 ? (
          <View className={result.research.summary ? 'mt-3 gap-2.5' : 'gap-2.5'}>
            {result.research.findings.map((finding, index) => (
              <View key={index} className="gap-1">
                <StatusPill
                  tone={confidenceTone(finding.confidence)}
                  label={`${capitalise(finding.confidence)} confidence`}
                />
                <Para>{finding.claim}</Para>
              </View>
            ))}
          </View>
        ) : null}
        {!result.research.summary && result.research.findings.length === 0 ? (
          <Muted>No checked research was available for this review.</Muted>
        ) : null}
        {result.research.openQuestions.length > 0 ? (
          <View className="mt-4">
            <SubHead>Open questions</SubHead>
            <Bullets items={result.research.openQuestions} />
          </View>
        ) : null}
      </Panel>

      <Panel title="Sources read" meta={String(result.research.sources.length)}>
        {result.research.sources.length > 0 ? (
          result.research.sources.map((source, index) => (
            <LinkLine
              key={source.url}
              url={source.url}
              title={source.title ?? hostOf(source.url)}
              meta={[
                hostOf(source.url),
                source.publishedAt ? formatDateTime(source.publishedAt) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              divider={index > 0}
            />
          ))
        ) : (
          <Muted>No fetched source was available for this review.</Muted>
        )}
      </Panel>

      <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        AI-generated research for your review — not a recommendation from a SEBI-registered research
        analyst or investment adviser, and not an order. Consider your own risk profile, holding
        period and tax position.{footnote ? ` ${footnote}` : ''}
      </Text>
    </View>
  );
}

/** A tappable source / news line that opens the page. */
function LinkLine({
  url,
  title,
  meta,
  divider,
}: {
  url: string | null;
  title: string;
  meta: string;
  divider: boolean;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <View className="flex-1">
        <Text
          className={
            url
              ? 'text-[13px] font-semibold leading-[18px] text-brand-text dark:text-brand-text-dark'
              : 'text-[13px] font-semibold leading-[18px] text-ink dark:text-ink-dark'
          }
        >
          {title}
        </Text>
        {meta ? (
          <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {meta}
          </Text>
        ) : null}
      </View>
      {url ? <ExternalLink size={14} color={colors.textFaint} style={{ marginTop: 2 }} /> : null}
    </>
  );
  const frame = `flex-row gap-2.5 py-2.5${divider ? ' border-t border-line dark:border-line-dark' : ''}`;
  return url ? (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}, opens in the browser`}
      onPress={() => void openSource(url)}
      className={`${frame} active:opacity-70`}
    >
      {body}
    </Pressable>
  ) : (
    <View className={frame}>{body}</View>
  );
}
