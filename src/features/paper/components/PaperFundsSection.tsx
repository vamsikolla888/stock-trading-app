import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, Section } from '@/components/ui/Section';
import { useMask } from '@/features/portfolio/components/BookSummaryCard';
import { plural } from '@/features/portfolio/lib/dates';
import { confirmAction } from '@/features/settings/lib/confirm';
import { Sheet } from '@/features/trading/components/Sheet';
import { formatINR, formatSignedINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

import { usePaperMutations, usePaperWallet } from '../hooks';
import type { ProductSummary, SegmentOverview } from '../types';

import { WalletChanges, WalletEditor } from './WalletEditor';

/**
 * Funds — where the one wallet's money is (web: Paper trading › Funds). Cash, what open orders
 * hold, what is invested and borrowed, then each product as its own P&L category. Managing the
 * wallet (deposit, withdraw, reset) opens a sheet, because each of those moves real paper money.
 */
export function PaperFundsSection({
  overview,
  isPending,
  error,
  onRetry,
  profileId,
  profileName,
  profileCount,
}: {
  overview: SegmentOverview | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  profileId: string | undefined;
  profileName: string | null;
  profileCount: number;
}) {
  const mask = useMask();
  const [managing, setManaging] = useState(false);

  if (isPending) return <ListSkeleton rows={4} />;
  if (!overview) return <InlineError what="your paper funds" error={error} onRetry={onRetry} />;

  const w = overview.wallet;
  const delivery = overview.segments.find((s) => s.segment === 'equity');
  const intraday = overview.segments.find((s) => s.segment === 'intraday');

  return (
    <View>
      {w.marginShortfall > 0 ? (
        <Banner
          className="mb-4"
          tone="error"
          title={`${formatINR(w.marginShortfall)} short`}
          message="A forced intraday square-off lost more than the margin behind it. That loss is real and isn’t floored at zero — deposit or reset the wallet to trade again."
        />
      ) : null}

      <ListCard className="px-3.5">
        <KeyValueRow
          label="Wallet balance"
          hint="Free to trade — delivery and intraday"
          value={mask(formatINR(w.availableCash))}
        />
        {w.blockedCash > 0 ? (
          <KeyValueRow
            label="Held by open orders"
            hint="Released if they are cancelled"
            value={mask(formatINR(w.blockedCash))}
            divider
          />
        ) : null}
        <KeyValueRow label="Cash" value={mask(formatINR(w.cash))} divider />
        <KeyValueRow
          label="Holdings at market"
          hint="Unpriced positions carried at cost"
          value={mask(formatINR(w.holdingsValue))}
          divider
        />
        {w.borrowed > 0 ? (
          <KeyValueRow
            label="Borrowed (intraday)"
            hint="Owed, so taken off the value"
            value={mask(`−${formatINR(w.borrowed)}`)}
            divider
          />
        ) : null}
        <KeyValueRow
          label="Wallet value"
          hint="Cash + holdings − borrowing"
          value={mask(formatINR(w.value))}
          divider
        />
        <KeyValueRow
          label="Intraday buying power"
          hint="Wallet balance × MIS leverage"
          value={mask(formatINR(w.intradayBuyingPower, 0))}
          divider
        />
      </ListCard>

      <Section title="Capital">
        <ListCard className="px-3.5">
          <KeyValueRow
            label="Put in"
            hint="Opening capital + deposits − withdrawals"
            value={mask(formatINR(w.capital))}
          />
          <KeyValueRow label="Opening capital" value={mask(formatINR(w.openingCapital))} divider />
          {w.capitalAdded !== 0 ? (
            <KeyValueRow
              label="Added since"
              value={mask(formatSignedINR(w.capitalAdded))}
              divider
            />
          ) : null}
          <KeyValueRow
            label="Realised P&L"
            hint="Closed trades, before charges"
            value={mask(formatSignedINR(w.realisedPnl))}
            trend={w.realisedPnl}
            divider
          />
          <KeyValueRow
            label="Unrealised P&L"
            hint="Open positions, before charges"
            value={mask(formatSignedINR(w.unrealisedPnl))}
            trend={w.unrealisedPnl}
            divider
          />
          <KeyValueRow label="Charges" value={mask(`−${formatINR(w.charges)}`)} divider />
          <KeyValueRow
            label="Net P&L"
            hint="Realised + unrealised − charges"
            value={mask(formatSignedINR(w.netPnl))}
            trend={w.netPnl}
            divider
          />
        </ListCard>
        <Button
          label="Manage wallet"
          variant="secondary"
          className="mt-3"
          onPress={() => setManaging(true)}
        />
      </Section>

      {delivery || intraday ? (
        <Section title="By product" note="each its own P&L">
          <View className="gap-3">
            {delivery ? <ProductCard product={delivery} /> : null}
            {intraday ? <ProductCard product={intraday} /> : null}
          </View>
        </Section>
      ) : null}

      {w.mergedAt ? (
        <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Your separate delivery and intraday pools were merged into this one wallet on{' '}
          {new Date(w.mergedAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}{' '}
          — capital and cash added together, nothing else changed.
        </Text>
      ) : null}
      {overview.caveats.map((caveat) => (
        <Text
          key={caveat}
          className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
        >
          {caveat}
        </Text>
      ))}

      {managing ? (
        <WalletSheet
          profileId={profileId}
          profileName={profileName}
          profileCount={profileCount}
          onClose={() => setManaging(false)}
        />
      ) : null}
    </View>
  );
}

function ProductCard({ product }: { product: ProductSummary }) {
  const mask = useMask();
  const intraday = product.segment === 'intraday';
  return (
    <ListCard className="px-3.5 pb-1 pt-3">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="text-sm font-bold text-ink dark:text-ink-dark">
          {product.label} ({product.product})
        </Text>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {plural(product.positionCount, 'open position')}
        </Text>
      </View>
      <KeyValueRow
        label="Invested"
        hint="At the price paid"
        value={mask(formatINR(product.investedValue))}
      />
      {intraday ? (
        <KeyValueRow
          label="Own money / borrowed"
          value={mask(`${formatINR(product.ownFunds, 0)} / ${formatINR(product.borrowed, 0)}`)}
          divider
        />
      ) : null}
      <KeyValueRow label="Current value" value={mask(formatINR(product.currentValue))} divider />
      <KeyValueRow
        label="Unrealised"
        value={mask(formatSignedINR(product.unrealisedPnl))}
        trend={product.unrealisedPnl}
        divider
      />
      <KeyValueRow
        label="Realised"
        hint={`${plural(product.closedTradeCount, 'closed trade')} · ${mask(formatSignedINR(product.realisedNetPnl))} after charges`}
        value={mask(formatSignedINR(product.realisedPnl))}
        trend={product.realisedPnl}
        divider
      />
      <KeyValueRow label="Charges" value={mask(formatINR(product.charges))} divider />
      <KeyValueRow
        label="Net P&L"
        value={mask(formatSignedINR(product.netPnl))}
        trend={product.netPnl}
        divider
      />
    </ListCard>
  );
}

/** Deposit / withdraw, and the two destructive resets — each confirmed. */
function WalletSheet({
  profileId,
  profileName,
  profileCount,
  onClose,
}: {
  profileId: string | undefined;
  profileName: string | null;
  profileCount: number;
  onClose: () => void;
}) {
  const wallet = usePaperWallet(profileId);
  const { setWallet, reset, resetAll } = usePaperMutations(profileId);
  const busy = setWallet.isPending || reset.isPending || resetAll.isPending;
  const name = profileName ?? 'this profile';

  const confirmReset = () =>
    confirmAction({
      title: `Reset ${name}?`,
      message:
        'Deletes every delivery and intraday position, order and wallet change, so the book starts empty at this wallet. F&O paper trading is untouched. This can’t be undone.',
      confirmLabel: 'Reset',
      cancelLabel: 'Keep my history',
      destructive: true,
      onConfirm: () =>
        reset.mutate(undefined, {
          onSuccess: () => {
            toast.success('Paper account reset', 'Back to an empty book at your wallet.');
            onClose();
          },
          onError: (error) => toast.error('Couldn’t reset', getErrorMessage(error)),
        }),
    });

  const confirmResetAll = () =>
    confirmAction({
      title: `Reset all ${profileCount} profiles?`,
      message:
        'Every paper profile — default included — goes back to an empty book at its own wallet. The profiles themselves are kept. F&O paper trading is untouched. This can’t be undone.',
      confirmLabel: 'Reset all',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: () =>
        resetAll.mutate(undefined, {
          onSuccess: (result) => {
            toast.success(`${plural(result.reset.length, 'profile')} reset`);
            onClose();
          },
          onError: (error) => toast.error('Reset stopped part-way', getErrorMessage(error)),
        }),
    });

  return (
    <Sheet
      visible
      onClose={onClose}
      busy={busy}
      title="Paper wallet"
      subtitle={`${profileName ?? 'Default profile'} · one wallet for delivery and intraday`}
    >
      {wallet.isPending ? (
        <ListSkeleton rows={2} />
      ) : !wallet.data ? (
        <InlineError what="the wallet" error={wallet.error} onRetry={() => void wallet.refetch()} />
      ) : (
        <View className="gap-6">
          <View className="flex-row rounded-xl bg-surface-sunk px-3.5 py-3 dark:bg-surface-sunk-dark">
            <Fact label="Wallet now" value={formatINR(wallet.data.capital, 0)} />
            <Fact label="Free cash" value={formatINR(wallet.data.availableCash, 0)} />
            <Fact label="Lowest now" value={formatINR(wallet.data.minCapital, 0)} />
          </View>
          <WalletEditor
            key={wallet.data.capital}
            wallet={wallet.data}
            saving={setWallet.isPending}
            error={
              setWallet.error ? getErrorMessage(setWallet.error, 'Couldn’t save the wallet.') : null
            }
            onSave={(amount) =>
              setWallet.mutate(amount, {
                onSuccess: (next) =>
                  toast.success('Wallet updated', `Now ${formatINR(next.capital, 0)}.`),
              })
            }
          />
          <WalletChanges changes={wallet.data.changes} />
          <View className="gap-2 border-t border-line pt-4 dark:border-line-dark">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
              Start over
            </Text>
            <Button
              label={`Reset ${name}`}
              variant="outline"
              loading={reset.isPending}
              onPress={confirmReset}
            />
            {profileCount > 1 ? (
              <Button
                label={`Reset all ${profileCount} profiles`}
                variant="ghost"
                loading={resetAll.isPending}
                onPress={confirmResetAll}
              />
            ) : null}
          </View>
        </View>
      )}
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{label}</Text>
      <Text
        className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark"
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}
