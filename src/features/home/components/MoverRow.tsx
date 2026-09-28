import React, { memo } from 'react';

import { StockRow } from '@/components/market/StockRow';
import { stockLogoUrl } from '@/features/market/api';
import type { Mover, MoverKind } from '@/features/market/types';
import { formatCompactNumber } from '@/lib/utils/formatters';

import { formatMarketCapCrore } from '../lib/capBands';
import { moverTrendShape } from '../lib/dayShape';

/**
 * A ranked stock: name, the session's real shape (prev close → open → high/low → price),
 * price and change. The second line carries what the ranking is about — volume on the
 * most-traded list, market cap where a cap-band response sends it.
 */
export const MoverRow = memo(function MoverRow({
  mover,
  kind,
  onPress,
}: {
  mover: Mover;
  kind: MoverKind;
  onPress: () => void;
}) {
  const shape = moverTrendShape({
    prevClose: mover.close,
    open: mover.open,
    high: mover.high,
    low: mover.low,
    ltp: mover.ltp,
    changePct: mover.changePct,
  });
  const meta =
    kind === 'volume' && mover.volume != null
      ? `${mover.symbol} · Vol ${formatCompactNumber(mover.volume)}`
      : mover.marketCap != null
        ? `${mover.symbol} · ${formatMarketCapCrore(mover.marketCap)}`
        : undefined;

  return (
    <StockRow
      symbol={mover.symbol}
      name={mover.companyName}
      exchange={mover.exchange}
      subtitle={meta}
      price={mover.ltp}
      changePercent={mover.changePct}
      logoUri={stockLogoUrl(mover.symbol)}
      trend={shape ?? undefined}
      onPress={onPress}
    />
  );
});
