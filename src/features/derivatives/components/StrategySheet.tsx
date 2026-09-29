import { useRouter } from 'expo-router';
import Square from 'lucide-react-native/icons/square';
import SquareCheck from 'lucide-react-native/icons/square-check';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import {
  Caveats,
  Disclosure,
  FieldLabel,
  LotsStepper,
  Note,
  SideTag,
  SummaryLine,
  Tag,
} from '@/features/fno/components/primitives';
import { Sheet } from '@/features/fno/components/Sheet';
import {
  daysUntil,
  dteLabel,
  expiryLabel,
  formatStrike,
  lotsLabel,
} from '@/features/fno/lib/format';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { useBuildStrategy, usePlacePaperBasket, useStrategyTemplates } from '../hooks';
import { basketName, basketOutcome, outlookTone, PAPER_MAX_LOTS } from '../lib/book';
import { paperBookHref } from '../lib/routes';
import type { BuildStrategyResult, FnoOrderView } from '../types';

import { PayoffChart } from './PayoffChart';
import { ProbabilityPanel } from './ProbabilityPanel';

/**
 * Pick a template, resolve it against the real chain, see what it would cost, place it — all
 * in the paper book. THE TEMPLATE IS NOT THE POSITION: nothing is placeable until the server
 * has resolved concrete contracts and priced them, and anything that changes what would be
 * placed throws that priced result away. UNLIMITED RISK IS GATED: the place button stays dead
 * until the risk sentence has been acknowledged.
 */
export function StrategySheet({
  visible,
  underlying,
  expiry,
  expiries,
  onClose,
}: {
  visible: boolean;
  underlying: string | null;
  expiry: string | null;
  expiries: readonly string[];
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      busy={busy}
      title="Strategy builder"
      subtitle={underlying ? `Paper · resolved against ${underlying}` : 'Pick an underlying first'}
    >
      {visible && underlying ? (
        // The chain's selection leads: a new underlying or expiry is a new build.
        <Builder
          key={`${underlying}:${expiry ?? ''}`}
          underlying={underlying}
          chainExpiry={expiry}
          expiries={expiries}
          onBusy={setBusy}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function Builder({
  underlying,
  chainExpiry,
  expiries,
  onBusy,
  onClose,
}: {
  underlying: string;
  chainExpiry: string | null;
  expiries: readonly string[];
  onBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const templates = useStrategyTemplates();
  const build = useBuildStrategy();
  const place = usePlacePaperBasket();
  const inFlight = useRef(false);
  const [key, setKey] = useState<string | null>(null);
  const [lots, setLots] = useState(1);
  const [chosenExpiry, setChosenExpiry] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [built, setBuilt] = useState<BuildStrategyResult | null>(null);
  const [placed, setPlaced] = useState<FnoOrderView[] | null>(null);

  const expiry = chosenExpiry ?? chainExpiry ?? expiries[0] ?? null;
  const definition = templates.data?.find((t) => t.key === key) ?? null;
  const lotsOk = Number.isInteger(lots) && lots >= 1 && lots <= PAPER_MAX_LOTS;

  /** Anything that changes WHAT would be placed discards the priced result. */
  const invalidate = () => {
    setBuilt(null);
    setPlaced(null);
    setAcknowledged(false);
    build.reset();
    place.reset();
  };

  const runBuild = () => {
    if (!key || !expiry || !lotsOk || build.isPending) return;
    setPlaced(null);
    build.mutate({ strategyKey: key, underlying, expiry, lots }, { onSuccess: setBuilt });
  };

  const runPlace = () => {
    if (!built?.buildable || place.isPending || inFlight.current) return;
    if (built.definition.unlimitedRisk && !acknowledged) return;
    inFlight.current = true;
    onBusy(true);
    place.mutate(
      {
        basketName: basketName(built.definition.name, underlying, expiryLabel(built.expiry)),
        legs: built.legs.map((l) => ({
          tradingsymbol: l.tradingsymbol,
          exchange: l.exchange === 'BFO' ? 'BFO' : 'NFO',
          side: l.side,
          lots: l.lots,
        })),
      },
      {
        onSuccess: (result) => {
          setPlaced(result.orders);
          const outcome = basketOutcome(result.orders);
          const summary = `${outcome.filled} of ${outcome.total} legs filled`;
          if (outcome.filled === outcome.total) toast.success('Paper basket placed', summary);
          else toast.info('Paper basket partly filled', summary);
        },
        onSettled: () => {
          inFlight.current = false;
          onBusy(false);
        },
      },
    );
  };

  /* Placed: the per-leg outcome, in the server's words. */
  if (placed) {
    const outcome = basketOutcome(placed);
    return (
      <View className="gap-4 pb-1">
        <Banner
          tone={outcome.filled === outcome.total ? 'success' : 'warning'}
          title={`${outcome.filled} of ${outcome.total} legs filled`}
          message={
            outcome.filled === outcome.total
              ? 'Every leg is in your paper book under one basket.'
              : 'Legs are placed one at a time, so a later leg can be rejected after an earlier one filled. Check your paper positions.'
          }
        />
        <View className="overflow-hidden rounded-xl border border-line dark:border-line-dark">
          {placed.map((o, i) => (
            <View
              key={o.id}
              className={cn(
                'gap-1 px-3.5 py-2.5',
                i > 0 && 'border-t border-line dark:border-line-dark',
              )}
            >
              <View className="flex-row items-center gap-2">
                <SideTag side={o.side} />
                <Text
                  className="min-w-0 flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
                  numberOfLines={1}
                >
                  {o.tradingsymbol}
                </Text>
                <Badge label={o.status} variant={o.status === 'FILLED' ? 'success' : 'danger'} />
              </View>
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                {lotsLabel(o.lots)}
                {o.status === 'FILLED' ? ` at ${formatINR(o.price)}` : ''}
                {o.note ? ` · ${o.note}` : ''}
              </Text>
            </View>
          ))}
        </View>
        <Button label="Done" size="lg" fullWidth onPress={onClose} />
        <Button
          label="View paper positions"
          variant="ghost"
          fullWidth
          onPress={() => {
            onClose();
            router.dismissTo(paperBookHref('positions'));
          }}
        />
      </View>
    );
  }

  /* No template yet: the catalogue. */
  if (!definition) {
    if (templates.isLoading) {
      return (
        <View className="items-center py-8">
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }
    if (templates.isError && !templates.data) {
      return (
        <InlineError
          what="strategy templates"
          error={templates.error}
          onRetry={() => void templates.refetch()}
        />
      );
    }
    if (templates.data && templates.data.length === 0) {
      return (
        <InlineEmpty title="No strategy templates" message="The server lists none right now." />
      );
    }
    return (
      <View className="gap-2.5 pb-1">
        <Note>
          Each template is a shape. The strikes you get depend on what {underlying} lists for the
          expiry, and on the live quotes.
        </Note>
        {(templates.data ?? []).map((t) => (
          <Pressable
            key={t.key}
            accessibilityRole="button"
            accessibilityLabel={`${t.name}, ${t.outlook}, ${t.legCount} legs${t.unlimitedRisk ? ', unlimited risk' : ''}. ${t.summary}`}
            onPress={() => {
              invalidate();
              setKey(t.key);
            }}
            className="gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
          >
            <Text className="text-sm font-semibold text-ink dark:text-ink-dark">{t.name}</Text>
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Badge label={t.outlook} variant={outlookTone(t.outlook)} />
              <Badge label={`${t.legCount} leg${t.legCount === 1 ? '' : 's'}`} />
              {t.unlimitedRisk ? <Badge label="Unlimited risk" variant="warning" /> : null}
            </View>
            <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
              {t.summary}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <View className="gap-4 pb-1">
      <View className="rounded-xl bg-surface-sunk px-3.5 py-3 dark:bg-surface-sunk-dark">
        <View className="flex-row items-start gap-2">
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] font-bold text-ink dark:text-ink-dark">
              {definition.name}
            </Text>
            <View className="mt-1 flex-row flex-wrap gap-1.5">
              <Badge label={definition.outlook} variant={outlookTone(definition.outlook)} />
              {definition.unlimitedRisk ? <Badge label="Unlimited risk" variant="warning" /> : null}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose another strategy"
            hitSlop={8}
            disabled={place.isPending}
            onPress={() => {
              invalidate();
              setKey(null);
            }}
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              Change
            </Text>
          </Pressable>
        </View>
        <Text className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {definition.riskProfile}
        </Text>
      </View>

      <View>
        <FieldLabel>Expiry</FieldLabel>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {expiries.map((e) => {
            const on = e === expiry;
            return (
              <Pressable
                key={e}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Expiry ${expiryLabel(e)}, ${dteLabel(daysUntil(e))}`}
                disabled={place.isPending}
                onPress={() => {
                  invalidate();
                  setChosenExpiry(e);
                }}
                className={cn(
                  'rounded-full border px-3.5 py-2',
                  on
                    ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
                    : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
                )}
              >
                <Text
                  className={cn(
                    'text-[13px] font-semibold',
                    on
                      ? 'text-brand-text dark:text-brand-text-dark'
                      : 'text-ink-muted dark:text-ink-dark-muted',
                  )}
                >
                  {expiryLabel(e)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View>
        <FieldLabel>Lots per leg</FieldLabel>
        <LotsStepper
          value={lots}
          max={PAPER_MAX_LOTS}
          disabled={place.isPending}
          onChange={(n) => {
            invalidate();
            setLots(n);
          }}
        />
      </View>

      {!built?.buildable ? (
        <Button
          label={build.isPending ? 'Resolving…' : 'Build and price'}
          size="lg"
          fullWidth
          loading={build.isPending}
          disabled={!expiry || !lotsOk}
          onPress={runBuild}
        />
      ) : null}
      {build.isError ? <Banner tone="error" message={getErrorMessage(build.error)} /> : null}
      {built && !built.buildable ? (
        <InlineEmpty title="Can’t build this here" message={built.reason} />
      ) : null}

      {built?.buildable ? (
        <View className="gap-4">
          <View>
            <FieldLabel>Resolved legs</FieldLabel>
            <View className="overflow-hidden rounded-xl border border-line dark:border-line-dark">
              {built.legs.map((l, i) => (
                <View
                  key={l.tradingsymbol}
                  className={cn(
                    'flex-row items-center gap-2 px-3.5 py-2.5',
                    i > 0 && 'border-t border-line dark:border-line-dark',
                  )}
                >
                  <SideTag side={l.side} />
                  <Tag label={l.kind} />
                  <View className="min-w-0 flex-1">
                    <Text
                      className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                      numberOfLines={1}
                    >
                      {formatStrike(l.strike)} {l.kind}
                    </Text>
                    <Text
                      className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
                      numberOfLines={1}
                    >
                      {l.tradingsymbol} · {lotsLabel(l.lots)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
          <View className="rounded-xl border border-line px-3.5 py-1.5 dark:border-line-dark">
            <SummaryLine label="At-the-money strike" value={formatStrike(built.atmStrike)} />
            <SummaryLine label="Strike interval used" value={formatStrike(built.strikeInterval)} />
            <SummaryLine
              label="Margin (approximate)"
              value={formatINR(built.payoff.marginRequired, 0)}
            />
            <SummaryLine label="Charges to open" value={formatINR(built.payoff.openingCharges)} />
          </View>

          <View>
            <FieldLabel>Payoff at expiry</FieldLabel>
            <PayoffChart
              analysis={built.payoff.analysis}
              spot={built.payoff.spot ?? built.spot}
              underlying={built.payoff.underlying}
            />
          </View>
          <View>
            <FieldLabel>Odds at expiry</FieldLabel>
            <ProbabilityPanel probability={built.payoff.probability} />
          </View>
          {built.payoff.caveats.length > 0 ? (
            <Disclosure
              title="What this payoff assumes"
              meta={`${built.payoff.caveats.length} caveat${built.payoff.caveats.length === 1 ? '' : 's'}`}
            >
              <Caveats items={built.payoff.caveats} />
            </Disclosure>
          ) : null}

          {built.definition.unlimitedRisk ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acknowledged }}
              onPress={() => setAcknowledged((v) => !v)}
              className="flex-row gap-3 rounded-xl bg-danger-wash px-3.5 py-3 dark:bg-danger-wash-dark"
            >
              {acknowledged ? (
                <SquareCheck size={20} color={colors.danger} />
              ) : (
                <Square size={20} color={colors.danger} />
              )}
              <View className="flex-1">
                <Text className="text-[13px] font-bold text-danger-600 dark:text-danger-dark">
                  This structure can lose an unbounded amount.
                </Text>
                <Text className="mt-1 text-xs leading-[17px] text-danger-600 dark:text-danger-dark">
                  {built.definition.riskProfile} The margin above is an approximation, not an
                  exchange SPAN figure — a real broker would ask for more as it moved against you.
                </Text>
              </View>
            </Pressable>
          ) : null}

          {place.isError ? <Banner tone="error" message={getErrorMessage(place.error)} /> : null}
          <Button
            label={place.isPending ? 'Placing…' : `Place ${built.legs.length}-leg paper basket`}
            size="lg"
            fullWidth
            loading={place.isPending}
            disabled={built.definition.unlimitedRisk && !acknowledged}
            onPress={runPlace}
          />
          <Note>
            Legs are placed one at a time under one basket id, so a later leg can be rejected after
            an earlier one filled.
          </Note>
        </View>
      ) : null}
    </View>
  );
}
