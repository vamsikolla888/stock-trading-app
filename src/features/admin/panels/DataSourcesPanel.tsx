import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { SplitColumns } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { StackScreen } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { useCatalogAction, useRecServiceStatus } from '@/features/admin/hooks';
import { dataSourceRows } from '@/features/admin/lib/dataSources';
import type { CatalogAction, CatalogActionResult } from '@/features/admin/types';
import { useWorkflows } from '@/features/automations/hooks';
import { JsonBlock } from '@/features/settings/components/JsonBlock';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatDateTime } from '@/features/settings/lib/time';
import { useBrokerConnections } from '@/features/trading/hooks';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

const CATALOG_ACTIONS: readonly {
  id: CatalogAction;
  label: string;
  detail: string;
  confirm: string;
}[] = [
  {
    id: 'sync',
    label: 'Sync instrument master',
    detail:
      'Re-reads the broker’s full instrument list into the stock catalog. Needs the service user.',
    confirm: 'Re-reads every instrument from the broker and updates the catalog.',
  },
  {
    id: 'groww',
    label: 'Sync stocks and logos from Groww',
    detail: 'Queues the Groww job: new stocks, search details and logos. Follow it under Jobs.',
    confirm: 'Queues a long-running worker job. Only one can be pending at a time.',
  },
  {
    id: 'snapshots',
    label: 'Refresh price snapshots',
    detail: 'Re-prices the tracked universe — one broker request per exchange.',
    confirm: 'Re-prices every tracked stock from the broker now.',
  },
];

function humanize(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function ResultSummary({ result }: { result: CatalogActionResult }) {
  const entries = Object.entries(result.result);
  const simple = entries.every(
    ([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value),
  );
  const label =
    CATALOG_ACTIONS.find((action) => action.id === result.action)?.label ?? result.action;
  return (
    <Card className="mt-3 gap-1">
      <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
        Last run · {label}
      </Text>
      {simple && entries.length > 0 ? (
        entries.map(([key, value], index) => (
          <KeyValueRow
            key={key}
            label={humanize(key)}
            value={
              value === null
                ? '—'
                : typeof value === 'number'
                  ? value.toLocaleString('en-IN')
                  : String(value)
            }
            divider={index > 0}
          />
        ))
      ) : (
        <JsonBlock value={result.result} />
      )}
    </Card>
  );
}

/** Feed freshness and catalog maintenance (web: Data sources). */
export function DataSourcesPanel() {
  const layout = useScreenLayout();
  const connections = useBrokerConnections();
  const workflows = useWorkflows();
  const recService = useRecServiceStatus();
  const catalog = useCatalogAction();
  const [running, setRunning] = useState<CatalogAction | null>(null);

  const rows = dataSourceRows({
    recService: recService.data,
    connections: connections.data,
    // Undefined while loading; null once n8n could not be read (unconfigured or down).
    workflows: workflows.data ? workflows.data.summary : workflows.isError ? null : undefined,
  });
  const live = rows.filter((row) => row.tone === 'ok').length;

  const runAction = (action: (typeof CATALOG_ACTIONS)[number]) =>
    confirmAction({
      title: `${action.label}?`,
      message: `${action.confirm} This writes to the production catalog.`,
      confirmLabel: 'Run',
      onConfirm: () => {
        setRunning(action.id);
        catalog.mutate(action.id, {
          onSuccess: () => toast.success('Done', action.label),
          onError: (error) => toast.error('Couldn’t run it', getErrorMessage(error)),
          onSettled: () => setRunning(null),
        });
      },
    });

  return (
    <StackScreen
      title="Data sources"
      subtitle="Where market data and news come from"
      fill
      onRefresh={() =>
        Promise.all([connections.refetch(), workflows.refetch(), recService.refetch()])
      }
    >
      <SplitColumns
        split={!layout.compact}
        left={
          <Section title="Sources" note={`${live} of ${rows.length} live`} className="mt-0">
            <ListCard>
              {rows.map((row, index) => (
                <View key={row.name}>
                  {index > 0 ? <RowDivider /> : null}
                  <View className="gap-1.5 px-3.5 py-3">
                    <View className="flex-row items-start gap-3">
                      <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
                        {row.name}
                      </Text>
                      <StatusPill tone={row.tone} label={row.label} />
                    </View>
                    <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                      {row.feeds} · {row.scope}
                    </Text>
                    <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
                      Last update {row.updated ? formatDateTime(row.updated) : '—'}
                    </Text>
                  </View>
                </View>
              ))}
            </ListCard>
            <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
              Every row is read live from the server. Your own broker sessions are listed once
              connected.
            </Text>
          </Section>
        }
        right={
          <Section
            title="Catalog maintenance"
            note="Writes · admin only"
            className={layout.compact ? undefined : 'mt-0'}
          >
            <ListCard>
              {CATALOG_ACTIONS.map((action, index) => (
                <View key={action.id}>
                  {index > 0 ? <RowDivider /> : null}
                  <View className="flex-row items-center gap-3 px-3.5 py-3">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                        {action.label}
                      </Text>
                      <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                        {action.detail}
                      </Text>
                    </View>
                    <Button
                      label="Run"
                      size="sm"
                      variant="outline"
                      disabled={catalog.isPending && running !== action.id}
                      loading={running === action.id}
                      onPress={() => runAction(action)}
                    />
                  </View>
                </View>
              ))}
            </ListCard>
            {catalog.data ? <ResultSummary result={catalog.data} /> : null}
          </Section>
        }
      />
    </StackScreen>
  );
}
