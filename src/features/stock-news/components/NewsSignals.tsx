import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { Sparkline } from '@/components/market/Sparkline';
import { Meter, type MeterTone } from '@/components/ui/Meter';
import { openArticleLink } from '@/features/news/lib/openLink';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { useStockNews } from '../hooks';
import {
  ago,
  EVENT_LABEL,
  EVIDENCE_TEXT,
  RISK_WORD,
  SCORE_WORD,
  scoreProgress,
  signedInt,
} from '../lib/format';
import type { NewsRisk, NewsScore } from '../types';

/**
 * The two numbers the News tab leads with (server stock-news.score.ts, last 30 days):
 *   News score  0–100, 50 neutral — the weighted balance of positive against negative stories.
 *   News risk   0–100, higher = more adverse news — with its level and the stories driving it.
 * The level and the direction are always WRITTEN beside their colour.
 */

const NUM = { fontVariant: ['tabular-nums' as const] };

const DIRECTION = (n: number | null | undefined) =>
  n == null || n === 0
    ? 'text-ink dark:text-ink-dark'
    : n > 0
      ? 'text-brand-text dark:text-brand-text-dark'
      : 'text-danger-600 dark:text-danger-dark';

const LABEL_TEXT: Record<string, string> = {
  Positive: 'text-brand-text dark:text-brand-text-dark',
  Negative: 'text-danger-600 dark:text-danger-dark',
  Neutral: 'text-ink-muted dark:text-ink-dark-muted',
};

const RISK_METER: Record<NonNullable<NewsRisk['level']>, MeterTone> = {
  low: 'gain',
  moderate: 'warning',
  high: 'loss',
};

const RISK_PILL: Record<NonNullable<NewsRisk['level']>, string> = {
  low: 'bg-success-wash text-brand-text dark:bg-success-wash-dark dark:text-brand-text-dark',
  moderate: 'bg-warning-wash text-warning-600 dark:bg-warning-wash-dark dark:text-warning-dark',
  high: 'bg-danger-wash text-danger-600 dark:bg-danger-wash-dark dark:text-danger-dark',
};

function Tile({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View
      accessibilityLabel={label}
      className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
    >
      {children}
    </View>
  );
}

function Foot({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
      {children}
    </Text>
  );
}

export function NewsScoreTile({ score }: { score: NewsScore }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width)),
    [],
  );
  const trend = score.series.map((p) => p.value).filter((v): v is number => v != null);
  const progress = scoreProgress(score);
  return (
    <Tile label="News score">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">News score · 30 days</Text>
      {score.value == null ? (
        <Text className="mt-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Not enough analysed news in the last 30 days to score.
        </Text>
      ) : (
        <>
          <View className="mt-1 flex-row items-baseline gap-1.5">
            <Text className="text-[28px] font-bold text-ink dark:text-ink-dark" style={NUM}>
              {score.value}
            </Text>
            <Text className="text-sm text-ink-muted dark:text-ink-dark-muted">/100</Text>
            {score.label ? (
              <Text className={cn('ml-1 flex-1 text-sm font-semibold', LABEL_TEXT[score.label])}>
                {SCORE_WORD[score.label]}
              </Text>
            ) : null}
          </View>
          <Text className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted">
            {score.change7d != null ? (
              <>
                <Text className={cn('font-semibold', DIRECTION(score.change7d))} style={NUM}>
                  {signedInt(score.change7d)}
                </Text>{' '}
                vs 7 days ago{progress ? ` · ${progress}` : ''}
              </>
            ) : (
              'No score a week ago to compare with'
            )}
          </Text>
          <View onLayout={onLayout} className="mt-3 h-10">
            {trend.length >= 2 && width > 0 ? (
              <Sparkline data={trend} width={width} height={40} color={colors.info} />
            ) : null}
          </View>
          <Foot>
            50 is neutral. From {score.stories} stor{score.stories === 1 ? 'y' : 'ies'} —{' '}
            {EVIDENCE_TEXT[score.evidence]}.
          </Foot>
        </>
      )}
    </Tile>
  );
}

export function NewsRiskTile({ risk, now }: { risk: NewsRisk; now: number }) {
  return (
    <Tile label="News risk">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">News risk · 30 days</Text>
      {risk.value == null || risk.level == null ? (
        <Text className="mt-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Not enough analysed news in the last 30 days to assess.
        </Text>
      ) : (
        <>
          <View className="mt-1 flex-row items-center gap-1.5">
            <Text className="text-[28px] font-bold text-ink dark:text-ink-dark" style={NUM}>
              {risk.value}
            </Text>
            <Text className="text-sm text-ink-muted dark:text-ink-dark-muted">/100</Text>
            <Text
              className={cn(
                'ml-1 overflow-hidden rounded-full px-2.5 py-0.5 text-xs font-semibold',
                RISK_PILL[risk.level],
              )}
            >
              {RISK_WORD[risk.level]} risk
            </Text>
          </View>
          <Meter
            className="mt-2"
            value={Math.max(2, risk.value)}
            tone={RISK_METER[risk.level]}
            accessibilityLabel={`News risk ${risk.value} out of 100, ${RISK_WORD[risk.level].toLowerCase()}`}
          />
          {risk.components ? (
            <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
              Adverse share {risk.components.adverseShare} · Serious adverse news{' '}
              {risk.components.adverseEvents} · Contested {risk.components.conflict}
            </Text>
          ) : null}
          {risk.drivers.length > 0 ? (
            <View className="mt-3 gap-2">
              <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
                What drives it
              </Text>
              {risk.drivers.map((d) => (
                <Pressable
                  key={d.id}
                  accessibilityRole="link"
                  onPress={() => void openArticleLink(d.url)}
                  className="active:opacity-60"
                >
                  <Text
                    className="text-[13px] leading-[18px] text-ink dark:text-ink-dark"
                    numberOfLines={2}
                  >
                    {d.title}
                  </Text>
                  <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                    {d.eventType ? EVENT_LABEL[d.eventType] : 'News'}
                    {d.at ? ` · ${ago(d.at, now)}` : ''}
                    {d.impact != null ? ` · impact ${d.impact}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Foot>No material adverse story in the last 30 days.</Foot>
          )}
          <Foot>
            Low below 30, high from 60. From {risk.stories} stor{risk.stories === 1 ? 'y' : 'ies'} —{' '}
            {EVIDENCE_TEXT[risk.evidence]}.
          </Foot>
        </>
      )}
    </Tile>
  );
}

/**
 * The Overview's compact readout of both numbers — a tap opens the News tab. Same query (and key)
 * the News tab opens with, so it costs nothing extra; it renders nothing until there is a score,
 * and nothing at all on a server without stock news.
 */
export function NewsSignalStrip({
  exchange,
  symbol,
  onOpen,
}: {
  exchange: 'NSE' | 'BSE';
  symbol: string;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const news = useStockNews(exchange, symbol);
  const signals = news.data?.pages[0]?.signals;
  if (!signals) return null;
  const { score, risk } = signals;
  if (score.value == null && (risk.value == null || risk.level == null)) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`News score ${score.value ?? 'not available'}, news risk ${risk.level ? RISK_WORD[risk.level] : 'not available'}. Opens the News tab.`}
      onPress={onOpen}
      className="mt-3 flex-row items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-1 flex-row flex-wrap items-center gap-x-4 gap-y-1">
        {score.value != null ? (
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
            News score{' '}
            <Text className="font-bold text-ink dark:text-ink-dark" style={NUM}>
              {score.value}
            </Text>
            {score.change7d != null && score.change7d !== 0 ? (
              <Text className={cn('text-xs font-semibold', DIRECTION(score.change7d))} style={NUM}>
                {` ${signedInt(score.change7d)}`}
              </Text>
            ) : null}
          </Text>
        ) : null}
        {risk.value != null && risk.level ? (
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
            News risk{' '}
            <Text className="font-bold text-ink dark:text-ink-dark" style={NUM}>
              {risk.value}
            </Text>{' '}
            <Text
              className={cn(
                'text-xs font-semibold',
                risk.level === 'high'
                  ? 'text-danger-600 dark:text-danger-dark'
                  : risk.level === 'moderate'
                    ? 'text-warning-600 dark:text-warning-dark'
                    : 'text-brand-text dark:text-brand-text-dark',
              )}
            >
              {RISK_WORD[risk.level]}
            </Text>
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textFaint} />
    </Pressable>
  );
}
