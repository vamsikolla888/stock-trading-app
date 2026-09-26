import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { formatIstDateTime } from '@/features/home/lib/istTime';
import { cn } from '@/lib/utils/cn';

import {
  articleState,
  impactTier,
  scoredImpact,
  SENTIMENT_BADGE,
  type ImpactTier,
} from '../lib/news';
import type { AnalyzedArticleListItem } from '../types';

const IMPACT_BOX: Record<ImpactTier, { box: string; text: string }> = {
  high: {
    box: 'bg-danger-wash dark:bg-danger-wash-dark',
    text: 'text-danger-600 dark:text-danger-dark',
  },
  medium: {
    box: 'bg-warning-wash dark:bg-warning-wash-dark',
    text: 'text-warning-600 dark:text-warning-dark',
  },
  low: {
    box: 'bg-success-wash dark:bg-success-wash-dark',
    text: 'text-brand-text dark:text-brand-text-dark',
  },
};

function StateBadge({ item }: { item: AnalyzedArticleListItem }) {
  const state = articleState(item);
  if (state === 'scored' && item.sentiment) {
    return <Badge label={item.sentiment} variant={SENTIMENT_BADGE[item.sentiment]} />;
  }
  if (state === 'failed') return <Badge label="Analysis failed" variant="danger" />;
  if (state === 'analyzing') return <Badge label="Analyzing…" />;
  return <Badge label="Not analysed yet" />;
}

interface NewsRowProps {
  item: AnalyzedArticleListItem;
  onPress: () => void;
  /** Shown on a failed row; omit to hide the retry control. */
  onRetry?: () => void;
  retrying?: boolean;
  /** Hide the ticker (e.g. inside a stock's own News tab). */
  hideSymbol?: boolean;
}

/**
 * One analysed article: impact score on the left (the number to watch — sentiment without
 * impact is noise), then status, ticker, headline and source. Tapping opens the in-app
 * article; a failed analysis gets its own Retry beside, not inside, the row's button.
 */
export const NewsRow = memo(function NewsRow({
  item,
  onPress,
  onRetry,
  retrying = false,
  hideSymbol = false,
}: NewsRowProps) {
  const impact = scoredImpact(item);
  const tone = impact !== null ? IMPACT_BOX[impactTier(impact)] : null;
  const when = formatIstDateTime(item.publishedAtDate);
  const failed = articleState(item) === 'failed';
  const title = item.title || '(untitled)';

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[
          title,
          item.source,
          impact !== null ? `impact ${impact} of 100` : 'impact not scored yet',
          item.sentiment ?? undefined,
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint="Opens the article"
        onPress={onPress}
        className="flex-row gap-3 px-3.5 py-3.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <View
          className={cn(
            'h-11 w-11 items-center justify-center rounded-xl',
            tone ? tone.box : 'bg-surface-sunk dark:bg-surface-sunk-dark',
          )}
        >
          <Text
            className={cn(
              'text-[15px] font-bold',
              tone ? tone.text : 'text-ink-faint dark:text-ink-dark-faint',
            )}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {impact ?? '—'}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <StateBadge item={item} />
            {!hideSymbol && item.stockSymbol ? (
              <Text
                className="text-xs font-semibold text-brand-text dark:text-brand-text-dark"
                numberOfLines={1}
              >
                {item.stockSymbol}
                {item.symbolVerified ? '' : ' (unverified)'}
              </Text>
            ) : null}
          </View>
          <Text
            className="mt-1.5 text-sm font-semibold leading-5 text-ink dark:text-ink-dark"
            numberOfLines={3}
          >
            {title}
          </Text>
          <Text className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {item.source}
            {when ? ` · ${when}` : ''}
          </Text>
        </View>
      </Pressable>
      {failed && onRetry ? (
        <View className="-mt-1.5 flex-row items-center gap-3 pb-3 pl-[70px] pr-3.5">
          {item.lastError ? (
            <Text
              className="flex-1 text-[11px] text-ink-faint dark:text-ink-dark-faint"
              numberOfLines={2}
            >
              {item.lastError}
            </Text>
          ) : (
            <View className="flex-1" />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry analysis of ${title}`}
            accessibilityState={{ disabled: retrying, busy: retrying }}
            disabled={retrying}
            hitSlop={8}
            onPress={onRetry}
            className="active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              {retrying ? 'Retrying…' : 'Retry'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});
