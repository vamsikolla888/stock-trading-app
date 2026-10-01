import Wallet from 'lucide-react-native/icons/wallet';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { WalletChanges, WalletEditor } from '@/features/paper/components/WalletEditor';
import { useMask } from '@/features/portfolio/components/BookSummaryCard';
import { confirmAction } from '@/features/settings/lib/confirm';
import { Sheet } from '@/features/trading/components/Sheet';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatSignedINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { usePaperBook, usePaperFnoWallet, useResetPaperFno, useSetPaperFnoWallet } from '../hooks';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * The F&O paper account at a glance (web: /fno/paper's KPI row): unrealised, realised, margin
 * blocked and the wallet balance, then charges and the net once they are out. Deliberately no
 * "today's P&L" — the F&O book stores no previous-close baseline, and a figure this account
 * cannot measure is worse than none. The wallet is the sandbox's OWN pool, separate from the
 * delivery/intraday paper wallet.
 */
export function PaperFnoSummary() {
  const { colors } = useTheme();
  const mask = useMask();
  const book = usePaperBook();
  const wallet = usePaperFnoWallet();
  const [managing, setManaging] = useState(false);

  const t = book.data?.totals;
  const w = wallet.data;
  const open = book.data?.positions.length ?? 0;
  const net = t ? t.unrealisedPnl + t.realisedPnl - t.totalCharges : null;

  if (book.isPending && wallet.isPending) return <ListSkeleton rows={2} />;

  return (
    <View>
      <View className="rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
        <View className="flex-row flex-wrap p-1.5">
          <Kpi
            label="Unrealised P&L"
            value={t ? mask(formatSignedINR(t.unrealisedPnl)) : '—'}
            tone={t?.unrealisedPnl}
            sub={t ? `${open} open position${open === 1 ? '' : 's'}` : 'open positions, live'}
          />
          <Kpi
            label="Realised P&L"
            value={t ? mask(formatSignedINR(t.realisedPnl)) : '—'}
            tone={t?.realisedPnl}
            sub="closed and settled"
          />
          <Kpi
            label="Margin blocked"
            value={t ? mask(formatINR(t.marginBlocked, 0)) : '—'}
            sub="approximate, not SPAN"
          />
          <Kpi
            label="Wallet balance"
            value={w ? mask(formatINR(w.availableCash)) : '—'}
            sub={
              w && w.blockedCash > 0
                ? `${mask(formatINR(w.blockedCash, 0))} held by limit orders`
                : 'free to trade'
            }
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage the F&O paper wallet"
          onPress={() => setManaging(true)}
          className="flex-row items-center gap-2.5 rounded-b-card border-t border-line px-3.5 py-3 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          <Wallet size={16} color={colors.link} />
          <Text
            className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
            style={NUM}
            numberOfLines={2}
          >
            Charges {t ? mask(formatINR(t.totalCharges)) : '—'} · Net after charges{' '}
            <ChangeText value={net} className="text-xs">
              {net == null ? '—' : mask(formatSignedINR(net))}
            </ChangeText>
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
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: number | null;
}) {
  return (
    <View className="w-1/2 px-2.5 py-2">
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
      subtitle="Its own pool — separate from the delivery and intraday wallet"
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
            <Fact label="Wallet now" value={formatINR(w.capital, 0)} />
            <Fact label="Free cash" value={formatINR(w.availableCash, 0)} />
            <Fact label="Margin blocked" value={formatINR(w.marginBlocked, 0)} />
            {w.blockedCash > 0 ? (
              <Fact label="Limit orders" value={formatINR(w.blockedCash, 0)} />
            ) : null}
          </View>
          {w.capitalAdded !== 0 ? (
            <Text className="-mt-3 text-xs text-ink-muted dark:text-ink-dark-muted">
              Started at {formatINR(w.openingCapital, 0)}; {formatSignedINR(w.capitalAdded, 0)}{' '}
              added since {w.resetAt ? 'the last reset' : 'it opened'}.
            </Text>
          ) : null}
          <WalletEditor
            key={w.capital}
            wallet={w}
            saving={setWallet.isPending}
            error={
              setWallet.error
                ? getErrorMessage(setWallet.error, 'Couldn’t save the F&O wallet.')
                : null
            }
            onSave={(amount) =>
              setWallet.mutate(amount, {
                onSuccess: (next) =>
                  toast.success('F&O wallet updated', `Now ${formatINR(next.capital, 0)}.`),
              })
            }
          />
          <WalletChanges changes={w.changes} />
          <View className="gap-2 border-t border-line pt-4 dark:border-line-dark">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
              Start over
            </Text>
            <Button
              label="Reset the F&O sandbox"
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
    <View className={cn('w-1/3 px-1.5 py-1')}>
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
