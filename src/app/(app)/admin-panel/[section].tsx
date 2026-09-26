import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';

import { InlineEmpty } from '@/components/common/InlineError';
import { StackScreen } from '@/components/navigation/StackScreen';
import { AdminOnlyNotice } from '@/features/admin/components/AdminState';
import { AiUsagePanel } from '@/features/admin/panels/AiUsagePanel';
import { AnalyticsPanel } from '@/features/admin/panels/AnalyticsPanel';
import { BrokerUsagePanel } from '@/features/admin/panels/BrokerUsagePanel';
import { BrowserResearchPanel } from '@/features/admin/panels/BrowserResearchPanel';
import { DataSourcesPanel } from '@/features/admin/panels/DataSourcesPanel';
import { HealthPanel } from '@/features/admin/panels/HealthPanel';
import { JobsPanel } from '@/features/admin/panels/JobsPanel';
import { LogsPanel } from '@/features/admin/panels/LogsPanel';
import { TradingPanel } from '@/features/admin/panels/TradingPanel';
import { UsersPanel } from '@/features/admin/panels/UsersPanel';
import { adminSection, type AdminSectionId } from '@/features/admin/sections';
import { useAuthStore } from '@/store/authStore';

/** One screen per admin console section; each panel owns its StackScreen. */
const PANELS: Record<AdminSectionId, React.ComponentType> = {
  health: HealthPanel,
  analytics: AnalyticsPanel,
  logs: LogsPanel,
  jobs: JobsPanel,
  'browser-research': BrowserResearchPanel,
  ai: AiUsagePanel,
  'broker-usage': BrokerUsagePanel,
  data: DataSourcesPanel,
  users: UsersPanel,
  trading: TradingPanel,
};

/** Admin console detail (web: an AdminConsole tab). Guards itself — the panels never mount for a non-admin. */
export default function AdminPanelScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section: string }>();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const meta = adminSection(section);

  if (!isAdmin) {
    return (
      <StackScreen title={meta?.title ?? 'Admin console'}>
        <AdminOnlyNotice />
      </StackScreen>
    );
  }

  if (!meta) {
    return (
      <StackScreen title="Not found">
        <InlineEmpty
          title="This admin page doesn’t exist"
          message="It may have been renamed or removed. Every section is listed in the admin console."
          action={{
            label: 'Open the admin console',
            onPress: () => router.replace('/settings/admin'),
          }}
        />
      </StackScreen>
    );
  }

  const Panel = PANELS[meta.id];
  return <Panel />;
}
