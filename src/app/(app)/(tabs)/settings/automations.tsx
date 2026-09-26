import { useRouter } from 'expo-router';
import ArrowUpDown from 'lucide-react-native/icons/arrow-up-down';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Input } from '@/components/ui/Input';
import { KpiGrid } from '@/components/ui/KpiGrid';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { Chips } from '@/components/ui/Tabs';
import { WorkflowRow } from '@/features/automations/components/WorkflowRow';
import { useWorkflows } from '@/features/automations/hooks';
import {
  filterWorkflows,
  sortWorkflows,
  type WorkflowFilter,
  type WorkflowSort,
} from '@/features/automations/lib/workflows';
import { relativeTime } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { isApiError } from '@/types/api';

const SORT_OPTIONS: readonly { key: WorkflowSort; label: string }[] = [
  { key: 'lastRun', label: 'Last run' },
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
];

/** Automations (web: Workflows) — the shared n8n instance's workflows and how they last ran. */
export default function AutomationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const workflows = useWorkflows();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WorkflowFilter>('all');
  const [sort, setSort] = useState<WorkflowSort>('lastRun');
  const [sortOpen, setSortOpen] = useState(false);

  const list = workflows.data?.workflows;
  const summary = workflows.data?.summary;
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
      <InlineEmpty
        title="Automations aren’t connected"
        message={
          isAdmin
            ? 'The server has no n8n instance configured. Set N8N_BASE_URL and N8N_API_KEY on the server, then pull to refresh.'
            : 'The server isn’t connected to an automation engine yet. An administrator can set it up.'
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
          <KpiGrid
            items={[
              { label: 'Workflows', value: String(summary.total), sub: `${summary.active} active` },
              {
                label: 'Failed · 24h',
                value: String(summary.failedLast24h),
                sub: summary.failedLast24h > 0 ? 'Check the failed runs' : 'All clear',
                ...(summary.failedLast24h > 0 ? { trend: -1 } : {}),
              },
              {
                label: 'Last success',
                value: summary.lastSuccessAt
                  ? relativeTime(summary.lastSuccessAt, now)
                  : 'None yet',
              },
              {
                label: 'Inactive',
                value: String(Math.max(0, summary.total - summary.active)),
                sub: 'Not listening',
              },
            ]}
          />
        ) : null}

        <Input
          containerClassName="mt-5"
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
        ) : (
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
      intro="Scheduled jobs and webhooks on the shared n8n instance."
    >
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
