import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Search from 'lucide-react-native/icons/search';
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SplitColumns } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { Button } from '@/components/ui/Button';
import { ScrollTabs } from '@/components/ui/Tabs';
import { PaperAnalytics } from '@/features/derivatives/components/PaperAnalytics';
import { PaperExplore } from '@/features/derivatives/components/PaperExplore';
import { FnoWalletSheet, PaperFnoSummary } from '@/features/derivatives/components/PaperFnoSummary';
import { PaperOrders } from '@/features/derivatives/components/PaperOrders';
import { PaperPositions } from '@/features/derivatives/components/PaperPositions';
import { PaperTicket, type PaperTicketTarget } from '@/features/derivatives/components/PaperTicket';
import { derivativesKeys, usePaperOrders } from '@/features/derivatives/hooks';
import { PAPER_ORDERS_LIMIT } from '@/features/derivatives/lib/book';
import { paperContractOfRow } from '@/features/derivatives/lib/paperFno';
import {
  PAPER_VIEWS,
  paperChainHref,
  paperSearchHref,
  parsePaperView,
} from '@/features/derivatives/lib/routes';
import type {
  FnoOrderView,
  FnoPositionView,
  PaperTicketQuote,
  PaperView,
} from '@/features/derivatives/types';
import { marketKeys } from '@/features/market/hooks';
import { afterSheetClose } from '@/features/trading/components/Sheet';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * F&O › Paper trading — the web's paper F&O workspace, laid out for a phone: the account on top
 * (its OWN wallet, separate from the cash paper wallet — available, held, margin, P&L marked
 * live, net greeks, the market state), then the book — Positions (streamed where the feed can),
 * Orders (resting and after-market orders wait here), Analytics — and Explore for finding the
 * next contract. ONE order ticket per screen: Exit / Add on a position and "Trade this contract"
 * on an order open it with the server's live estimate; the chain is a stack screen, opened from
 * the footer or the search (which, from here, never opens the live chain).
 *
 * The view lives in the route (`?view=orders`), and `?wallet=1` opens the wallet on arrival
 * (Settings, a ticket's "Add funds"). On a wide window the account and the book sit side by side.
 */
export default function FnoPaperScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const split = layout.columns >= 2;
  const params = useLocalSearchParams<{ view?: string; wallet?: string }>();
  const view = parsePaperView(params.view);
  const setView = useCallback((next: PaperView) => router.setParams({ view: next }), [router]);

  const [ticket, setTicket] = useState<{
    target: PaperTicketTarget;
    quote: PaperTicketQuote | null;
  } | null>(null);
  const [walletAsked, setWalletOpen] = useState(false);
  // A link can ask for the wallet too (`?wallet=1`); closing it drops the param with the sheet.
  const walletLinked = params.wallet === '1';
  const walletOpen = walletAsked || walletLinked;
  const closeWallet = useCallback(() => {
    setWalletOpen(false);
    if (walletLinked) router.setParams({ wallet: undefined });
  }, [walletLinked, router]);

  // Shared with the Orders view (same key), so the resting-order count costs no extra request.
  const orders = usePaperOrders(PAPER_ORDERS_LIMIT);
  const resting = orders.data?.filter((o) => o.status === 'PENDING').length ?? 0;

  const tradePosition = useCallback(
    (p: FnoPositionView, side: 'BUY' | 'SELL', lots: number) =>
      setTicket({
        target: { ...paperContractOfRow(p), side, lots, nonce: Date.now() },
        quote: { lastPrice: p.ltp, impliedVolatility: p.impliedVolatility, delta: null },
      }),
    [],
  );
  const tradeOrder = useCallback(
    (o: FnoOrderView) =>
      setTicket({
        target: { ...paperContractOfRow(o), side: o.side, lots: o.lots, nonce: Date.now() },
        quote: null,
      }),
    [],
  );

  // Only what is on screen: an inactive query has no observer to refresh.
  const onRefresh = useCallback(
    () =>
      Promise.all([
        qc.refetchQueries({ queryKey: derivativesKeys.all, type: 'active' }),
        view === 'explore'
          ? qc.refetchQueries({ queryKey: marketKeys.indices(), type: 'active' })
          : Promise.resolve(),
      ]),
    [qc, view],
  );

  const account = (
    <View>
      <View className="mb-4 flex-row items-center gap-2">
        <View className="rounded-md bg-info-wash px-1.5 py-0.5 dark:bg-info-wash-dark">
          <Text className="text-[10px] font-bold text-info dark:text-info-dark">PAPER</Text>
        </View>
        <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={2}>
          Simulated futures &amp; options with their own paper wallet. Nothing reaches a broker.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search F&O contracts to paper trade"
          hitSlop={8}
          onPress={() => router.push(paperSearchHref())}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface-sunk active:opacity-70 dark:bg-surface-sunk-dark"
        >
          <Search size={17} color={colors.text} />
        </Pressable>
      </View>
      <PaperFnoSummary onManageWallet={() => setWalletOpen(true)} />
    </View>
  );

  const book = (
    <View>
      <ScrollTabs
        items={PAPER_VIEWS}
        value={view}
        onChange={setView}
        className={split ? 'mb-4' : 'mb-4 mt-6'}
        badges={{ orders: resting }}
      />
      {view === 'orders' ? (
        <PaperOrders onOpen={tradeOrder} />
      ) : view === 'analytics' ? (
        <PaperAnalytics />
      ) : view === 'explore' ? (
        <PaperExplore onOpenView={setView} />
      ) : (
        <PaperPositions onTrade={tradePosition} />
      )}
    </View>
  );

  return (
    <>
      <GroupScreen
        onRefresh={onRefresh}
        fill={split}
        footer={
          <View className="border-t border-line px-5 pb-2 pt-3 dark:border-line-dark">
            <Button
              label="Trade on the option chain"
              size="lg"
              fullWidth
              onPress={() => router.push(paperChainHref())}
            />
          </View>
        }
      >
        <SplitColumns split={split} left={account} right={book} />
      </GroupScreen>

      <PaperTicket
        target={ticket?.target ?? null}
        quote={ticket?.quote ?? null}
        onClose={() => setTicket(null)}
        onViewPositions={() => setView('positions')}
        onAddFunds={() => {
          setTicket(null);
          afterSheetClose(() => setWalletOpen(true));
        }}
      />
      {walletOpen ? <FnoWalletSheet onClose={closeWallet} /> : null}
    </>
  );
}
