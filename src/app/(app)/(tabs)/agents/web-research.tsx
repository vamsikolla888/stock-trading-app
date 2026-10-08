import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Chips, SegmentedControl } from '@/components/ui/Tabs';
import { AdminOnlyNotice } from '@/features/admin/components/AdminState';
import { isAdminDenied } from '@/features/admin/lib/access';
import { AgentsOutdated, NUM } from '@/features/agents/components/Parts';
import { ResearchRow } from '@/features/agents/components/ResearchRow';
import { useAskResearch, useResearchList } from '@/features/agents/hooks';
import { agentErrorMessage } from '@/features/agents/lib/errors';
import {
  duration,
  RESEARCH_LIMITS,
  validateResearch,
  type ResearchDraft,
} from '@/features/agents/lib/view';
import type { ResearchItem, ResearchStats } from '@/features/agents/types';
import { TextArea } from '@/features/settings/components/TextArea';
import { useNow } from '@/hooks/useNow';
import { formatNumber } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { isServerOutdated } from '@/services/api/contract';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

const DEPTHS = [
  { key: 'quick' as const, label: 'Quick' },
  { key: 'standard' as const, label: 'Standard' },
  { key: 'deep' as const, label: 'Deep' },
];
const DEPTH_HINT: Record<ResearchDraft['depth'], string> = {
  quick: 'About 4 pages read — fastest.',
  standard: 'About 8 pages read.',
  deep: 'About 14 pages read — slowest.',
};
const RANGES = [
  { key: '' as const, label: 'Any time' },
  { key: 'day' as const, label: 'Last day' },
  { key: 'week' as const, label: 'Last week' },
  { key: 'month' as const, label: 'Last month' },
  { key: 'year' as const, label: 'Last year' },
];
const EMPTY_DRAFT: ResearchDraft = {
  query: '',
  depth: 'standard',
  timeRange: '',
  instructions: '',
};

/**
 * Agents › Web research (web: /agents/web-research; admin) — the ai-service's research agent: it
 * searches, reads pages, writes a cited answer and then VERIFIES it. Headline figures, a composer
 * to ask it something, and every run it was asked by IPO reports, a person here or another API
 * client; a run opens its answer. Admin-only: research spends the shared AI budget.
 */
export default function WebResearchScreen() {
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const router = useRouter();
  const layout = useScreenLayout();
  const now = useNow();
  const list = useResearchList(isAdmin);
  const ask = useAskResearch();

  const pages = list.data?.pages;
  const first = pages?.[0];
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (pages ?? [])
      .flatMap((page) => page.items)
      .filter((item) => (seen.has(item.jobId) ? false : (seen.add(item.jobId), true)));
  }, [pages]);

  const onRefresh = useCallback(() => list.refetch(), [list]);
  const open = useCallback(
    (item: ResearchItem) =>
      router.push({ pathname: '/research/[jobId]', params: { jobId: item.jobId } }),
    [router],
  );

  if (!isAdmin || isAdminDenied(list.error)) {
    return (
      <GroupScreen fill>
        <AdminOnlyNotice message="Research runs spend the platform’s shared AI budget, so this screen is limited to administrators." />
      </GroupScreen>
    );
  }

  if (!first && isServerOutdated(list.error)) {
    return (
      <GroupScreen fill onRefresh={onRefresh}>
        <AgentsOutdated what="Web research and the other Agents screens" />
      </GroupScreen>
    );
  }

  const composer = (
    <AskComposer
      ready={first?.ready ?? true}
      pending={ask.isPending}
      onSubmit={(payload, reset) =>
        ask.mutate(payload, {
          onSuccess: (result) => {
            toast.success('Research started', 'The answer appears on its page as it is verified.');
            reset();
            router.push({ pathname: '/research/[jobId]', params: { jobId: result.jobId } });
          },
          onError: (error) => toast.error('The research could not start', agentErrorMessage(error)),
        })
      }
    />
  );

  const runs = (
    <Section
      title="Research runs"
      note="newest first"
      className={layout.columns === 1 ? undefined : 'mt-0'}
    >
      {first ? (
        items.length === 0 ? (
          <InlineEmpty
            title="No research yet"
            message="Ask a question, or let the next IPO report start one."
          />
        ) : (
          <>
            <ListCard>
              {items.map((item, index) => (
                <React.Fragment key={item.jobId}>
                  {index > 0 ? <RowDivider /> : null}
                  <ResearchRow item={item} now={now} onPress={open} />
                </React.Fragment>
              ))}
            </ListCard>
            {list.hasNextPage ? (
              <Button
                className="mt-3"
                label="Show older runs"
                variant="ghost"
                size="sm"
                loading={list.isFetchingNextPage}
                onPress={() => void list.fetchNextPage()}
              />
            ) : null}
            {list.isFetchNextPageError ? (
              <Text className="mt-2 text-center text-xs text-danger-600 dark:text-danger-dark">
                {`Couldn’t load older runs. ${agentErrorMessage(list.error)}`}
              </Text>
            ) : null}
          </>
        )
      ) : list.error ? (
        <InlineError what="research runs" error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <ListSkeleton rows={6} />
      )}
    </Section>
  );

  return (
    <GroupScreen
      fill
      onRefresh={onRefresh}
      intro="Searches, reads and verifies — every finding cites a page it actually read."
    >
      {first && !first.ready ? (
        <Banner
          tone="warning"
          className="mb-4"
          title="Not connected to the AI service"
          message="Set the research service URL and key on the server to run research."
        />
      ) : null}
      {first ? <Stats stats={first.stats} columns={layout.kpiColumns} /> : null}
      {layout.columns === 1 ? (
        <View className={first ? 'mt-4' : undefined}>
          {composer}
          {runs}
        </View>
      ) : (
        <View
          className={first ? 'mt-4 flex-row items-start' : 'flex-row items-start'}
          style={{ columnGap: 16 }}
        >
          <View className="flex-1">{composer}</View>
          <View style={{ flex: layout.columns === 3 ? 2 : 1 }}>{runs}</View>
        </View>
      )}
    </GroupScreen>
  );
}

function Stats({ stats, columns }: { stats: ResearchStats; columns: number }) {
  return (
    <Grid columns={Math.min(columns, 6)}>
      <StatTile label="Runs" value={formatNumber(stats.runs, 0)} sub="the most recent 50" />
      <StatTile
        label="Answered"
        value={formatNumber(stats.completed, 0)}
        sub={stats.runs ? `${Math.round((stats.completed / stats.runs) * 100)}% of runs` : '—'}
        status={stats.completed ? 'ok' : undefined}
      />
      <StatTile
        label="Researching now"
        value={formatNumber(stats.running, 0)}
        sub={stats.running ? 'updates every 10 s' : 'nothing in flight'}
        status={stats.running ? 'info' : undefined}
      />
      <StatTile
        label="Failed"
        value={formatNumber(stats.failed, 0)}
        sub="gave up or was cancelled"
        status={stats.failed ? 'warn' : undefined}
      />
      <StatTile
        label="Median time"
        value={duration(stats.medianDurationMs)}
        sub="question to verified answer"
      />
      <StatTile
        label="Per answer"
        value={stats.avgSources == null ? '—' : `${formatNumber(stats.avgSources, 1)} sources`}
        sub={
          stats.avgFindings == null
            ? '—'
            : `${formatNumber(stats.avgFindings, 1)} verified findings`
        }
      />
    </Grid>
  );
}

/**
 * Ask the research agent: the question, how deep to read, how recent the sources must be, and
 * optional guidance — checked against the server's own limits before anything is sent.
 */
function AskComposer({
  ready,
  pending,
  onSubmit,
}: {
  ready: boolean;
  pending: boolean;
  onSubmit: (
    payload: Extract<ReturnType<typeof validateResearch>, { ok: true }>['payload'],
    reset: () => void,
  ) => void;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<ResearchDraft>(EMPTY_DRAFT);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<{ field: 'query' | 'instructions'; message: string } | null>(
    null,
  );
  const update = (patch: Partial<ResearchDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };
  const MoreIcon = more ? ChevronUp : ChevronDown;

  const submit = () => {
    const checked = validateResearch(draft);
    if (!checked.ok) {
      setError({ field: checked.field, message: checked.error });
      if (checked.field === 'instructions') setMore(true);
      return;
    }
    onSubmit(checked.payload, () => {
      setDraft(EMPTY_DRAFT);
      setMore(false);
    });
  };

  return (
    <Panel title="Ask the research agent" meta="cited answers only">
      <View className="gap-4">
        <View>
          <TextArea
            label="Question"
            value={draft.query}
            onChangeText={(query) => update({ query })}
            maxLength={RESEARCH_LIMITS.queryMax}
            minHeight={88}
            placeholder="e.g. What did SEBI change in the F&O lot-size rules this year, and when does it apply?"
          />
          <View className="mt-1 flex-row items-center justify-between gap-3">
            <Text
              className={
                error?.field === 'query'
                  ? 'flex-1 text-xs text-danger-600 dark:text-danger-dark'
                  : 'flex-1 text-xs text-ink-faint dark:text-ink-dark-faint'
              }
            >
              {error?.field === 'query' ? error.message : 'At least 3 characters.'}
            </Text>
            <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
              {`${draft.query.length}/${RESEARCH_LIMITS.queryMax}`}
            </Text>
          </View>
        </View>

        <View>
          <Text className="mb-1.5 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
            Depth
          </Text>
          <SegmentedControl
            items={DEPTHS}
            value={draft.depth}
            onChange={(depth) => update({ depth })}
          />
          <Text className="mt-1.5 text-xs text-ink-faint dark:text-ink-dark-faint">
            {DEPTH_HINT[draft.depth]}
          </Text>
        </View>

        <View>
          <Text className="mb-1.5 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
            Only sources from
          </Text>
          <Chips
            bleed={false}
            items={RANGES}
            value={draft.timeRange}
            onChange={(timeRange) => update({ timeRange })}
          />
        </View>

        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: more }}
            hitSlop={6}
            onPress={() => setMore((value) => !value)}
            className="flex-row items-center gap-1 self-start active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              More options
            </Text>
            <MoreIcon size={16} color={colors.link} />
          </Pressable>
          {more ? (
            <View className="mt-3">
              <TextArea
                label="Guidance (optional)"
                value={draft.instructions}
                onChangeText={(instructions) => update({ instructions })}
                maxLength={RESEARCH_LIMITS.instructionsMax}
                minHeight={72}
                placeholder="e.g. prefer exchange circulars and regulator filings"
              />
              <View className="mt-1 flex-row items-center justify-between gap-3">
                <Text
                  className={
                    error?.field === 'instructions'
                      ? 'flex-1 text-xs text-danger-600 dark:text-danger-dark'
                      : 'flex-1 text-xs text-ink-faint dark:text-ink-dark-faint'
                  }
                >
                  {error?.field === 'instructions'
                    ? error.message
                    : 'Treated as guidance, not as an instruction the agent must obey.'}
                </Text>
                <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
                  {`${draft.instructions.length}/${RESEARCH_LIMITS.instructionsMax}`}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <Button
          label="Start research"
          loading={pending}
          disabled={!ready || draft.query.trim().length < RESEARCH_LIMITS.queryMin}
          onPress={submit}
          accessibilityHint="Starts a research job and opens it"
        />
      </View>
    </Panel>
  );
}
