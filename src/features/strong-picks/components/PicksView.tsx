import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ChangeText } from '@/components/market/ChangeText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { RowDivider } from '@/components/ui/Section';
import { ModalSheet } from '@/features/home/components/ModalSheet';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { regimeView } from '@/features/strategies/lib/houseView';
import { SWING_KEY } from '@/features/strategies/types';
import { stockHref } from '@/lib/navigation';
import { formatINR, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import {
  CATEGORY_META,
  dayHeadline,
  dayName,
  earlierActive,
  filterByCategory,
  parseCapital,
  pickPosition,
  pickStatus,
  sessionsLeft,
  type CategoryFilter,
} from '../lib/picksView';
import { useStrongPickPrefs } from '../store';
import type { MarketRegime, StrongPick, StrongPicksResponse } from '../types';
import { RunPanel, type ReviewActions } from './RunPanel';
import { StrongPickCard } from './StrongPickCard';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * One day's picks — today live, or an earlier day settled: the headline numbers, the tickets
 * (filtered by category), then (today only) the picks from earlier days still inside their
 * horizon, then how that morning's list was made and the server's caveats, verbatim. The screen
 * owns the query, the day strip and the category chips; this owns the day itself.
 */
export function PicksView({
  data,
  isToday,
  category,
  onCategory,
  record,
  isAdmin,
  actions,
  onOpenResults,
  onShowDate,
}: {
  data: StrongPicksResponse;
  isToday: boolean;
  category: CategoryFilter;
  onCategory: (category: CategoryFilter) => void;
  /** The window's record for the headline; null when the server has no analytics. */
  record: { days: number; successRate: number | null; closed: number; profitable: number } | null;
  isAdmin: boolean;
  actions?: ReviewActions;
  onOpenResults: () => void;
  onShowDate: (date: string) => void;
}) {
  const router = useRouter();
  const layout = useScreenLayout();
  const capital = useStrongPickPrefs((state) => state.capital);
  const [editingCapital, setEditingCapital] = useState(false);
  const picks = data.picks;
  const shown = filterByCategory(picks, category);
  const earlier = isToday ? earlierActive(data.active, data.date, category) : [];
  const tiles = dayHeadline({ picks, runStatus: data.run.status }, isToday, record);

  return (
    <View className="gap-4">
      <Grid columns={Math.min(layout.kpiColumns, 4)}>
        {tiles.map((tile) => (
          <StatTile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            sub={tile.sub}
            status={tile.status}
            onPress={tile.opensResults ? onOpenResults : undefined}
          />
        ))}
      </Grid>

      {isToday && data.regime?.state === 'risk-off' ? (
        <Banner
          tone="warning"
          title="Risk-off market"
          message="Nifty is below its key averages or volatility is high. Only the strongest setups are kept on days like this — size down, or wait."
        />
      ) : null}

      {category !== 'all' ? (
        <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          <Text className="font-semibold text-ink dark:text-ink-dark">
            {CATEGORY_META[category].label}
          </Text>
          {` · ${CATEGORY_META[category].held}. ${CATEGORY_META[category].blurb}`}
        </Text>
      ) : null}

      {picks.length === 0 ? (
        <RunPanel
          data={data}
          isToday={isToday}
          mode="empty"
          onOpenRecommendations={isToday ? () => router.push('/intel') : undefined}
          onShowDate={onShowDate}
          actions={isAdmin ? actions : undefined}
        />
      ) : (
        <>
          <View className="flex-row items-center gap-3">
            <Text
              className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
              style={NUM}
              numberOfLines={1}
            >
              {`Sizes at 1% risk of ${formatINR(capital, 0)}`}
            </Text>
            <Button label="Change capital" variant="link" onPress={() => setEditingCapital(true)} />
          </View>
          {shown.length === 0 ? (
            <InlineEmpty
              title={`No ${category === 'all' ? '' : `${CATEGORY_META[category].label.toLowerCase()} `}picks ${isToday ? 'today' : 'this day'}`}
              action={{ label: 'Show all picks', onPress: () => onCategory('all') }}
            />
          ) : (
            <Grid columns={layout.columns} equalHeight={false}>
              {shown.map((pick) => (
                <StrongPickCard
                  key={`${pick.exchange}:${pick.symbol}`}
                  pick={pick}
                  capital={capital}
                />
              ))}
            </Grid>
          )}
        </>
      )}

      {earlier.length > 0 ? <ActiveList picks={earlier} /> : null}

      {picks.length > 0 ? (
        <RunPanel
          data={data}
          isToday={isToday}
          mode="summary"
          actions={isAdmin ? actions : undefined}
        />
      ) : null}

      {data.caveats.length > 0 ? (
        <View className="gap-2">
          {data.caveats.map((caveat) => (
            <Text
              key={caveat}
              className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
            >
              {caveat}
            </Text>
          ))}
        </View>
      ) : null}

      <CapitalSheet visible={editingCapital} onClose={() => setEditingCapital(false)} />
    </View>
  );
}

/**
 * The market the evening swing scan measured — the regime that decides which setup grades are
 * kept. Tapping opens the strategy that measures it.
 */
export function RegimeStrip({ regime }: { regime: MarketRegime | null }) {
  const router = useRouter();
  const { colors } = useTheme();
  const view = regimeView(regime?.state);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Market: ${view.label}. ${regime?.detail ?? 'Measured by the evening swing scan'}. Open the swing strategy`}
      onPress={() => router.push({ pathname: '/house-strategy/[key]', params: { key: SWING_KEY } })}
      className="flex-row items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <View className="min-w-0 flex-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Market</Text>
          <StatusPill tone={view.tone} label={view.label} />
          {regime?.asOf ? (
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
              as of {dayName(regime.asOf)}
            </Text>
          ) : null}
        </View>
        <Text
          className="mt-1.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={3}
        >
          {regime?.detail || 'Measured by the evening swing scan after each close.'}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </Pressable>
  );
}

/** Earlier days' picks still inside their horizon — live today, so they are followed here. */
function ActiveList({ picks }: { picks: readonly StrongPick[] }) {
  const router = useRouter();
  return (
    <Panel
      title="Still active from earlier days"
      meta={`${picks.length} inside their horizon`}
      flush
    >
      {picks.map((pick, index) => {
        const status = pickStatus(pick);
        const position = pickPosition(pick);
        const left = sessionsLeft(pick.horizonDays, pick.sessionsElapsed);
        return (
          <View key={`${pick.date}:${pick.exchange}:${pick.symbol}`}>
            {index > 0 ? <RowDivider /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${pick.symbol}, picked ${dayName(pick.date)}, ${status.label}${position.movePct != null ? `, ${formatSignedPercent(position.movePct, 2)} from entry` : ''}. Open stock`}
              onPress={() => router.push(stockHref(pick.symbol, pick.exchange))}
              className="flex-row items-center gap-3 px-4 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
            >
              <View className="min-w-0 flex-1">
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                  {pick.symbol}
                </Text>
                <Text
                  className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={1}
                  style={NUM}
                >
                  {[
                    pick.category ? CATEGORY_META[pick.category].label : null,
                    `picked ${dayName(pick.date, false)}`,
                    `${left} session${left === 1 ? '' : 's'} left`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <Text
                  className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
                  numberOfLines={1}
                  style={NUM}
                >
                  {`now ${formatINR(position.price)} · target ${formatINR(pick.targetPrice)} · stop ${formatINR(pick.stopPrice)}`}
                </Text>
              </View>
              <View className="items-end gap-1">
                <StatusPill tone={status.tone} label={status.label} />
                {position.movePct != null ? (
                  <ChangeText value={position.movePct} className="text-xs" style={NUM}>
                    {formatSignedPercent(position.movePct, 2)}
                  </ChangeText>
                ) : null}
              </View>
            </Pressable>
          </View>
        );
      })}
    </Panel>
  );
}

/** Trading capital for position sizing. Kept on this device only; never sent anywhere. */
function CapitalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const capital = useStrongPickPrefs((state) => state.capital);
  const setCapital = useStrongPickPrefs((state) => state.setCapital);
  const [draft, setDraft] = useState('');
  const parsed = parseCapital(draft);

  return (
    <ModalSheet
      visible={visible}
      title="Your trading capital"
      onClose={onClose}
      footer={
        <Button
          label="Save"
          fullWidth
          disabled={parsed === null}
          onPress={() => {
            if (parsed === null) return;
            setCapital(parsed);
            setDraft('');
            onClose();
          }}
        />
      }
    >
      <Text className="mb-3 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        Each pick is sized so its stop costs 1% of this amount. It stays on this device and is never
        sent anywhere.
      </Text>
      <Input
        label="Capital (₹)"
        keyboardType="number-pad"
        placeholder={formatNumber(capital, 0)}
        value={draft}
        onChangeText={setDraft}
        error={draft && parsed === null ? 'Enter at least ₹10,000.' : undefined}
      />
      <Text className="mt-2 text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
        {`1% risk = ${formatINR((parsed ?? capital) / 100, 0)}`}
      </Text>
    </ModalSheet>
  );
}
