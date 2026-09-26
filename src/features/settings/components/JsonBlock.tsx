import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

/** Characters shown before "Show all" — keeps a large n8n payload from freezing the list. */
const PREVIEW_CHARS = 1_200;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function stringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return String(value);
  }
}

/** Read-only, selectable JSON/text with a length cap and horizontal scroll for long lines. */
export function JsonBlock({ value, label }: { value: unknown; label?: string }) {
  const text = useMemo(() => stringify(value), [value]);
  const [expanded, setExpanded] = useState(false);
  const long = text.length > PREVIEW_CHARS;
  const shown = long && !expanded ? `${text.slice(0, PREVIEW_CHARS)}…` : text;

  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
          {label}
        </Text>
      ) : null}
      <View className="rounded-field border border-line bg-surface-sunk dark:border-line-dark dark:bg-surface-sunk-dark">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text
            selectable
            className="p-3 text-[11px] leading-4 text-ink dark:text-ink-dark"
            style={{ fontFamily: MONO }}
          >
            {shown}
          </Text>
        </ScrollView>
      </View>
      {long ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setExpanded((open) => !open)}
          className="self-start active:opacity-60"
        >
          <Text className="text-xs font-semibold text-brand-text dark:text-brand-text-dark">
            {expanded ? 'Show less' : `Show all (${text.length.toLocaleString('en-IN')} chars)`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const monoFont = MONO;
