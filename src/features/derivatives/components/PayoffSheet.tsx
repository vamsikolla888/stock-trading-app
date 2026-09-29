import React, { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { Caveats, Disclosure, FieldLabel, Note } from '@/features/fno/components/primitives';
import { Sheet } from '@/features/fno/components/Sheet';
import { formatNumber } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { usePaperPayoff } from '../hooks';
import { payoffLegs } from '../lib/book';
import type { FnoPositionView } from '../types';

import { PayoffChart } from './PayoffChart';
import { ProbabilityPanel } from './ProbabilityPanel';

/**
 * The expiry payoff of what is actually held in ONE underlying (the x-axis is one underlying's
 * price). Each leg is priced at its ENTRY, so the curve answers "what does this pay me at
 * expiry" against what it cost. The server's opening margin and charges are deliberately not
 * shown — the margin already blocked is the figure on the book, and two margins on one screen
 * is worse than one.
 */
export function PayoffSheet({
  group,
  onClose,
}: {
  group: { underlying: string; positions: FnoPositionView[] } | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={group != null}
      onClose={onClose}
      title={group ? `${group.underlying} payoff at expiry` : 'Payoff'}
      subtitle={
        group
          ? `${group.positions.length} leg${group.positions.length === 1 ? '' : 's'} held · priced at your entry`
          : undefined
      }
    >
      {group ? <PayoffBody key={group.underlying} positions={group.positions} /> : null}
    </Sheet>
  );
}

function PayoffBody({ positions }: { positions: FnoPositionView[] }) {
  const { colors } = useTheme();
  const legs = useMemo(() => payoffLegs(positions), [positions]);
  const payoff = usePaperPayoff(legs);

  if (payoff.isPending) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (payoff.isError && !payoff.data) {
    return (
      <InlineError what="the payoff" error={payoff.error} onRetry={() => void payoff.refetch()} />
    );
  }
  const data = payoff.data;
  if (!data) return null;
  return (
    <View className="gap-4 pb-2">
      <PayoffChart analysis={data.analysis} spot={data.spot} underlying={data.underlying} />
      <View>
        <FieldLabel>Odds at expiry</FieldLabel>
        <ProbabilityPanel probability={data.probability} />
      </View>
      {data.caveats.length > 0 ? (
        <Disclosure title="What this payoff assumes" meta={`${data.caveats.length} caveats`}>
          <Caveats items={data.caveats} />
        </Disclosure>
      ) : null}
      <Note>
        Modelled from the legs’ entry prices and the market’s implied volatility — not a forecast.
      </Note>
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
        {positions.length} position{positions.length === 1 ? '' : 's'} · {data.underlying}
        {data.spot != null ? ` · spot ${formatNumber(data.spot)}` : ''}
      </Text>
    </View>
  );
}
