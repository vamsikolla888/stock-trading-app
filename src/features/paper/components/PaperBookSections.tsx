import React, { useMemo, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { StockRow } from '@/components/market/StockRow';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { stockLogoUrl } from '@/features/market/api';
import { formatReturn, useMask } from '@/features/portfolio/components/BookSummaryCard';
import { formatAsOf, formatDay, istDateOf, plural } from '@/features/portfolio/lib/dates';
import { PriceInput } from '@/features/trading/components/OrderInputs';
import { Note, Sheet } from '@/features/trading/components/Sheet';
import type { TicketParams } from '@/features/trading/lib/ticket';
import {
  formatINR,
  formatQuantity,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { usePaperMutations } from '../hooks';
import {
  parsePositive,
  POOL_LABEL,
  quoteKey,
  rowMark,
  squareOffText,
  sumOrNull,
  type RowMark,
} from '../lib/book';
import type { CashSegment, PaperPortfolio, PaperPosition, QuoteRow } from '../types';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

export type OpenTicket = (params: Omit<TicketParams, 'mode' | 'profileId'>) => void;

const positionKey = (position: PaperPosition) =>
  `${position.segment}:${position.exchange}:${position.symbol}`;

/** "₹3,100 / ₹2,800" — whole rupees when whole, paise otherwise, so it fits one line. */
function level(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number.isInteger(value) ? formatINR(value, 0) : formatINR(value);
}

interface BookProps {
  quotes: Record<string, QuoteRow> | undefined;
  profileId: string | undefined;
  onTrade: OpenTicket;
  /** Opens the paper order search on this pool. */
  onNewOrder: (segment: CashSegment) => void;
}

function useMarks(
  positions: readonly PaperPosition[],
  quotes: Record<string, QuoteRow> | undefined,
) {
  return useMemo(
    () =>
      positions.map((position) => ({
        position,
        mark: rowMark(position, quotes?.[quoteKey(position.exchange, position.symbol)]),
      })),
    [positions, quotes],
  );
}

// ── Holdings: the delivery (CNC) pool ────────────────────────────────────────────────────

/** The delivery pool as a broker's holdings list: qty · cost-inclusive avg, value, returns. */
export function PaperHoldingsSection({
  portfolio,
  now,
  ...props
}: BookProps & { portfolio: PaperPortfolio; now: number }) {
  const mask = useMask();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rows = useMarks(portfolio.positions, props.quotes);
  const totalPnl = sumOrNull(rows.map(({ mark }) => mark.pnl));
  const open = rows.find(({ position }) => positionKey(position) === openKey) ?? null;

  if (rows.length === 0) {
    return (
      <InlineEmpty
        title="No delivery holdings"
        message="Buy a stock with virtual cash — it's held here, marked at real prices."
        action={{ label: 'Buy a stock', onPress: () => props.onNewOrder('equity') }}
      />
    );
  }

  return (
    <View>
      <View className="mb-2.5 flex-row items-center justify-between gap-3">
        <Text
          className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={1}
        >
          {plural(rows.length, 'holding')} · Delivery (CNC)
          {portfolio.pricesAsOf ? ` · marks ${formatAsOf(portfolio.pricesAsOf, now)}` : ''}
        </Text>
        <ChangeText value={totalPnl} className="text-[13px]" style={NUMBERS}>
          {totalPnl === null ? '—' : mask(formatSignedINR(totalPnl))}
        </ChangeText>
      </View>
      <ListCard>
        {rows.map(({ position, mark }, index) => (
          <View key={positionKey(position)}>
            {index > 0 ? <RowDivider /> : null}
            <PositionRow
              position={position}
              mark={mark}
              subtitle={`${formatQuantity(position.quantity)} ${position.quantity === 1 ? 'share' : 'shares'} · Avg ${formatINR(position.avgPrice)}${
                position.targetPrice !== null && position.targetPrice !== undefined
                  ? ' · target set'
                  : ''
              }`}
              onPress={() => setOpenKey(positionKey(position))}
            />
          </View>
        ))}
      </ListCard>
      <Note>
        Avg is cost-inclusive — it already contains the charges paid on the way in, so it's your
        break-even price.
      </Note>

      {open ? (
        <PaperPositionSheet
          position={open.position}
          mark={open.mark}
          profileId={props.profileId}
          now={now}
          onClose={() => setOpenKey(null)}
          onTrade={(params) => {
            setOpenKey(null);
            props.onTrade(params);
          }}
        />
      ) : null}
    </View>
  );
}

// ── Positions: the intraday (MIS) pool ───────────────────────────────────────────────────

/**
 * The intraday pool: leveraged, squared off at 15:15 IST. A refused entry and a shortfall
 * left by a forced square-off show even when nothing is open — that's when they matter most.
 */
export function PaperPositionsSection({
  portfolio,
  now,
  ...props
}: BookProps & { portfolio: PaperPortfolio; now: number }) {
  const mask = useMask();
  const { sweep } = usePaperMutations(props.profileId);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rows = useMarks(portfolio.positions, props.quotes);
  const totalPnl = sumOrNull(rows.map(({ mark }) => mark.pnl));
  const called = portfolio.positions.filter((position) => position.marginCall);
  const open = rows.find(({ position }) => positionKey(position) === openKey) ?? null;
  const shortfall = portfolio.marginShortfall ?? 0;

  const squareOff = () =>
    sweep.mutate(undefined, {
      onSuccess: (result) => {
        const closed = result.squaredOff + result.marginCalled + result.staleClosed;
        toast.info(
          closed === 0 ? 'Nothing to close' : `Closed ${plural(closed, 'intraday position')}`,
          closed === 0
            ? `The sweep ran in ${result.mode} mode — before 15:15 IST it only closes margin calls.`
            : undefined,
        );
      },
      onError: (error) => toast.error('Couldn’t run the sweep', getErrorMessage(error)),
    });

  const alerts = (
    <>
      {portfolio.intradayEntryBlockedReason ? (
        <Banner className="mb-3" tone="info" message={portfolio.intradayEntryBlockedReason} />
      ) : null}
      {shortfall > 0 ? (
        <Banner
          className="mb-3"
          tone="error"
          title={`${formatINR(shortfall)} short`}
          message="A forced square-off lost more than the margin behind it. That loss is real and isn't floored at zero — reset the intraday pool from Funds to start again."
        />
      ) : null}
      {called.length > 0 ? (
        <Banner
          className="mb-3"
          tone="error"
          title={`${plural(called.length, 'position')} will be force-closed on the next sweep`}
          message={`${called.map((position) => position.symbol).join(', ')} — each has lost most of the margin behind it. Exit now if you'd rather choose the moment.`}
        />
      ) : null}
    </>
  );

  if (rows.length === 0) {
    return (
      <View>
        {alerts}
        <InlineEmpty
          title="No intraday positions"
          message="Pick Intraday in a paper order to open one — they're squared off at 3:15 PM IST."
          action={{ label: 'Trade intraday', onPress: () => props.onNewOrder('intraday') }}
        />
      </View>
    );
  }

  return (
    <View>
      {alerts}
      <View className="mb-2.5 flex-row items-center justify-between gap-3">
        <Text
          className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={2}
        >
          {rows.length} open · {squareOffText(portfolio.minutesToSquareOff)}
        </Text>
        <ChangeText value={totalPnl} className="text-[13px]" style={NUMBERS}>
          {totalPnl === null ? '—' : mask(formatSignedINR(totalPnl))}
        </ChangeText>
      </View>
      <ListCard>
        {rows.map(({ position, mark }, index) => (
          <View key={positionKey(position)}>
            {index > 0 ? <RowDivider /> : null}
            <PositionRow
              position={position}
              mark={mark}
              subtitle={`${formatQuantity(position.quantity)} qty · Avg ${formatINR(position.avgPrice)} · margin ${formatINR(position.ownFunds ?? position.investedValue, 0)}`}
              onPress={() => setOpenKey(positionKey(position))}
            />
          </View>
        ))}
      </ListCard>
      <Button
        label="Square off now"
        variant="outline"
        size="sm"
        className="mt-3 self-start"
        loading={sweep.isPending}
        onPress={squareOff}
      />
      <Note>
        Runs the same sweep the worker runs every minute. It reads the clock, so before 3:15 PM IST
        it can only force-close a margin call. Margin is your own money in each position; the rest
        is borrowed at {portfolio.leverage ?? 5}× and repaid on exit — P&L % is against that margin.
      </Note>

      {open ? (
        <PaperPositionSheet
          position={open.position}
          mark={open.mark}
          profileId={props.profileId}
          now={now}
          onClose={() => setOpenKey(null)}
          onTrade={(params) => {
            setOpenKey(null);
            props.onTrade(params);
          }}
        />
      ) : null}
    </View>
  );
}

function PositionRow({
  position,
  mark,
  subtitle,
  onPress,
}: {
  position: PaperPosition;
  mark: RowMark;
  subtitle: string;
  onPress: () => void;
}) {
  const mask = useMask();
  return (
    <StockRow
      symbol={position.symbol}
      exchange={position.exchange}
      logoUri={stockLogoUrl(position.symbol)}
      subtitle={subtitle}
      onPress={onPress}
      right={
        <View className="items-end">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" style={NUMBERS}>
            {mask(formatINR(mark.value ?? position.investedValue))}
          </Text>
          <ChangeText value={mark.pnl} className="mt-0.5 text-xs" style={NUMBERS}>
            {mark.pnl === null ? 'No price' : mask(formatReturn(mark.pnl, mark.pnlPct))}
          </ChangeText>
        </View>
      }
    />
  );
}

// ── One position ─────────────────────────────────────────────────────────────────────────

function PaperPositionSheet({
  position,
  mark,
  profileId,
  now,
  onClose,
  onTrade,
}: {
  position: PaperPosition;
  mark: RowMark;
  profileId: string | undefined;
  now: number;
  onClose: () => void;
  onTrade: OpenTicket;
}) {
  const mask = useMask();
  const [editing, setEditing] = useState(false);
  const intraday = position.segment === 'intraday';
  const product = intraday ? 'intraday' : 'delivery';
  const hasLevels =
    (position.targetPrice ?? null) !== null || (position.stopPrice ?? null) !== null;

  if (editing) {
    return (
      <LevelsSheet position={position} profileId={profileId} onClose={() => setEditing(false)} />
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={position.symbol}
      subtitle={`${position.exchange} · ${POOL_LABEL[position.segment]} (${position.product}) · paper${
        position.companyName ? ` · ${position.companyName}` : ''
      }`}
      footer={
        <View className="flex-row gap-2.5">
          <Button
            label={intraday ? 'Exit' : 'Sell'}
            variant="danger"
            className="flex-1"
            onPress={() =>
              onTrade({
                symbol: position.symbol,
                exchange: position.exchange,
                side: 'SELL',
                qty: position.quantity,
                product,
              })
            }
          />
          <Button
            label={intraday ? 'Add' : 'Buy more'}
            className="flex-1"
            onPress={() =>
              onTrade({
                symbol: position.symbol,
                exchange: position.exchange,
                side: 'BUY',
                product,
              })
            }
          />
        </View>
      }
    >
      {position.marginCall ? (
        <Banner
          className="mb-3"
          tone="error"
          title="Margin call"
          message="This position has lost most of the margin behind it and will be force-closed on the next sweep."
        />
      ) : null}
      <View className="rounded-xl bg-surface-sunk px-3.5 py-3 dark:bg-surface-sunk-dark">
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Current value</Text>
        <Text className="mt-0.5 text-[22px] font-bold text-ink dark:text-ink-dark" style={NUMBERS}>
          {mask(formatINR(mark.value ?? position.investedValue))}
        </Text>
        <ChangeText value={mark.pnl} className="mt-0.5 text-[13px]" style={NUMBERS}>
          {mark.pnl === null
            ? 'No price yet — shown at cost'
            : `${mask(formatReturn(mark.pnl, mark.pnlPct))} unrealised`}
        </ChangeText>
      </View>

      <KeyValueRow label="Quantity" value={formatQuantity(position.quantity)} />
      <KeyValueRow
        label="Average price"
        hint="Cost-inclusive — your break-even"
        value={formatINR(position.avgPrice)}
        divider
      />
      <KeyValueRow
        label="Last price"
        value={`${formatINR(mark.ltp)}${mark.changePct !== null ? `  ${formatSignedPercent(mark.changePct)}` : ''}`}
        divider
      />
      <KeyValueRow label="Invested" value={mask(formatINR(position.investedValue))} divider />
      {intraday ? (
        <>
          <KeyValueRow
            label="Your margin"
            hint="Own money in the position"
            value={mask(formatINR(position.ownFunds ?? position.investedValue))}
            divider
          />
          <KeyValueRow
            label="Borrowed"
            hint="Repaid from the proceeds on exit"
            value={mask(formatINR(position.borrowedAmount ?? 0))}
            divider
          />
        </>
      ) : null}
      {position.openedAt ? (
        <KeyValueRow label="Opened" value={formatDay(istDateOf(position.openedAt), now)} divider />
      ) : null}

      <View className="mt-3 rounded-xl border border-line p-3.5 dark:border-line-dark">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
            Target / stop
          </Text>
          {hasLevels ? (
            <Badge
              label={position.autoExit ? 'Acted on' : 'Reminder only'}
              variant={position.autoExit ? 'primary' : 'neutral'}
            />
          ) : null}
        </View>
        <Text className="mt-1 text-sm font-semibold text-ink dark:text-ink-dark" style={NUMBERS}>
          {hasLevels ? `${level(position.targetPrice)} / ${level(position.stopPrice)}` : 'None set'}
        </Text>
        <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {position.autoExit
            ? 'An engine sells the whole position at the first snapshot price at or beyond either level, once a minute in market hours.'
            : 'Recorded for reference — nothing acts on reminders.'}
        </Text>
        <Button
          label={hasLevels ? 'Edit levels' : 'Set levels'}
          variant="link"
          className="mt-1 self-start"
          onPress={() => setEditing(true)}
        />
      </View>
    </Sheet>
  );
}

/**
 * Edits a position's target and stop, and whether they're acted on. Two separate controls
 * on purpose: a field that looks like a stop-loss but is only a note is the most dangerous
 * control this screen could have, and so is one that silently sells.
 */
function LevelsSheet({
  position,
  profileId,
  onClose,
}: {
  position: PaperPosition;
  profileId: string | undefined;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { updateLevels } = usePaperMutations(profileId);
  const [target, setTarget] = useState(
    position.targetPrice !== null && position.targetPrice !== undefined
      ? String(position.targetPrice)
      : '',
  );
  const [stop, setStop] = useState(
    position.stopPrice !== null && position.stopPrice !== undefined
      ? String(position.stopPrice)
      : '',
  );
  const [autoExit, setAutoExit] = useState(Boolean(position.autoExit));
  const targetValue = parsePositive(target);
  const stopValue = parsePositive(stop);
  const hasLevel = targetValue !== null || stopValue !== null;
  const acting = autoExit && hasLevel;
  const crossed = targetValue !== null && stopValue !== null && targetValue <= stopValue;

  const save = () =>
    updateLevels.mutate(
      {
        exchange: position.exchange,
        symbol: position.symbol,
        segment: position.segment,
        targetPrice: targetValue,
        stopPrice: stopValue,
        // Sent only when it changed — a default would demote a bracket to reminders.
        ...(acting !== Boolean(position.autoExit) ? { autoExit: acting } : {}),
      },
      {
        onSuccess: () => {
          toast.success(
            'Levels saved',
            acting ? 'They will be acted on in market hours.' : 'Kept as reminders only.',
          );
          onClose();
        },
      },
    );

  return (
    <Sheet
      visible
      busy={updateLevels.isPending}
      onClose={onClose}
      title={`Levels · ${position.symbol}`}
      subtitle={`${POOL_LABEL[position.segment]} · paper`}
      footer={
        <Button
          label="Save levels"
          size="lg"
          fullWidth
          disabled={crossed}
          loading={updateLevels.isPending}
          onPress={save}
        />
      }
    >
      <View className="flex-row gap-3">
        <PriceInput label="Target price" value={target} onChange={setTarget} placeholder="none" />
        <PriceInput
          label="Stop price"
          value={stop}
          onChange={setStop}
          placeholder="none"
          error={crossed ? 'Keep the stop below the target' : null}
        />
      </View>
      <View className="mt-4 flex-row items-start gap-3">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
            Act on these levels
          </Text>
          <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
            {hasLevel
              ? 'On: an engine sells the whole position at the first snapshot price at or beyond either level, once a minute in market hours. Off: they are reminders, and nothing acts on them.'
              : 'Enter a target or a stop first — authorising an engine to act on nothing reads as protection and is not.'}
          </Text>
        </View>
        <Switch
          accessibilityLabel="Act on these levels"
          value={acting}
          disabled={!hasLevel}
          onValueChange={setAutoExit}
          trackColor={{ true: colors.primary, false: colors.borderStrong }}
        />
      </View>
      {updateLevels.error ? (
        <Banner className="mt-3" tone="error" message={getErrorMessage(updateLevels.error)} />
      ) : null}
    </Sheet>
  );
}
