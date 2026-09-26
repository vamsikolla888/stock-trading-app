import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/theme/ThemeProvider';

interface ConditionsCardProps {
  /** One line under the title, e.g. "3 conditions · daily bars · Last run 22 Aug, 01:11 IST". */
  meta: string;
  /** Facts about the scan (timeframe, universe size) shown as neutral tags. */
  tags: readonly string[];
  /** Each condition in words — the server's own wording where it provides one. */
  conditions: readonly string[];
  description?: string | null;
}

/**
 * "Details & conditions", collapsed by default so the matches stay near the top. The rows
 * read "When … / And …" because every condition must hold on the latest bar.
 */
export function ConditionsCard({ meta, tags, conditions, description }: ConditionsCardProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <Card padded={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Details and conditions, ${meta}`}
        onPress={() => setOpen((value) => !value)}
        className="min-h-[56px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
            Details & conditions
          </Text>
          <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">{meta}</Text>
        </View>
        <Chevron size={18} color={colors.textMuted} />
      </Pressable>

      {open ? (
        <View className="border-t border-line px-4 pb-4 pt-3 dark:border-line-dark">
          {description ? (
            <Text className="mb-3 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              {description}
            </Text>
          ) : null}
          {tags.length > 0 ? (
            <View className="mb-3 flex-row flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} label={tag} />
              ))}
            </View>
          ) : null}
          <View className="gap-2">
            {conditions.map((text, index) => (
              <View key={`${index}-${text}`} className="flex-row items-start gap-2.5">
                <View className="mt-0.5 min-w-[46px] items-center rounded-md bg-brand-wash px-1.5 py-0.5 dark:bg-brand-wash-dark">
                  <Text className="text-[11px] font-bold text-brand-text dark:text-brand-text-dark">
                    {index === 0 ? 'When' : 'And'}
                  </Text>
                </View>
                <Text className="flex-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
                  {text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}
