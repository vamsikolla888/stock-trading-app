import React from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8 py-12">
      {icon}
      <Text className="text-center text-lg font-semibold text-ink dark:text-ink-dark">{title}</Text>
      {description ? (
        <Text className="text-center text-sm text-ink-muted dark:text-ink-dark-muted">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="outline" onPress={onAction} />
      ) : null}
    </View>
  );
}
