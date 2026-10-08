import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ChangeText } from '@/components/market/ChangeText';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { RowDivider } from '@/components/ui/Section';
import { StatusDot, StatusPill } from '@/features/settings/components/StatusPill';
import { relativeTime } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import { stockHref } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';
import { isServerOutdated } from '@/services/api/contract';
import { useTheme } from '@/theme/ThemeProvider';

import { useHouseScan } from '../../hooks';
import {
  CHECK_VIEW,
  checkTally,
  dayLabel,
  formatVolumeRatio,
  funnelWidths,
  groupChecks,
  planSentence,
  regimeView,
  scanDayLabel,
  SECTOR_TONE,
  sectorsByStrength,
  triggerLabel,
} from '../../lib/houseView';
import type { HouseStrategyKey, ScanDay, SwingScan, SwingSetup } from '../../types';
import { FactGrid, Note, TrackBar } from './HouseBits';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * The evening scans, one session at a time: the market it ran in, every setup for the next
 * session with its plan and its checklist (passed / caution / failed, grouped by the six steps),
 * how the universe narrowed, the near misses and the sectors. Used on the platform strategy's
 * Scan tab and on Strong picks' Swing scan view.
 */
export function ScanTab({
  strategyKey,
  days,
  isAdmin = false,
  onRunScan,
  scanBusy = false,
}: {
  strategyKey: HouseStrategyKey;
  /** The scan days for the picker, newest first; empty reads the latest scan only. */
  days: readonly ScanDay[];
  isAdmin?: boolean;
  onRunScan?: () => void;
  scanBusy?: boolean;
}) {
  const layout = useScreenLayout();
  const { colors } = useTheme();
  const now = useNow();
  const [date, setDate] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const query = useHouseScan(strategyKey, date);
  const scan = query.data ?? null;
  const selected = date ?? scan?.date ?? days[0]?.date ?? null;
  const at = selected ? days.findIndex((d) => d.date === selected) : -1;
  const selectedDay = at >= 0 ? days[at] : undefined;
  const earlier = at >= 0 ? days[at + 1] : undefined;
  const later = at > 0 ? days[at - 1] : undefined;

  const toolbar = (
    <View className="gap-2.5">
      {days.length > 0 ? (
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Scan session: ${selectedDay ? scanDayLabel(selectedDay) : 'latest'}. Change`}
            onPress={() => setPicking(true)}
            className="min-h-[40px] flex-1 flex-row items-center gap-2 rounded-field border border-line bg-surface px-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
          >
            <Text
              className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
              numberOfLines={1}
            >
              {selectedDay
                ? scanDayLabel(selectedDay)
                : selected
                  ? dayLabel(selected)
                  : 'Latest scan'}
            </Text>
            <ChevronDown size={16} color={colors.textMuted} />
          </Pressable>
          <StepButton
            label="Earlier session"
            direction="left"
            disabled={!earlier}
            onPress={() => earlier && setDate(earlier.date)}
          />
          <StepButton
            label="Later session"
            direction="right"
            disabled={!later}
            onPress={() => later && setDate(later.date)}
          />
        </View>
      ) : null}
      {scan || (isAdmin && onRunScan) ? (
        <View className="flex-row items-center gap-3">
          <Text className="flex-1 text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {scan
              ? `${formatNumber(scan.universe.withBars, 0)} stocks · ran ${relativeTime(scan.runAt, now)}`
              : ''}
          </Text>
          {isAdmin && onRunScan ? (
            <Button
              label="Run scan now"
              size="sm"
              variant="secondary"
              loading={scanBusy}
              onPress={onRunScan}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  let body: React.ReactNode;
  if (query.isPending) {
    body = <ListSkeleton rows={4} />;
  } else if (query.error && !scan) {
    body = isServerOutdated(query.error) ? (
      <InlineEmpty
        title="Needs a newer server"
        message="The evening swing scan isn’t available on the server this app is connected to yet."
      />
    ) : (
      <InlineError what="the scan" error={query.error} onRetry={() => void query.refetch()} />
    );
  } else if (!scan) {
    body = <InlineEmpty title="No scan yet" />;
  } else {
    body = <ScanBody scan={scan} columns={layout.columns} />;
  }

  return (
    <View className="gap-4">
      {toolbar}
      <View style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>{body}</View>
      <OptionSheet
        visible={picking}
        title="Scan session"
        options={days.map((d) => ({ key: d.date, label: scanDayLabel(d) }))}
        value={selected ?? ''}
        onSelect={(key) => setDate(key)}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

function StepButton({
  label,
  direction,
  disabled,
  onPress,
}: {
  label: string;
  direction: 'left' | 'right';
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'h-10 w-10 items-center justify-center rounded-field border border-line bg-surface active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
        disabled && 'opacity-40',
      )}
    >
      <Icon size={18} color={colors.text} />
    </Pressable>
  );
}

/** One completed (or failed) scan: setups first, then the context panels. */
function ScanBody({ scan, columns }: { scan: SwingScan; columns: 1 | 2 | 3 }) {
  return (
    <View className="gap-4">
      {scan.status !== 'completed' ? (
        <InlineEmpty
          title={scan.status === 'failed' ? 'This scan failed' : 'No data for this session'}
          message={scan.error ?? 'The scan did not complete on this session.'}
        />
      ) : null}

      <View>
        <Text
          accessibilityRole="header"
          className="mb-2.5 text-[15px] font-semibold text-ink dark:text-ink-dark"
        >
          {scan.setups.length
            ? `${scan.setups.length} setup${scan.setups.length === 1 ? '' : 's'} for the next session`
            : 'Setups for the next session'}
        </Text>
        {scan.setups.length === 0 ? (
          <InlineEmpty
            title="No setups this session"
            message="No stock passed every check this session."
          />
        ) : (
          <Grid columns={columns} equalHeight={false}>
            {scan.setups.map((setup) => (
              <SetupCard key={setup.symbol} setup={setup} />
            ))}
          </Grid>
        )}
      </View>

      <Grid columns={columns} equalHeight={false}>
        <MarketPanel scan={scan} />
        <FunnelPanel scan={scan} />
        <NearMissPanel scan={scan} />
      </Grid>

      {scan.sectors.length > 0 ? <SectorsPanel scan={scan} /> : null}
    </View>
  );
}

/** A setup as a ticket: who, grade, the plan's three levels, and its checklist one tap down. */
const SetupCard = memo(function SetupCard({ setup }: { setup: SwingSetup }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const p = setup.plan;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${setup.symbol}, grade ${setup.grade}, ${triggerLabel(setup.trigger)}. Open stock`}
        onPress={() => router.push(stockHref(setup.symbol, setup.exchange))}
        className="flex-row items-center gap-2 active:opacity-70"
      >
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
              {setup.symbol}
            </Text>
            {setup.fno ? (
              <Text className="text-[11px] font-semibold text-ink-faint dark:text-ink-dark-faint">
                F&amp;O
              </Text>
            ) : null}
          </View>
          {setup.name || setup.sector ? (
            <Text
              className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
              numberOfLines={1}
            >
              {[setup.name, setup.sector].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Badge
          label={`Grade ${setup.grade}`}
          variant={setup.grade === 'A' ? 'primary' : 'neutral'}
        />
      </Pressable>

      <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
        {triggerLabel(setup.trigger)}
        {setup.score != null ? ` · score ${formatNumber(setup.score, 0)}` : ''}
        {setup.metrics.dayChangePct != null
          ? ` · ${formatSignedPercent(setup.metrics.dayChangePct, 1)} on the day`
          : ''}
        {setup.metrics.volumeRatio != null
          ? ` · ${formatVolumeRatio(setup.metrics.volumeRatio)} volume`
          : ''}
      </Text>

      <View className="mt-3 rounded-xl bg-surface-sunk px-3 py-1.5 dark:bg-surface-sunk-dark">
        <FactGrid
          facts={[
            { label: 'Buy above', value: formatINR(p.entry) },
            { label: 'Stop', value: formatINR(p.stop), negative: true },
            { label: 'Target (2R)', value: formatINR(p.target) },
          ]}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Checklist: ${checkTally(setup.checks)}. ${open ? 'Hide' : 'Show'}`}
        onPress={() => setOpen((value) => !value)}
        className="mt-2 flex-row items-center gap-1.5 py-1.5 active:opacity-60"
      >
        <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {checkTally(setup.checks) || 'No checks recorded'}
        </Text>
        <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
          {open ? 'Hide checklist' : 'Checklist'}
        </Text>
        <Chevron size={15} color={colors.link} />
      </Pressable>

      {open ? <SetupDetail setup={setup} /> : null}
    </View>
  );
});

function SetupDetail({ setup }: { setup: SwingSetup }) {
  const p = setup.plan;
  return (
    <View className="mt-1 gap-3 border-t border-line pt-3 dark:border-line-dark">
      <Text className="text-[13px] leading-[19px] text-ink dark:text-ink-dark">
        {planSentence(setup)}
      </Text>
      <FactGrid
        facts={[
          { label: 'Stretch (3R)', value: formatINR(p.target3R) },
          {
            label: 'Risk a share',
            value:
              p.riskPerShare != null
                ? `${formatINR(p.riskPerShare)}${p.riskPct != null ? ` · ${formatNumber(p.riskPct, 1)}%` : ''}`
                : '—',
          },
          {
            label: 'Hold up to',
            value: p.horizonDays != null ? `${p.horizonDays} sessions` : '—',
          },
        ]}
      />
      {groupChecks(setup.checks).map((group) => (
        <View key={group.group}>
          <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
            {group.label}
          </Text>
          <View className="gap-2">
            {group.checks.map((c) => (
              <View
                key={c.key}
                accessible
                accessibilityLabel={`${c.label}, ${CHECK_VIEW[c.status].word}. ${c.detail}`}
                className="flex-row gap-2"
              >
                <View className="pt-[5px]">
                  <StatusDot tone={CHECK_VIEW[c.status].tone} size={7} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                    {c.label}
                    <Text className="font-normal text-ink-faint dark:text-ink-dark-faint">
                      {` · ${CHECK_VIEW[c.status].word}${c.hard ? ' · must pass' : ''}`}
                    </Text>
                  </Text>
                  {c.detail ? (
                    <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                      {c.detail}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function MarketPanel({ scan }: { scan: SwingScan }) {
  const r = scan.regime;
  const view = regimeView(r.state);
  const level = (n: number | null) => formatNumber(n, 0);
  return (
    <Panel title="The market it ran in" meta={`after ${dayLabel(scan.date)}`}>
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusPill tone={view.tone} label={view.label} />
      </View>
      {r.detail ? (
        <Text className="mt-2 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          {r.detail}
        </Text>
      ) : null}
      <FactGrid
        className="mt-2"
        facts={[
          { label: 'Nifty 50', value: level(r.close) },
          { label: '50 DMA', value: level(r.dma50) },
          { label: '200 DMA', value: level(r.dma200) },
          { label: 'India VIX', value: formatNumber(r.vix, 2) },
          { label: '1 month', value: formatSignedPercent(r.return21Pct, 1), trend: r.return21Pct },
          { label: '3 months', value: formatSignedPercent(r.return63Pct, 1), trend: r.return63Pct },
        ]}
      />
    </Panel>
  );
}

function FunnelPanel({ scan }: { scan: SwingScan }) {
  const widths = funnelWidths(scan.funnel);
  return (
    <Panel
      title="How the universe narrowed"
      meta={`${formatNumber(scan.universe.current, 0)} → ${scan.setups.length}`}
    >
      {scan.funnel.length === 0 ? (
        <Note>No funnel was recorded for this scan.</Note>
      ) : (
        <View className="gap-2.5">
          {scan.funnel.map((step, index) => (
            <View key={step.key} accessible accessibilityLabel={`${step.label}: ${step.remaining}`}>
              <View className="mb-1 flex-row items-baseline gap-2">
                <Text
                  className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
                <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={NUM}>
                  {formatNumber(step.remaining, 0)}
                </Text>
              </View>
              <TrackBar pct={widths[index] ?? 0} emphasis />
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

function NearMissPanel({ scan }: { scan: SwingScan }) {
  const router = useRouter();
  return (
    <Panel title="Near misses" meta="failed one hard check" flush>
      {scan.nearMisses.length === 0 ? (
        <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          None on this session.
        </Text>
      ) : (
        scan.nearMisses.map((miss, index) => (
          <View key={miss.symbol}>
            {index > 0 ? <RowDivider /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${miss.symbol}, failed on ${miss.failedOn}. Open stock`}
              onPress={() => router.push(stockHref(miss.symbol, 'NSE'))}
              className="flex-row items-center gap-3 px-4 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
            >
              <View className="min-w-0 flex-1">
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                  {miss.symbol}
                </Text>
                <Text
                  className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={2}
                >
                  {miss.failedOn}
                </Text>
              </View>
              <Text
                className="text-[13px] font-semibold text-ink-muted dark:text-ink-dark-muted"
                style={NUM}
                accessibilityLabel={`Checklist score ${miss.score ?? 'unknown'}`}
              >
                {formatNumber(miss.score, 0)}
              </Text>
            </Pressable>
          </View>
        ))
      )}
    </Panel>
  );
}

function SectorsPanel({ scan }: { scan: SwingScan }) {
  const sectors = sectorsByStrength(scan.sectors);
  return (
    <Panel title="Sectors" meta="median 1-month return · above 50 EMA" flush>
      {sectors.map((s, index) => (
        <View key={s.key}>
          {index > 0 ? <RowDivider /> : null}
          <View
            accessible
            accessibilityLabel={`${s.label}, ${s.state}, ${formatSignedPercent(s.medianReturn21Pct, 1)} median one-month return`}
            className="flex-row items-center gap-3 px-4 py-2.5"
          >
            <StatusDot tone={SECTOR_TONE[s.state]} size={7} />
            <Text className="flex-1 text-[13px] text-ink dark:text-ink-dark" numberOfLines={1}>
              {s.label}
            </Text>
            <ChangeText value={s.medianReturn21Pct} className="w-16 text-right text-xs" style={NUM}>
              {formatSignedPercent(s.medianReturn21Pct, 1)}
            </ChangeText>
            <Text
              className="w-11 text-right text-xs text-ink-muted dark:text-ink-dark-muted"
              style={NUM}
            >
              {s.breadthAboveEma50Pct == null ? '—' : `${Math.round(s.breadthAboveEma50Pct)}%`}
            </Text>
          </View>
        </View>
      ))}
    </Panel>
  );
}
