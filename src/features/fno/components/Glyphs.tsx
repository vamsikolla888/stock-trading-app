import React, { memo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { StockLogo } from '@/components/market/StockLogo';
import { stockLogoUrl } from '@/features/market/api';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Instrument marks for F&O rows and cards: a monogram for an index (indices have no logo
 * file), a small drawn icon per commodity family, and the company logo for a stock.
 * Decorative — the name printed beside each is the accessible label.
 */

const INDEX_CODES: Record<string, string> = {
  NIFTY: 'N50',
  BANKNIFTY: 'BNK',
  SENSEX: 'SX',
  FINNIFTY: 'FIN',
  MIDCPNIFTY: 'MID',
  NIFTYNXT50: 'NXT',
  BANKEX: 'BKX',
};

export const IndexGlyph = memo(function IndexGlyph({
  underlying,
  size = 36,
}: {
  underlying: string;
  size?: number;
}) {
  return (
    <View
      accessible={false}
      className="items-center justify-center bg-info-wash dark:bg-info-wash-dark"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <Text
        className="font-extrabold text-info dark:text-info-dark"
        style={{ fontSize: Math.round(size * 0.3) }}
      >
        {INDEX_CODES[underlying] ?? underlying.slice(0, 3)}
      </Text>
    </View>
  );
});

type Family = 'oil' | 'gas' | 'gold' | 'silver' | 'copper' | 'metal' | 'agri' | 'power' | 'index';

export function commodityFamily(underlying: string): Family {
  const u = underlying.toUpperCase();
  if (u.startsWith('CRUDE')) return 'oil';
  if (u.startsWith('NATURALGAS') || u.startsWith('NATGAS')) return 'gas';
  if (u.startsWith('GOLD')) return 'gold';
  if (u.startsWith('SILVER')) return 'silver';
  if (u.startsWith('COPPER')) return 'copper';
  if (u.startsWith('MCX')) return 'index';
  if (u.startsWith('ELEC')) return 'power';
  if (/^(COTTON|KAPAS|CARDAMOM|MENTHA)/.test(u)) return 'agri';
  return 'metal';
}

function Shape({ family, color, cut }: { family: Family; color: string; cut: string }) {
  switch (family) {
    case 'oil':
      return (
        <>
          <Rect x="6" y="3" width="12" height="18" rx="2.5" fill={color} />
          <Path d="M6 8.5h12M6 15.5h12" stroke={cut} strokeWidth="1.4" />
        </>
      );
    case 'gas':
      return (
        <Path
          d="M12 2.5c.6 3.2 5.5 5.6 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4.2 2.7-5.6.3 1.7 1 2.8 2.1 3.3-.4-3 .1-5.7.7-8.3Z"
          fill={color}
        />
      );
    case 'agri':
      return (
        <Path
          d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Zm0 0 7-7"
          fill={color}
          stroke={cut}
          strokeWidth="1.2"
        />
      );
    case 'power':
      return <Path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6L13.5 2Z" fill={color} />;
    case 'index':
      return (
        <Path d="M4 20V13h3.5v7H4Zm6.25 0V8h3.5v12h-3.5ZM16.5 20V4H20v16h-3.5Z" fill={color} />
      );
    default:
      return (
        <>
          <Path d="M7 9h10l3 9H4l3-9Z" fill={color} />
          <Path d="M8.5 9 10 5h4l1.5 4" fill={color} opacity={0.65} />
        </>
      );
  }
}

export const CommodityGlyph = memo(function CommodityGlyph({
  underlying,
  size = 36,
}: {
  underlying: string;
  size?: number;
}) {
  const { colors } = useTheme();
  const family = commodityFamily(underlying);
  // Theme tones only: gold/copper are the warning and loss tones, not literal metals.
  const tint: Record<Family, string> = {
    oil: colors.text,
    gas: colors.info,
    gold: colors.warning,
    silver: colors.textMuted,
    copper: colors.danger,
    metal: colors.textFaint,
    agri: colors.link,
    power: colors.warning,
    index: colors.info,
  };
  const inner = Math.round(size * 0.62);
  return (
    <View
      accessible={false}
      className="items-center justify-center bg-surface-sunk dark:bg-surface-sunk-dark"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <Svg viewBox="0 0 24 24" width={inner} height={inner}>
        <Shape family={family} color={tint[family]} cut={colors.surfaceSunk} />
      </Svg>
    </View>
  );
});

/** The right mark for any F&O instrument: index monogram, commodity icon or company logo. */
export function InstrumentMark({
  kind,
  underlying,
  logoSymbol,
  size = 36,
}: {
  kind: 'index' | 'stock' | 'commodity';
  underlying: string;
  logoSymbol?: string | null;
  size?: number;
}) {
  if (kind === 'index') return <IndexGlyph underlying={underlying} size={size} />;
  if (kind === 'commodity') return <CommodityGlyph underlying={underlying} size={size} />;
  const symbol = logoSymbol ?? underlying;
  return <StockLogo symbol={symbol} uri={stockLogoUrl(symbol)} size={size >= 40 ? 'lg' : 'md'} />;
}
