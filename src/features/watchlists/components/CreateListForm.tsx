import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useCreateWatchlist } from '@/features/watchlists/hooks';
import type { WatchlistItemInput, WatchlistView } from '@/features/watchlists/types';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

interface CreateListFormProps {
  /** Seed the new list with this stock (from the picker). */
  seed?: WatchlistItemInput;
  onCreated?: (view: WatchlistView) => void;
}

/** Inline "new list" field — cross-platform (Alert.prompt is iOS-only). */
export function CreateListForm({ seed, onCreated }: CreateListFormProps) {
  const { colors } = useTheme();
  const create = useCreateWatchlist();
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, items: seed ? [seed] : undefined },
      {
        onSuccess: (view) => {
          setName('');
          toast.success('List created', seed ? `${seed.symbol} added to ${view.name}.` : view.name);
          onCreated?.(view);
        },
        onError: (error) => toast.error('Couldn’t create list', getErrorMessage(error)),
      },
    );
  };

  return (
    <View className="flex-row items-center gap-2.5">
      <TextInput
        value={name}
        onChangeText={setName}
        maxLength={60}
        placeholder="New list name"
        placeholderTextColor={colors.textFaint}
        returnKeyType="done"
        onSubmitEditing={submit}
        accessibilityLabel="New list name"
        className="h-11 flex-1 rounded-field border border-line-strong px-3 text-[15px] text-ink dark:border-line-dark-strong dark:text-ink-dark"
      />
      <Button label="Create" disabled={!trimmed} loading={create.isPending} onPress={submit} />
    </View>
  );
}
