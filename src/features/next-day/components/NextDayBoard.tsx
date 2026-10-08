import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ChangeText } from '@/components/market/ChangeText';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { ModalSheet, SheetOption } from '@/features/home/components/ModalSheet';
import { relativeTime } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import { stockHref } from '@/lib/navigation';
import { formatSignedPercent } from '@/lib/utils/formatters';
import { isServerOutdated } from '@/services/api/contract';
import { useTheme } from '@/theme/ThemeProvider';

import { useIsAdmin, useNextDayReport, useNextDayReports, useNextDayStatus } from '../hooks';
import {
  boardSections,
  effectiveScore,
  missingData,
  missingDataNote,
  morningFor,
  reportOptions,
  sessionDay,
  sizingSummary,
  type SizingPrefs,
} from '../lib/view';
import { useSizingPrefs } from '../store';
import type { Candidate, NextDayReport, ReportDocument } from '../types';
import { AdminPanel, useRunNextDayAction } from './AdminPanel';
import {
  DataStatusPanel,
  MorningPanel,
  OutcomePanel,
  ScannerHitsPanel,
  SectorStrip,
  TrackRecordPanel,
} from './BoardPanels';
import { CandidateRow } from './CandidateRow';
import { Bullets, FinePrint, NUM } from './parts';
import { RegimeCard } from './RegimeCard';
import { SizingSheet } from './SizingSheet';

/**
 * Scanner › Next day. The evening report as a trader reads it: is the market tradable at all
 * (regime + the action, which can be NO TRADE TODAY), which sectors lead, then the lists — top
 * bullish, top bearish, F&O high conviction, two-sided squeezes, names to avoid — each candidate
 * with its plan and a size for the reader's own capital. Below: how the system's own picks did,
 * what every scanner saw, and where the data stands. Candidates, never orders.
 *
 * Renders inside the screen's scroll view (GroupScreen); the screen's pull-to-refresh
 * invalidates `nextDayKeys.all`.
 */
export function NextDayBoard() {
  const isAdmin = useIsAdmin();
  const now = useNow();
  const [date, setDate] = useState<string | null>(null);
  const query = useNextDayReport(date);
  const reports = useNextDayReports();
  const status = useNextDayStatus();
  const admin = useRunNextDayAction();
  const doc = query.data;

  if (query.isPending) {
    return (
      <View className="gap-3">
        <ListSkeleton rows={2} />
        <ListSkeleton rows={5} />
      </View>
    );
  }

  if (query.error && doc === undefined) {
    return isServerOutdated(query.error) ? (
      <InlineEmpty
        title="Needs a newer server"
        message="The next-day scanner isn’t available on the server this app is connected to yet."
      />
    ) : (
      <InlineError
        what="the next-day report"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!doc) {
    const eod = status.data?.eod;
    return (
      <View className="gap-4">
        {date ? (
          <InlineEmpty
            title={`No report for ${sessionDay(date)}`}
            action={{ label: 'Back to the latest', onPress: () => setDate(null) }}
          />
        ) : (
          <InlineEmpty
            title="No next-day report yet"
            message={`Built every weekday evening from NSE’s end-of-day files, 18:00–21:45 IST.${
              eod
                ? ` ${eod.sessions} sessions stored${eod.last ? `, newest ${sessionDay(eod.last)}` : ''}.`
                : ''
            }`}
            action={
              isAdmin
                ? { label: 'Import NSE history and run', onPress: () => admin.run('backfill') }
                : undefined
            }
          />
        )}
        {isAdmin ? <AdminPanel /> : null}
      </View>
    );
  }

  if (doc.status === 'failed' || !doc.report) {
    return (
      <View className="gap-4">
        <Banner
          tone="error"
          title={`The report for ${sessionDay(doc.date)} failed`}
          message={doc.error ?? 'The evening run did not finish.'}
          action={date ? { label: 'Back to the latest', onPress: () => setDate(null) } : undefined}
        />
        {isAdmin ? <AdminPanel /> : null}
      </View>
    );
  }

  return (
    <View style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
      <Board
        doc={doc}
        report={doc.report}
        date={date}
        onDate={setDate}
        options={reportOptions(reports.data ?? [])}
        isAdmin={isAdmin}
        now={now}
        status={status.data}
      />
    </View>
  );
}

function Board({
  doc,
  report,
  date,
  onDate,
  options,
  isAdmin,
  now,
  status,
}: {
  doc: ReportDocument;
  report: NextDayReport;
  date: string | null;
  onDate: (date: string | null) => void;
  options: ReturnType<typeof reportOptions>;
  isAdmin: boolean;
  now: number;
  status: ReturnType<typeof useNextDayStatus>['data'];
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const [picking, setPicking] = useState(false);
  const [sizing, setSizing] = useState(false);
  const reportDefault: SizingPrefs = {
    capital: report.risk.capital,
    riskPct: report.risk.riskPct,
  };
  const prefs = useSizingPrefs(reportDefault);
  const sec = useMemo(() => boardSections(report), [report]);
  const missing = missingData(doc);
  const latestDate = options[0]?.date ?? null;

  const open = useCallback(
    (symbol: string) =>
      router.push({ pathname: '/next-day/[symbol]', params: { symbol, date: doc.date } }),
    [router, doc.date],
  );

  const row = (c: Candidate, twoSided = false) => (
    <CandidateRow
      c={c}
      prefs={prefs}
      morning={morningFor(doc.morning, c.symbol)}
      compat={report.compatibility}
      twoSided={twoSided}
      onPress={open}
    />
  );

  const lists: {
    key: string;
    title: string;
    note?: string;
    none: string;
    items: Candidate[];
    twoSided?: boolean;
  }[] = [
    {
      key: 'bullish',
      title: 'Top bullish',
      none: 'No long clears the bar after the hurdles.',
      items: sec.bullish,
    },
    {
      key: 'bearish',
      title: 'Top bearish',
      note: 'Cash shorts intraday only',
      none: 'No short clears the bar after the hurdles.',
      items: sec.bearish,
    },
    {
      key: 'fno',
      title: 'F&O high conviction',
      none: 'None — needs a futures buildup agreeing and 80+ after hurdles.',
      items: sec.fno,
    },
    {
      key: 'squeeze',
      title: 'Volatility squeeze',
      note: 'Two-sided',
      none: 'No contraction setups.',
      items: sec.squeeze,
      twoSided: true,
    },
  ];

  return (
    <View className="gap-5">
      {/* Which session, built when — and the picker for an earlier report. */}
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-ink dark:text-ink-dark">
            {`For ${sessionDay(doc.forDate)}`}
          </Text>
          <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
            {`From the ${sessionDay(doc.date)} close · built ${relativeTime(report.generatedAt, now)}`}
          </Text>
        </View>
        {options.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Report: ${date ? sessionDay(date) : 'latest'}. Change`}
            onPress={() => setPicking(true)}
            className="flex-row items-center gap-1 rounded-full border border-line px-3 py-1.5 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
          >
            <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
              {date ? sessionDay(date) : 'Latest'}
            </Text>
            <ChevronDown size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {date ? (
        <Banner
          tone="info"
          title="An earlier report"
          message="Its levels describe that session’s plan, not today’s."
          action={{ label: 'Back to the latest', onPress: () => onDate(null) }}
        />
      ) : null}

      <RegimeCard report={report} />

      {missing.length > 0 ? <Banner tone="warning" message={missingDataNote(missing)} /> : null}

      {doc.morning ? <MorningPanel morning={doc.morning} /> : null}

      {report.sectors.length > 0 ? (
        <Section title="Sectors" note="Ranked · today" className="mt-0">
          <SectorStrip sectors={report.sectors} />
        </Section>
      ) : null}

      {/* The reader's sizing — every row below is sized by it. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sized for ${sizingSummary(prefs)}. Change`}
        onPress={() => setSizing(true)}
        className="flex-row items-center gap-3 rounded-card bg-surface-sunk px-3.5 py-3 active:opacity-70 dark:bg-surface-sunk-dark"
      >
        <Text className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted" style={NUM}>
          Sized for{' '}
          <Text className="font-semibold text-ink dark:text-ink-dark">{sizingSummary(prefs)}</Text>
        </Text>
        <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
          Change
        </Text>
      </Pressable>

      <Grid columns={Math.min(layout.columns, 2)} gap={20} equalHeight={false}>
        {lists.map((list) => (
          <Section
            key={list.key}
            title={list.title}
            note={list.note ? `${list.note} · ${list.items.length}` : String(list.items.length)}
            className="mt-0"
          >
            {list.items.length === 0 ? (
              <NoneLine text={list.none} />
            ) : (
              <ListCard>
                {list.items.map((c, index) => (
                  <View key={c.symbol}>
                    {index > 0 ? <RowDivider /> : null}
                    {row(c, list.twoSided)}
                  </View>
                ))}
              </ListCard>
            )}
          </Section>
        ))}

        <Section key="avoid" title="Avoid" note={String(sec.avoid.length)} className="mt-0">
          {sec.avoid.length === 0 ? (
            <NoneLine text="Nothing flagged." />
          ) : (
            <ListCard>
              {sec.avoid.map((a, index) => (
                <View key={a.symbol}>
                  {index > 0 ? <RowDivider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${a.symbol}: avoid. ${a.reason}`}
                    onPress={() =>
                      a.candidate ? open(a.symbol) : router.push(stockHref(a.symbol, 'NSE'))
                    }
                    className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
                  >
                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-baseline gap-2">
                        <Text className="text-[15px] font-bold text-ink dark:text-ink-dark">
                          {a.symbol}
                        </Text>
                        {a.candidate ? (
                          <ChangeText value={a.candidate.changePct} className="text-xs" style={NUM}>
                            {formatSignedPercent(a.candidate.changePct)}
                          </ChangeText>
                        ) : null}
                      </View>
                      {a.reason ? (
                        <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                          {a.reason}
                        </Text>
                      ) : null}
                    </View>
                    <ChevronRight size={16} color={colors.textFaint} />
                  </Pressable>
                </View>
              ))}
            </ListCard>
          )}
        </Section>

        {sec.watch.length > 0 ? (
          <Section
            key="watch"
            title="Next in line"
            note={String(sec.watch.length)}
            className="mt-0"
          >
            <ListCard>
              {sec.watch.map((c, index) => (
                <View key={c.symbol}>
                  {index > 0 ? <RowDivider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${c.symbol}, ${c.direction === 'LONG' ? 'long' : 'short'}, ${effectiveScore(c)} after hurdles. ${c.setup}`}
                    onPress={() => open(c.symbol)}
                    className="flex-row items-center gap-3 px-3.5 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                        {c.symbol}{' '}
                        <Text className="font-normal text-ink-muted dark:text-ink-dark-muted">
                          {c.direction === 'LONG' ? 'long' : 'short'}
                        </Text>
                      </Text>
                      <Text
                        className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                        numberOfLines={1}
                      >
                        {c.setup || c.name}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-sm font-bold text-ink dark:text-ink-dark" style={NUM}>
                        {effectiveScore(c)}
                      </Text>
                      <ChangeText value={c.changePct} className="text-[11px]" style={NUM}>
                        {formatSignedPercent(c.changePct)}
                      </ChangeText>
                    </View>
                  </Pressable>
                </View>
              ))}
            </ListCard>
          </Section>
        ) : null}
      </Grid>

      {doc.outcome ? <OutcomePanel doc={doc} /> : null}

      <Grid columns={Math.min(layout.columns, 2)} gap={20} equalHeight={false}>
        <TrackRecordPanel key="track" />
        <ScannerHitsPanel key="hits" report={report} />
      </Grid>

      <Grid columns={Math.min(layout.columns, 2)} gap={20} equalHeight={false}>
        <DataStatusPanel
          key="data"
          status={status}
          doc={doc}
          report={report}
          isAdmin={isAdmin}
          now={now}
        />
        <Panel
          key="read"
          title="How to read it"
          meta={
            status?.measure?.at
              ? `Scanners measured ${relativeTime(status.measure.at, now)}`
              : undefined
          }
        >
          <Bullets items={report.caveats} />
        </Panel>
      </Grid>

      {isAdmin ? <AdminPanel /> : null}

      <FinePrint>
        The score is signal strength, never a probability. Not investment advice.
      </FinePrint>

      <ModalSheet visible={picking} title="Report" onClose={() => setPicking(false)}>
        <SheetOption
          label="Latest"
          detail={options[0] ? `${options[0].label} · ${options[0].detail}` : undefined}
          selected={date === null}
          onPress={() => {
            onDate(null);
            setPicking(false);
          }}
        />
        {options.slice(1).map((o) => (
          <SheetOption
            key={o.date}
            label={o.label}
            detail={o.detail}
            selected={date === o.date}
            onPress={() => {
              onDate(o.date === latestDate ? null : o.date);
              setPicking(false);
            }}
          />
        ))}
      </ModalSheet>

      <SizingSheet
        visible={sizing}
        current={prefs}
        reportDefault={reportDefault}
        onClose={() => setSizing(false)}
      />
    </View>
  );
}

function NoneLine({ text }: { text: string }) {
  return (
    <View className="rounded-card border border-dashed border-line-strong px-4 py-3.5 dark:border-line-dark-strong">
      <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {text}
      </Text>
    </View>
  );
}
