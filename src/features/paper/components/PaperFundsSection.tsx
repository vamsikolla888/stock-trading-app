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
import { CASH_WALLET_PRESETS } from '../lib/wallet';
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
          message="A forced intraday square-off lost more than its margin. Deposit or reset to trade again."
        />
      ) : null}

      <ListCard className="px-3.5">
        <KeyValueRow
          label="Wallet balance"
          hint="Delivery + intraday"
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
          hint={`${intraday?.leverage ?? 5}× available cash`}
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
        <Section title="By product" note="at trade price">
          <View className="gap-3">
            {delivery ? <ProductCard product={delivery} /> : null}
            {intraday ? <ProductCard product={intraday} /> : null}
          </View>
        </Section>
      ) : null}

      {w.mergedAt ? (
        <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Delivery and intraday pools merged into this wallet on{' '}
          {new Date(w.mergedAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
          .
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
      <KeyValueRow label="Invested" hint="At cost" value={mask(formatINR(product.investedValue))} />
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
        'Deletes every order, position and trade (the wallet amount is kept). F&O paper is untouched. This can’t be undone.',
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
        'Each profile goes back to an empty book at its own wallet. F&O paper is untouched. This can’t be undone.',
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
            <Fact label="Wallet" value={formatINR(wallet.data.capital)} />
            <Fact label="Cash" value={formatINR(wallet.data.cash)} />
            <Fact
              label="Free to withdraw"
              value={formatINR(Math.max(0, wallet.data.availableCash))}
            />
          </View>
          {wallet.data.capitalAdded !== 0 || wallet.data.mergedAt ? (
            <Text
              className="-mt-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {wallet.data.capitalAdded !== 0
                ? `Started at ${formatINR(wallet.data.openingCapital)}; ${formatSignedINR(wallet.data.capitalAdded)} added since ${wallet.data.resetAt ? 'the last reset' : 'it opened'}. `
                : ''}
              {wallet.data.mergedAt
                ? `The separate delivery and intraday wallets were combined into this one on ${new Date(
                    wallet.data.mergedAt,
                  ).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'Asia/Kolkata',
                  })}.`
                : ''}
            </Text>
          ) : null}
          <WalletEditor
            key={wallet.data.capital}
            presets={CASH_WALLET_PRESETS}
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
          <Text className="-mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            Each change is logged in Analytics.
          </Text>
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
