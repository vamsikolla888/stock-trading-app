import React from 'react';
import { Text, View } from 'react-native';

import { formatCount, formatMs, formatUptimePct, uptimeTone } from '@/features/admin/lib/format';
import { serviceDescription, serviceName, serviceState } from '@/features/admin/lib/services';
import type { ServiceHealthRow } from '@/features/admin/types';
import { StatusPill } from '@/features/settings/components/StatusPill';
import type { StatusTone } from '@/features/settings/lib/status';
import { formatDateTime } from '@/features/settings/lib/time';
import { cn } from '@/lib/utils/cn';

import { UptimeStrip } from './OpsBits';

const NUM = { fontVariant: ['tabular-nums' as const] };

const UPTIME_TEXT: Record<StatusTone, string> = {
  ok: 'text-ink dark:text-ink-dark',
  warn: 'text-warning-600 dark:text-warning-dark',
  bad: 'text-danger-600 dark:text-danger-dark',
  info: 'text-info dark:text-info-dark',
  neutral: 'text-ink-muted dark:text-ink-dark-muted',
};

/**
 * One dependency at a glance: name, Up/Down, latency and uptime, and its recent history as a
 * strip of checks. A failing service says why in one line.
 */
export function ServiceTile({
  row,
  detail = false,
  className,
}: {
  row: ServiceHealthRow;
  detail?: boolean;
  className?: string;
}) {
  const state = serviceState(row);
  const uptime = uptimeTone(row.uptimePct);
  const description = serviceDescription(row.service);
  return (
    <View
      accessible
      accessibilityLabel={`${serviceName(row.service)}: ${state.label}, uptime ${formatUptimePct(row.uptimePct)}`}
      className={cn(
        'gap-3 rounded-card border border-line bg-surface p-3.5 dark:border-line-dark dark:bg-surface-dark',
        className,
      )}
    >
      <View className="flex-row items-start gap-2">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={2}>
            {serviceName(row.service)}
          </Text>
          {detail && description ? (
            <Text
              className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
              numberOfLines={1}
            >
              {description}
            </Text>
          ) : null}
        </View>
        <StatusPill tone={state.tone} label={state.label} />
      </View>
      <View className="flex-row items-baseline justify-between gap-2">
        <Text
          className={cn('text-[17px] font-bold', UPTIME_TEXT[uptime])}
          style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.3 }}
        >
          {formatUptimePct(row.uptimePct)}
        </Text>
        <Text
          className="text-xs text-ink-muted dark:text-ink-dark-muted"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {row.latencyMs != null ? formatMs(row.latencyMs) : 'no latency'}
        </Text>
      </View>
      <UptimeStrip
        series={row.series}
        accessibilityLabel={`${serviceName(row.service)} uptime history`}
      />
      {detail ? (
        <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" style={NUM}>
          {formatCount(row.checks)} checks
          {row.failures > 0 ? ` · ${formatCount(row.failures)} failed` : ' · none failed'}
          {row.avgLatencyMs != null ? ` · avg ${formatMs(row.avgLatencyMs)}` : ''}
        </Text>
      ) : null}
      {!row.ok && row.detail ? (
        <Text
          className="text-[11px] leading-4 text-danger-600 dark:text-danger-dark"
          numberOfLines={detail ? 4 : 2}
          selectable
        >
          {row.detail}
        </Text>
      ) : detail ? (
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {row.lastFailureAt
            ? `Last failure ${formatDateTime(row.lastFailureAt)}`
            : 'No failures recorded'}
        </Text>
      ) : null}
    </View>
  );
}
