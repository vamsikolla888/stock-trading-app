import { useRouter } from 'expo-router';
import ChevronsUpDown from 'lucide-react-native/icons/chevrons-up-down';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StockLogo } from '@/components/market/StockLogo';
import { Badge } from '@/components/ui/Badge';
import { ModalSheet, SheetOption } from '@/features/home/components/ModalSheet';
import { stockLogoUrl } from '@/features/market/api';
import type { StockDetail, StockListing } from '@/features/market/types';
import { stockHref } from '@/lib/navigation';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { circuitBadge, type CircuitView } from '../lib/circuit';

/**
 * "SSRETAIL · NSE" — and, for a company listed on both exchanges, the NSE/BSE switch. Each
 * option shows that book's own price: the gap between them is real, not rounding. Switching
 * opens the other listing (BSE rows are keyed by scrip code, so the symbol changes too).
 */
function ExchangeSwitch({
  symbol,
  exchange,
  listings,
}: {
  symbol: string;
  exchange: string;
  listings: readonly StockListing[] | undefined;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const current = listings?.find((listing) => listing.exchange === exchange);
  const label = `${current?.displaySymbol ?? symbol} · ${exchange}`;
  const options = listings ?? [];

  if (options.length < 2) {
    return (
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
        {label}
      </Text>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. Switch exchange`}
        hitSlop={6}
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-1 self-start rounded-full border border-line px-2.5 py-1 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
      >
        <Text className="text-xs font-semibold text-ink dark:text-ink-dark">{label}</Text>
        <ChevronsUpDown size={13} color={colors.textMuted} />
      </Pressable>
      <ModalSheet visible={open} title="Exchange" onClose={() => setOpen(false)}>
        {options.map((listing) => (
          <SheetOption
            key={`${listing.exchange}:${listing.symbol}`}
            label={`${listing.exchange} · ${formatINR(listing.ltp)}`}
            detail={
              listing.changePct !== null
                ? `${formatSignedPercent(listing.changePct)} today · ${listing.displaySymbol}`
                : listing.displaySymbol
            }
            selected={listing.exchange === exchange}
            onPress={() => {
              setOpen(false);
              if (listing.exchange !== exchange)
                router.push(stockHref(listing.symbol, listing.exchange));
            }}
          />
        ))}
      </ModalSheet>
    </>
  );
}

/** Logo, name, exchange, index memberships and the feed's state. */
export function StockHeader({
  symbol,
  exchange,
  detail,
  marketOpen,
  streaming = false,
  circuit,
}: {
  symbol: string;
  exchange: string;
  detail: StockDetail | undefined;
  marketOpen: boolean;
  /** Ticks are arriving on the live feed right now. */
  streaming?: boolean;
  /** Where the price sits against today's circuit limits: a badge only at or near one. */
  circuit?: Pick<CircuitView, 'at' | 'near'>;
}) {
  const circuitTag = circuit ? circuitBadge(circuit) : null;
  const displaySymbol =
    detail?.listings?.find((listing) => listing.exchange === exchange)?.displaySymbol ?? symbol;
  const tags = detail?.indices
    ? [
        ...(detail.indices.primary ? [detail.indices.primary] : []),
        ...detail.indices.sectors.filter((tag) => tag.key !== detail.indices?.primary?.key),
      ].slice(0, 3)
    : [];
  const live = streaming || (marketOpen && detail?.priceSource === 'broker');

  return (
    <View>
      <View className="flex-row items-center gap-3">
        <StockLogo symbol={displaySymbol} uri={stockLogoUrl(symbol)} size="lg" />
        <View className="min-w-0 flex-1 gap-1">
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-ink dark:text-ink-dark"
            style={{ letterSpacing: -0.5 }}
            numberOfLines={2}
          >
            {detail?.companyName ?? displaySymbol}
          </Text>
          <ExchangeSwitch symbol={symbol} exchange={exchange} listings={detail?.listings} />
        </View>
      </View>
      {tags.length > 0 || detail ? (
        <View className="mt-3 flex-row flex-wrap items-center gap-1.5">
          {live ? <Badge label="● Live" variant="success" /> : null}
          {!marketOpen ? <Badge label="Market closed" /> : null}
          {circuitTag ? <Badge label={circuitTag.label} variant={circuitTag.tone} /> : null}
          {detail && !detail.isActive ? (
            <Badge label="Suspended / delisted" variant="warning" />
          ) : null}
          {tags.map((tag) => (
            <Badge key={tag.key} label={tag.shortLabel} variant="primary" />
          ))}
        </View>
      ) : null}
    </View>
  );
}
