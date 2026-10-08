import { useRouter, type Href } from 'expo-router';
import BookOpen from 'lucide-react-native/icons/book-open';
import Briefcase from 'lucide-react-native/icons/briefcase';
import ChartCandlestick from 'lucide-react-native/icons/chart-candlestick';
import Globe from 'lucide-react-native/icons/globe';
import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { Grid, GridItem } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { Skeleton } from '@/components/ui/Skeleton';
import { ActivityRow, AgentCard } from '@/features/agents/components/HubParts';
import { AgentsOutdated, Fig, signClass } from '@/features/agents/components/Parts';
import { VerdictShare } from '@/features/agents/components/Verdict';
import { useAgentsSummary } from '@/features/agents/hooks';
import { mobileHrefFor } from '@/features/agents/lib/links';
import {
  duration,
  indexStatus,
  outcomeView,
  plural,
  portfolioStatus,
  proposalLabel,
  researchStatus,
  signedRupees,
  signOf,
} from '@/features/agents/lib/view';
import type { AgentsSummary } from '@/features/agents/types';
import { useNow } from '@/hooks/useNow';
import { formatNumber, formatPercent } from '@/lib/utils/formatters';
import { isServerOutdated } from '@/services/api/contract';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Agents › Overview (web: /agents) — what each agent is, whether it is working, its headline
 * numbers, and one feed of what they all did lately. Index trading and web research are
 * admin-only on the server; their cards appear only when the server sends them.
 */
export default function AgentsHubScreen() {
  const router = useRouter();
  const layout = useScreenLayout();
  const summary = useAgentsSummary();
  const now = useNow();
  const data = summary.data;

  const go = useCallback((href: Href) => router.push(href), [router]);
  const onRefresh = useCallback(() => summary.refetch(), [summary]);

  if (!data && isServerOutdated(summary.error)) {
    return (
      <GroupScreen fill onRefresh={onRefresh}>
        <AgentsOutdated />
      </GroupScreen>
    );
  }

  return (
    <GroupScreen fill onRefresh={onRefresh}>
      {data ? (
        <>
          {/* One card per agent the server sent; a lone card takes the row rather than a third of it. */}
          <Grid
            columns={Math.min(
              layout.columns,
              1 + Number(Boolean(data.indexTrading)) + Number(Boolean(data.research)),
            )}
          >
            {data.indexTrading ? <IndexCard index={data.indexTrading} now={now} go={go} /> : null}
            <PortfolioCard portfolio={data.portfolio} now={now} go={go} />
            {data.research ? <ResearchCard research={data.research} now={now} go={go} /> : null}
          </Grid>
          <View className="mt-4">
            <Grid columns={layout.columns === 1 ? 1 : 3} equalHeight={false}>
              <GridItem span={2}>
                <Activity data={data} now={now} go={go} />
              </GridItem>
              <HowTheyWork admin={data.admin} go={go} />
            </Grid>
          </View>
        </>
      ) : summary.error ? (
        <InlineError
          what="the agents"
          error={summary.error}
          onRetry={() => void summary.refetch()}
        />
      ) : (
        <Grid columns={layout.columns}>
          {[0, 1, 2].map((key) => (
            <View
              key={key}
              className="gap-3 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
            >
              <Skeleton width="50%" height={16} />
              <Skeleton width="90%" height={12} />
              <Skeleton width="100%" height={44} />
              <Skeleton width="70%" height={12} />
            </View>
          ))}
        </Grid>
      )}
    </GroupScreen>
  );
}

type Go = (href: Href) => void;

function IndexCard({
  index,
  now,
  go,
}: {
  index: NonNullable<AgentsSummary['indexTrading']>;
  now: number;
  go: Go;
}) {
  const run = index.latestRun;
  const proposal = run ? proposalLabel(run) : null;
  return (
    <AgentCard
      Icon={ChartCandlestick}
      iconTone="violet"
      title="Index trading"
      status={indexStatus(index)}
      role={`Debates NIFTY options${index.cadenceMinutes ? ` every ${index.cadenceMinutes} min` : ''}; buys only on an edge that clears costs.`}
      latest={
        run
          ? {
              tone: outcomeView(run.outcome).tone,
              text: [outcomeView(run.outcome).label, proposal, run.reason || null]
                .filter(Boolean)
                .join(' · '),
              at: run.at,
              now,
            }
          : { empty: 'No scan yet.' }
      }
      onPress={() => go('/agents/index-trading')}
    >
      <View className="flex-row gap-3">
        <Fig
          label={`Today · ${plural(index.today.entries, 'entry', 'entries')}`}
          value={signedRupees(index.today.net)}
          valueClassName={signClass(signOf(index.today.net))}
        />
        <Fig
          label={`This month · ${index.month.closed} closed`}
          value={signedRupees(index.month.net)}
          valueClassName={signClass(signOf(index.month.net))}
        />
      </View>
      <View className="mt-3 flex-row gap-3">
        <Fig label="Win rate" value={formatPercent(index.month.winRate, 0)} />
        <Fig label="Open" value={formatNumber(index.open, 0)} />
        <Fig label="Scans today" value={formatNumber(index.scansToday, 0)} />
      </View>
    </AgentCard>
  );
}

function PortfolioCard({
  portfolio,
  now,
  go,
}: {
  portfolio: AgentsSummary['portfolio'];
  now: number;
  go: Go;
}) {
  const c = portfolio.counts;
  return (
    <AgentCard
      Icon={Briefcase}
      iconTone="green"
      title="Portfolio review"
      status={portfolioStatus(portfolio)}
      role="Labels each Groww and mStock holding hourly. Research only; it never orders."
      latest={
        c.latestAt
          ? {
              tone: c.changed ? 'warn' : 'ok',
              text: c.changed
                ? `${plural(c.changed, 'verdict')} changed in the last 24 h`
                : 'No verdict changed in the last 24 h',
              at: c.latestAt,
              now,
            }
          : { empty: 'No review yet.' }
      }
      onPress={() => go('/agents/portfolio')}
    >
      <View className="flex-row gap-3">
        <Fig label="Reviewed" value={`${c.withVerdict} of ${c.holdings}`} />
        <Fig
          label="Changed · 24 h"
          value={formatNumber(c.changed, 0)}
          valueClassName={c.changed ? 'text-warning-600 dark:text-warning-dark' : undefined}
        />
        <Fig
          label="Failed"
          value={formatNumber(c.failed, 0)}
          valueClassName={c.failed ? 'text-danger-600 dark:text-danger-dark' : undefined}
        />
      </View>
      {c.withVerdict > 0 ? (
        <View className="mt-3.5">
          <VerdictShare counts={c} />
        </View>
      ) : null}
    </AgentCard>
  );
}

function ResearchCard({
  research,
  now,
  go,
}: {
  research: NonNullable<AgentsSummary['research']>;
  now: number;
  go: Go;
}) {
  const s = research.stats;
  return (
    <AgentCard
      Icon={Globe}
      iconTone="blue"
      title="Web research"
      status={researchStatus(research)}
      role="Cited, verified answers from the web."
      latest={
        research.latest
          ? { tone: 'neutral', text: research.latest.query, at: research.latest.at, now }
          : { empty: research.error ?? 'No research yet.' }
      }
      onPress={() => go('/agents/web-research')}
    >
      <View className="flex-row gap-3">
        <Fig label="Runs" value={formatNumber(s.runs, 0)} />
        <Fig label="Answered" value={formatNumber(s.completed, 0)} />
        <Fig
          label="Running"
          value={formatNumber(s.running, 0)}
          valueClassName={s.running ? 'text-info dark:text-info-dark' : undefined}
        />
        <Fig label="Median time" value={duration(s.medianDurationMs)} />
      </View>
    </AgentCard>
  );
}

function Activity({ data, now, go }: { data: AgentsSummary; now: number; go: Go }) {
  return (
    <Panel title="Recent activity" meta="all agents, newest first" flush>
      {data.activity.length === 0 ? (
        <View className="px-4 pb-4">
          <InlineEmpty title="No activity yet." />
        </View>
      ) : (
        data.activity.map((event, index) => {
          const href = mobileHrefFor(event.to);
          return (
            <ActivityRow
              key={`${event.at}-${index}`}
              event={event}
              now={now}
              divider={index > 0}
              onPress={href ? () => go(href) : null}
            />
          );
        })
      )}
    </Panel>
  );
}

function HowTheyWork({ admin, go }: { admin: boolean; go: Go }) {
  const { colors } = useTheme();
  const steps = [
    ...(admin
      ? [
          {
            name: 'Index trading',
            text: 'Futures & news → bull/bear debate → risk caps → edge check → order.',
          },
        ]
      : []),
    {
      name: 'Portfolio review',
      text: 'Holding → trend, RSI, volume, news → web research → label.',
    },
    ...(admin
      ? [
          {
            name: 'Web research',
            text: 'Search → read → cited answer → verified.',
          },
        ]
      : []),
  ];
  return (
    <Panel
      title="How they work"
      right={
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open the agents docs"
          hitSlop={8}
          onPress={() => go('/agents/docs')}
          className="flex-row items-center gap-1 active:opacity-60"
        >
          <BookOpen size={14} color={colors.link} />
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Docs
          </Text>
        </Pressable>
      }
      footer="Model confidence is a research score, not a probability. Only the index bot orders, within caps the model cannot change."
    >
      <View className="gap-3">
        {steps.map((step) => (
          <View key={step.name}>
            <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
              {step.name}
            </Text>
            <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
              {step.text}
            </Text>
          </View>
        ))}
      </View>
    </Panel>
  );
}
