import BellRing from 'lucide-react-native/icons/bell-ring';
import X from 'lucide-react-native/icons/x';
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import {
  useCreatePriceAlert,
  useDeletePriceAlert,
  usePriceAlerts,
  type PriceAlertDirection,
} from '@/features/alerts/hooks';
import { formatINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const DIRECTIONS: readonly { key: PriceAlertDirection; label: string }[] = [
  { key: 'ABOVE', label: 'Rises above' },
  { key: 'BELOW', label: 'Falls below' },
];

function parsePrice(text: string): number | null {
  const value = Number(text.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 && value <= 10_000_000
    ? Math.round(value * 100) / 100
    : null;
}

/** Server-stored price alerts for this stock; they notify each time the price crosses into the zone. */
export function PriceAlertCard({
  exchange,
  symbol,
  ltp,
}: {
  exchange: string;
  symbol: string;
  ltp: number | null;
}) {
  const { colors } = useTheme();
  const alerts = usePriceAlerts();
  const create = useCreatePriceAlert();
  const remove = useDeletePriceAlert();
  const [direction, setDirection] = useState<PriceAlertDirection>('ABOVE');
  const [priceText, setPriceText] = useState('');

  const mine = (alerts.data ?? []).filter(
    (alert) => alert.exchange === exchange && alert.symbol === symbol,
  );
  const price = parsePrice(priceText);
  const isStockExchange = exchange === 'NSE' || exchange === 'BSE';

  const submit = () => {
    if (price === null || !isStockExchange) return;
    create.mutate(
      { exchange: exchange as 'NSE' | 'BSE', symbol, direction, targetPrice: price },
      {
        onSuccess: (alert) => {
          setPriceText('');
          toast.success(
            'Price alert set',
            alert.alreadyMet
              ? 'The price is already there — you’ll be notified the next time it crosses.'
              : `We'll notify you when ${symbol} ${direction === 'ABOVE' ? 'rises above' : 'falls below'} ${formatINR(price)}.`,
          );
        },
        onError: (error) => toast.error('Couldn’t set alert', getErrorMessage(error)),
      },
    );
  };

  if (!isStockExchange) return null;

  return (
    <Section title="Price alerts">
      <View className="gap-3 rounded-card border border-line bg-surface p-3.5 dark:border-line-dark dark:bg-surface-dark">
        {mine.map((alert) => (
          <View key={alert.id} className="flex-row items-center gap-2.5">
            <BellRing size={16} color={alert.armed ? colors.link : colors.textFaint} />
            <Text className="flex-1 text-[13px] text-ink dark:text-ink-dark">
              {alert.direction === 'ABOVE' ? 'Above' : 'Below'} {formatINR(alert.targetPrice)}
              {alert.triggerCount > 0 ? ` · triggered ${alert.triggerCount}×` : ''}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete alert at ${formatINR(alert.targetPrice)}`}
              hitSlop={10}
              disabled={remove.isPending}
              onPress={() =>
                remove.mutate(alert.id, {
                  onError: (error) => toast.error('Couldn’t delete', getErrorMessage(error)),
                })
              }
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}

        <SegmentedControl items={DIRECTIONS} value={direction} onChange={setDirection} />
        <View className="flex-row items-center gap-2.5">
          <View className="h-11 flex-1 flex-row items-center rounded-field border border-line-strong px-3 dark:border-line-dark-strong">
            <Text className="text-[15px] text-ink-muted dark:text-ink-dark-muted">₹</Text>
            <TextInput
              value={priceText}
              onChangeText={setPriceText}
              placeholder={ltp ? formatINR(ltp).slice(1) : 'Target price'}
              placeholderTextColor={colors.textFaint}
              keyboardType="decimal-pad"
              accessibilityLabel="Alert price"
              className="h-full flex-1 pl-1 text-[15px] text-ink dark:text-ink-dark"
            />
          </View>
          <Button
            label="Set alert"
            size="md"
            disabled={price === null}
            loading={create.isPending}
            onPress={submit}
          />
        </View>
      </View>
    </Section>
  );
}
