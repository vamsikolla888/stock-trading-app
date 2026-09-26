import { useRouter } from 'expo-router';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Sparkles from 'lucide-react-native/icons/sparkles';
import UserCheck from 'lucide-react-native/icons/user-check';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { IconTile } from '@/components/ui/IconTile';
import { MenuRow } from '@/components/ui/MenuRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { AdminOnlyNotice } from '@/features/admin/components/AdminState';
import {
  useLiveness,
  usePlatformUsers,
  useReadiness,
  useRecServiceStatus,
} from '@/features/admin/hooks';
import { isAdminDenied } from '@/features/admin/lib/access';
import { buildOverviewServices, overviewTally } from '@/features/admin/lib/overview';
import { userCounts } from '@/features/admin/lib/users';
import { ADMIN_SECTION_GROUPS, type AdminSectionId } from '@/features/admin/sections';
import { useWorkflows } from '@/features/automations/hooks';
import { StatusDot } from '@/features/settings/components/StatusPill';
import { formatClock, formatDateTime } from '@/features/settings/lib/time';
import { useBrokerConnections } from '@/features/trading/hooks';
import { useAuthStore } from '@/store/authStore';

function AdminOverview() {
  const router = useRouter();
  const liveness = useLiveness();
  const readiness = useReadiness();
  const workflows = useWorkflows();
  const connections = useBrokerConnections();
  const recService = useRecServiceStatus();
  const users = usePlatformUsers();

  const services = useMemo(
    () =>
      buildOverviewServices({
        liveness: liveness.data,
        readiness: readiness.data,
        workflows: workflows.data?.summary,
        mstock: {
          loaded: !connections.isPending,
          connection: connections.data?.find((connection) => connection.broker === 'mstock'),
        },
        recService: recService.data,
        formatTime: formatDateTime,
      }),
    [
      liveness.data,
      readiness.data,
      workflows.data,
      connections.isPending,
      connections.data,
      recService.data,
    ],
  );
  const tally = overviewTally(services);
  const pending = users.data ? userCounts(users.data).pending : 0;
  const probing = liveness.isPending || readiness.isPending;
  const checkedAt = Math.max(liveness.dataUpdatedAt, readiness.dataUpdatedAt);

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
    ]);

  if (isAdminDenied(users.error)) {
    return (
      <GroupScreen onRefresh={onRefresh}>
        <AdminOnlyNotice message="Your account no longer has administrator access." />
      </GroupScreen>
    );
  }

  const healthy = tally.bad === 0 && tally.warn === 0;

  return (
    <GroupScreen onRefresh={onRefresh} intro="What the platform is doing right now.">
      {probing ? (
        <ListSkeleton rows={3} />
      ) : (
        <View className="flex-row items-center gap-3.5 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          <IconTile
            Icon={healthy ? CircleCheck : CircleAlert}
            tone={tally.bad > 0 ? 'rose' : healthy ? 'green' : 'amber'}
            size="lg"
          />
          <View className="flex-1">
            <Text
              accessibilityRole="header"
              className="text-base font-bold text-ink dark:text-ink-dark"
            >
              {healthy
                ? 'All checks passing'
                : `${tally.bad + tally.warn} check${tally.bad + tally.warn === 1 ? '' : 's'} need attention`}
            </Text>
            <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
              {checkedAt > 0 ? `Checked ${formatClock(checkedAt)} · every 30s` : 'Checking…'}
            </Text>
          </View>
        </View>
      )}

      {pending > 0 ? (
        <Banner
          tone="warning"
          className="mt-3"
          title={`${pending} sign-up${pending === 1 ? '' : 's'} waiting`}
          message="New accounts can’t sign in until an administrator approves them."
          action={{ label: 'Review users', onPress: () => open('users') }}
        />
      ) : null}

      <Section title="Live status">
        <ListCard>
          {services.map((service, index) => (
            <View key={service.name}>
              {index > 0 ? <RowDivider /> : null}
              <View
                accessible
                accessibilityLabel={`${service.name}: ${service.detail}`}
                className="flex-row items-start gap-3 px-3.5 py-3"
              >
                <View className="pt-1.5">
                  <StatusDot tone={service.tone} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                    {service.name}
                  </Text>
                  <Text
                    className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={3}
                  >
                    {service.detail}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </ListCard>
        <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Every row is a live check. Latency, pool and disk figures aren’t estimated here — see
          Service health and Server analytics.
        </Text>
      </Section>

      {ADMIN_SECTION_GROUPS.map((group) => (
        <Section key={group.title} title={group.title}>
          <ListCard>
            {group.sections.map((section, index) => (
              <View key={section.id}>
                {index > 0 ? <RowDivider /> : null}
                <MenuRow
                  Icon={section.id === 'users' && pending > 0 ? UserCheck : section.Icon}
                  iconTone={section.tone}
                  title={section.title}
                  subtitle={
                    section.id === 'users' && pending > 0
                      ? `${pending} waiting for approval`
                      : section.subtitle
                  }
                  onPress={() => open(section.id)}
                />
              </View>
            ))}
            {group.title === 'Control' ? (
              <>
                <RowDivider />
                <MenuRow
                  Icon={Sparkles}
                  iconTone="amber"
                  title="Recommendations engine"
                  subtitle="Data session and manual runs"
                  onPress={() => router.push('/recommendations-admin')}
                />
              </>
            ) : null}
          </ListCard>
        </Section>
      ))}
    </GroupScreen>
  );
}

/** Admin console overview (web: /admin). The nav hides this tab for non-admins; it still guards itself. */
export default function AdminScreen() {
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  if (!isAdmin) {
    return (
      <GroupScreen>
        <AdminOnlyNotice />
      </GroupScreen>
    );
  }
  return <AdminOverview />;
}
