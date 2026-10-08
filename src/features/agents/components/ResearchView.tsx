import ExternalLink from 'lucide-react-native/icons/external-link';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { SplitColumns } from '@/components/layout/Grid';
import { Banner } from '@/components/ui/Banner';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { Meter } from '@/components/ui/Meter';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { formatDateTime } from '@/features/settings/lib/time';
import { formatNumber } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import {
  answerBlocks,
  capitalise,
  confidenceTone,
  credibilityWord,
  detailSources,
  duration,
  isActiveJob,
  type AnswerInline,
} from '../lib/view';
import type { ResearchDetail, ResearchFinding, ResearchResult, ResearchSource } from '../types';

import { Bullets, Disclosure, Muted, NUM, openSource, Para } from './Parts';

type RefMap = Map<string, { url: string; title: string | null }>;

/**
 * One research run, read top to bottom (web: WebResearchAgent's ResearchDetailView): progress
 * while it runs, then the answer in brief, the full answer with tappable citations, the verified
 * findings with the evidence behind each, what verification dropped, every page read, and the
 * run's own figures. A wide window puts the sources and figures beside the answer.
 */
export function ResearchView({ detail, wide }: { detail: ResearchDetail; wide: boolean }) {
  const result = detail.result;
  const sources = useMemo(() => detailSources(detail), [detail]);
  const refs: RefMap = useMemo(
    () => new Map(sources.map((s) => [s.ref, { url: s.url, title: s.title }])),
    [sources],
  );
  const active = isActiveJob(detail.status);
  const ended = detail.status === 'FAILED' || detail.status === 'CANCELLED';

  return (
    <View>
      {active ? (
        <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
            {detail.progress?.message ?? 'Searching and reading sources…'}
          </Text>
          <Meter
            className="mt-3"
            tone="info"
            value={detail.progress?.percent ?? 0}
            accessibilityLabel="Research progress"
          />
          <Muted className="mt-2">
            {[
              detail.progress?.stage ? capitalise(detail.progress.stage) : null,
              detail.progress?.percent != null ? `${Math.round(detail.progress.percent)}%` : null,
              'this screen updates by itself',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Muted>
        </View>
      ) : null}
      {ended ? (
        <Banner
          tone="error"
          title={`The research ${detail.status === 'FAILED' ? 'failed' : 'was cancelled'}`}
          message={detail.error?.message ?? 'No reason recorded.'}
        />
      ) : null}

      {result ? (
        <View className={active || ended ? 'mt-4' : undefined}>
          <SplitColumns
            split={wide}
            gap={16}
            left={<AnswerColumn result={result} refs={refs} />}
            right={
              <View className={wide ? 'gap-4' : 'mt-4 gap-4'}>
                <SourcesPanel sources={sources} />
                <RunStats result={result} />
              </View>
            }
          />
        </View>
      ) : sources.length > 0 ? (
        <View className={active || ended ? 'mt-4' : undefined}>
          <SourcesPanel sources={sources} title="Pages read so far" />
        </View>
      ) : null}
    </View>
  );
}

function AnswerColumn({ result, refs }: { result: ResearchResult; refs: RefMap }) {
  const blocks = useMemo(() => (result.answer ? answerBlocks(result.answer) : []), [result]);
  return (
    <View className="gap-4">
      {result.summary ? (
        <Panel title="In brief">
          <Text selectable className="text-[15px] leading-[22px] text-ink dark:text-ink-dark">
            {result.summary}
          </Text>
        </Panel>
      ) : null}

      {blocks.length > 0 ? (
        <Panel title="The answer" meta="tap [S1] to open a source">
          <View className="gap-2.5">
            {blocks.map((block, index) =>
              'parts' in block ? (
                <Text
                  key={index}
                  selectable
                  className={
                    block.kind === 'h'
                      ? 'text-sm font-semibold text-ink dark:text-ink-dark'
                      : 'text-[13px] leading-[20px] text-ink dark:text-ink-dark'
                  }
                >
                  <Inline parts={block.parts} refs={refs} />
                </Text>
              ) : (
                <View key={index} className="gap-1.5">
                  {block.items.map((item, j) => (
                    <View key={j} className="flex-row gap-2">
                      <Text
                        className="w-4 text-[13px] leading-[20px] text-ink-muted dark:text-ink-dark-muted"
                        style={NUM}
                      >
                        {block.kind === 'ol' ? `${j + 1}.` : '•'}
                      </Text>
                      <Text
                        selectable
                        className="flex-1 text-[13px] leading-[20px] text-ink dark:text-ink-dark"
                      >
                        <Inline parts={item} refs={refs} />
                      </Text>
                    </View>
                  ))}
                </View>
              ),
            )}
          </View>
        </Panel>
      ) : null}

      <Panel title="Verified findings" meta={String(result.keyFindings.length)}>
        {result.keyFindings.length === 0 ? (
          <Muted>No finding survived verification.</Muted>
        ) : (
          <View className="gap-4">
            {result.keyFindings.map((finding, index) => (
              <FindingBlock key={index} finding={finding} />
            ))}
          </View>
        )}
      </Panel>

      {result.openQuestions.length > 0 ? (
        <Panel title="Open questions">
          <Bullets items={result.openQuestions} />
        </Panel>
      ) : null}

      {result.rejectedClaims.length > 0 ? (
        <Panel flush>
          <Disclosure
            title="Claims dropped by verification"
            meta={String(result.rejectedClaims.length)}
          >
            <View className="gap-2.5">
              {result.rejectedClaims.map((claim, index) => (
                <View key={index}>
                  <Para>{claim.claim}</Para>
                  {claim.reason ? <Muted className="mt-0.5">{claim.reason}</Muted> : null}
                </View>
              ))}
            </View>
          </Disclosure>
        </Panel>
      ) : null}
    </View>
  );
}

/** Answer text with its citations as tappable references; a citation to no page read is dimmed. */
function Inline({ parts, refs }: { parts: AnswerInline[]; refs: RefMap }) {
  return (
    <>
      {parts.map((part, index) => {
        if ('text' in part) return <React.Fragment key={index}>{part.text}</React.Fragment>;
        const source = refs.get(part.ref);
        return source ? (
          <Text
            key={index}
            accessibilityRole="link"
            accessibilityLabel={`Source ${part.ref}: ${source.title ?? source.url}`}
            onPress={() => void openSource(source.url)}
            className="text-xs font-semibold text-brand-text dark:text-brand-text-dark"
          >
            {` [${part.ref}]`}
          </Text>
        ) : (
          <Text
            key={index}
            accessibilityLabel={`${part.ref}, not among the pages this run read`}
            className="text-xs text-ink-faint dark:text-ink-dark-faint"
          >
            {` [${part.ref}]`}
          </Text>
        );
      })}
    </>
  );
}

function FindingBlock({ finding }: { finding: ResearchFinding }) {
  const changed = finding.modelConfidence && finding.modelConfidence !== finding.confidence;
  return (
    <View className="gap-1.5">
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusPill
          tone={confidenceTone(finding.confidence)}
          label={`${capitalise(finding.confidence)} confidence`}
        />
        {finding.corroboration != null ? (
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {`${finding.corroboration} independent site${finding.corroboration === 1 ? '' : 's'}`}
          </Text>
        ) : null}
        {changed ? (
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
            {`model said ${finding.modelConfidence}`}
          </Text>
        ) : null}
      </View>
      <Para>{finding.claim}</Para>
      {finding.sources.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {finding.sources.map((source) => (
            <Pressable
              key={source.ref}
              accessibilityRole="link"
              accessibilityLabel={`Source ${source.ref}: ${source.title ?? source.domain}`}
              onPress={() => void openSource(source.url)}
              hitSlop={4}
              className="rounded-full bg-surface-sunk px-2 py-0.5 active:opacity-70 dark:bg-surface-sunk-dark"
            >
              <Text
                className="text-[11px] font-semibold text-brand-text dark:text-brand-text-dark"
                numberOfLines={1}
              >
                {`${source.ref} · ${source.domain}`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {finding.unverifiedNumbers.length > 0 ? (
        <Text className="text-xs leading-[17px] text-warning-600 dark:text-warning-dark">
          {`Not on a cited page: ${finding.unverifiedNumbers.join(', ')}`}
        </Text>
      ) : null}
    </View>
  );
}

function SourcesPanel({
  sources,
  title = 'Sources',
}: {
  sources: readonly ResearchSource[];
  title?: string;
}) {
  const { colors } = useTheme();
  return (
    <Panel title={title} meta={`${sources.length} read`}>
      {sources.length === 0 ? (
        <Muted>No page was read.</Muted>
      ) : (
        sources.map((source, index) => (
          <Pressable
            key={source.ref}
            accessibilityRole="link"
            accessibilityLabel={`${source.ref}: ${source.title ?? source.domain}, ${
              source.cited ? 'cited' : 'read, not cited'
            }, credibility ${credibilityWord(source.credibility)}. Opens in the browser`}
            onPress={() => void openSource(source.url)}
            className={`flex-row gap-2.5 py-2.5 active:opacity-70${
              index > 0 ? ' border-t border-line dark:border-line-dark' : ''
            }`}
          >
            <Text
              className="w-7 text-xs font-semibold text-ink-muted dark:text-ink-dark-muted"
              style={NUM}
            >
              {source.ref}
            </Text>
            <View className="min-w-0 flex-1">
              <Text
                className="text-[13px] font-semibold leading-[18px] text-brand-text dark:text-brand-text-dark"
                numberOfLines={2}
              >
                {source.title ?? source.domain}
              </Text>
              <Text
                className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
                numberOfLines={1}
                style={NUM}
              >
                {[
                  source.domain,
                  source.publishedAt ? formatDateTime(source.publishedAt) : null,
                  source.cited ? 'cited' : 'read, not cited',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {source.excerpt ? (
                <Text
                  className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={2}
                >
                  {source.excerpt}
                </Text>
              ) : null}
              {source.credibility != null ? (
                <View className="mt-1.5 flex-row items-center gap-2">
                  <View className="w-16">
                    <Meter value={source.credibility} tone="neutral" height={4} />
                  </View>
                  <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
                    {`${credibilityWord(source.credibility)} credibility · ${Math.round(source.credibility)}/100`}
                  </Text>
                </View>
              ) : null}
            </View>
            <ExternalLink size={14} color={colors.textFaint} style={{ marginTop: 2 }} />
          </Pressable>
        ))
      )}
    </Panel>
  );
}

function RunStats({ result }: { result: ResearchResult }) {
  const stats = result.stats;
  if (!stats) return null;
  return (
    <Panel title="Run" footer={stats.forcedFinish ? 'Stopped at its budget.' : undefined}>
      <KeyValueRow label="Model" value={stats.model ?? '—'} />
      <KeyValueRow divider label="Model turns" value={formatNumber(stats.modelTurns, 0)} />
      <KeyValueRow divider label="Searches" value={formatNumber(stats.searches, 0)} />
      <KeyValueRow
        divider
        label="Pages fetched"
        value={formatNumber(stats.pagesFetched, 0)}
        hint={stats.pagesFailed ? `${stats.pagesFailed} failed to load` : undefined}
      />
      <KeyValueRow divider label="Duration" value={duration(stats.durationMs)} />
      {result.generatedAt ? (
        <KeyValueRow divider label="Answered" value={formatDateTime(result.generatedAt)} />
      ) : null}
    </Panel>
  );
}
