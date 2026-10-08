import { useRouter } from 'expo-router';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import React from 'react';
import { Pressable, Text } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { useTheme } from '@/theme/ThemeProvider';

import { useSafeModeOn } from '../hooks';

/**
 * Safe Mode's read-only faces — the header pill and the notice a live order ticket shows in place
 * of its submit. The switch itself is on Profile & security. The server is what blocks the orders
 * (account/safe-mode.service.ts); these only say so before anyone tries.
 */

const VERB = { place: 'Placing', modify: 'Modifying', exit: 'Exiting with' } as const;

/**
 * What a live ticket says instead of letting the order go. Paper and cancels are never blocked.
 * A ticket inside a sheet passes `onLeave` to close itself before the profile opens.
 */
export function SafeModeNotice({
  action = 'place',
  onLeave,
  className,
}: {
  action?: keyof typeof VERB;
  onLeave?: () => void;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Banner
      tone="warning"
      title="Safe Mode is on"
      message={`${VERB[action]} a real order is blocked on every broker. Turn Safe Mode off in Profile & security to trade live.`}
      action={{
        label: 'Open Profile & security',
        onPress: () => {
          onLeave?.();
          router.push('/profile');
        },
      }}
      className={className}
    />
  );
}

/** In the header while Safe Mode is on; nothing while it is off. Opens the switch. */
export function SafeModeIndicator() {
  const router = useRouter();
  const { colors } = useTheme();
  const on = useSafeModeOn();
  if (!on) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Safe Mode is on: real orders are blocked on every broker"
      accessibilityHint="Opens Profile & security, where the switch is"
      hitSlop={6}
      onPress={() => router.push('/profile')}
      className="mr-1 h-8 flex-row items-center gap-1 rounded-full bg-warning-wash px-2.5 active:opacity-70 dark:bg-warning-wash-dark"
    >
      <ShieldCheck size={14} color={colors.warning} />
      <Text className="text-xs font-semibold text-warning-600 dark:text-warning-dark">
        Safe Mode
      </Text>
    </Pressable>
  );
}
