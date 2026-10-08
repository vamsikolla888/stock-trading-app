import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { DebateView } from '@/features/index-bot/components/DebateView';
import { BotNotice, BotQueryError, NUM } from '@/features/index-bot/components/parts';
import { StageSteps } from '@/features/index-bot/components/StageSteps';
import { TraceList } from '@/features/index-bot/components/TraceList';
import { useBotRun, useIsAdmin } from '@/features/index-bot/hooks';
import { outcomeView, proposalLabel, testScanView } from '@/features/index-bot/lib/view';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { formatDateTime } from '@/features/settings/lib/time';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/**
 * One scan of the index bot, explained: how far it got, the bull / bear / rebuttal debate, the
 * trader's proposal, what the risk engine measured and every step it logged. Read from the bot's
 * own record (GET /ai-autotrade/runs/:id), painted first from whichever list opened it, and
 * followed every few seconds while it is still running.
 */
export default function IndexBotRunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isAdmin = useIsAdmin();
  const query = useBotRun(id ?? null);
  const run = query.data;
  const view = run ? (run.dryRun ? testScanView(run) : outcomeView(run.outcome)) : null;

  return (
    <StackScreen
      title={run ? `Scan · ${formatDateTime(run.at)}` : 'Scan'}
      subtitle={
        run
          ? [
              run.dryRun ? 'Test scan' : null,
              run.mode === 'live' ? 'Live' : run.mode ? 'Paper' : null,
              proposalLabel(run) !== '—' ? proposalLabel(run) : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Index bot'
          : 'Index bot'
      }
      onRefresh={() => query.refetch()}
      fill
    >
      {!isAdmin ? (
        <BotNotice kind="admin" />
      ) : query.isPending ? (
        <ListSkeleton rows={5} />
      ) : !run || !view ? (
        <BotQueryError what="this scan" error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <View className="gap-3">
          <Panel
            title="Outcome"
            right={
              <StatusPill
                tone={view.tone}
                label={
                  run.dryRun
                    ? run.status === 'RUNNING'
                      ? 'Running'
                      : 'Test scan'
                    : outcomeView(run.outcome).label
                }
              />
            }
          >
            <Text className="text-[13px] leading-[19px] text-ink dark:text-ink-dark">
              {run.reason || 'No reason recorded.'}
            </Text>
            <StageSteps run={run} className="mt-3" />
            <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
              {run.status || '—'} · {formatDateTime(run.at)} IST
            </Text>
          </Panel>

          <DebateView run={run} />

          <Panel
            title="Every step"
            meta={run.mode ? (run.mode === 'live' ? 'live' : 'paper') : undefined}
          >
            <TraceList trace={run.trace} />
          </Panel>

          <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            Convictions and the trader’s confidence are the models’ own research scores, not
            probabilities. The only probability here is the historical one the risk engine measured.
          </Text>
        </View>
      )}
    </StackScreen>
  );
}
