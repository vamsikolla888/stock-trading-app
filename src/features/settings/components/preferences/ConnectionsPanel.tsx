import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { PanelLink, RowsSkeleton, SettingDivider } from '@/features/settings/components/SettingRow';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { brokerRows, connectionState, type BrokerRow } from '@/features/settings/lib/preferences';
import { useBrokerCatalog, useBrokerConnections } from '@/features/trading/hooks';
import { useTheme } from '@/theme/ThemeProvider';

function BrokerLine({ row, onPress }: { row: BrokerRow; onPress: () => void }) {
  const { colors } = useTheme();
  const state = connectionState(row.connection);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.label}, ${state.word}${state.detail ? `. ${state.detail}` : ''}`}
      accessibilityHint={row.connection ? 'Opens broker connections' : 'Connect this broker'}
      onPress={onPress}
      className="min-h-[60px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-sunk dark:border-line-dark dark:bg-surface-sunk-dark">
        <Text className="text-[13px] font-semibold text-ink-muted dark:text-ink-dark-muted">
          {row.label.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">{row.label}</Text>
          <StatusPill tone={state.tone} label={state.word} />
        </View>
        {state.detail ? (
          <Text
            className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={2}
          >
            {state.detail}
          </Text>
        ) : null}
      </View>
      <Text className="text-xs font-semibold text-brand-text dark:text-brand-text-dark">
        {row.connection ? 'Manage' : 'Connect'}
      </Text>
      <ChevronRight size={14} color={colors.link} />
    </Pressable>
  );
}

/**
 * Preferences › Broker connections (web: ConnectionsPanel) — every broker the catalog offers,
 * each with its state in a word. A failed read says so: it never falls back to "Not connected"
 * for every broker.
 */
export function ConnectionsPanel() {
  const router = useRouter();
  const connections = useBrokerConnections();
  const catalog = useBrokerCatalog();
  const rows = useMemo(
    () => brokerRows(connections.data, catalog.data),
    [connections.data, catalog.data],
  );
  const open = () => router.push('/brokers');

  return (
    <Panel
      title="Broker connections"
      flush
      right={<PanelLink label="Manage" onPress={open} />}
      footer="Paper trading works without a broker."
    >
      {connections.isPending ? (
        <RowsSkeleton rows={2} />
      ) : !connections.data ? (
        <View className="px-4">
          <InlineError
            what="your broker connections"
            error={connections.error}
            onRetry={() => void connections.refetch()}
          />
        </View>
      ) : (
        rows.map((row, index) => (
          <View key={row.id}>
            {index > 0 ? <SettingDivider /> : null}
            <BrokerLine row={row} onPress={open} />
          </View>
        ))
      )}
    </Panel>
  );
}
