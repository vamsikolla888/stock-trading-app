import { useRouter } from 'expo-router';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Sparkles from 'lucide-react-native/icons/sparkles';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AreaChart } from '@/components/charts/AreaChart';
import { NavTile } from '@/components/dashboard/NavTile';
import { GroupTitle, Panel } from '@/components/dashboard/Panel';
import { ShareBar } from '@/components/dashboard/ShareBar';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid, GridItem } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import type { IconComponent } from '@/components/ui/icon';
import type { IconTone } from '@/components/ui/IconTile';
import { MenuRow } from '@/components/ui/MenuRow';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { AdminOnlyNotice } from '@/features/admin/components/AdminState';
import { ServiceTile } from '@/features/admin/components/ServiceTile';
import {
  useLiveness,
  usePlatformUsers,
  useProviderUsage,
  useReadiness,
  useRecServiceStatus,
  useServerAnalytics,
  useServiceHealth,
} from '@/features/admin/hooks';
import { isAdminDenied } from '@/features/admin/lib/access';
import { providerUsage } from '@/features/admin/lib/aiProviders';
import { bucketLabel, formatCount, formatMs, formatTokens } from '@/features/admin/lib/format';
import {
  buildOverviewServices,
  errorRate,
  errorRateTone,
  trafficSplit,
  verdictInputs,
} from '@/features/admin/lib/overview';
import { platformHeadline, serviceState } from '@/features/admin/lib/services';
import { usageBucketLabel } from '@/features/admin/lib/usage';
import { APPROVAL, sortUsers, userCounts } from '@/features/admin/lib/users';
import { ADMIN_SECTION_GROUPS, type AdminSectionId } from '@/features/admin/sections';
import { useWorkflows } from '@/features/automations/hooks';
import { StatusDot, StatusPill } from '@/features/settings/components/StatusPill';
import { formatClock, formatDateTime, relativeTime } from '@/features/settings/lib/time';
import { useBrokerConnections } from '@/features/trading/hooks';
import { useNow } from '@/hooks/useNow';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

const NUM = { fontVariant: ['tabular-nums' as const] };

interface ConsoleEntry {
  key: string;
  Icon: IconComponent;
  tone: IconTone;
  title: string;
  subtitle: string;
  badge: string | undefined;
  onPress: () => void;
}

/** Admin console (web: /admin) — the platform's state at a glance, then every console screen. */
function Console() {
  const router = useRouter();
  const { colors } = useTheme();
  const layout = useScreenLayout();

  const liveness = useLiveness();
  const readiness = useReadiness();
  const workflows = useWorkflows();
  const connections = useBrokerConnections();
  const recService = useRecServiceStatus();
  const users = usePlatformUsers();
  const health = useServiceHealth('24h');
  const analytics = useServerAnalytics('24h');
  const ai = useProviderUsage('day', 'ollama');
  const now = useNow(60_000);
  // Who is waiting on an admin, then who joined most recently.
  const latestUsers = useMemo(
    () => (users.data ? sortUsers(users.data).slice(0, 5) : []),
    [users.data],
  );

  // Service health is the richer source for the datastores; the live checks add what it lacks.
  const probedKey = (health.data?.services ?? []).map((row) => row.service).join(',');
  const liveChecks = useMemo(
    () =>
      buildOverviewServices({
        liveness: liveness.data,
        readiness: readiness.data,
        // Undefined while loading; null once n8n could not be read (unconfigured or down).
        workflows: workflows.data ? workflows.data.summary : workflows.isError ? null : undefined,
        mstock: {
          loaded: !connections.isPending,
          connection: connections.data?.find((connection) => connection.broker === 'mstock'),
        },
        recService: recService.data,
        probed: new Set(probedKey ? probedKey.split(',') : []),
        formatTime: formatDateTime,
      }),
    [
      liveness.data,
      readiness.data,
      workflows.data,
      workflows.isError,
      connections.isPending,
      connections.data,
      recService.data,
      probedKey,
    ],
  );
  const traffic = useMemo(
    () => trafficSplit(analytics.data?.series ?? []),
    [analytics.data?.series],
  );
  const ollama = useMemo(
    () => (ai.data ? providerUsage(ai.data, 'ollama', ai.filtered) : null),
    [ai.data, ai.filtered],
  );

  const open = (section: AdminSectionId) =>
    router.push({ pathname: '/admin-panel/[section]', params: { section } });

  const onRefresh = () =>
    Promise.all([
      liveness.refetch(),
      readiness.refetch(),
      workflows.refetch(),
      connections.refetch(),
      recService.refetch(),
      users.refetch(),
      health.refetch(),
      analytics.refetch(),
      ai.refetch(),
    ]);

  if (isAdminDenied(users.error)) {
    return (
      <GroupScreen onRefresh={onRefresh}>
        <AdminOnlyNotice message="Your account no longer has administrator access." />
      </GroupScreen>
    );
  }

  // Only the API and its datastores being down is an outage; any other failing check (one
  // failed n8n run, an open breaker) needs attention but is not "down".
  const headline = platformHeadline({
    ...verdictInputs(liveChecks, health.data?.services ?? []),
    checked: Boolean(liveness.data || health.data),
  });
  const checksOk = liveChecks.filter((check) => check.tone === 'ok').length;
  const servicesUp = (health.data?.services ?? []).filter(
    (row) => serviceState(row).tone === 'ok',
  ).length;
  const checkedAt = Math.max(liveness.dataUpdatedAt, health.dataUpdatedAt);
  const counts = users.data ? userCounts(users.data) : null;

  const totals = analytics.data?.totals;
  const errorPct = errorRate(totals);
  const failed24h = workflows.data?.summary.failedLast24h ?? null;
  const series = analytics.data?.series ?? [];
  const pendingAction =
    counts && counts.pending > 0 ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => open('users')}
        className="self-start rounded-full bg-warning-wash px-3 py-1.5 active:opacity-70 dark:bg-warning-wash-dark"
      >
        <Text className="text-xs font-semibold text-warning-600 dark:text-warning-dark">
          {counts.pending} sign-up{counts.pending === 1 ? '' : 's'} waiting · Review
        </Text>
      </Pressable>
    ) : null;

  return (
    <GroupScreen onRefresh={onRefresh} fill>
      {/* ── The verdict ── */}
      <View className="rounded-card border border-line bg-surface px-4 py-3.5 dark:border-line-dark dark:bg-surface-dark">
        <View className="flex-row items-center gap-3">
          <StatusDot tone={headline.tone} size={10} />
          <View className="flex-1">
            <Text
              accessibilityRole="header"
              className="text-[15px] font-semibold text-ink dark:text-ink-dark"
            >
              {headline.text}
            </Text>
            <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
              {checkedAt > 0 ? `Checked ${formatClock(checkedAt)} · every 30s` : 'Checking…'}
            </Text>
          </View>
          {!layout.compact && pendingAction}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh"
            hitSlop={8}
            onPress={() => void onRefresh()}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
          >
            <RefreshCw size={17} color={colors.textMuted} />
          </Pressable>
        </View>
        {layout.compact && pendingAction ? (
          <View className="ml-[22px] mt-2.5">{pendingAction}</View>
        ) : null}
      </View>

      {/* ── Headline numbers ── */}
      <Grid columns={layout.kpiColumns} className="mt-4">
        <StatTile
          label="Requests · 24h"
          value={totals ? formatCount(totals.requests) : '—'}
          sub={
            totals?.successRate != null
              ? `${totals.successRate.toFixed(1)}% succeeded`
              : 'Server analytics'
          }
          trend={series.map((p) => p.count)}
          onPress={() => open('analytics')}
        />
        <StatTile
          label="Error rate · 24h"
          value={errorPct == null ? '—' : `${errorPct.toFixed(2)}%`}
          status={errorRateTone(errorPct)}
          sub={
            totals
              ? `${formatCount(totals.errors5xx)} server · ${formatCount(totals.errors4xx)} client`
              : undefined
          }
          onPress={() => open('analytics')}
        />
        <StatTile
          label="Avg latency · 24h"
          value={formatMs(totals?.avgLatencyMs)}
          sub={totals ? `Slowest ${formatMs(totals.maxLatencyMs)}` : undefined}
          onPress={() => open('analytics')}
        />
        <StatTile
          label="Ollama tokens · 30d"
          value={ollama ? formatTokens(ollama.totals.totalTokens) : '—'}
          sub={ollama ? `${formatCount(ollama.totals.calls)} calls` : 'AI usage'}
          trend={ollama?.series?.map((p) => p.promptTokens + p.completionTokens)}
          onPress={() => open('ai')}
        />
        <StatTile
          label="Users"
          value={counts ? formatCount(counts.all) : '—'}
          status={counts && counts.pending > 0 ? 'warn' : undefined}
          sub={
            counts
              ? counts.pending > 0
                ? `${counts.pending} waiting`
                : `${counts.admins} admin${counts.admins === 1 ? '' : 's'}`
              : undefined
          }
          onPress={() => open('users')}
        />
        <StatTile
          label="Automations · 24h"
          value={failed24h == null ? '—' : failed24h > 0 ? `${failed24h} failed` : 'All ok'}
          status={failed24h == null ? undefined : failed24h > 0 ? 'bad' : 'ok'}
          sub={
            workflows.data
              ? `${workflows.data.summary.active} active of ${workflows.data.summary.total}`
              : workflows.isError
                ? 'n8n unreachable'
                : undefined
          }
          onPress={() => router.navigate('/settings/automations')}
        />
      </Grid>

      {/* ── Traffic and live checks ── */}
      <Grid columns={layout.columns} gap={layout.compact ? 12 : 16} className="mt-4">
        <GridItem span={layout.columns === 3 ? 2 : 1}>
          <Panel title="Traffic" meta="Requests per hour · 24h">
            {analytics.isPending ? (
              <Skeleton height={190} />
            ) : series.length > 1 ? (
              <AreaChart
                labels={series.map((p) => bucketLabel(p.periodStart, analytics.data!.bucket))}
                stacked
                height={layout.compact ? 150 : 190}
                format={(v) => formatCount(Math.round(v))}
                accessibilityLabel="Requests per hour, last 24 hours"
                series={[
                  { key: 'ok', label: 'Handled', color: colors.accent, values: traffic.ok },
                  { key: 'err', label: 'Errors', color: colors.danger, values: traffic.errors },
                ]}
              />
            ) : (
              <Text className="py-8 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
                {analytics.data
                  ? 'No traffic recorded yet.'
                  : 'Server analytics couldn’t be loaded.'}
              </Text>
            )}
          </Panel>
        </GridItem>
        <Panel title="Live checks" meta={`${checksOk} of ${liveChecks.length} ok`} flush>
          {liveChecks.map((check, index) => (
            <View key={check.name}>
              {index > 0 ? <RowDivider /> : null}
              <View
                accessible
                accessibilityLabel={`${check.name}: ${check.detail}`}
                className="flex-row items-center gap-3 px-4 py-2.5"
              >
                <StatusDot tone={check.tone} />
                <Text className="flex-1 text-[13px] text-ink dark:text-ink-dark" numberOfLines={1}>
                  {check.name}
                </Text>
                <Text
                  className="max-w-[55%] text-right text-xs text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={1}
                >
                  {check.detail}
                </Text>
              </View>
            </View>
          ))}
        </Panel>
      </Grid>

      {/* ── AI and accounts ── */}
      <Grid columns={layout.columns} gap={layout.compact ? 12 : 16} className="mt-4">
        <GridItem span={layout.columns === 3 ? 2 : 1}>
          <Panel
            title="Ollama tokens"
            meta="Per day · 30 days"
            right={<Link label="AI usage" onPress={() => open('ai')} />}
          >
            {ai.isPending ? (
              <Skeleton height={170} />
            ) : ollama?.series ? (
              <AreaChart
                labels={ollama.series.map((p) => usageBucketLabel(p.periodStart, 'day'))}
                stacked
                height={layout.compact ? 140 : 170}
                format={formatTokens}
                accessibilityLabel="Ollama tokens per day, last 30 days"
                series={[
                  {
                    key: 'in',
                    label: 'Input',
                    color: colors.info,
                    values: ollama.series.map((p) => p.promptTokens),
                  },
                  {
                    key: 'out',
                    label: 'Output',
                    color: colors.accent,
                    values: ollama.series.map((p) => p.completionTokens),
                  },
                ]}
              />
            ) : (
              <Text className="py-8 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
                {ollama
                  ? 'This server can’t split tokens by provider per day yet.'
                  : 'AI usage couldn’t be loaded.'}
              </Text>
            )}
          </Panel>
        </GridItem>
        <Panel title="Accounts" right={<Link label="Manage" onPress={() => open('users')} />}>
          {counts ? (
            <>
              <Text className="text-[26px] font-bold text-ink dark:text-ink-dark" style={NUM}>
                {formatCount(counts.all)}
              </Text>
              <Text className="mb-3 text-xs text-ink-muted dark:text-ink-dark-muted">
                {counts.admins} administrator{counts.admins === 1 ? '' : 's'}
              </Text>
              <ShareBar
                segments={[
                  { label: 'Approved', value: counts.approved, color: colors.accent },
                  { label: 'Waiting', value: counts.pending, color: colors.warning },
                  { label: 'Rejected', value: counts.rejected, color: colors.borderStrong },
                ]}
              />
              {latestUsers.length > 0 ? (
                <View className="mt-4 border-t border-line pt-3 dark:border-line-dark">
                  <Text className="mb-1 text-[11px] font-semibold text-ink-faint dark:text-ink-dark-faint">
                    Latest sign-ups
                  </Text>
                  {latestUsers.map((user) => (
                    <View key={user.id} className="flex-row items-center gap-2 py-1.5">
                      <Text
                        className="flex-1 text-[13px] text-ink dark:text-ink-dark"
                        numberOfLines={1}
                      >
                        {user.email}
                      </Text>
                      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                        {relativeTime(user.createdAt, now)}
                        {user.role === 'admin' ? ' · admin' : ''}
                      </Text>
                      <StatusPill
                        tone={APPROVAL[user.approvalStatus].tone}
                        label={APPROVAL[user.approvalStatus].label}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <Skeleton height={90} />
          )}
        </Panel>
      </Grid>

      {/* ── Services ── */}
      <GroupTitle
        title={
          health.data ? `Services · ${servicesUp} of ${health.data.services.length} up` : 'Services'
        }
        right={<Link label="Uptime history" onPress={() => open('health')} />}
      />
      {health.data ? (
        <Grid columns={layout.columns === 3 ? 4 : layout.columns === 2 ? 3 : 2} gap={12}>
          {health.data.services.map((row) => (
            <ServiceTile key={row.service} row={row} />
          ))}
        </Grid>
      ) : (
        <Skeleton height={120} className="rounded-card" />
      )}

      {/* ── Console ── */}
      {ADMIN_SECTION_GROUPS.map((group) => {
        const sections: ConsoleEntry[] = group.sections.map((section) => ({
          key: section.id,
          Icon: section.Icon,
          tone: section.tone,
          title: section.title,
          subtitle: section.subtitle,
          badge:
            section.id === 'users' && counts && counts.pending > 0
              ? `${counts.pending} waiting`
              : undefined,
          onPress: () => open(section.id),
        }));
        if (group.title === 'Control') {
          sections.push({
            key: 'recommendations',
            Icon: Sparkles,
            tone: 'amber',
            title: 'Recommendations engine',
            subtitle: 'Data session and manual runs',
            badge: undefined,
            onPress: () => router.push('/recommendations-admin'),
          });
        }
        return (
          <View key={group.title}>
            <GroupTitle title={group.title} />
            {layout.compact ? (
              <ListCard>
                {sections.map((section, index) => (
                  <View key={section.key}>
                    {index > 0 ? <RowDivider /> : null}
                    <MenuRow
                      Icon={section.Icon}
                      iconTone={section.tone}
                      title={section.title}
                      subtitle={section.badge ?? section.subtitle}
                      onPress={section.onPress}
                    />
                  </View>
                ))}
              </ListCard>
            ) : (
              <Grid columns={layout.columns === 3 ? 3 : 2} gap={12}>
                {sections.map((section) => (
                  <NavTile
                    key={section.key}
                    Icon={section.Icon}
                    tone={section.tone}
                    title={section.title}
                    subtitle={section.subtitle}
                    badge={section.badge}
                    onPress={section.onPress}
                  />
                ))}
              </Grid>
            )}
          </View>
        );
      })}
    </GroupScreen>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" hitSlop={8} onPress={onPress} className="active:opacity-60">
      <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
        {label}
      </Text>
    </Pressable>
  );
}

/** Admin console (web: /admin). The nav hides this tab for non-admins; it still guards itself. */
export default function AdminScreen() {
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  if (!isAdmin) {
    return (
      <GroupScreen>
        <AdminOnlyNotice />
      </GroupScreen>
    );
  }
  return <Console />;
}
