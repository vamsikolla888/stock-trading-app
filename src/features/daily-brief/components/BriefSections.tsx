import { useRouter } from 'expo-router';
import Headphones from 'lucide-react-native/icons/headphones';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { trendOf, trendTextClass } from '@/components/market/ChangeText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Tabs';
import { chainHref } from '@/features/fno/lib/explore';
import { formatIstTime } from '@/features/home/lib/istTime';
import { gmpPctText, times, verdictOf, type Tone } from '@/features/ipo/lib/format';
import { openArticleLink } from '@/features/news/lib/openLink';
import { stockHref } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import {
  formatCompactNumber,
  formatINR,
  formatNumber,
  formatQuantity,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import {
  attentionItems,
  breadthShares,
  humanize,
  pickPreferred,
  sectorBarPercent,
  toneOfLabel,
} from '../lib/brief';
import type { BriefIpoReport, BriefMover, DailyBrief } from '../types';

import {
  BriefEmpty,
  BriefRow,
  BriefSection,
  Caveat,
  ConvictionDots,
  Divider,
  MetaLine,
  metaProps,
  Move,
  Stat,
  StatRow,
  Tag,
} from './BriefBits';

interface SectionProps {
  brief: DailyBrief;
}

const toneClass = (label: string) => trendTextClass[toneOfLabel(label)];

/** "Today in 30 seconds": the bias, the summary, and the three numbers behind it. */
export function SummarySection({
  brief,
  onListen,
  listenBusy,
  showListen,
}: SectionProps & { onListen: () => void; listenBusy: boolean; showListen: boolean }) {
  const { colors } = useTheme();
  const nifty = brief.indices.find((row) => row.name === 'NIFTY 50');
  const ai = brief.summary.source === 'ai-with-evidence';
  const { breadth, sentiment } = brief;

  return (
    <View className="mt-5 rounded-hero border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">
          Today in 30 seconds
        </Text>
        <Tag
          label={ai ? 'AI, grounded in data' : 'Calculated summary'}
          tone={ai ? 'info' : 'neutral'}
        />
      </View>
      <Text
        className={cn('mt-2 text-[24px] font-bold', toneClass(brief.summary.bias))}
        style={{ letterSpacing: -0.6 }}
      >
        {humanize(brief.summary.bias)}
      </Text>
      {brief.summary.text ? (
        <Text className="mt-1.5 text-[14px] leading-[21px] text-ink dark:text-ink-dark">
          {brief.summary.text}
        </Text>
      ) : null}
      {showListen ? (
        <Button
          label="Listen to brief"
          variant="secondary"
          size="sm"
          loading={listenBusy}
          onPress={onListen}
          leftIcon={<Headphones size={16} color={colors.link} />}
          className="mt-3 self-start"
        />
      ) : null}
      <Divider className="my-4" />
      <StatRow>
        <Stat
          label="NIFTY 50"
          value={formatNumber(nifty?.ltp)}
          detail={formatSignedPercent(nifty?.changePct)}
        />
        <Stat
          label="Market pulse"
          value={sentiment.score === null ? '—' : `${sentiment.score} / 100`}
          detail={humanize(sentiment.label)}
        />
        <Stat
          label="Breadth"
          value={breadth.ratio === null ? '—' : `${breadth.ratio.toFixed(2)} : 1`}
          detail={`${formatQuantity(breadth.advances)} up · ${formatQuantity(breadth.declines)} down`}
        />
      </StatRow>
    </View>
  );
}

/** Evidence, then interpretation — or an honest note that no analysis exists yet. */
export function OutlookSection({
  brief,
  onRefresh,
  canRefresh,
}: SectionProps & { onRefresh: () => void; canRefresh: boolean }) {
  const ai = brief.ai;
  if (!ai) {
    return (
      <BriefSection title="AI market outlook">
        <BriefEmpty
          title={
            brief.aiStatus === 'unavailable'
              ? 'AI analysis is temporarily unavailable.'
              : 'No AI analysis for this data yet.'
          }
          message={canRefresh ? 'Refresh to request one.' : 'Past briefs are kept as they were.'}
          action={canRefresh ? { label: 'Analyze now', onPress: onRefresh } : undefined}
        />
      </BriefSection>
    );
  }
  return (
    <BriefSection title="AI market outlook">
      <StatRow>
        <View className="flex-1">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Bias</Text>
          <Text className={cn('mt-1 text-[15px] font-semibold', toneClass(ai.marketBias))}>
            {humanize(ai.marketBias)}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Model conviction</Text>
          <View className="mt-2 flex-row items-center gap-2">
            <ConvictionDots value={ai.conviction} />
            <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
              {ai.conviction === null ? '—' : `${ai.conviction}/5`}
            </Text>
          </View>
        </View>
        <Stat label="Horizon" value="This session" />
      </StatRow>
      {ai.caveat ? <Caveat className="mt-3">{ai.caveat}</Caveat> : null}
      {brief.aiStale ? (
        <Banner
          tone="warning"
          className="mt-3"
          message="Based on earlier data — refresh for the latest."
          action={canRefresh ? { label: 'Refresh analysis', onPress: onRefresh } : undefined}
        />
      ) : null}

      <Text className="mt-4 text-[13px] font-bold text-ink dark:text-ink-dark">Why this view</Text>
      {ai.supportingFactors.length > 0 ? (
        ai.supportingFactors.map((item) => (
          <View key={item.factor} className="mt-2">
            <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
              {item.factor}
            </Text>
            <Text className="mt-0.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              {item.explanation}
            </Text>
          </View>
        ))
      ) : (
        <Caveat className="mt-1">None returned.</Caveat>
      )}

      <Text className="mt-4 text-[13px] font-bold text-ink dark:text-ink-dark">
        Risks to this view
      </Text>
      {ai.riskFactors.length > 0 ? (
        ai.riskFactors.map((risk) => (
          <View key={risk} className="mt-2 flex-row gap-2">
            <Text className="text-[13px] text-danger-600 dark:text-danger-dark">•</Text>
            <Text className="flex-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              {risk}
            </Text>
          </View>
        ))
      ) : (
        <Caveat className="mt-1">None returned.</Caveat>
      )}
      <MetaLine
        className="mt-4"
        source={[ai.provider, ai.model].filter(Boolean).join(' · ') || 'AI analysis'}
        timestamp={brief.generatedAt}
      />
    </BriefSection>
  );
}

/** Index tiles in a strip, limited to the user's preferred indices when they chose some. */
export function IndicesSection({ brief, preferred }: SectionProps & { preferred: string[] }) {
  const rows = pickPreferred(brief.indices, preferred, (row) => row.name);
  return (
    <BriefSection title="Major indices" caption="Observed prices" bare>
      {rows.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-5"
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
        >
          {rows.map((row) => (
            <View
              key={`${row.exchange}:${row.symbol}`}
              accessible
              accessibilityLabel={`${row.name} ${formatNumber(row.ltp)}, ${formatSignedPercent(row.changePct)}`}
              className="w-[150px] rounded-card border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark"
            >
              <Text
                className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted"
                numberOfLines={1}
              >
                {row.name}
              </Text>
              <Text
                className="mt-1.5 text-[16px] font-bold text-ink dark:text-ink-dark"
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatNumber(row.ltp)}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1.5">
                <Text className={cn('text-xs font-semibold', trendTextClass[trendOf(row.change)])}>
                  {row.change === null
                    ? '—'
                    : `${row.change >= 0 ? '+' : '−'}${formatNumber(Math.abs(row.change))}`}
                </Text>
                <Move value={row.changePct} className="text-xs" />
              </View>
              <MetaLine className="mt-2" {...metaProps(row.meta)} />
            </View>
          ))}
        </ScrollView>
      ) : (
        <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          <BriefEmpty message="Index feed unavailable." />
        </View>
      )}
    </BriefSection>
  );
}

/** Calculated sentiment and NIFTY 500 breadth. */
export function PulseSection({ brief }: SectionProps) {
  const { colors } = useTheme();
  const { sentiment, breadth } = brief;
  const shares = breadthShares(breadth);
  return (
    <BriefSection title="Market pulse">
      <View className="flex-row items-center gap-3">
        <Text
          className="text-[34px] font-bold text-ink dark:text-ink-dark"
          style={{ letterSpacing: -1 }}
        >
          {sentiment.score ?? '—'}
        </Text>
        <View className="flex-1">
          <Text className={cn('text-[15px] font-semibold', toneClass(sentiment.label))}>
            {humanize(sentiment.label)}
          </Text>
          <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
            {sentiment.score === null ? 'Score unavailable' : 'out of 100'}
          </Text>
        </View>
      </View>
      {sentiment.caveat ? <Caveat className="mt-2">{sentiment.caveat}</Caveat> : null}

      <View
        className="mt-4 h-2 flex-row overflow-hidden rounded-full bg-line dark:bg-line-dark"
        accessible
        accessibilityLabel={`${breadth.advances} advances, ${breadth.declines} declines, ${breadth.unchanged} unchanged`}
      >
        <View style={{ width: `${shares.advances}%`, backgroundColor: colors.gain }} />
        <View style={{ width: `${shares.declines}%`, backgroundColor: colors.loss }} />
      </View>
      <View className="mt-2 flex-row flex-wrap gap-x-3 gap-y-1">
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          <Text className="font-semibold text-brand-text dark:text-brand-text-dark">
            {formatQuantity(breadth.advances)}
          </Text>{' '}
          advancing
        </Text>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          <Text className="font-semibold text-danger-600 dark:text-danger-dark">
            {formatQuantity(breadth.declines)}
          </Text>{' '}
          declining
        </Text>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {formatQuantity(breadth.unchanged)} unchanged
        </Text>
      </View>

      {sentiment.factors.length > 0 ? (
        <View className="mt-4">
          {sentiment.factors.map((factor, position) => (
            <View
              key={factor.label}
              className={cn(
                'flex-row items-center justify-between py-2',
                position > 0 && 'border-t border-line dark:border-line-dark',
              )}
            >
              <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
                {factor.label}
              </Text>
              <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                {factor.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <MetaLine className="mt-3" {...metaProps(breadth.meta)} />
    </BriefSection>
  );
}

const SECTORS_COLLAPSED = 8;

/** Equal-weight sector moves across NIFTY 500 constituents. */
export function SectorsSection({ brief, preferred }: SectionProps & { preferred: string[] }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const rows = pickPreferred(brief.sectors, preferred, (row) => row.name);
  const shown = expanded ? rows : rows.slice(0, SECTORS_COLLAPSED);
  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(row.changePct)));

  return (
    <BriefSection
      title="Sector pulse"
      caption="Equal-weight"
      action={{ label: 'Heatmap', onPress: () => router.push('/heatmap') }}
    >
      {rows.length === 0 ? (
        <BriefEmpty message="Sector data unavailable." />
      ) : (
        <>
          {shown.map((row, position) => (
            <View
              key={row.name}
              className={cn('py-2.5', position > 0 && 'border-t border-line dark:border-line-dark')}
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text
                  className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
                  numberOfLines={1}
                >
                  {row.name}
                </Text>
                <Move value={row.changePct} />
              </View>
              <View className="mt-1.5 flex-row items-center gap-3">
                <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunk dark:bg-surface-sunk-dark">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${sectorBarPercent(row.changePct, maxAbs)}%`,
                      backgroundColor: row.changePct < 0 ? colors.loss : colors.gain,
                    }}
                  />
                </View>
                <Text className="w-[92px] text-right text-[11px] text-ink-faint dark:text-ink-dark-faint">
                  {row.advances} up · {row.declines} down
                </Text>
              </View>
            </View>
          ))}
          {rows.length > SECTORS_COLLAPSED ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setExpanded((open) => !open)}
              className="mt-2 self-start active:opacity-60"
            >
              <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                {expanded ? 'Show fewer' : `Show all ${rows.length} sectors`}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </BriefSection>
  );
}

type MoverTab = 'gainers' | 'losers' | 'volume';
const MOVER_TABS: readonly { key: MoverTab; label: string }[] = [
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
  { key: 'volume', label: 'Volume' },
];

/** Ranked facts, not recommendations. */
export function MoversSection({ brief }: SectionProps) {
  const router = useRouter();
  const [tab, setTab] = useState<MoverTab>('gainers');
  const rows: BriefMover[] = brief.movers[tab].slice(0, 6);

  return (
    <BriefSection title="Market movers" caption="Not recommendations">
      <SegmentedControl items={MOVER_TABS} value={tab} onChange={setTab} />
      <View className="mt-2">
        {rows.length > 0 ? (
          rows.map((row, position) => (
            <BriefRow
              key={`${row.exchange}:${row.symbol}`}
              first={position === 0}
              accessibilityLabel={`${row.symbol}, ${formatINR(row.ltp)}, ${formatSignedPercent(row.changePct)}`}
              onPress={() => router.push(stockHref(row.symbol, row.exchange))}
            >
              <View className="flex-1">
                <Text
                  className="text-sm font-semibold text-ink dark:text-ink-dark"
                  numberOfLines={1}
                >
                  {row.symbol}
                </Text>
                <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
                  {row.companyName ?? row.exchange}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                  {formatINR(row.ltp)}
                </Text>
                <Move value={row.changePct} className="text-xs" />
                {tab === 'volume' && row.volume !== null ? (
                  <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                    {formatCompactNumber(row.volume)} shares
                  </Text>
                ) : null}
              </View>
            </BriefRow>
          ))
        ) : (
          <View className="pt-3">
            <BriefEmpty message="No data this session." />
          </View>
        )}
      </View>
      {tab === 'volume' && brief.volumeNote ? (
        <Caveat className="mt-2">{brief.volumeNote}</Caveat>
      ) : null}
    </BriefSection>
  );
}

/** NIFTY listed-contract readings. No open interest from the broker, so none is implied. */
export function DerivativesSection({ brief }: SectionProps) {
  const router = useRouter();
  const data = brief.derivatives;
  const underlying = data.underlying ?? 'NIFTY';
  return (
    <BriefSection
      title="Derivatives radar"
      caption={underlying}
      // Like the web, the chain opens at its own nearest expiry: the brief's expiry comes from
      // the platform feed, whose format the Groww-backed chain screen doesn't promise to share.
      action={{ label: 'Option chain', onPress: () => router.push(chainHref('NFO', underlying)) }}
    >
      {data.available ? (
        <>
          <StatRow>
            <Stat
              label="Spot"
              value={formatNumber(data.spot)}
              detail={data.spotSource ?? undefined}
            />
            <Stat
              label="ATM strike"
              value={formatNumber(data.atmStrike, 0)}
              detail={data.expiry ? `Expiry ${data.expiry}` : undefined}
            />
          </StatRow>
          <Divider className="my-3" />
          <StatRow>
            <Stat
              label="Put / call premium"
              value={formatNumber(data.premiumRatio)}
              detail="Not an OI-based PCR"
            />
            <Stat
              label="Futures basis"
              value={formatNumber(data.futuresBasis)}
              detail="Future minus inferred spot"
            />
          </StatRow>
          <Caveat className="mt-3">No open-interest data — PCR and max pain not shown.</Caveat>
          <MetaLine className="mt-2" {...metaProps(data.meta)} />
        </>
      ) : (
        <BriefEmpty message={data.meta.message ?? 'NIFTY derivatives data is unavailable.'} />
      )}
    </BriefSection>
  );
}

/** How the connected broker's holdings moved today, and which stocks moved them. */
export function PortfolioSection({ brief }: SectionProps) {
  const router = useRouter();
  const data = brief.portfolio;
  return (
    <BriefSection title="Your portfolio today" caption="Connected broker">
      {data.available ? (
        <>
          <StatRow>
            <Stat label="Value" value={formatINR(data.value)} />
            <Stat
              label="Today"
              value={formatSignedINR(data.todayPnl)}
              detail={formatSignedPercent(data.todayPct)}
              tone={data.todayPnl}
            />
            <Stat
              label="Unrealized"
              value={formatSignedINR(data.unrealizedPnl)}
              tone={data.unrealizedPnl}
            />
          </StatRow>
          {data.contributors.length > 0 ? (
            <>
              <Text className="mt-4 text-[13px] font-bold text-ink dark:text-ink-dark">
                What moved it
              </Text>
              <View className="mt-1">
                {data.contributors.map((row, position) => (
                  <BriefRow
                    key={`${row.exchange}:${row.symbol}`}
                    first={position === 0}
                    accessibilityLabel={`${row.symbol}, ${formatSignedINR(row.contribution)}`}
                    onPress={() => router.push(stockHref(row.symbol, row.exchange))}
                  >
                    <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
                      {row.symbol}
                    </Text>
                    <Move value={row.changePct} className="text-xs" />
                    <Text
                      className={cn(
                        'w-[96px] text-right text-sm font-semibold',
                        trendTextClass[trendOf(row.contribution)],
                      )}
                    >
                      {formatSignedINR(row.contribution)}
                    </Text>
                  </BriefRow>
                ))}
              </View>
            </>
          ) : null}
          <MetaLine className="mt-3" {...metaProps(data.meta)} />
        </>
      ) : (
        <BriefEmpty
          message="Connect a broker to see portfolio impact."
          action={{ label: 'Connect a broker', onPress: () => router.push('/brokers') }}
        />
      )}
    </BriefSection>
  );
}

/** The biggest moves across the user's manual watchlists. */
export function WatchlistSection({ brief }: SectionProps) {
  const router = useRouter();
  const data = brief.watchlist;
  return (
    <BriefSection
      title="Your watchlists today"
      action={{ label: 'Watchlists', onPress: () => router.push('/trade/watchlists') }}
    >
      {data.available ? (
        <>
          <StatRow>
            <Stat label="Advancing" value={formatQuantity(data.advancing)} />
            <Stat label="Declining" value={formatQuantity(data.declining)} />
            <Stat
              label="Average move"
              value={formatSignedPercent(data.averageChangePct)}
              tone={data.averageChangePct}
            />
          </StatRow>
          {data.attention.length > 0 ? (
            <View className="mt-3">
              {data.attention.map((row, position) => (
                <BriefRow
                  key={`${row.watchlist}:${row.symbol}`}
                  first={position === 0}
                  accessibilityLabel={`${row.symbol}, ${formatSignedPercent(row.changePct)}`}
                  onPress={() => router.push(stockHref(row.symbol, row.exchange))}
                >
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                      {row.symbol}
                    </Text>
                    <Text
                      className="text-xs text-ink-muted dark:text-ink-dark-muted"
                      numberOfLines={1}
                    >
                      {row.note ? `${row.watchlist} · ${row.note}` : row.watchlist}
                    </Text>
                  </View>
                  <Move value={row.changePct} />
                </BriefRow>
              ))}
            </View>
          ) : (
            <Caveat className="mt-3">None of your watched stocks has a move to report yet.</Caveat>
          )}
          <MetaLine className="mt-3" {...metaProps(data.meta)} />
        </>
      ) : (
        <BriefEmpty message="Watchlist impact is unavailable." />
      )}
    </BriefSection>
  );
}

const ACTION_TONE = { BUY: 'up', SELL: 'down', WATCH: 'neutral' } as const;

/** Today's screener signals, with each one's measured history kept apart from the model view. */
export function TechnicalSection({ brief }: SectionProps) {
  const router = useRouter();
  const radar = brief.technicalRadar;
  return (
    <BriefSection
      title="Technical radar"
      action={{ label: 'Signals', onPress: () => router.push('/intel/signals') }}
    >
      {radar.available ? (
        radar.signals.map((signal, position) => (
          <Pressable
            key={signal.id}
            accessibilityRole="button"
            accessibilityLabel={`${signal.symbol}, ${signal.action}, ${signal.screenerName}`}
            onPress={() => router.push(stockHref(signal.symbol, signal.exchange))}
            className={cn(
              '-mx-4 px-4 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark',
              position > 0 && 'border-t border-line dark:border-line-dark',
            )}
          >
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-bold text-ink dark:text-ink-dark">{signal.symbol}</Text>
              <Tag label={signal.action} tone={ACTION_TONE[signal.action]} />
              <Text
                className="flex-1 text-right text-xs text-ink-muted dark:text-ink-dark-muted"
                numberOfLines={1}
              >
                {signal.screenerName}
              </Text>
            </View>
            {signal.rationale ? (
              <Text className="mt-1.5 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
                {signal.rationale}
              </Text>
            ) : null}
            <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
              <Evidence
                label="Conviction"
                value={signal.conviction === null ? '—' : `${signal.conviction}/5`}
              />
              <Evidence
                label="Hit rate"
                value={
                  signal.hitRatePct === null ? 'Unmeasured' : `${signal.hitRatePct.toFixed(1)}%`
                }
              />
              <Evidence label="Sample" value={formatQuantity(signal.sampleTrades)} />
              <Evidence label="Avg return" value={formatSignedPercent(signal.avgReturnPct)} />
            </View>
            {signal.invalidation ? (
              <Text className="mt-1.5 text-xs text-ink-faint dark:text-ink-dark-faint">
                Invalidation: {signal.invalidation}
              </Text>
            ) : null}
          </Pressable>
        ))
      ) : (
        <BriefEmpty message="No signals this session." />
      )}
      <Caveat className="mt-3">
        Hit rate is measured history; conviction is a model rank, not a probability.
      </Caveat>
    </BriefSection>
  );
}

function Evidence({ label, value }: { label: string; value: string }) {
  return (
    <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
      {label} <Text className="font-semibold text-ink dark:text-ink-dark">{value}</Text>
    </Text>
  );
}

/** Noteworthy, not prescriptive. */
export function AttentionSection({ brief }: SectionProps) {
  const router = useRouter();
  const items = useMemo(() => attentionItems(brief), [brief]);
  return (
    <BriefSection title="What needs your attention?">
      {items.length > 0 ? (
        items.map((item, position) => (
          <View
            key={`${item.symbol ?? 'market'}:${position}`}
            className={cn(
              'py-3',
              position > 0 && 'border-t border-line dark:border-line-dark',
              position === 0 && 'pt-0',
            )}
          >
            <Tag label={item.symbol ?? 'MARKET'} tone="info" />
            <Text className="mt-1.5 text-sm font-bold text-ink dark:text-ink-dark">
              {item.title}
            </Text>
            {item.whatHappened ? (
              <Text className="mt-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
                {item.whatHappened}
              </Text>
            ) : null}
            {item.whyItMatters ? (
              <Labelled label="Why it matters" value={item.whyItMatters} />
            ) : null}
            {item.risk ? <Labelled label="Risk" value={item.risk} /> : null}
            {item.symbol ? (
              <Pressable
                accessibilityRole="link"
                hitSlop={8}
                onPress={() => router.push(stockHref(item.symbol!, 'NSE'))}
                className="mt-2 self-start active:opacity-60"
              >
                <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                  View {item.symbol}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))
      ) : (
        <BriefEmpty message="Nothing flagged today." />
      )}
    </BriefSection>
  );
}

function Labelled({ label, value }: { label: string; value: string }) {
  return (
    <Text className="mt-1.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
      <Text className="font-semibold text-ink dark:text-ink-dark">{label}: </Text>
      {value}
    </Text>
  );
}

const SENTIMENT_TONE: Record<string, 'up' | 'down' | 'neutral'> = {
  Positive: 'up',
  Negative: 'down',
};

/** Only analyzed articles, ranked by impact — never padded with filler. */
export function NewsSection({ brief }: SectionProps) {
  const router = useRouter();
  return (
    <BriefSection
      title="News that matters today"
      action={{ label: 'News', onPress: () => router.push('/news') }}
    >
      {brief.news.length > 0 ? (
        brief.news.map((item, position) => {
          const time = formatIstTime(item.publishedAt);
          return (
            <View
              key={item.id}
              className={cn(
                'py-3',
                position > 0 && 'border-t border-line dark:border-line-dark',
                position === 0 && 'pt-0',
              )}
            >
              <View className="flex-row flex-wrap items-center gap-1.5">
                <Tag label={item.symbol ?? 'MARKET'} />
                {item.sentiment ? (
                  <Tag label={item.sentiment} tone={SENTIMENT_TONE[item.sentiment] ?? 'neutral'} />
                ) : null}
                <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                  {[item.source, time ? `${time} IST` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text className="mt-1.5 text-sm font-semibold leading-5 text-ink dark:text-ink-dark">
                {item.title}
              </Text>
              <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                {item.analysisAvailable
                  ? `AI impact score: ${item.effectivenessScore ?? 'unavailable'} / 100`
                  : 'Analysis pending.'}
              </Text>
              <View className="mt-2 flex-row gap-4">
                <Pressable
                  accessibilityRole="link"
                  hitSlop={8}
                  onPress={() =>
                    router.push({ pathname: '/article/[id]', params: { id: item.id } })
                  }
                  className="active:opacity-60"
                >
                  <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                    {item.analysisAvailable ? 'Read analysis' : 'Open article'}
                  </Text>
                </Pressable>
                {item.link ? (
                  <Pressable
                    accessibilityRole="link"
                    hitSlop={8}
                    onPress={() => void openArticleLink(item.link)}
                    className="active:opacity-60"
                  >
                    <Text className="text-[13px] font-semibold text-ink-muted dark:text-ink-dark-muted">
                      Original source ↗
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })
      ) : (
        <BriefEmpty message="No analyzed news this session." />
      )}
    </BriefSection>
  );
}

const VERDICT_TEXT: Record<Tone, string> = {
  ok: 'text-brand-text dark:text-brand-text-dark',
  warn: 'text-warning-600 dark:text-warning-dark',
  err: 'text-danger-600 dark:text-danger-dark',
  info: 'text-info dark:text-info-dark',
  neutral: 'text-ink-muted dark:text-ink-dark-muted',
};

/** "Pre-listing setup · 72/100 · Favourable setup", or that it is still being prepared. */
function IpoReportLine({
  label,
  kind,
  report,
}: {
  label: string;
  kind: 'pre-listing' | 'post-listing';
  report: BriefIpoReport | null;
}) {
  if (!report) return null;
  const busy = report.status === 'queued' || report.status === 'running';
  const verdict = verdictOf(kind, report.verdict);
  return (
    <View className="mt-2">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
        {label} ·{' '}
        <Text
          className={cn('font-semibold', busy ? VERDICT_TEXT.neutral : VERDICT_TEXT[verdict.tone])}
        >
          {busy ? 'Being prepared…' : `${report.composite ?? '—'}/100 · ${verdict.word}`}
        </Text>
      </Text>
      {!busy && report.headline ? (
        <Text className="mt-0.5 text-xs leading-[17px] text-ink dark:text-ink-dark">
          {report.headline}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * IPOs whose listing date is the brief's date, with their research verdicts. The IPO call
 * auction runs 09:00–09:45 IST and trading starts at 10:00. Only rendered on a day something
 * lists — an empty card every other day is noise.
 */
export function IpoListingsSection({ brief, isToday }: SectionProps & { isToday: boolean }) {
  const router = useRouter();
  const items = brief.ipoListings.items;
  return (
    <BriefSection
      title={isToday ? 'IPOs listing today' : `IPOs listing on ${brief.date}`}
      caption="Trading from 10:00 IST"
      action={{ label: 'IPO centre', onPress: () => router.push('/ipo') }}
    >
      {items.map((ipo, position) => (
        <Pressable
          key={ipo.id}
          accessibilityRole="button"
          accessibilityLabel={`${ipo.companyName}, opens the IPO's research`}
          onPress={() => router.push({ pathname: '/ipo/[id]', params: { id: ipo.id } })}
          className={cn(
            'py-3 active:opacity-70',
            position > 0 && 'border-t border-line dark:border-line-dark',
            position === 0 && 'pt-0',
          )}
        >
          <View className="flex-row items-center gap-2">
            <Text
              className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark"
              numberOfLines={1}
            >
              {ipo.companyName}
            </Text>
            <Tag
              label={`${ipo.issueType === 'sme' ? 'SME' : 'Mainboard'}${ipo.exchange ? ` · ${ipo.exchange}` : ''}`}
            />
          </View>
          <Text
            className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            Issue {formatINR(ipo.issuePrice, 0)} · GMP {gmpPctText(ipo.gmpPercent)} · Implied{' '}
            {formatINR(ipo.estimatedListingPrice, 0)} · {times(ipo.totalSubscription)} subscribed
          </Text>
          <IpoReportLine label="Pre-listing setup" kind="pre-listing" report={ipo.preListing} />
          <IpoReportLine label="Entry after listing" kind="post-listing" report={ipo.postListing} />
          {!ipo.preListing && !ipo.postListing ? (
            <Text className="mt-2 text-xs text-ink-faint dark:text-ink-dark-faint">
              No research report.
            </Text>
          ) : null}
        </Pressable>
      ))}
      <Caveat className="mt-1">
        Model-assisted research, not advice. Grey-market premiums are unofficial.
      </Caveat>
    </BriefSection>
  );
}

/** Which external providers the brief can't use yet, and why. */
export function CalendarSection({ brief }: SectionProps) {
  return (
    <BriefSection title="Calendar & external cues">
      {brief.unavailableSources.length > 0 ? (
        brief.unavailableSources.map((item, position) => (
          <View
            key={item.key || item.label}
            className={cn(
              'py-2.5',
              position > 0 && 'border-t border-line dark:border-line-dark',
              position === 0 && 'pt-0',
            )}
          >
            <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
              {item.label}
            </Text>
            <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
              {item.reason}
            </Text>
          </View>
        ))
      ) : (
        <BriefEmpty message="Every external source this brief uses is available." />
      )}
    </BriefSection>
  );
}
