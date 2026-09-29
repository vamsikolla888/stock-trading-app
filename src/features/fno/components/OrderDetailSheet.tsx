import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { Badge } from '@/components/ui/Badge';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { useFnoOrderDetail } from '../hooks';
import { statusLabel, statusTone } from '../lib/chain';
import { contractTitle, dateTimeIst, DASH, lotsLabel, timeIst } from '../lib/format';

import { Caveats, Disclosure, Note, SummaryLine } from './primitives';
import { Sheet } from './Sheet';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * One Groww order in full: Groww's own status word, the fills, and — for an order placed in
 * this app — its lifecycle here and the risk engine's checks.
 */
export function OrderDetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <Sheet
      visible={id != null}
      onClose={onClose}
      title="Order details"
      subtitle={id ? `Groww order ${id}` : undefined}
    >
      {id ? <DetailBody id={id} /> : null}
    </Sheet>
  );
}

function DetailBody({ id }: { id: string }) {
  const { colors } = useTheme();
  const detail = useFnoOrderDetail(id);
  const d = detail.data;
  if (detail.isLoading) {
    return (
      <View className="items-center py-8">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (detail.isError && !d) {
    return (
      <InlineError what="this order" error={detail.error} onRetry={() => void detail.refetch()} />
    );
  }
  if (!d) return null;
  const o = d.order;
  const riskChecks = d.lifecycle?.riskDecision?.checks ?? [];

  return (
    <View className="gap-4 pb-2">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-base font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
            {o.contract ? contractTitle(o.contract) : o.tradingSymbol}
          </Text>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{o.tradingSymbol}</Text>
        </View>
        <Badge label={statusLabel(o.status)} variant={statusTone(o.status)} />
      </View>

      <View>
        <SummaryLine label="Groww status" value={o.growwStatus ?? DASH} />
        <SummaryLine
          label="Side · type · product"
          value={`${o.side ?? DASH} · ${o.orderType ?? DASH} · ${o.product ?? DASH}`}
        />
        <SummaryLine
          label="Quantity"
          value={`${formatQuantity(o.filledQuantity)}/${o.quantity != null ? formatQuantity(o.quantity) : DASH}${
            o.lots != null ? ` (${lotsLabel(o.lots)})` : ''
          }`}
        />
        <SummaryLine
          label="Price"
          value={`${o.price != null ? formatINR(o.price) : o.orderType === 'MARKET' || o.orderType === 'SL-M' ? 'Market' : DASH}${
            o.triggerPrice != null ? ` · trigger ${formatINR(o.triggerPrice)}` : ''
          }`}
        />
        <SummaryLine
          label="Average fill"
          value={o.averagePrice != null ? formatINR(o.averagePrice) : DASH}
        />
        <SummaryLine label="Placed" value={dateTimeIst(o.placedAt)} />
        <SummaryLine label="Reference" value={o.orderReferenceId ?? DASH} />
        {o.remark ? <SummaryLine label="Remark" value={o.remark} /> : null}
      </View>

      <View>
        <Text className="mb-1.5 text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
          Trades ({d.trades.length})
        </Text>
        {d.trades.length === 0 ? (
          <Note>No fills yet.</Note>
        ) : (
          <View className="overflow-hidden rounded-lg border border-line dark:border-line-dark">
            {d.trades.map((t, i) => (
              <View
                key={t.growwTradeId ?? t.exchangeTradeId ?? i}
                className="flex-row items-center gap-2 border-b border-line px-3 py-2 dark:border-line-dark"
              >
                <Text className="w-14 text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
                  {timeIst(t.tradedAt)}
                </Text>
                <Text className="flex-1 text-xs text-ink dark:text-ink-dark" style={NUM}>
                  {formatQuantity(t.quantity)} @ {formatINR(t.price)}
                </Text>
                <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={NUM}>
                  {formatINR(t.value)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {d.lifecycle ? (
        <View>
          <Text className="mb-1.5 text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
            Lifecycle in this app
          </Text>
          <View className="gap-2">
            {(d.lifecycle.events ?? []).map((e, i) => (
              <View key={`${e.status}:${e.at}:${i}`} className="flex-row gap-3">
                <View className="mt-1.5 h-2 w-2 rounded-full bg-brand" />
                <View className="flex-1">
                  <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                    {statusLabel(e.status)}{' '}
                    <Text className="text-xs font-normal text-ink-faint dark:text-ink-dark-faint">
                      {timeIst(e.at, true)}
                    </Text>
                  </Text>
                  {e.note ? (
                    <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                      {e.note}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
          {riskChecks.length > 0 ? (
            <Disclosure
              className="mt-2"
              title="Risk checks"
              meta={`${riskChecks.filter((c) => c.passed).length}/${riskChecks.length} passed`}
            >
              <Caveats items={riskChecks.map((c) => `${c.passed ? '✓' : '✕'} ${c.detail}`)} />
            </Disclosure>
          ) : null}
        </View>
      ) : (
        <Note>
          Placed outside this app (for example from the Groww app), so it has no lifecycle record
          here.
        </Note>
      )}
    </View>
  );
}
