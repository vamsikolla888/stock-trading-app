import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Tabs';
import { useMask } from '@/features/portfolio/components/BookSummaryCard';
import { formatINR, formatSignedINR } from '@/lib/utils/formatters';

import { useLivePaperMarks, usePaperBook, usePaperFnoWallet, usePaperOrders } from '../hooks';
import { PAPER_ORDERS_LIMIT } from '../lib/book';
import { fnoAccountView, paperContractOfRow } from '../lib/paperFno';
import type { FnoOrderView, FnoPositionView, PaperTicketQuote } from '../types';

import { PaperOrders } from './PaperOrders';
import { PaperPositions } from './PaperPositions';
import type { PaperTicketTarget } from './PaperTicket';

const NUM = { fontVariant: ['tabular-nums' as const] };

type BookView = 'positions' | 'orders';

/** A request to open the paper F&O ticket, handed to the screen that hosts it. */
export interface FnoTicketRequest {
  target: PaperTicketTarget;
  quote: PaperTicketQuote | null;
}

/**
 * The F&O paper book as a tab of the CASH paper screen (web: /paper's F&O tab): the same live
 * positions and order log as F&O › Paper trading, so someone trading both books sees both in one
 * place. Exit / Add / "Trade this contract" hand the contract to the screen's ticket
 * (`onTrade`); a NEW contract is found from the screen's order search, or the full F&O
 * workspace one tap away. Its own wallet — separate from the cash one above it.
 */
export function PaperFnoBook({ onTrade }: { onTrade: (request: FnoTicketRequest) => void }) {
  const router = useRouter();
  const mask = useMask();
  const [view, setView] = useState<BookView>('positions');
  const book = usePaperBook();
  const wallet = usePaperFnoWallet();
  const orders = usePaperOrders(PAPER_ORDERS_LIMIT);
  const positions = useMemo(() => book.data?.positions ?? [], [book.data]);
  const { totals: live } = useLivePaperMarks(positions);
  const account = fnoAccountView(book.data, wallet.data, positions.length ? live : null);
  const open = orders.data?.filter((o) => o.status === 'PENDING').length ?? 0;

  const tradePosition = (p: FnoPositionView, side: 'BUY' | 'SELL', lots: number) =>
    onTrade({
      target: { ...paperContractOfRow(p), side, lots, nonce: Date.now() },
      quote: { lastPrice: p.ltp, impliedVolatility: p.impliedVolatility, delta: null },
    });
  const tradeOrder = (o: FnoOrderView) =>
    onTrade({
      target: { ...paperContractOfRow(o), side: o.side, lots: o.lots, nonce: Date.now() },
      quote: null,
    });

  return (
    <View>
      <View className="rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
        <View className="flex-row flex-wrap p-1.5">
          <Stat
            label="Unrealised"
            value={account.unrealised == null ? '—' : mask(formatSignedINR(account.unrealised))}
            tone={account.unrealised}
          />
          <Stat
            label="Realised"
            value={account.realised == null ? '—' : mask(formatSignedINR(account.realised))}
            tone={account.realised}
          />
          <Stat
            label="Margin"
            value={account.marginBlocked == null ? '—' : mask(formatINR(account.marginBlocked, 0))}
          />
          <Stat
            label="Available"
            value={account.available == null ? '—' : mask(formatINR(account.available))}
          />
        </View>
        <View className="border-t border-line px-3.5 py-2.5 dark:border-line-dark">
          <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            The F&amp;O sandbox’s own wallet. Search NIFTY, BANKNIFTY or a contract in “Place a
            paper order” to trade F&amp;O from here.
          </Text>
        </View>
      </View>

      <View className="mb-3 mt-4 flex-row items-center gap-3">
        <SegmentedControl<BookView>
          items={[
            {
              key: 'positions',
              label: `Positions${positions.length ? ` (${positions.length})` : ''}`,
            },
            { key: 'orders', label: `Orders${open ? ` · ${open} open` : ''}` },
          ]}
          value={view}
          onChange={setView}
          className="flex-1"
        />
      </View>

      {view === 'positions' ? (
        <PaperPositions onTrade={tradePosition} compact />
      ) : (
        <PaperOrders onOpen={tradeOrder} compact />
      )}

      <Button
        label="Open the F&O workspace"
        variant="outline"
        className="mt-4"
        onPress={() => router.navigate('/fno/paper')}
      />
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <View className="w-1/2 px-2.5 py-2">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{label}</Text>
      {tone !== undefined ? (
        <ChangeText value={tone} className="mt-0.5 text-[15px]" style={NUM} numberOfLines={1}>
          {value}
        </ChangeText>
      ) : (
        <Text
          className="mt-0.5 text-[15px] font-bold text-ink dark:text-ink-dark"
          style={NUM}
          numberOfLines={1}
        >
          {value}
        </Text>
      )}
    </View>
  );
}
