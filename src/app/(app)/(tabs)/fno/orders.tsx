import Search from 'lucide-react-native/icons/search';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Input } from '@/components/ui/Input';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { ConnectGroww, Freshness, GrowwAccessBanner } from '@/features/fno/components/FnoChrome';
import { ModifySheet } from '@/features/fno/components/ModifySheet';
import { OrderCard } from '@/features/fno/components/OrderCard';
import { OrderDetailSheet } from '@/features/fno/components/OrderDetailSheet';
import { useCancelFnoOrder, useFnoOrders, useFnoStatus } from '@/features/fno/hooks';
import { accessProblemFromError } from '@/features/fno/lib/access';
import {
  countByFilter,
  filterOrders,
  ORDER_FILTERS,
  type OrderFilter,
} from '@/features/fno/lib/chain';
import { contractTitle, lotsLabel } from '@/features/fno/lib/format';
import type { FnoOrderRow } from '@/features/fno/types';
import { formatINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

/**
 * Today's Groww F&O order book — every FNO order on the account, including ones placed from
 * the Groww app. Modify (LIMIT / SL / SL-M) and cancel each go through a confirmation; after
 * either, the book shows what GROWW then reports — "cancel requested" is not "cancelled".
 */
export default function FnoOrdersScreen() {
  const { colors } = useTheme();
  const orders = useFnoOrders();
  const status = useFnoStatus();
  const cancel = useCancelFnoOrder();
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [query, setQuery] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [modifying, setModifying] = useState<FnoOrderRow | null>(null);

  const problem = accessProblemFromError(orders.error);
  const rows = useMemo(() => orders.data?.orders ?? [], [orders.data]);
  const counts = useMemo(() => countByFilter(rows), [rows]);
  const shown = useMemo(() => filterOrders(rows, filter, query), [rows, filter, query]);
  const chips = ORDER_FILTERS.map((f) => ({ key: f.key, label: `${f.label} ${counts[f.key]}` }));

  const onRefresh = useCallback(
    () => Promise.all([orders.refetch(), status.refetch()]),
    [orders, status],
  );

  const confirmCancel = useCallback(
    (o: FnoOrderRow) => {
      const title = o.contract ? contractTitle(o.contract) : o.tradingSymbol;
      Alert.alert(
        'Cancel this order?',
        `${o.side ?? ''} ${o.lots != null ? lotsLabel(o.lots) : (o.quantity ?? '')} ${title}${
          o.price != null ? ` @ ${formatINR(o.price)}` : ''
        }. Whatever has already filled (${o.filledQuantity}) stays filled; Groww confirms the cancellation.`,
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Cancel order',
            style: 'destructive',
            onPress: () =>
              cancel.mutate(o.growwOrderId, {
                onSuccess: () =>
                  toast.success('Cancellation requested', 'The book shows what Groww reports.'),
                onError: (error) => toast.error('Could not cancel', getErrorMessage(error)),
              }),
          },
        ],
      );
    },
    [cancel],
  );

  return (
    <GroupScreen onRefresh={onRefresh}>
      {!problem ? <GrowwAccessBanner className="mb-4" /> : null}

      {orders.isLoading ? (
        <ListSkeleton rows={5} />
      ) : problem ? (
        <ConnectGroww problem={problem} what="orders" />
      ) : orders.isError && !orders.data ? (
        <InlineError
          what="your orders"
          error={orders.error}
          onRetry={() => void orders.refetch()}
        />
      ) : orders.data ? (
        <>
          <Chips items={chips} value={filter} onChange={setFilter} />
          <Input
            containerClassName="mt-3"
            value={query}
            onChangeText={setQuery}
            placeholder="Filter by contract"
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Filter orders by contract"
            leftIcon={<Search size={18} color={colors.textMuted} />}
          />
          <Freshness
            className="mt-3"
            asOf={orders.data.asOf}
            updatedAt={orders.dataUpdatedAt}
            refreshFailed={orders.isError}
          />
          <View className="mt-3">
            {shown.length === 0 ? (
              <InlineEmpty
                title={rows.length ? 'No orders match' : 'No F&O orders today'}
                message={
                  rows.length
                    ? 'Try another filter.'
                    : 'Orders you place on your Groww account today — here or in the Groww app — show up here.'
                }
              />
            ) : (
              <ListCard>
                {shown.map((o, index) => (
                  <React.Fragment key={o.growwOrderId}>
                    {index > 0 ? <RowDivider /> : null}
                    <OrderCard
                      order={o}
                      cancelling={cancel.isPending && cancel.variables === o.growwOrderId}
                      onOpen={(row) => setDetailId(row.growwOrderId)}
                      onModify={setModifying}
                      onCancel={confirmCancel}
                    />
                  </React.Fragment>
                ))}
              </ListCard>
            )}
          </View>
          <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            Status is Groww’s. Refreshes every 5 s while an order is open.
          </Text>
        </>
      ) : null}

      <ModifySheet order={modifying} onClose={() => setModifying(null)} />
      <OrderDetailSheet id={detailId} onClose={() => setDetailId(null)} />
    </GroupScreen>
  );
}
