import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatSignedINR } from '@/lib/utils/formatters';

import { presetLabel, WALLET_PRESETS, walletDraft, type WalletLimits } from '../lib/wallet';
import type { WalletChange } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * Set a paper wallet's capital. Raising it deposits the difference and lowering it withdraws
 * free cash; positions, orders and booked P&L stay exactly as they are. What saving would do is
 * spelled out before the button — the part people get wrong. Shared by the cash paper wallet and
 * the F&O sandbox's, which follow the same rule on the server.
 */
export function WalletEditor({
  wallet,
  saving,
  error,
  onSave,
  presets = WALLET_PRESETS,
}: {
  wallet: WalletLimits;
  saving: boolean;
  error: string | null;
  onSave: (amount: number) => void;
  /** One-tap amounts; the cash wallet's by default (the F&O wallet passes its own). */
  presets?: readonly number[];
}) {
  const [text, setText] = useState(String(Math.round(wallet.capital)));
  const draft = walletDraft(wallet, text);

  return (
    <View className="gap-3">
      <Input
        label="Change the wallet to (₹)"
        value={text}
        onChangeText={setText}
        keyboardType="number-pad"
        inputMode="numeric"
        returnKeyType="done"
        onSubmitEditing={() => draft.canSave && draft.amount != null && onSave(draft.amount)}
        error={draft.tooLow || draft.tooHigh ? draft.message : undefined}
        helperText={draft.tooLow || draft.tooHigh ? undefined : draft.message}
        style={NUM}
      />
      <View className="flex-row gap-2">
        {presets.map((preset) => {
          const selected = draft.amount === preset;
          const disabled = preset < wallet.minCapital || preset > wallet.maxCapital;
          return (
            <Pressable
              key={preset}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={formatINR(preset, 0)}
              disabled={disabled}
              onPress={() => setText(String(preset))}
              className={cn(
                'h-9 flex-1 items-center justify-center rounded-lg border',
                selected
                  ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
                  : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
                disabled && 'opacity-40',
              )}
            >
              <Text
                className={cn(
                  'text-xs font-semibold',
                  selected
                    ? 'text-brand-text dark:text-brand-text-dark'
                    : 'text-ink-muted dark:text-ink-dark-muted',
                )}
              >
                {presetLabel(preset)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Banner tone="error" message={error} /> : null}
      <Button
        label={
          draft.delta > 0
            ? `Deposit ${formatINR(draft.delta, 0)}`
            : draft.delta < 0
              ? `Withdraw ${formatINR(-draft.delta, 0)}`
              : 'Save wallet'
        }
        loading={saving}
        disabled={!draft.canSave}
        onPress={() => draft.amount != null && onSave(draft.amount)}
      />
    </View>
  );
}

/** Deposits and withdrawals since the last reset, newest first. */
export function WalletChanges({ changes }: { changes: readonly WalletChange[] }) {
  if (changes.length === 0) return null;
  return (
    <View className="gap-2">
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
        Changes since the last reset
      </Text>
      {changes.map((change) => (
        <View key={change.id} className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-[13px] text-ink dark:text-ink-dark" style={NUM}>
              {formatINR(change.capitalBefore)} → {formatINR(change.capitalAfter)}
            </Text>
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
              {new Date(change.at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: 'Asia/Kolkata',
              })}
              {change.legacyPool
                ? ` · ${change.legacyPool === 'equity' ? 'delivery' : 'intraday'} pool, before the merge`
                : ''}
            </Text>
          </View>
          <Text
            className={
              change.amount >= 0
                ? 'text-[13px] font-semibold text-brand-text dark:text-brand-text-dark'
                : 'text-[13px] font-semibold text-danger-600 dark:text-danger-dark'
            }
            style={NUM}
          >
            {change.amount >= 0 ? 'Deposit' : 'Withdrawal'} {formatSignedINR(change.amount)}
          </Text>
        </View>
      ))}
    </View>
  );
}
