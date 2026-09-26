import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Pencil from 'lucide-react-native/icons/pencil';
import Plus from 'lucide-react-native/icons/plus';
import Trash from 'lucide-react-native/icons/trash';
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Note, Sheet } from '@/features/trading/components/Sheet';
import { formatINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { usePaperMutations } from '../hooks';
import { rupeesOnly } from '../lib/wallet';
import type { PaperProfile } from '../types';

/** The trigger: the active profile's name, opening the switcher. */
export function ProfileButton({ name, onPress }: { name: string | null; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Paper profile: ${name ?? 'Default'}. Change profile`}
      hitSlop={6}
      onPress={onPress}
      className="max-w-[150px] flex-row items-center gap-1 rounded-full border border-line-strong px-3 py-1.5 active:bg-surface-sunk dark:border-line-dark-strong dark:active:bg-surface-sunk-dark"
    >
      <Text
        className="flex-shrink text-[13px] font-semibold text-ink dark:text-ink-dark"
        numberOfLines={1}
      >
        {name ?? 'Default'}
      </Text>
      <ChevronDown size={14} color={colors.textMuted} />
    </Pressable>
  );
}

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'rename'; profile: PaperProfile };

/**
 * Switches between named paper profiles, each its own delivery and intraday account with its
 * own history — and creates, renames and deletes them. Mount it only while open, so a form
 * never carries a previous draft.
 */
export function ProfileSheet({
  profiles,
  activeId,
  onSelect,
  onClose,
}: {
  profiles: readonly PaperProfile[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const mutations = usePaperMutations();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState('');
  const [capital, setCapital] = useState('');
  const busy =
    mutations.createProfile.isPending ||
    mutations.renameProfile.isPending ||
    mutations.deleteProfile.isPending;

  const startCreate = () => {
    mutations.createProfile.reset();
    setName('');
    setStrategy('');
    setCapital('');
    setMode({ kind: 'create' });
  };
  const startRename = (profile: PaperProfile) => {
    mutations.renameProfile.reset();
    setName(profile.name);
    setStrategy(profile.strategy ?? '');
    setMode({ kind: 'rename', profile });
  };

  const capitalAmount = rupeesOnly(capital);
  const capitalError =
    capitalAmount !== null && (capitalAmount < 10_000 || capitalAmount > 100_000_000)
      ? 'Between ₹10,000 and ₹10 crore'
      : undefined;

  const submitCreate = () => {
    if (!name.trim() || capitalError || busy) return;
    mutations.createProfile.mutate(
      {
        name: name.trim(),
        strategy: strategy.trim() || null,
        ...(capitalAmount !== null ? { startingCapital: capitalAmount } : {}),
      },
      {
        onSuccess: (profile) => {
          onSelect(profile.id);
          toast.success('Profile created', `${profile.name} is now active.`);
          onClose();
        },
      },
    );
  };

  const submitRename = (profile: PaperProfile) => {
    if (!name.trim() || busy) return;
    mutations.renameProfile.mutate(
      { profileId: profile.id, name: name.trim(), strategy: strategy.trim() || null },
      {
        onSuccess: () => {
          toast.success('Profile updated', name.trim());
          setMode({ kind: 'list' });
        },
      },
    );
  };

  const confirmDelete = (profile: PaperProfile) =>
    Alert.alert(
      `Delete “${profile.name}”?`,
      'Its account, positions and order history are gone for good.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            mutations.deleteProfile.mutate(profile.id, {
              onSuccess: () => {
                // The default profile can't be deleted, so it's always a safe fallback.
                if (profile.id === activeId) {
                  const fallback = profiles.find(
                    (item) => item.isDefault && item.id !== profile.id,
                  );
                  if (fallback) onSelect(fallback.id);
                }
                toast.success('Profile deleted', profile.name);
              },
              onError: (error) => toast.error('Couldn’t delete it', getErrorMessage(error)),
            }),
        },
      ],
    );

  if (mode.kind === 'create' || mode.kind === 'rename') {
    const creating = mode.kind === 'create';
    const error = creating ? mutations.createProfile.error : mutations.renameProfile.error;
    return (
      <Sheet
        visible
        busy={busy}
        onClose={onClose}
        title={creating ? 'New paper profile' : `Edit “${mode.profile.name}”`}
        subtitle={
          creating
            ? 'Its own delivery and intraday account, orders and history'
            : 'The account and its history stay as they are'
        }
        footer={
          <View className="flex-row gap-2.5">
            <Button
              label="Back"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onPress={() => setMode({ kind: 'list' })}
            />
            <Button
              label={creating ? 'Create profile' : 'Save'}
              className="flex-1"
              disabled={!name.trim() || Boolean(creating && capitalError)}
              loading={busy}
              onPress={() => (creating ? submitCreate() : submitRename(mode.profile))}
            />
          </View>
        }
      >
        <View className="gap-3">
          <Input
            label="Profile name"
            value={name}
            onChangeText={setName}
            maxLength={60}
            autoFocus
            placeholder="e.g. Momentum test"
          />
          <Input
            label="Strategy label (optional)"
            value={strategy}
            onChangeText={setStrategy}
            maxLength={120}
            placeholder="e.g. Breakouts, held a week"
          />
          {creating ? (
            <Input
              label="Starting capital (optional)"
              value={capital}
              onChangeText={(text) => setCapital(text.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder="Default ₹5,00,000"
              error={capitalError}
              helperText={
                capitalAmount !== null && !capitalError ? formatINR(capitalAmount, 0) : undefined
              }
            />
          ) : null}
          {error ? <Banner tone="error" message={getErrorMessage(error)} /> : null}
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible
      busy={busy}
      onClose={onClose}
      title="Paper profiles"
      subtitle="Each profile is a separate practice account"
      footer={
        <Button
          label="New profile"
          variant="secondary"
          fullWidth
          leftIcon={<Plus size={16} color={colors.link} />}
          onPress={startCreate}
        />
      }
    >
      <ListCard>
        {profiles.map((profile, index) => {
          const selected = profile.id === activeId;
          return (
            <View key={profile.id}>
              {index > 0 ? <RowDivider /> : null}
              <View className="min-h-[60px] flex-row items-center gap-2 pl-3.5 pr-1.5">
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onSelect(profile.id);
                    onClose();
                  }}
                  className="min-w-0 flex-1 flex-row items-center gap-2.5 py-2.5 active:opacity-70"
                >
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text
                        className={
                          selected
                            ? 'flex-shrink text-sm font-bold text-brand-text dark:text-brand-text-dark'
                            : 'flex-shrink text-sm font-semibold text-ink dark:text-ink-dark'
                        }
                        numberOfLines={1}
                      >
                        {profile.name}
                      </Text>
                      {profile.isDefault ? <Badge label="Default" /> : null}
                    </View>
                    {profile.strategy ? (
                      <Text
                        className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                        numberOfLines={1}
                      >
                        {profile.strategy}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <Check size={18} color={colors.link} /> : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Rename ${profile.name}`}
                  hitSlop={6}
                  onPress={() => startRename(profile)}
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
                >
                  <Pencil size={16} color={colors.textMuted} />
                </Pressable>
                {!profile.isDefault ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${profile.name}`}
                    hitSlop={6}
                    onPress={() => confirmDelete(profile)}
                    className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
                  >
                    <Trash size={16} color={colors.danger} />
                  </Pressable>
                ) : (
                  <View className="h-9 w-9" />
                )}
              </View>
            </View>
          );
        })}
      </ListCard>
      <Note>
        F&O practice isn't part of these profiles — it keeps its own sandbox under F&O → Paper.
      </Note>
    </Sheet>
  );
}
