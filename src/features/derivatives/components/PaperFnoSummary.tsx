import Wallet from 'lucide-react-native/icons/wallet';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { useScreenLayout } from '@/components/layout/responsive';
import { ChangeText } from '@/components/market/ChangeText';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { signedGreek, timeIst } from '@/features/fno/lib/format';
import { WalletChanges, WalletEditor } from '@/features/paper/components/WalletEditor';
import { FNO_WALLET_PRESETS } from '@/features/paper/lib/wallet';
import { useMask } from '@/features/portfolio/components/BookSummaryCard';
import { confirmAction } from '@/features/settings/lib/confirm';
import { Sheet } from '@/features/trading/components/Sheet';
import { useNow } from '@/hooks/useNow';
import { formatINR, formatSignedINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import {
  useLivePaperMarks,
  usePaperBook,
  usePaperFnoWallet,
  useResetPaperFno,
  useSetPaperFnoWallet,
} from '../hooks';
import { fnoAccountView, marketStateWords } from '../lib/paperFno';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * The F&O paper account at a glance (web: the paper workspace's KPI row): total P&L, open P&L
 * marked LIVE at streamed prices, realised and charges, margin blocked, what is available to
 * trade and what resting orders hold, the net greeks — and the market state and the book's
 * as-of time, so every figure says when it is from. Deliberately no "today's P&L": the F&O book
 * stores no previous-close baseline, and a figure this account cannot measure is worse than
 * none. The wallet is the sandbox's OWN pool, separate from the delivery/intraday wallet.
 *
 * Pass `onManageWallet` to host the wallet sheet on the screen (so a ticket's "Add funds" and a
 * link can open it); without it the card opens its own.
 */
export function PaperFnoSummary({ onManageWallet }: { onManageWallet?: () => void } = {}) {
  const { colors } = useTheme();
  const mask = useMask();
  const layout = useScreenLayout();
  const now = useNow(30_000);
  const book = usePaperBook();
  const wallet = usePaperFnoWallet();
  const [managing, setManaging] = useState(false);

  const positions = useMemo(() => book.data?.positions ?? [], [book.data]);
  const { totals: live } = useLivePaperMarks(positions);
  const view = fnoAccountView(book.data, wallet.data, positions.length ? live : null);
  const t = book.data?.totals;
  const ungreeked = book.data?.ungreekedCount ?? 0;
  const market = marketStateWords(book.data?.sessionOpen, now);
  const tileWidth = `${100 / Math.min(layout.kpiColumns, 4)}%` as const;

  if (book.isPending && wallet.isPending) return <ListSkeleton rows={3} />;

  const manage = () => (onManageWallet ? onManageWallet() : setManaging(true));
  const reservedLine =
    view.reserved != null && view.reserved > 0
      ? `${mask(formatINR(view.reserved))} held by ${
          view.pendingOrders != null
            ? `${view.pendingOrders} open order${view.pendingOrders === 1 ? '' : 's'}`
            : 'open orders'
        }`
      : view.startingCapital != null
        ? `of ${mask(formatINR(view.startingCapital, 0))} capital`
        : 'to trade';

  return (
    <View>
      <View className="rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
        <View className="flex-row items-start gap-3 px-4 pb-1 pt-3.5">
          <View className="min-w-0 flex-1">
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
              Total P&amp;L
            </Text>
            <ChangeText
              value={view.totalPnl}
              className="mt-0.5 text-[22px]"
              style={NUM}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {view.totalPnl == null ? '—' : mask(formatSignedINR(view.totalPnl))}
            </ChangeText>
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
              realised − charges + open, live
            </Text>
          </View>
          <View
            accessible
            accessibilityLabel={market.text}
            className="flex-row items-center gap-1.5 pt-1"
          >
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: market.open ? colors.success : colors.textFaint }}
            />
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
              {market.open ? 'Market open' : 'Market closed'}
            </Text>
          </View>
        </View>

        <View className="flex-row flex-wrap p-1.5">
          <Kpi
            width={tileWidth}
            label="Unrealised"
            value={view.unrealised == null ? '—' : mask(formatSignedINR(view.unrealised))}
            tone={view.unrealised}
            sub={`${positions.length} open${view.unpriced ? ` · ${view.unpriced} without a price` : ''}`}
          />
          <Kpi
            width={tileWidth}
            label="Realised"
            value={view.realised == null ? '—' : mask(formatSignedINR(view.realised))}
            tone={view.realised}
            sub={
              view.charges != null
                ? `charges ${mask(formatINR(view.charges))}`
                : 'closed and settled'
            }
          />
          <Kpi
            width={tileWidth}
            label="Margin blocked"
            value={view.marginBlocked == null ? '—' : mask(formatINR(view.marginBlocked, 0))}
            sub="approximate, not SPAN"
          />
          <Kpi
            width={tileWidth}
            label="Available"
            value={view.available == null ? '—' : mask(formatINR(view.available))}
            sub={reservedLine}
          />
          <Kpi
            width={tileWidth}
            label="Cash"
            value={view.cash == null ? '—' : mask(formatINR(view.cash))}
            sub="margin already out of it"
          />
          {t && positions.length > 0 ? (
            <Kpi
              width={tileWidth}
              label="Net Δ · Θ/day"
              value={
                t.netDelta != null
                  ? `${signedGreek(t.netDelta, 1)} · ${signedGreek(t.netTheta, 0)}`
                  : '—'
              }
              sub={
                ungreeked
                  ? `${ungreeked} position${ungreeked === 1 ? '' : 's'} not greeked`
                  : 'whole book'
              }
            />
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage the F&O paper wallet"
          onPress={manage}
          className="flex-row items-center gap-2.5 rounded-b-card border-t border-line px-3.5 py-3 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          <Wallet size={16} color={colors.link} />
          <Text
            className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
            style={NUM}
            numberOfLines={2}
          >
            {market.text}
            {book.data?.asOf ? ` · as of ${timeIst(book.data.asOf, true)} IST` : ''}
          </Text>
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Wallet
          </Text>
        </Pressable>
      </View>
      {book.isError && !book.data ? (
        <InlineError
          className="mt-3"
          what="your F&O book"
          error={book.error}
          onRetry={() => void book.refetch()}
        />
      ) : null}
      {managing ? <FnoWalletSheet onClose={() => setManaging(false)} /> : null}
    </View>
  );
}

function Kpi({
  width,
  label,
  value,
  sub,
  tone,
}: {
  width: `${number}%`;
  label: string;
  value: string;
  sub: string;
  tone?: number | null;
}) {
  return (
    <View className="px-2.5 py-2" style={{ width }}>
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{label}</Text>
      {tone !== undefined ? (
        <ChangeText
          value={tone}
          className="mt-0.5 text-base"
          style={NUM}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </ChangeText>
      ) : (
        <Text
          className="mt-0.5 text-base font-bold text-ink dark:text-ink-dark"
          style={NUM}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
      )}
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

/** The sandbox's own wallet: deposit or withdraw, and the separate, destructive reset. */
export function FnoWalletSheet({ onClose }: { onClose: () => void }) {
  const wallet = usePaperFnoWallet();
  const setWallet = useSetPaperFnoWallet();
  const reset = useResetPaperFno();
  const w = wallet.data;

  const confirmReset = () =>
    confirmAction({
      title: 'Reset the F&O paper sandbox?',
      message:
        'Deletes every F&O position, order and wallet change so the book starts empty at this wallet. Delivery and intraday paper trading are untouched. This can’t be undone.',
      confirmLabel: 'Yes, wipe it',
      cancelLabel: 'Keep my history',
      destructive: true,
      onConfirm: () =>
        reset.mutate(undefined, {
          onSuccess: () => {
            toast.success('F&O sandbox reset');
            onClose();
          },
          onError: (error) => toast.error('Couldn’t reset', getErrorMessage(error)),
        }),
    });

  return (
    <Sheet
      visible
      onClose={onClose}
      busy={setWallet.isPending || reset.isPending}
      title="F&O paper wallet"
      subtitle="Its own pool, apart from the cash wallet"
    >
      {wallet.isPending ? (
        <ListSkeleton rows={2} />
      ) : !w ? (
        <InlineError
          what="the F&O wallet"
          error={wallet.error}
          onRetry={() => void wallet.refetch()}
        />
      ) : (
        <View className="gap-6">
          <View className="flex-row flex-wrap rounded-xl bg-surface-sunk px-2 py-2.5 dark:bg-surface-sunk-dark">
            <Fact label="Wallet" value={formatINR(w.capital)} />
            <Fact label="Free cash" value={formatINR(w.availableCash)} />
            <Fact label="Margin blocked" value={formatINR(w.marginBlocked)} />
            {w.blockedCash > 0 ? (
              <Fact label="Resting orders" value={formatINR(w.blockedCash)} />
            ) : null}
          </View>
          {w.capitalAdded !== 0 ? (
            <Text className="-mt-3 text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
              Started at {formatINR(w.openingCapital)}; {formatSignedINR(w.capitalAdded)} added
              since {w.resetAt ? 'the last reset' : 'it opened'}.
            </Text>
          ) : null}
          <WalletEditor
            key={w.capital}
            wallet={w}
            presets={FNO_WALLET_PRESETS}
            saving={setWallet.isPending}
            error={
              setWallet.error
                ? getErrorMessage(setWallet.error, 'Couldn’t save the F&O wallet.')
                : null
            }
            onSave={(amount) =>
              setWallet.mutate(amount, {
                onSuccess: (next) =>
                  toast.success('F&O wallet updated', `Now ${formatINR(next.capital)}.`),
              })
            }
          />
          <WalletChanges changes={w.changes} />
          <View className="gap-2 border-t border-line pt-4 dark:border-line-dark">
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
              Returns are measured against the capital put in.
            </Text>
            <Button
              label="Reset the F&O sandbox…"
              variant="outline"
              loading={reset.isPending}
              onPress={confirmReset}
            />
          </View>
        </View>
      )}
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/3 px-1.5 py-1">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{label}</Text>
      <Text
        className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark"
        style={NUM}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}
