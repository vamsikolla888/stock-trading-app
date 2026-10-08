import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import {
  IpoLogo,
  IpoRating,
  NUM,
  TONE_DOT,
  TONE_TEXT,
  ToneLine,
} from '@/features/ipo/components/IpoParts';
import { useIpoList } from '@/features/ipo/hooks';
import {
  EVENT_TONE,
  eventLine,
  gmpPctText,
  ipoCall,
  ipoNextDays,
  issueLabel,
  type IpoCall,
  type IpoEventKind,
} from '@/features/ipo/lib/format';
import type { IpoRecord } from '@/features/ipo/types';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { isServerOutdated } from '@/services/api/contract';

const MAX_ROWS = 4;

/**
 * The primary market on Today (web: Today's IPOs panel) — what lists, closes or opens over the
 * next three days, each with its star rating, its research call (the report's score out of 100
 * and its suggestion) and its grey-market premium. Shares the IPO centre's cached list. Hidden on
 * a server without the IPO calendar, and quiet when nothing is happening.
 */
export function UpcomingIpos() {
  const router = useRouter();
  const now = useNow();
  const list = useIpoList('all');
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const events = useMemo(
    () =>
      ipoNextDays(items, new Date(now)).flatMap((day) =>
        day.events.map((event) => ({ ...event, day: day.label })),
      ),
    [items, now],
  );
  const openNow = items.filter((ipo) => ipo.status === 'open').length;

  if (!list.data && (list.isPending || isServerOutdated(list.error))) return null;

  const open = (ipo: IpoRecord) => router.push({ pathname: '/ipo/[id]', params: { id: ipo.id } });

  return (
    <Section
      title="IPOs"
      action={{
        label: openNow > 0 ? `${openNow} open now` : 'See all',
        onPress: () => router.push('/ipo'),
      }}
    >
      {list.error && !list.data ? (
        <InlineError what="IPOs" error={list.error} onRetry={() => void list.refetch()} />
      ) : events.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/ipo')}
          className="rounded-card border border-line bg-surface px-3.5 py-3.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
        >
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
            No IPO opens, closes or lists in the next three days.{' '}
            <Text className="font-semibold text-brand-text dark:text-brand-text-dark">
              Open the IPO centre
            </Text>
          </Text>
        </Pressable>
      ) : (
        <ListCard>
          {events.slice(0, MAX_ROWS).map(({ kind, ipo, day }, index) => (
            <View key={`${kind}:${ipo.id}`}>
              {index > 0 ? <RowDivider /> : null}
              <EventRow kind={kind} ipo={ipo} day={day} onPress={() => open(ipo)} />
            </View>
          ))}
          {events.length > MAX_ROWS ? (
            <Text className="border-t border-line px-3.5 py-2.5 text-xs text-ink-muted dark:border-line-dark dark:text-ink-dark-muted">
              +{events.length - MAX_ROWS} more in the next three days
            </Text>
          ) : null}
        </ListCard>
      )}
      {events.length > 0 ? (
        <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Scores are model-assisted research, not advice · GMP is unofficial
        </Text>
      ) : null}
    </Section>
  );
}

/** "Setup 72/100 · ● Favourable setup" — or why there is no score yet. */
function CallLine({ call }: { call: IpoCall | null }) {
  if (!call || call.state !== 'ready') {
    return (
      <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
        {call ? `${call.label} · ${call.verdict}` : 'No research report yet'}
      </Text>
    );
  }
  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
        {call.label}{' '}
        <Text className="font-bold text-ink dark:text-ink-dark">{call.score ?? '—'}</Text>
        <Text className="text-ink-faint dark:text-ink-dark-faint">/100</Text>
      </Text>
      <ToneLine tone={call.tone} text={call.verdict} className="flex-1" />
    </View>
  );
}

function EventRow({
  kind,
  ipo,
  day,
  onPress,
}: {
  kind: IpoEventKind;
  ipo: IpoRecord;
  day: string;
  onPress: () => void;
}) {
  const gmp = ipo.gmpPercent;
  const call = ipoCall(ipo.research, kind);
  const callWords = call
    ? call.state === 'ready'
      ? `${call.label} score ${call.score ?? 'not available'} of 100, ${call.verdict}`
      : `${call.label}: ${call.verdict}`
    : 'No research report yet';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ipo.companyName}, ${eventLine(kind, day)}${
        ipo.rating != null ? `, rated ${ipo.rating} of 5` : ''
      }. ${callWords}. Grey-market premium ${gmpPctText(gmp)}`}
      onPress={onPress}
      className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <IpoLogo ipo={ipo} />
      <View className="flex-1 gap-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
          {ipo.companyName}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <View className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[EVENT_TONE[kind]])} />
          <Text
            className={cn('flex-shrink text-xs font-medium', TONE_TEXT[EVENT_TONE[kind]])}
            numberOfLines={1}
          >
            {eventLine(kind, day)} · {issueLabel(ipo.issueType)}
          </Text>
          <View className="ml-0.5">
            <IpoRating rating={ipo.rating} small showValue={false} hideEmpty />
          </View>
        </View>
        <CallLine call={call} />
      </View>
      <View className="items-end">
        <Text
          className={cn(
            'text-[13px] font-semibold',
            gmp == null || gmp === 0
              ? 'text-ink-muted dark:text-ink-dark-muted'
              : gmp > 0
                ? 'text-brand-text dark:text-brand-text-dark'
                : 'text-danger-600 dark:text-danger-dark',
          )}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {gmp == null ? 'No GMP' : gmpPctText(gmp)}
        </Text>
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">GMP</Text>
      </View>
    </Pressable>
  );
}
