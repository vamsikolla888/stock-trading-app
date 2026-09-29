import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { StockTile, StockTileSkeleton } from '@/components/market/StockTile';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { Section } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { stockLogoUrl } from '@/features/market/api';
import { useMovers } from '@/features/market/hooks';
import type { CapBand, Mover, MoverKind } from '@/features/market/types';
import { stockHref } from '@/lib/navigation';
import { useTheme } from '@/theme/ThemeProvider';

const GRID_SIZE = 4;

const KINDS: readonly { key: MoverKind; label: string }[] = [
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
  { key: 'volume', label: 'Volume shockers' },
];

type CapFilter = 'all' | CapBand;

const CAPS: readonly { key: CapFilter; label: string }[] = [
  { key: 'all', label: 'All stocks' },
  { key: 'large', label: 'Large cap' },
  { key: 'mid', label: 'Mid cap' },
  { key: 'small', label: 'Low cap' },
];

function CapPill({ value, onPress }: { value: CapFilter; onPress: () => void }) {
  const { colors } = useTheme();
  const label = CAPS.find((cap) => cap.key === value)?.label ?? 'All stocks';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Market cap filter: ${label}`}
      hitSlop={8}
      onPress={onPress}
      className="flex-row items-center gap-1 rounded-full border border-line px-3 py-1.5 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
    >
      <Text className="text-xs font-semibold text-ink dark:text-ink-dark">{label}</Text>
      <ChevronDown size={14} color={colors.textMuted} />
    </Pressable>
  );
}

/** Two tiles per row; an odd last tile keeps its width instead of stretching. */
function TileGrid({ movers, onOpen }: { movers: Mover[]; onOpen: (mover: Mover) => void }) {
  const rows: Mover[][] = [];
  for (let i = 0; i < movers.length; i += 2) rows.push(movers.slice(i, i + 2));

  return (
    <View className="gap-2.5">
      {rows.map((row) => (
        <View
          key={row.map((mover) => `${mover.exchange}:${mover.symbol}`).join('|')}
          className="flex-row gap-2.5"
        >
          {row.map((mover) => (
            <StockTile
              key={`${mover.exchange}:${mover.symbol}`}
              symbol={mover.symbol}
              name={mover.companyName}
              price={mover.ltp}
              changeAbs={mover.changeAbs}
              changePercent={mover.changePct}
              logoUri={stockLogoUrl(mover.symbol)}
              onPress={() => onOpen(mover)}
            />
          ))}
          {row.length === 1 ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}

/** Groww's "Top movers today": ranking chips, a market-cap filter, and a 2×2 grid. */
export function TopMovers() {
  const router = useRouter();
  const { colors } = useTheme();
  const [kind, setKind] = useState<MoverKind>('gainers');
  const [cap, setCap] = useState<CapFilter>('all');
  const [capSheetOpen, setCapSheetOpen] = useState(false);
  const movers = useMovers(kind, GRID_SIZE, cap === 'all' ? undefined : cap);

  let body: React.ReactNode;
  if (movers.isPending) {
    body = (
      <View className="gap-2.5">
        {[0, 1].map((row) => (
          <View key={row} className="flex-row gap-2.5">
            <StockTileSkeleton />
            <StockTileSkeleton />
          </View>
        ))}
      </View>
    );
  } else if (movers.error && !movers.data) {
    body = (
      <InlineError what="top movers" error={movers.error} onRetry={() => void movers.refetch()} />
    );
  } else if (!movers.data || movers.data.length === 0) {
    body = (
      <InlineEmpty
        title="No movers yet"
        message="Rankings appear once the session's prices are in."
      />
    );
  } else {
    // While another ranking loads, the previous one stays up, dimmed, instead of a flash.
    body = (
      <View style={{ opacity: movers.isPlaceholderData ? 0.5 : 1 }}>
        <TileGrid
          movers={movers.data.slice(0, GRID_SIZE)}
          onOpen={(mover) => router.push(stockHref(mover.symbol, mover.exchange))}
        />
      </View>
    );
  }

  return (
    <Section
      title="Top movers today"
      right={<CapPill value={cap} onPress={() => setCapSheetOpen(true)} />}
    >
      <Chips items={KINDS} value={kind} onChange={setKind} className="mb-3" />
      {body}
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push(
            kind === 'volume'
              ? { pathname: '/most-traded', params: { cap } }
              : { pathname: '/movers', params: { kind, cap } },
          )
        }
        className="mt-3 flex-row items-center justify-center gap-1 py-2 active:opacity-60"
      >
        <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
          See more
        </Text>
        <ChevronRight size={16} color={colors.link} />
      </Pressable>

      <OptionSheet
        visible={capSheetOpen}
        title="Market cap"
        options={CAPS}
        value={cap}
        onSelect={setCap}
        onClose={() => setCapSheetOpen(false)}
      />
    </Section>
  );
}
