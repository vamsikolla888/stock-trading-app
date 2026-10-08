import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import { formatINR } from '@/lib/utils/formatters';
import { isServerOutdated } from '@/services/api/contract';
import { useTheme } from '@/theme/ThemeProvider';

import { isoDayLabel, runningOf, targetParams } from '../lib/view';
import type { DeployMode, Deployment, DeploymentList, DeployTarget } from '../types';
import { DeploymentView } from './DeploymentView';
import { ModeBadge } from './parts';

/**
 * The Deployment tab of a strategy page (a user's own, the platform swing, the intraday platform
 * strategy): the running deployment — or a choice between paper and live when both run — and the
 * past ones under it. Not deployed: the two ways in, paper first.
 */
export function DeploymentTab({
  target,
  query,
  onDeploy,
}: {
  target: DeployTarget;
  query: {
    data: DeploymentList | undefined;
    isPending: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  onDeploy: (mode: DeployMode) => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const list = query.data;

  if (!list) {
    if (query.isPending) return <ListSkeleton rows={5} />;
    if (isServerOutdated(query.error)) {
      return (
        <InlineEmpty
          title="Needs a newer server"
          message="Deployments aren’t available on the server this app is connected to yet."
        />
      );
    }
    return (
      <InlineError what="deployments" error={query.error} onRetry={() => void query.refetch()} />
    );
  }

  const current = runningOf(list.deployments);
  const past = list.deployments.filter((d) => d.status === 'stopped');
  const selected = current.find((d) => d.id === pick) ?? current[0] ?? null;

  return (
    <View>
      {selected ? (
        <>
          {current.length > 1 ? (
            <SegmentedControl
              items={current.map((d) => ({
                key: d.id,
                label: d.mode === 'live' ? 'Live' : 'Paper',
              }))}
              value={selected.id}
              onChange={setPick}
              className="mb-3"
            />
          ) : null}
          <DeploymentView
            key={selected.id}
            target={target}
            dep={selected}
            list={list}
            onEdit={() => onDeploy(selected.mode)}
            canAddOther={current.length < 2}
            onDeploy={onDeploy}
          />
        </>
      ) : (
        <NotDeployed list={list} onDeploy={onDeploy} />
      )}
      {past.length > 0 ? <PastList target={target} past={past} /> : null}
    </View>
  );
}

function NotDeployed({
  list,
  onDeploy,
}: {
  list: DeploymentList;
  onDeploy: (mode: DeployMode) => void;
}) {
  const paper = list.defaults.paper;
  return (
    <Card>
      <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">Not deployed</Text>
      <Text className="mt-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {`Run it on your paper wallet first — ${formatINR(paper.capitalPerTrade, 0)} a trade by default — or live with real money.`}
      </Text>
      <View className="mt-4 flex-row gap-2.5">
        <Button
          label="Deploy to paper"
          size="sm"
          className="flex-1"
          onPress={() => onDeploy('paper')}
        />
        <Button
          label="Deploy live"
          size="sm"
          variant="outline"
          className="flex-1"
          onPress={() => onDeploy('live')}
        />
      </View>
    </Card>
  );
}

function PastList({ target, past }: { target: DeployTarget; past: readonly Deployment[] }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Section title="Past deployments">
      <ListCard>
        {past.map((d, i) => (
          <React.Fragment key={d.id}>
            {i > 0 ? <RowDivider /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Opens its trades"
              onPress={() =>
                router.push({
                  pathname: '/deployment/[id]',
                  params: { id: d.id, section: 'trades', ...targetParams(target) },
                })
              }
              className="flex-row items-center gap-3 px-4 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
            >
              <ModeBadge mode={d.mode} />
              <View className="min-w-0 flex-1">
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                  {`${isoDayLabel(d.startedAt)} → ${d.stoppedAt ? isoDayLabel(d.stoppedAt) : '—'}`}
                </Text>
                <Text
                  className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={1}
                >
                  {`${d.symbols.length ? `${d.symbols.length} stocks` : 'all stocks'} · ${formatINR(d.capitalPerTrade, 0)} a trade`}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textMuted} />
            </Pressable>
          </React.Fragment>
        ))}
      </ListCard>
    </Section>
  );
}
