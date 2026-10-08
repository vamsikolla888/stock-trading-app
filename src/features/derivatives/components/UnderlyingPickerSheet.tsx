import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { InstrumentMark } from '@/features/fno/components/Glyphs';
import { Tag } from '@/features/fno/components/primitives';
import { Sheet } from '@/features/fno/components/Sheet';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { usePaperUnderlyings } from '../hooks';
import { matchUnderlyings } from '../lib/book';

/**
 * Pick one of the ~218 underlyings with listed derivatives. The indices — most of the traded
 * volume — get a permanent row of chips; the field matches by prefix before substring, so
 * typing "RE" offers RELIANCE before names that merely contain those letters.
 */
export function UnderlyingPickerSheet({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: string | null;
  onPick: (underlying: string) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const catalogue = usePaperUnderlyings();
  const [q, setQ] = useState('');
  const list = useMemo(() => catalogue.data ?? [], [catalogue.data]);
  const indices = useMemo(() => list.filter((u) => u.isIndex), [list]);
  const matches = useMemo(() => matchUnderlyings(list, q, 30), [list, q]);

  const close = () => {
    setQ('');
    onClose();
  };
  const choose = (underlying: string) => {
    close();
    onPick(underlying);
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Choose an underlying"
      subtitle={list.length ? `${list.length} with listed contracts` : undefined}
      maxHeight={0.9}
      header={
        <View className="gap-3">
          <View className="h-12 flex-row items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3.5 dark:border-line-dark-strong dark:bg-canvas-dark">
            <Search size={18} color={colors.textMuted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="NIFTY, RELIANCE, HDFCBANK…"
              placeholderTextColor={colors.textFaint}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              accessibilityLabel="Search underlyings"
              returnKeyType="search"
              className="h-full flex-1 text-[15px] text-ink dark:text-ink-dark"
            />
            {catalogue.isFetching && !catalogue.data ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : null}
            {q ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={10}
                onPress={() => setQ('')}
              >
                <X size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          {indices.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 8 }}
            >
              {indices.map((ix) => {
                const on = ix.underlying === value;
                return (
                  <Pressable
                    key={ix.underlying}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => choose(ix.underlying)}
                    className={cn(
                      'rounded-full border px-3.5 py-2',
                      on
                        ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
                        : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-[13px] font-semibold',
                        on
                          ? 'text-brand-text dark:text-brand-text-dark'
                          : 'text-ink-muted dark:text-ink-dark-muted',
                      )}
                    >
                      {ix.underlying}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      }
    >
      {catalogue.isError && !catalogue.data ? (
        <InlineError
          what="the contract catalogue"
          error={catalogue.error}
          onRetry={() => void catalogue.refetch()}
        />
      ) : null}
      {catalogue.isPending && !catalogue.isError ? (
        <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Loading contracts…
        </Text>
      ) : null}
      {matches.map((u) => {
        const on = u.underlying === value;
        return (
          <Pressable
            key={u.underlying}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${u.underlying}, ${u.isIndex ? 'index' : 'stock'}, ${u.expiryCount} expiries`}
            onPress={() => choose(u.underlying)}
            className="min-h-[52px] flex-row items-center gap-3 border-b border-line py-2.5 active:opacity-70 dark:border-line-dark"
          >
            <InstrumentMark
              kind={u.isIndex ? 'index' : 'stock'}
              underlying={u.underlying}
              size={32}
            />
            <View className="min-w-0 flex-1">
              <Text
                className={cn(
                  'text-sm font-semibold',
                  on ? 'text-brand-text dark:text-brand-text-dark' : 'text-ink dark:text-ink-dark',
                )}
                numberOfLines={1}
              >
                {u.underlying}
              </Text>
              <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                {u.isIndex ? 'Index' : 'Stock'} · {u.expiryCount} expir
                {u.expiryCount === 1 ? 'y' : 'ies'}
              </Text>
            </View>
            {u.isIndex ? <Tag label="Index" tone="info" /> : null}
          </Pressable>
        );
      })}
      {catalogue.data && matches.length === 0 ? (
        <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No underlying matches “{q.trim()}”.
        </Text>
      ) : null}
    </Sheet>
  );
}
