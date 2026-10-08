import { useLocalSearchParams, useRouter } from 'expo-router';
import ArrowUpDown from 'lucide-react-native/icons/arrow-up-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { ShareBar } from '@/components/dashboard/ShareBar';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid, GridItem } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Input } from '@/components/ui/Input';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { Chips } from '@/components/ui/Tabs';
import { WorkflowRow } from '@/features/automations/components/WorkflowRow';
import { WorkflowTable } from '@/features/automations/components/WorkflowTable';
import { useWorkflows } from '@/features/automations/hooks';
import {
  filterWorkflows,
  runStatusCounts,
  sortWorkflows,
  workflowKpis,
  type WorkflowFilter,
  type WorkflowSort,
} from '@/features/automations/lib/workflows';
import { INDEX_BOT_CONTROLS } from '@/features/settings/lib/preferences';
import { useNow } from '@/hooks/useNow';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { isApiError } from '@/types/api';

const SORT_OPTIONS: readonly { key: WorkflowSort; label: string }[] = [
  { key: 'lastRun', label: 'Last run' },
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
];

/**
 * The index bot used to be a second view here (`?view=bot`). It is an agent now, with trades,
 * a decision log and P&L of its own, so the old address goes to Agents › Index trading's
 * Controls tab — old links and notifications still land on the bot's switch.
 */
export default function AutomationsRoute() {
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  if (view === 'bot') return <IndexBotRedirect />;
  return <AutomationsScreen />;
}

function IndexBotRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(INDEX_BOT_CONTROLS);
  }, [router]);
  return null;
}

/** Admin only (the Index trading tab is): a quiet pointer to where the index bot went. */
function IndexBotLink() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Index bot moved to Agents, Index trading"
      accessibilityHint="Opens the index bot's controls"
      hitSlop={6}
      onPress={() => router.push(INDEX_BOT_CONTROLS)}
      className="mb-4 flex-row items-center gap-1 self-start active:opacity-60"
    >
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
        Index bot moved to
      </Text>
      <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
        Agents › Index trading
      </Text>
      <ChevronRight size={14} color={colors.link} />
    </Pressable>
  );
}

/**
 * Settings › Automations (web: Automations › Workflows) — the shared n8n instance's workflows
 * and how they last ran. The numbers first (each a tap from the workflows it counts), the spread
 * of last outcomes as one bar, then the workflows: a list on a phone, a table on a wider window.
 */
function AutomationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const workflows = useWorkflows();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WorkflowFilter>('all');
  const [sort, setSort] = useState<WorkflowSort>('lastRun');
  const [sortOpen, setSortOpen] = useState(false);

  const list = workflows.data?.workflows;
  const summary = workflows.data?.summary;
  const statusCounts = useMemo(() => runStatusCounts(list ?? []), [list]);
  const outcomes = (
    <ShareBar
      segments={[
        { label: 'Succeeded', value: statusCounts.success, color: colors.accent },
        { label: 'Failed', value: statusCounts.error, color: colors.danger },
        { label: 'Running', value: statusCounts.running, color: colors.info },
        { label: 'No runs', value: statusCounts.idle, color: colors.borderStrong },
      ]}
    />
  );
  const visible = useMemo(
    () => sortWorkflows(filterWorkflows(list ?? [], query, filter), sort),
    [list, query, filter, sort],
  );
  const filterItems = useMemo(() => {
    const count = (f: WorkflowFilter) => filterWorkflows(list ?? [], '', f).length;
    return [
      { key: 'all' as const, label: 'All' },
      { key: 'active' as const, label: `Active · ${count('active')}` },
      { key: 'inactive' as const, label: `Inactive · ${count('inactive')}` },
      { key: 'failed' as const, label: `Failed · ${count('failed')}` },
      { key: 'success' as const, label: `Succeeded · ${count('success')}` },
    ];
  }, [list]);

  const notConfigured =
    !workflows.data &&
    isApiError(workflows.error) &&
    workflows.error.code === 'DEPENDENCY_UNAVAILABLE';

  let body: React.ReactNode;
  if (workflows.isPending) {
    body = (
      <View className="gap-3">
        <View className="flex-row gap-2.5">
          <Skeleton height={72} className="rounded-card" width="48%" />
          <Skeleton height={72} className="rounded-card" width="48%" />
        </View>
        <ListSkeleton rows={4} />
      </View>
    );
  } else if (notConfigured) {
    body = (
      // The server answers DEPENDENCY_UNAVAILABLE both when n8n isn't configured and when
      // its circuit breaker is open (n8n not responding), so the copy covers both.
      <InlineEmpty
        title="Automations aren’t available"
        message={
          isAdmin
            ? 'The server can’t reach n8n — either N8N_BASE_URL and N8N_API_KEY aren’t set, or n8n isn’t responding. Pull to refresh to try again.'
            : 'The automation engine isn’t reachable right now. Pull to refresh to try again, or ask an administrator.'
        }
      />
    );
  } else if (!workflows.data) {
    body = (
      <InlineError
        what="automations"
        error={workflows.error}
        onRetry={() => void workflows.refetch()}
      />
    );
  } else if ((list ?? []).length === 0) {
    body = (
      <InlineEmpty
        title="No workflows yet"
        message="Nothing has been built on the connected n8n instance. Workflows created in n8n’s editor show up here."
      />
    );
  } else {
    body = (
      <>
        {workflows.error ? (
          <Banner
            tone="warning"
            message="Couldn’t refresh — showing the last loaded list."
            className="mb-3"
          />
        ) : null}
        {summary ? (
          <Grid columns={layout.columns === 1 ? 2 : layout.columns === 2 ? 4 : 6} gap={12}>
            {workflowKpis(summary, now).map((kpi) => (
              <StatTile
                key={kpi.key}
                label={kpi.label}
                value={kpi.value}
                sub={kpi.sub}
                status={kpi.status}
                onPress={kpi.filter ? () => setFilter(kpi.filter ?? 'all') : undefined}
              />
            ))}
            {layout.columns === 3 ? (
              <GridItem span={2}>
                <Panel title="Last run" meta="By outcome">
                  {outcomes}
                </Panel>
              </GridItem>
            ) : null}
          </Grid>
        ) : null}
        {summary && layout.columns < 3 ? (
          <View className="mt-3">
            <Panel title="Last run" meta="By outcome">
              {outcomes}
            </Panel>
          </View>
        ) : null}

        <Input
          containerClassName={layout.compact ? 'mt-5' : 'mt-6 max-w-[440px]'}
          placeholder="Search by name or tag"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search workflows"
          leftIcon={<Search size={18} color={colors.textFaint} />}
          rightIcon={
            query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={10}
                onPress={() => setQuery('')}
              >
                <X size={18} color={colors.textMuted} />
              </Pressable>
            ) : undefined
          }
        />

        <Chips items={filterItems} value={filter} onChange={setFilter} className="mt-3" />

        <View className="mb-2.5 mt-4 flex-row items-center justify-between">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            {visible.length === (list ?? []).length
              ? `${visible.length} workflow${visible.length === 1 ? '' : 's'}`
              : `${visible.length} of ${(list ?? []).length}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${SORT_OPTIONS.find((option) => option.key === sort)?.label}`}
            hitSlop={8}
            onPress={() => setSortOpen(true)}
            className="flex-row items-center gap-1.5 active:opacity-60"
          >
            <ArrowUpDown size={14} color={colors.link} />
            <Text className="text-xs font-semibold text-brand-text dark:text-brand-text-dark">
              {SORT_OPTIONS.find((option) => option.key === sort)?.label}
            </Text>
          </Pressable>
        </View>

        {visible.length === 0 ? (
          <InlineEmpty
            title="No workflows match"
            message="Try another search or filter."
            action={{
              label: 'Clear filters',
              onPress: () => {
                setQuery('');
                setFilter('all');
              },
            }}
          />
        ) : layout.compact ? (
          <ListCard>
            {visible.map((workflow, index) => (
              <View key={workflow.id}>
                {index > 0 ? <RowDivider /> : null}
                <WorkflowRow
                  workflow={workflow}
                  now={now}
                  onPress={() =>
                    router.push({ pathname: '/automation/[id]', params: { id: workflow.id } })
                  }
                />
              </View>
            ))}
          </ListCard>
        ) : (
          <WorkflowTable
            workflows={visible}
            now={now}
            showTags={layout.columns === 3}
            onOpen={(workflow) =>
              router.push({ pathname: '/automation/[id]', params: { id: workflow.id } })
            }
          />
        )}

        <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Failures are counted from each workflow’s recent runs. Open a workflow to run it, see its
          history or change its settings.
        </Text>
      </>
    );
  }

  return (
    <GroupScreen
      onRefresh={() => workflows.refetch()}
      intro="Workflows on the shared n8n instance, live — scheduled jobs and webhooks."
      fill
    >
      {isAdmin ? <IndexBotLink /> : null}
      {body}
      <OptionSheet
        visible={sortOpen}
        title="Sort workflows"
        options={SORT_OPTIONS}
        value={sort}
        onSelect={setSort}
        onClose={() => setSortOpen(false)}
      />
    </GroupScreen>
  );
}
