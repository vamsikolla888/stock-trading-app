import { useRouter } from 'expo-router';
import BriefcaseBusiness from 'lucide-react-native/icons/briefcase-business';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import PlugZap from 'lucide-react-native/icons/plug-zap';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import React, { useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Button } from '@/components/ui/Button';
import { IconTile } from '@/components/ui/IconTile';
import { Section } from '@/components/ui/Section';
import type { HomeBook } from '@/features/portfolio/hooks';
import { BOOK_HREF, bookIndex, type BookId } from '@/features/portfolio/lib/books';
import { formatINR, formatPercent, formatSignedINR, MASKED_VALUE } from '@/lib/utils/formatters';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useTheme } from '@/theme/ThemeProvider';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

/** "+₹18,260 (1.49%)" — sign on the amount, the percent in brackets, as Groww prints returns. */
function formatReturn(abs: number | null, pct: number | null): string {
  if (abs === null) return '—';
  return pct === null
    ? formatSignedINR(abs)
    : `${formatSignedINR(abs)} (${formatPercent(Math.abs(pct))})`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-1.5">
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      {children}
    </View>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUMBERS}>
      {children}
    </Text>
  );
}

const CARD =
  'rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark';

function LoadingCard() {
  return (
    <View accessibilityLabel="Loading your holdings" className={`gap-3 p-4 ${CARD}`}>
      <View className="h-3 w-24 rounded bg-line dark:bg-line-dark" />
      <View className="h-7 w-40 rounded-md bg-line dark:bg-line-dark" />
      <View className="mt-2 h-3 w-full rounded bg-line dark:bg-line-dark" />
      <View className="h-3 w-full rounded bg-line dark:bg-line-dark" />
    </View>
  );
}

/** A card with no figures: an icon, two lines of copy and the one or two actions that help. */
function MessageCard({
  Icon,
  tone,
  title,
  body,
  primary,
  secondary,
}: {
  Icon: typeof BriefcaseBusiness;
  tone: 'green' | 'amber' | 'rose';
  title: string;
  body: string;
  primary: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
}) {
  return (
    <View className={`p-4 ${CARD}`}>
      <View className="flex-row items-start gap-3">
        <IconTile Icon={Icon} tone={tone} />
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">{title}</Text>
          <Text className="mt-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            {body}
          </Text>
        </View>
      </View>
      <View className="mt-4 flex-row gap-2.5">
        <Button className="flex-1" size="sm" label={primary.label} onPress={primary.onPress} />
        {secondary ? (
          <Button
            className="flex-1"
            size="sm"
            variant="outline"
            label={secondary.label}
            onPress={secondary.onPress}
          />
        ) : null}
      </View>
    </View>
  );
}

/** No book at all: no broker connected and nothing added by hand. */
function NoBooksCard() {
  const router = useRouter();
  return (
    <MessageCard
      Icon={BriefcaseBusiness}
      tone="green"
      title="Your investments show up here"
      body="Connect Groww or mStock for live holdings, or practise with paper trading."
      primary={{ label: 'Connect broker', onPress: () => router.push('/brokers') }}
      secondary={{ label: 'Paper trade', onPress: () => router.push('/trade/paper') }}
    />
  );
}

/** A book with no rows to show: empty, or connected but unreadable with nothing cached. */
function EmptyBookCard({ book, onRetry }: { book: HomeBook; onRetry: () => void }) {
  const router = useRouter();
  if (book.state === 'error') {
    return book.sessionExpired ? (
      <MessageCard
        Icon={PlugZap}
        tone="amber"
        title={`Reconnect ${book.label}`}
        body={book.message ?? `Could not read your ${book.label} account.`}
        primary={{ label: 'Reconnect', onPress: () => router.push('/brokers') }}
      />
    ) : (
      <MessageCard
        Icon={TriangleAlert}
        tone="rose"
        title={`Couldn’t read your ${book.label} account`}
        body={book.message ?? 'Please try again in a moment.'}
        primary={{ label: 'Try again', onPress: onRetry }}
        secondary={{ label: 'Connections', onPress: () => router.push('/brokers') }}
      />
    );
  }
  return (
    <MessageCard
      Icon={BriefcaseBusiness}
      tone="green"
      title={`No holdings in ${book.label}`}
      body="Stocks you buy show up here with their value and returns."
      primary={{ label: 'Explore stocks', onPress: () => router.navigate('/explore') }}
      secondary={{ label: 'Paper trade', onPress: () => router.push('/trade/paper') }}
    />
  );
}

function BookCard({ book, onRetry }: { book: HomeBook; onRetry: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const hideValues = usePreferencesStore((state) => state.hideValues);
  const toggleHideValues = usePreferencesStore((state) => state.toggleHideValues);
  const mask = (text: string) => (hideValues ? MASKED_VALUE : text);
  const VisibilityIcon = hideValues ? EyeOff : Eye;

  if (book.holdings.length === 0) return <EmptyBookCard book={book} onRetry={onRetry} />;

  const { figures } = book;
  const href = BOOK_HREF[book.id];
  // Hand-tracked holdings can lack a live price; show what was invested rather than pass the
  // cost off as today's value. A book that could not be read shows its last known figures.
  const priced = figures.value !== null;
  const valueLabel = !priced
    ? 'Invested value'
    : book.state === 'error'
      ? 'Last known value'
      : 'Current value';

  const body = (
    <>
      <View className="flex-row items-center gap-2">
        <Text
          className="flex-1 text-[26px] font-bold text-ink dark:text-ink-dark"
          style={[NUMBERS, { letterSpacing: -0.8 }]}
          accessibilityLabel={hideValues ? 'Value hidden' : undefined}
        >
          {mask(formatINR(figures.value ?? figures.invested))}
        </Text>
        {href ? <ChevronRight size={18} color={colors.textFaint} /> : null}
      </View>

      <View className="my-3 h-px bg-line dark:bg-line-dark" />

      {figures.day ? (
        <Row label="1D returns">
          <ChangeText value={figures.day.abs} className="text-[13px]" style={NUMBERS}>
            {mask(formatReturn(figures.day.abs, figures.day.pct))}
          </ChangeText>
        </Row>
      ) : null}
      <Row label="Total returns">
        {figures.pnl !== null ? (
          <ChangeText value={figures.pnl} className="text-[13px]" style={NUMBERS}>
            {mask(formatReturn(figures.pnl, figures.pnlPct))}
          </ChangeText>
        ) : (
          <Value>Price unavailable</Value>
        )}
      </Row>
      {priced ? (
        <Row label="Invested">
          <Value>{mask(formatINR(figures.invested))}</Value>
        </Row>
      ) : null}
      {book.availableCash !== null ? (
        <Row label="Available funds">
          <Value>{mask(formatINR(book.availableCash))}</Value>
        </Row>
      ) : null}
      {!priced && figures.count > 0 ? (
        <Text className="mt-2 text-xs text-ink-faint dark:text-ink-dark-faint">
          {figures.priced} of {figures.count} priced — totals left blank, not understated.
        </Text>
      ) : book.stale && book.state === 'ready' ? (
        <Text className="mt-2 text-xs text-ink-faint dark:text-ink-dark-faint">
          Showing last known values — the broker was slow to respond.
        </Text>
      ) : book.id === 'manual' ? (
        <Text className="mt-2 text-xs text-ink-faint dark:text-ink-dark-faint">
          Tracked by hand. Connect a broker for live values.
        </Text>
      ) : null}
    </>
  );

  return (
    <View className={`overflow-hidden ${CARD}`}>
      <View className="flex-row items-center gap-2 px-4 pt-4">
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{valueLabel}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hideValues ? 'Show portfolio values' : 'Hide portfolio values'}
          hitSlop={12}
          onPress={toggleHideValues}
        >
          <VisibilityIcon size={16} color={colors.textMuted} />
        </Pressable>
        <Text
          className="ml-auto text-xs font-medium text-ink-faint dark:text-ink-dark-faint"
          numberOfLines={1}
        >
          {book.label}
        </Text>
      </View>

      {href ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={`Opens your ${book.label} portfolio`}
          onPress={() => router.navigate(href)}
          className="px-4 pb-4 pt-1 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          {body}
        </Pressable>
      ) : (
        <View className="px-4 pb-4 pt-1">{body}</View>
      )}

      {book.state === 'error' ? (
        <Pressable
          accessibilityRole="button"
          onPress={book.sessionExpired ? () => router.push('/brokers') : onRetry}
          className="flex-row items-center gap-2 border-t border-line bg-warning-wash px-4 py-2.5 active:opacity-70 dark:border-line-dark dark:bg-warning-wash-dark"
        >
          <Text
            className="flex-1 text-xs leading-[17px] text-warning-600 dark:text-warning-dark"
            numberOfLines={2}
          >
            {book.message}
          </Text>
          <Text className="text-xs font-semibold text-warning-600 dark:text-warning-dark">
            {book.sessionExpired ? 'Reconnect' : 'Retry'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface HoldingsCardProps {
  /** Every book the user has, Groww first (useHomeBooks). */
  books: readonly HomeBook[];
  isLoading: boolean;
  onRetry: () => void;
}

/**
 * Groww-style holdings summary, one card per book — Groww, then mStock, then holdings added by
 * hand — swiped sideways, never blended (web: Today's holdings carousel). It never turns by
 * itself. The shown book is kept by id, so a book that arrives later never shifts the one being
 * read. Each card's figures follow the live feed.
 */
export function HoldingsCard({ books, isLoading, onRetry }: HoldingsCardProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<BookId | null>(null);

  const ids = books.map((book) => book.id);
  const active = bookIndex(ids, selected);
  const current = books[active] ?? null;
  const count = current?.holdings.length ?? 0;
  const href = current ? BOOK_HREF[current.id] : null;

  // The pager follows the selected BOOK: a dot tap slides to it, and when the set of books
  // changes (one connects, one arrives late) it stays on the book being read. After a swipe it
  // is already there, so this is a no-op.
  const idsKey = ids.join(',');
  useEffect(() => {
    if (width > 0) scrollRef.current?.scrollTo({ x: active * width, animated: true });
  }, [active, idsKey, width]);

  const onSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    const book = books[index];
    if (book && book.id !== current?.id) setSelected(book.id);
  };

  const goTo = (index: number) => {
    const book = books[index];
    if (book) setSelected(book.id);
  };

  let body: React.ReactNode;
  if (isLoading && books.length === 0) {
    body = <LoadingCard />;
  } else if (books.length === 0) {
    body = <NoBooksCard />;
  } else if (books.length === 1 || width <= 0) {
    body = current ? <BookCard book={current} onRetry={onRetry} /> : null;
  } else {
    body = (
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onSettle}
        accessibilityLabel="Your holdings by broker"
      >
        {books.map((book, index) => (
          <View
            key={book.id}
            style={{ width }}
            accessibilityElementsHidden={index !== active}
            importantForAccessibility={index === active ? 'auto' : 'no-hide-descendants'}
          >
            <BookCard book={book} onRetry={onRetry} />
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <Section
      className="mt-6"
      title={count > 0 ? `Holdings (${count})` : 'Holdings'}
      action={
        count > 0 && href ? { label: 'View all', onPress: () => router.navigate(href) } : undefined
      }
    >
      <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
        {body}
      </View>

      {/* Carousel pagination: the book on show is a dash, the rest are dots. */}
      {books.length > 1 ? (
        <View
          accessibilityRole="tablist"
          className="mt-2.5 flex-row items-center justify-center gap-1.5"
        >
          {books.map((book, index) => (
            <Pressable
              key={book.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: index === active }}
              accessibilityLabel={`${book.label}, ${book.holdings.length} ${book.holdings.length === 1 ? 'holding' : 'holdings'}`}
              hitSlop={8}
              onPress={() => goTo(index)}
            >
              <View
                style={[
                  styles.dot,
                  index === active ? styles.dotActive : styles.dotInactive,
                  { backgroundColor: index === active ? colors.textMuted : colors.borderStrong },
                ]}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </Section>
  );
}

const styles = {
  dot: { borderRadius: 9999, height: 5 },
  dotActive: { width: 18, opacity: 1 },
  dotInactive: { width: 5, opacity: 0.8 },
};
