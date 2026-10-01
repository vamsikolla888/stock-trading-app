import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import FlaskConical from 'lucide-react-native/icons/flask-conical';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { IconTile } from '@/components/ui/IconTile';
import { Section } from '@/components/ui/Section';
import { usePaperSegments } from '@/features/trading/hooks';
import {
  formatINR,
  formatSignedINR,
  formatSignedPercent,
  MASKED_VALUE,
} from '@/lib/utils/formatters';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useTheme } from '@/theme/ThemeProvider';

const numbers = { fontVariant: ['tabular-nums' as const] };

/**
 * The simulated book in one row (the web Dashboard's "Paper account"): the one wallet's value
 * and its net P&L (after charges). Supplementary — hidden while loading or when it can't load.
 */
export function PaperAccountCard() {
  const router = useRouter();
  const { colors } = useTheme();
  const hideValues = usePreferencesStore((state) => state.hideValues);
  const segments = usePaperSegments();
  const overview = segments.data;
  if (!overview) return null;

  const { wallet } = overview;
  const positions = wallet.positionCount;
  const pnlPct =
    wallet.netPnlPct ?? (wallet.capital > 0 ? (wallet.netPnl / wallet.capital) * 100 : null);
  const mask = (text: string) => (hideValues ? MASKED_VALUE : text);

  return (
    <Section
      title="Paper trading"
      action={{ label: 'Open', onPress: () => router.navigate('/trade/paper') }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          hideValues
            ? 'Paper account, values hidden'
            : `Paper account, wallet value ${formatINR(wallet.value)}, net P&L ${formatSignedINR(wallet.netPnl)}`
        }
        accessibilityHint="Opens paper trading"
        onPress={() => router.navigate('/trade/paper')}
        className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-3.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
      >
        <IconTile Icon={FlaskConical} tone="violet" />
        <View className="min-w-0 flex-1">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            Paper wallet value
          </Text>
          <Text
            className="mt-0.5 text-[16px] font-bold text-ink dark:text-ink-dark"
            style={numbers}
            numberOfLines={1}
          >
            {mask(formatINR(wallet.value))}
          </Text>
          <Text
            className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
            numberOfLines={1}
          >
            {positions} open position{positions === 1 ? '' : 's'} · balance{' '}
            {mask(formatINR(wallet.availableCash, 0))}
          </Text>
        </View>
        <View className="items-end">
          <ChangeText value={wallet.netPnl} className="text-[13px]" style={numbers}>
            {mask(formatSignedINR(wallet.netPnl))}
          </ChangeText>
          {pnlPct !== null ? (
            <ChangeText value={wallet.netPnl} className="mt-0.5 text-[11px]" style={numbers}>
              {mask(formatSignedPercent(pnlPct))}
            </ChangeText>
          ) : null}
        </View>
        <ChevronRight size={18} color={colors.textFaint} />
      </Pressable>
      <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Simulated money. Charges are modelled; liquidity and the intraday path are not.
      </Text>
    </Section>
  );
}
