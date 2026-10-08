import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { SplitColumns } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { Button } from '@/components/ui/Button';

import { managementRules, methodSteps } from '../../lib/houseView';
import type { SwingConfig } from '../../types';
import { BulletList } from './HouseBits';

/**
 * The strategy in full: the six steps (worded from the scan's own thresholds), how a trade is
 * managed, what it cannot check, and where its setups go.
 */
export function RulesTab({ config }: { config: SwingConfig | null }) {
  const router = useRouter();
  const layout = useScreenLayout();

  if (!config) {
    return (
      <InlineEmpty
        title="Rules unavailable"
        message="The server didn’t send this strategy’s thresholds, so its rules can’t be written out."
      />
    );
  }

  const steps = (
    <Panel title="The six steps" meta="judged after every close">
      <View className="gap-4">
        {methodSteps(config).map((step, index) => (
          <View key={step.title} className="flex-row gap-3">
            <View className="h-6 w-6 items-center justify-center rounded-full bg-surface-sunk dark:bg-surface-sunk-dark">
              <Text className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
                {index + 1}
              </Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[14px] font-semibold text-ink dark:text-ink-dark">
                {step.title}
              </Text>
              <Text className="mt-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
                {step.body}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Panel>
  );

  const side = (
    <View className={layout.columns > 1 ? 'gap-4' : 'mt-4 gap-4'}>
      <Panel title="Managing the trade">
        <BulletList items={managementRules(config)} />
      </Panel>
      <Panel title="Not checked">
        <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          ASM/GSM lists, circuit limits, delivery % and FII/DII flows — no data source here. Check
          them on NSE before you trade.
        </Text>
      </Panel>
      <Panel title="Where it is used">
        <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          Setups that hold up at the 09:30 open can become Strong picks.
        </Text>
        <Button
          label="Open Strong picks"
          variant="link"
          className="mt-2 self-start"
          onPress={() => router.push('/strong-picks')}
        />
      </Panel>
    </View>
  );

  return <SplitColumns split={layout.columns > 1} gap={16} left={steps} right={side} />;
}
