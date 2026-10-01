import ChevronDown from 'lucide-react-native/icons/chevron-down';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StackScreen } from '@/components/navigation/StackScreen';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { appConfig } from '@/config/app';
import { appVersion } from '@/config/env';
import { animateNextLayout } from '@/lib/animation';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I connect my broker?',
    a: 'Go to Settings → Broker connections. mStock asks for your API key, checksum and login, then a daily code. Groww needs an API key and TOTP secret once — its daily token renews automatically.',
  },
  {
    q: 'Why does mStock ask for a code every day?',
    a: 'mStock resets broker sessions every night at midnight IST. Tap Reconnect and enter the day’s code to restore live prices, holdings and trading.',
  },
  {
    q: 'Why can’t I place a live order?',
    a: 'Live orders need a connected broker, live trading switched on, and the kill switch clear. The order screen tells you which one is missing. Paper trading always works.',
  },
  {
    q: 'What is paper trading?',
    a: 'Practice with virtual cash at real market prices. Paper orders never reach a broker and no real money moves.',
  },
  {
    q: 'My order was “blocked by risk check”. What happened?',
    a: 'Every live order passes server-side safeguards (market hours, funds, order-value and daily limits). The order status shows exactly which check failed. Nothing was sent to the broker.',
  },
  {
    q: 'Are picks and signals investment advice?',
    a: 'No. They are analysis with the reasoning shown. Nothing is ever traded on your behalf — review each idea against your own plan before acting.',
  },
  {
    q: 'Why do prices say “last session”?',
    a: 'Outside NSE/BSE hours (09:15–15:30 IST, Monday to Friday) the app shows the last session’s prices and stops refreshing them to save battery and data.',
  },
  {
    q: 'My account is waiting for approval.',
    a: 'Every new account is reviewed by an administrator. You can sign in as soon as yours is approved.',
  },
];

export default function HelpScreen() {
  const { colors } = useTheme();
  const [open, setOpen] = useState<number | null>(0);

  const toggle = (index: number) => {
    animateNextLayout();
    setOpen((current) => (current === index ? null : index));
  };

  return (
    <StackScreen title="Help & support" subtitle="Answers to common questions">
      <ListCard>
        {FAQ.map((item, index) => {
          const expanded = open === index;
          return (
            <View key={item.q}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => toggle(index)}
                className="flex-row items-center gap-3 px-3.5 py-3.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
                  {item.q}
                </Text>
                <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
                  <ChevronDown size={18} color={colors.textMuted} />
                </View>
              </Pressable>
              {expanded ? (
                <Text className="px-3.5 pb-4 text-[13px] leading-5 text-ink-muted dark:text-ink-dark-muted">
                  {item.a}
                </Text>
              ) : null}
            </View>
          );
        })}
      </ListCard>
      <Text className="mt-6 text-center text-xs leading-[18px] text-ink-faint dark:text-ink-dark-faint">
        Still stuck? Contact the administrator who approved your account.{'\n'}
        {appConfig.name} v{appVersion}
      </Text>
    </StackScreen>
  );
}
