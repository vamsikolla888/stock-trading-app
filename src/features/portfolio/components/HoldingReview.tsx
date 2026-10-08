import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Swatch, VerdictChip } from '@/features/agents/components/Verdict';
import { VERDICT, VERDICT_ORDER } from '@/features/agents/lib/view';
import type { HoldingSummary } from '@/features/agents/types';
import { relativeTime } from '@/features/settings/lib/time';
import { useTheme } from '@/theme/ThemeProvider';

import {
  reviewKey,
  reviewMark,
  reviewTally,
  VERDICT_HINT,
  type HoldingReviews,
} from '../lib/reviews';

/**
 * The AI portfolio review beside a holding (web: agents/ui/ReviewMark.tsx) — a research label,
 * never an order. A different thing from the screener signal: research on the holding, not a
 * scan hit.
 */

/**
 * One quiet line over a book's holdings: how they stand in the review and when it last ran;
 * tapping opens Portfolio review. Says plainly when the review is off or unreadable, and hides
 * on a server that predates it.
 */
export function ReviewSummaryLine({
  reviews,
  holdings,
  bookLabel,
  now,
  onOpen,
}: {
  reviews: HoldingReviews;
  holdings: readonly { exchange: string; symbol: string }[];
  bookLabel: string;
  now: number;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  if (reviews.outdated) return null;

  let content: React.ReactNode;
  let label: string;
  if (reviews.isLoading) {
    label = 'Reading the portfolio review';
    content = (
      <Text className="flex-1 text-xs text-ink-faint dark:text-ink-dark-faint">
        Reading the portfolio review…
      </Text>
    );
  } else if (reviews.isError || !reviews.data) {
    label = 'Portfolio review unavailable. Open Portfolio review';
    content = (
      <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted">
        Portfolio review couldn’t be read just now.
      </Text>
    );
  } else {
    const tally = reviewTally(holdings, reviews.index);
    const withVerdict = tally.total - tally.reviewing - tally.none;
    const parts = VERDICT_ORDER.filter((action) => tally[action] > 0);
    label = `AI review: ${
      withVerdict === 0
        ? 'no verdicts yet'
        : parts.map((action) => `${tally[action]} ${VERDICT[action].label}`).join(', ')
    }. Open Portfolio review`;
    content = (
      <View className="flex-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text className="text-xs font-semibold text-ink dark:text-ink-dark">AI review</Text>
        {withVerdict === 0 ? (
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            {reviews.data.enabled
              ? `No verdict on these ${bookLabel} holdings yet`
              : 'Off — turn it on in Portfolio review'}
          </Text>
        ) : (
          <>
            {parts.map((action) => (
              <View key={action} className="flex-row items-center gap-1">
                <Swatch action={action} size={8} />
                <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                  {tally[action]} {VERDICT[action].label}
                </Text>
              </View>
            ))}
            {tally.reviewing > 0 ? (
              <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
                {tally.reviewing} reviewing
              </Text>
            ) : null}
            {tally.latestAt ? (
              <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
                {relativeTime(tally.latestAt, now)}
              </Text>
            ) : null}
          </>
        )}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onOpen}
      className="mb-2.5 flex-row items-center gap-2 rounded-xl bg-surface-sunk px-3 py-2.5 active:opacity-70 dark:bg-surface-sunk-dark"
    >
      {content}
      <ChevronRight size={14} color={colors.textFaint} />
    </Pressable>
  );
}

/**
 * The verdict under a holding's returns: the review's swatch and word, "was …" when it flipped
 * in the last day. Quiet for a holding with no verdict yet — a column of "not reviewed" would
 * be noise in a list; the summary line counts them.
 */
export function ReviewMark({ summary }: { summary: HoldingSummary | null | undefined }) {
  const mark = reviewMark(summary);
  if (mark.kind === 'verdict') {
    const verdict = VERDICT[mark.action];
    return (
      <View
        accessible
        accessibilityLabel={`Portfolio review: ${verdict.label}${mark.changedFrom ? `, was ${VERDICT[mark.changedFrom].label}` : ''}`}
        className="mt-1 flex-row items-center gap-1"
      >
        <Swatch action={mark.action} size={7} />
        <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {verdict.label}
          {mark.changedFrom ? ` · was ${VERDICT[mark.changedFrom].label}` : ''}
        </Text>
      </View>
    );
  }
  if (mark.kind === 'reviewing' || mark.kind === 'failed') {
    return (
      <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
        {mark.kind === 'reviewing' ? 'Reviewing' : 'Review failed'}
      </Text>
    );
  }
  return null;
}

/** The review in a holding's sheet: the verdict, what it means, when, and the way to the note. */
export function ReviewSheetBlock({
  reviews,
  exchange,
  symbol,
  now,
  onOpenNote,
}: {
  reviews: HoldingReviews;
  exchange: string;
  symbol: string;
  now: number;
  onOpenNote: (key: string) => void;
}) {
  const { colors } = useTheme();
  if (!reviews.data) return null;
  const summary = reviews.index.get(reviewKey(exchange, symbol)) ?? null;
  const mark = reviewMark(summary);

  const body =
    mark.kind === 'verdict' ? (
      <>
        <View className="flex-row items-center justify-between gap-3">
          <VerdictChip action={mark.action} />
          <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
            {relativeTime(mark.at, now)}
            {mark.updating ? ' · updating' : ''}
          </Text>
        </View>
        <Text className="mt-2 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          {VERDICT_HINT[mark.action]}
          {mark.changedFrom ? ` Was ${VERDICT[mark.changedFrom].label}.` : ''}
        </Text>
      </>
    ) : (
      <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {mark.kind === 'reviewing'
          ? 'The first review of this holding is running.'
          : mark.kind === 'failed'
            ? `The last review failed${mark.error ? `: ${mark.error}` : '.'}`
            : 'Not reviewed yet.'}
      </Text>
    );

  return (
    <View className="mt-4 rounded-xl border border-line p-3.5 dark:border-line-dark">
      <Text className="mb-2 text-[13px] font-semibold text-ink dark:text-ink-dark">
        AI portfolio review
      </Text>
      {body}
      <Text className="mt-1.5 text-xs text-ink-faint dark:text-ink-dark-faint">
        Research only, not an order.
      </Text>
      {summary ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenNote(summary.key)}
          hitSlop={6}
          className="mt-2.5 flex-row items-center gap-1 self-start active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Read the review
          </Text>
          <ChevronRight size={14} color={colors.link} />
        </Pressable>
      ) : null}
    </View>
  );
}
