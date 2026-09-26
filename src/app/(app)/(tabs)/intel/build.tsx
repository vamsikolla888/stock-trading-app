import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Text, View } from 'react-native';

import { GroupScreen } from '@/components/navigation/GroupScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { StrategyFormFields, useStrategyForm } from '@/features/strategies/components/StrategyForm';
import { useCreateStrategy, useStrategyTemplates } from '@/features/strategies/hooks';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

/**
 * Compose a strategy: pick a template, adjust the conditions, save. Saving never runs
 * anything — the backtest is started from the strategy's own screen. (Editing an existing
 * strategy happens in place on that screen, with the same form.)
 */
export default function StrategyBuilderScreen() {
  const router = useRouter();
  const templates = useStrategyTemplates();
  const create = useCreateStrategy();
  const form = useStrategyForm();

  const save = async () => {
    if (!form.validation.valid) {
      form.setShowErrors(true);
      toast.error(
        'Check the highlighted fields',
        'The strategy needs a name, an entry and an exit.',
      );
      return;
    }
    try {
      const saved = await create.mutateAsync(form.body());
      toast.success('Strategy saved', 'Run a backtest to see how it would have done.');
      form.reset();
      create.reset();
      router.push({ pathname: '/strategy/[id]', params: { id: saved.id } });
    } catch {
      // Shown in the banner below.
    }
  };

  const confirmReset = () =>
    Alert.alert('Start over?', 'This clears the form back to the starting rule.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start over', style: 'destructive', onPress: () => form.reset() },
    ]);

  return (
    <GroupScreen
      intro="Pick a starting point, then adjust the rules. Nothing runs until you press Run backtest."
      right={
        form.dirty ? (
          <Button label="Reset" variant="link" size="sm" onPress={confirmReset} />
        ) : undefined
      }
      footer={
        <View className="border-t border-line bg-canvas px-5 pb-3 pt-3 dark:border-line-dark dark:bg-canvas-dark">
          <Button
            label="Save strategy"
            loading={create.isPending}
            disabled={create.isPending}
            fullWidth
            onPress={() => void save()}
          />
        </View>
      }
    >
      {create.error ? (
        <Banner
          tone="error"
          title="Couldn't save"
          message={getErrorMessage(create.error)}
          className="mb-2"
        />
      ) : null}
      <StrategyFormFields
        form={form}
        templates={templates.data ?? []}
        templatesLoading={templates.isPending}
      />
      <Text className="mt-6 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Not investment advice — review before acting.
      </Text>
    </GroupScreen>
  );
}
