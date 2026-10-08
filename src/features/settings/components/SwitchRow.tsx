import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { IconComponent } from '@/components/ui/icon';
import { IconTile, type IconTone } from '@/components/ui/IconTile';
import { Toggle } from '@/components/ui/Toggle';

interface SwitchRowProps {
  Icon?: IconComponent;
  iconTone?: IconTone;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Menu row with an inline toggle. The whole row is the control (one big target), and it
 * announces itself as a switch rather than a button.
 */
export function SwitchRow({
  Icon,
  iconTone = 'green',
  title,
  subtitle,
  value,
  onValueChange,
  disabled = false,
}: SwitchRowProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      className="min-h-[60px] flex-row items-center gap-3 px-3.5 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      {Icon ? <IconTile Icon={Icon} tone={iconTone} size="sm" /> : null}
      <View className="flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark">{title}</Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Toggle value={value} disabled={disabled} />
    </Pressable>
  );
}
