import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ExternalLink from 'lucide-react-native/icons/external-link';
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { Sparkline } from '@/components/market/Sparkline';
import { StackScreen } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Meter } from '@/components/ui/Meter';
import { Section } from '@/components/ui/Section';
import { StatGrid } from '@/components/ui/StatGrid';
import { formatIstDateTime } from '@/features/home/lib/istTime';
import { IpoLogo, Muted, NUM, StatusPill, TonePill } from '@/features/ipo/components/IpoParts';
import { IpoResearch } from '@/features/ipo/components/IpoResearch';
import { IpoValuationPanel } from '@/features/ipo/components/IpoValuationPanel';
import {
  ipoKeys,
  useIpoAnalytics,
  useIpoDetail,
  useIpoGmpHistory,
  useIpoReports,
} from '@/features/ipo/hooks';
import {
  boardLine,
  croreText,
  dateText,
  gmpPctText,
  gmpText,
  listingWhen,
  pctChange,
  priceBand,
  times,
  verifiedCategories,
} from '@/features/ipo/lib/format';
import type { IpoRecord } from '@/features/ipo/types';
import { openArticleLink } from '@/features/news/lib/openLink';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { isApiError } from '@/types/api';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/** Issue opens → closes → allotment → listing, with the steps already past filled in. */
function Timeline({ ipo, now }: { ipo: IpoRecord; now: number }) {
  const steps: [string, string | null][] = [
    ['Issue opens', ipo.openDate],
    ['Issue closes', ipo.closeDate],
    ['Allotment', ipo.allotmentDate],
    ['Listing', ipo.listingDate],
  ];
  return (
    <View className="rounded-card border border-line bg-surface px-4 py-3 dark:border-line-dark dark:bg-surface-dark">
      {steps.map(([label, date], index) => {
        const reached = date != null && new Date(date).getTime() <= now;
        const last = index === steps.length - 1;
        return (
          <View key={label} accessible className="flex-row gap-3">
            <View className="w-3 items-center">
              <View
                className={cn(
                  'mt-1.5 h-2.5 w-2.5 rounded-full border-2',
                  reached
                    ? 'border-brand-strong bg-brand-strong dark:border-brand-strong-dark dark:bg-brand-strong-dark'
                    : 'border-line-strong bg-surface dark:border-line-dark-strong dark:bg-surface-dark',
                )}
              />
              {last ? null : <View className="w-px flex-1 bg-line dark:bg-line-dark" />}
            </View>
            <View className={cn('flex-1 flex-row justify-between gap-3', !last && 'pb-3.5')}>
              <Text className="text-[13px] text-ink dark:text-ink-dark">{label}</Text>
              <Text
                className={cn(
                  'text-[13px] font-semibold',
                  date ? 'text-ink dark:text-ink-dark' : 'text-ink-faint dark:text-ink-dark-faint',
                )}
                style={NUM}
              >
                {dateText(date, 'Not announced')}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The grey-market premium over time, as this server observed it. */
function GmpHistory({ id, ipo }: { id: string; ipo: IpoRecord }) {
  const history = useIpoGmpHistory(id);
  const analytics = useIpoAnalytics(id);
  const [width, setWidth] = useState(0);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width)),
    [],
  );
  const values = (history.data ?? [])
    .map((point) => point.gmp)
    .filter((gmp): gmp is number => gmp != null)
    .slice(-30);
  const first = history.data?.find((point) => point.gmp != null);
  const trend = analytics.data?.gmpTrend;

  return (
    <Section title="Grey market" note={values.length ? `${values.length} observations` : undefined}>
      <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
        <View onLayout={onLayout} className="h-[72px] justify-center">
          {values.length >= 2 && width > 0 ? (
            <Sparkline data={values} width={width} height={72} />
          ) : (
            <Muted className="text-center">
              {history.isPending
                ? 'Loading the premium’s history…'
                : 'The history appears after at least two observations.'}
            </Muted>
          )}
        </View>
        {values.length >= 2 && first ? (
          <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
            Since {dateText(first.observedAt)}
          </Text>
        ) : null}
        <View className="mt-3 flex-row border-t border-line pt-3 dark:border-line-dark">
          <Stat label="Latest GMP" value={gmpText(ipo.gmp)} first />
          <Stat label="Est. listing" value={formatINR(ipo.estimatedListingPrice, 0)} />
          <Stat
            label="Trend"
            value={
              trend === 'up'
                ? 'Rising'
                : trend === 'down'
                  ? 'Falling'
                  : trend === 'flat'
                    ? 'Flat'
                    : '—'
            }
            last
          />
        </View>
      </View>
      <Muted className="mt-2">
        Grey-market premium is an unofficial over-the-counter quote, not an exchange price.
      </Muted>
    </Section>
  );
}

function Stat({
  label,
  value,
  first,
  last,
}: {
  label: string;
  value: string;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      className={cn(
        'flex-1',
        !first && 'pl-3',
        !last && 'border-r border-line pr-3 dark:border-line-dark',
      )}
    >
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <Text className="mt-0.5 text-sm font-semibold text-ink dark:text-ink-dark" style={NUM}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Subscription by investor category. The feed carries only the total; the split comes from the
 * pre-listing report, and only the figures it VERIFIED against a source's text.
 */
function Demand({ ipo, id }: { ipo: IpoRecord; id: string }) {
  const reports = useIpoReports(id);
  const analytics = useIpoAnalytics(id);
  const verified = reports.data?.preListing?.content?.subscription ?? null;
  const rows = verifiedCategories(verified, false);
  const max = Math.max(1, ...rows.map(([, value]) => value));
  const listed = reports.data?.postListing?.content?.market ?? null;
  const listingPrice = listed?.listingPrice ?? null;

  return (
    <Section title="Demand & outcome">
      <View className="gap-3 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
        <Row label="Subscribed" value={times(ipo.totalSubscription)} />
        {rows.map(([label, value]) => (
          <View key={label} accessible accessibilityLabel={`${label}: ${times(value)}`}>
            <View className="mb-1 flex-row justify-between">
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</Text>
              <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={NUM}>
                {times(value)}
              </Text>
            </View>
            <Meter value={(value / max) * 100} tone="brand" height={5} />
          </View>
        ))}
        <Row label="Demand" value={analytics.data?.demandLabel ?? 'Not enough data'} />
        <Row
          label="Anchor investors"
          value={
            ipo.anchorAvailable == null
              ? 'Pending'
              : ipo.anchorAvailable
                ? 'Allotted'
                : 'No anchor allocation'
          }
        />
        <Row
          label="Est. premium"
          value={gmpPctText(analytics.data?.estimatedGainPercent ?? ipo.gmpPercent)}
        />
        <Row
          label="Listing outcome"
          value={
            listingPrice == null
              ? 'Pending'
              : `${formatINR(listingPrice)} (${formatSignedPercent(pctChange(ipo.priceMax, listingPrice), 1)} vs issue)`
          }
        />
      </View>
      <Muted className="mt-2">
        {rows.length > 0
          ? 'Category figures are the ones the research report verified against a source.'
          : 'Category-wise demand appears once the research report verifies it against a source.'}
        {analytics.data?.riskNotes.length ? ` ${analytics.data.riskNotes.join(' ')}` : ''}
      </Muted>
    </Section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View accessible className="flex-row items-center justify-between gap-3">
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <Text
        className="max-w-[65%] text-right text-[13px] font-semibold text-ink dark:text-ink-dark"
        style={NUM}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * One IPO (web: /ipo/:id) — the issue at a glance, its schedule, the research report (before and
 * after listing), the grey market and demand. Reachable after the issue leaves the board: the
 * after-listing report is followed for the week a listing trade is held.
 */
export default function IpoDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const now = useNow();

  const detail = useIpoDetail(id);
  const reports = useIpoReports(id);
  const ipo = detail.data;

  const onRefresh = useCallback(
    () =>
      Promise.all([
        detail.refetch(),
        queryClient.invalidateQueries({ queryKey: ipoKeys.reports(id) }),
        queryClient.invalidateQueries({ queryKey: ipoKeys.gmpHistory(id) }),
        queryClient.invalidateQueries({ queryKey: ipoKeys.analytics(id) }),
      ]),
    [detail, queryClient, id],
  );

  const notFound =
    !id ||
    (!ipo &&
      isApiError(detail.error) &&
      (detail.error.status === 404 || detail.error.status === 422));

  if (notFound) {
    return (
      <StackScreen title="IPO">
        <Banner
          tone="info"
          title="IPO not found"
          message="This issue isn’t in the IPO calendar any more, or the link is incomplete."
        />
        <Button
          className="mt-4"
          label="Open the IPO centre"
          variant="outline"
          onPress={() => router.replace('/ipo')}
        />
      </StackScreen>
    );
  }

  if (!ipo) {
    return (
      <StackScreen title="IPO" onRefresh={onRefresh}>
        {detail.error ? (
          <InlineError what="this IPO" error={detail.error} onRetry={() => void detail.refetch()} />
        ) : (
          <View className="gap-3" accessibilityLabel="Loading the IPO">
            <View className="h-20 rounded-card bg-line dark:bg-line-dark" />
            <View className="h-40 rounded-card bg-line dark:bg-line-dark" />
            <View className="h-32 rounded-card bg-line dark:bg-line-dark" />
          </View>
        )}
      </StackScreen>
    );
  }

  const when = listingWhen(ipo.listingDate, new Date(now));
  const minInvestment =
    ipo.lotSize != null && ipo.priceMax != null ? ipo.lotSize * ipo.priceMax : null;
  const gmpTrendClass =
    ipo.gmp == null || ipo.gmp === 0
      ? undefined
      : ipo.gmp > 0
        ? 'text-brand-text dark:text-brand-text-dark'
        : 'text-danger-600 dark:text-danger-dark';

  return (
    <StackScreen title={ipo.companyName} subtitle={boardLine(ipo)} onRefresh={onRefresh}>
      {/* ── Identity ── */}
      <View className="flex-row items-center gap-3">
        <IpoLogo ipo={ipo} size="lg" />
        <View className="flex-1">
          <Text
            accessibilityRole="header"
            className="text-[19px] font-bold leading-6 text-ink dark:text-ink-dark"
            style={{ letterSpacing: -0.3 }}
          >
            {ipo.companyName}
          </Text>
          <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
            <StatusPill status={ipo.status} />
            {when ? (
              <TonePill tone="ok" label={when === 'today' ? 'Lists today' : 'Lists tomorrow'} />
            ) : null}
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {boardLine(ipo)}
            </Text>
          </View>
        </View>
      </View>

      {/* ── The issue ── */}
      <View className="mt-5">
        <StatGrid
          stats={[
            { label: 'Price band', value: priceBand(ipo) },
            {
              label: 'Lot size',
              value: ipo.lotSize != null ? `${formatNumber(ipo.lotSize, 0)} shares` : '—',
            },
            { label: 'Min. investment', value: formatINR(minInvestment, 0) },
            { label: 'Issue size', value: croreText(ipo.issueSizeCrore) },
            {
              label: 'GMP',
              value: ipo.gmp == null ? '—' : `${gmpText(ipo.gmp)} (${gmpPctText(ipo.gmpPercent)})`,
              valueClassName: gmpTrendClass,
            },
            { label: 'Est. listing price', value: formatINR(ipo.estimatedListingPrice, 0) },
            { label: 'Subscribed', value: times(ipo.totalSubscription) },
            {
              label: 'Market rating',
              value: ipo.rating != null ? `${ipo.rating} of 5` : 'Not rated',
            },
          ]}
        />
      </View>

      <IpoValuationPanel valuation={ipo.valuation} />

      <Section title="Schedule">
        <Timeline ipo={ipo} now={now} />
      </Section>

      <IpoResearch
        ipoId={id}
        reports={reports.data}
        isPending={reports.isPending}
        error={reports.error}
        onRetry={() => void reports.refetch()}
      />

      <GmpHistory id={id} ipo={ipo} />
      <Demand id={id} ipo={ipo} />

      {ipo.sourceUrl ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="View the source of this IPO's data"
          onPress={() => void openArticleLink(ipo.sourceUrl)}
          className="mt-6 flex-row items-center gap-2 self-start active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            View source · InvestorGain
          </Text>
          <ExternalLink size={14} color={colors.link} />
        </Pressable>
      ) : null}
      <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        {ipo.observedAt ? `Observed ${formatIstDateTime(ipo.observedAt)} IST. ` : ''}GMP and
        subscription are observations, not an assessment of suitability or expected return. Read the
        offer document before applying.
      </Text>
    </StackScreen>
  );
}
