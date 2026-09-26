import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Pause from 'lucide-react-native/icons/pause';
import Play from 'lucide-react-native/icons/play';
import Search from 'lucide-react-native/icons/search';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import { useRecentLogs } from '@/features/admin/hooks';
import { logLevelLabel, logLevelTone } from '@/features/admin/lib/format';
import type { LogRecord } from '@/features/admin/types';
import { JsonBlock, monoFont } from '@/features/settings/components/JsonBlock';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { formatClock } from '@/features/settings/lib/time';
import { useTheme } from '@/theme/ThemeProvider';

type LevelKey = '10' | '30' | '40' | '50';
const LEVELS: readonly { key: LevelKey; label: string }[] = [
  { key: '10', label: 'All' },
  { key: '30', label: 'Info +' },
  { key: '40', label: 'Warnings +' },
  { key: '50', label: 'Errors' },
];
const PAGE = 50;

type Line = LogRecord & { key: string };

/** Stable keys: neither the time (three processes log in the same ms) nor the index works. */
function withKeys(logs: readonly LogRecord[]): Line[] {
  const seen = new Map<string, number>();
  return logs.map((log) => {
    const base = `${log.time}:${log.pid}:${log.msg.slice(0, 32)}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return { ...log, key: `${base}:${count}` };
  });
}

function LogRow({
  line,
  expanded,
  onToggle,
}: {
  line: Line;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const hasExtra = Boolean(line.extra && Object.keys(line.extra).length > 0);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${logLevelLabel(line.level)} from ${line.proc} at ${formatClock(line.time)}: ${line.msg}`}
        onPress={onToggle}
        className="gap-1.5 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <View className="flex-row items-center gap-2">
          <StatusPill tone={logLevelTone(line.level)} label={logLevelLabel(line.level)} />
          <Text
            className="flex-1 text-[11px] text-ink-faint dark:text-ink-dark-faint"
            numberOfLines={1}
          >
            {formatClock(line.time)} · {line.proc}
            {line.reqId ? ` · ${line.reqId.slice(0, 8)}` : ''}
          </Text>
          <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
            <ChevronDown size={16} color={colors.textFaint} />
          </View>
        </View>
        <Text
          className="text-[13px] leading-[18px] text-ink dark:text-ink-dark"
          numberOfLines={expanded ? undefined : 2}
          selectable={expanded}
        >
          {line.msg}
        </Text>
      </Pressable>
      {expanded ? (
        <View className="gap-3 px-3.5 pb-3.5">
          <View className="gap-1">
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" selectable>
              Process {line.proc} · pid {line.pid}
            </Text>
            {line.reqId ? (
              <Text
                className="text-[11px] text-ink-muted dark:text-ink-dark-muted"
                style={{ fontFamily: monoFont }}
                selectable
              >
                Request {line.reqId}
              </Text>
            ) : null}
          </View>
          {hasExtra ? <JsonBlock label="Details" value={line.extra} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Recent server log lines (web: Logs). The web tails a live socket across every process;
 * the app reads the REST ring of the API process it reaches, refreshed every 10 seconds.
 */
export function LogsPanel() {
  const { colors } = useTheme();
  const [level, setLevel] = useState<LevelKey>('10');
  const [proc, setProc] = useState('all');
  const [query, setQuery] = useState('');
  const [live, setLive] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const logs = useRecentLogs(Number(level), live);

  const lines = useMemo(() => withKeys(logs.data?.logs ?? []).reverse(), [logs.data]);
  const processes = useMemo(() => {
    const names = [...new Set(lines.map((line) => line.proc))].sort();
    return [
      { key: 'all', label: 'All processes' },
      ...names.map((name) => ({ key: name, label: name })),
    ];
  }, [lines]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter(
      (line) =>
        (proc === 'all' || line.proc === proc) &&
        (!q ||
          line.msg.toLowerCase().includes(q) ||
          line.proc.toLowerCase().includes(q) ||
          (line.reqId ?? '').toLowerCase().includes(q)),
    );
  }, [lines, proc, query]);
  const counts = useMemo(
    () => ({
      errors: lines.filter((line) => line.level >= 50).length,
      warnings: lines.filter((line) => line.level >= 40 && line.level < 50).length,
    }),
    [lines],
  );

  return (
    <StackScreen
      title="Logs"
      subtitle={
        logs.data
          ? `${matches.length} lines${counts.errors ? ` · ${counts.errors} errors` : ''}${counts.warnings ? ` · ${counts.warnings} warnings` : ''}`
          : 'Recent server lines'
      }
      onRefresh={() => logs.refetch()}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={live ? 'Pause auto-refresh' : 'Resume auto-refresh'}
          hitSlop={8}
          onPress={() => setLive((on) => !on)}
          className="flex-row items-center gap-1.5 rounded-full bg-surface-sunk px-3 py-1.5 active:opacity-70 dark:bg-surface-sunk-dark"
        >
          {live ? <Pause size={14} color={colors.text} /> : <Play size={14} color={colors.text} />}
          <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
            {live ? 'Live' : 'Paused'}
          </Text>
        </Pressable>
      }
    >
      <Chips
        items={LEVELS}
        value={level}
        onChange={(key) => {
          setLevel(key);
          setLimit(PAGE);
        }}
      />
      {processes.length > 2 ? (
        <Chips items={processes} value={proc} onChange={setProc} className="mt-2" />
      ) : null}
      <Input
        containerClassName="mt-3"
        placeholder="Filter by message, process or request id"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Filter logs"
        leftIcon={<Search size={18} color={colors.textFaint} />}
      />

      <View className="mt-4">
        {logs.isPending ? (
          <ListSkeleton rows={5} />
        ) : !logs.data ? (
          <AdminQueryError what="logs" error={logs.error} onRetry={() => void logs.refetch()} />
        ) : matches.length === 0 ? (
          <InlineEmpty
            title={lines.length === 0 ? 'No log lines yet' : 'No lines match'}
            message={
              lines.length === 0
                ? 'Nothing at this level has been logged by this process recently.'
                : 'Try a lower level, another process or a different search.'
            }
          />
        ) : (
          <>
            <ListCard>
              {matches.slice(0, limit).map((line, index) => (
                <View key={line.key}>
                  {index > 0 ? <RowDivider /> : null}
                  <LogRow
                    line={line}
                    expanded={expanded === line.key}
                    onToggle={() =>
                      setExpanded((current) => (current === line.key ? null : line.key))
                    }
                  />
                </View>
              ))}
            </ListCard>
            {matches.length > limit ? (
              <Button
                label={`Show ${Math.min(PAGE, matches.length - limit)} more`}
                variant="outline"
                fullWidth
                className="mt-3"
                onPress={() => setLimit((current) => current + PAGE)}
              />
            ) : null}
          </>
        )}
      </View>
      <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Newest first. Shows the recent lines held by the API process that answered — background
        workers’ lines appear in the web console’s live tail.
        {logs.data?.logDir ? ` Full logs are written to ${logs.data.logDir} on the server.` : ''}
      </Text>
    </StackScreen>
  );
}
