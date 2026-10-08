import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import type { StockDetail } from '@/features/market/types';
import { openArticleLink } from '@/features/news/lib/openLink';

import type { ProfileQuery } from './CompanyParts';

/**
 * About the company — Groww's "About" block: the business in a few lines ("Read more"), then the
 * facts a reader looks up. Two sources, each the better one for what it gives: Groww's company page
 * (description, founded, leadership, parent, F&O) and this platform's own catalogue (sector, ISIN,
 * listings, index memberships). A fact neither has is left out, not printed as a dash.
 */

function LongValue({ children }: { children: string }) {
  return (
    <Text
      selectable
      className="max-w-[62%] text-right text-[13px] font-semibold text-ink dark:text-ink-dark"
      numberOfLines={2}
    >
      {children}
    </Text>
  );
}

function Summary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  // Only offered when four lines would cut something off (a short description reads whole).
  const long = text.length > 240;
  return (
    <View className="mb-1">
      <Text
        className="text-[13px] leading-[20px] text-ink dark:text-ink-dark"
        numberOfLines={open || !long ? undefined : 4}
      >
        {text}
      </Text>
      {long ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          onPress={() => setOpen((value) => !value)}
          className="mt-1 self-start active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            {open ? 'Show less' : 'Read more'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AboutCard({ detail, query }: { detail: StockDetail; query: ProfileQuery }) {
  const a = query.data?.profile?.about ?? null;
  const name = detail.companyName ?? query.data?.profile?.companyName ?? detail.symbol;
  const sector =
    [detail.sector, detail.industry].filter(Boolean).join(' · ') || a?.industry || null;
  const listedOn = detail.listings?.length
    ? detail.listings.map((l) => `${l.exchange} ${l.displaySymbol}`).join(' · ')
    : `${detail.exchange} ${detail.symbol}`;
  const leader: [string, string | null][] =
    a?.managingDirector && a.ceo && a.managingDirector === a.ceo
      ? [['MD & CEO', a.ceo]]
      : [
          ['Managing director', a?.managingDirector ?? null],
          ['CEO', a?.ceo ?? null],
        ];
  const facts = (
    [
      ['Founded', a?.foundedYear ?? null],
      ...leader,
      ['Parent organisation', a?.parentCompany ?? null],
      ['Headquarters', a?.headquarters ?? null],
      ['Sector', sector],
      ['Listed on', listedOn],
      ['ISIN', detail.isin ?? query.data?.profile?.isin ?? null],
      ['Segment', detail.segment ?? null],
      ['F&O', a?.fnoEnabled == null ? null : a.fnoEnabled ? 'Available' : 'Not available'],
    ] as [string, string | null][]
  ).filter((fact): fact is [string, string] => Boolean(fact[1]));
  const memberships = detail.indices?.all ?? [];
  const website = a?.website ?? null;

  return (
    <Section title={`About ${name}`}>
      <View className="rounded-card border border-line bg-surface px-3.5 pt-3.5 dark:border-line-dark dark:bg-surface-dark">
        {a?.summary ? (
          <Summary text={a.summary} />
        ) : query.isPending ? (
          <View className="mb-2 gap-2">
            <Skeleton height={13} />
            <Skeleton height={13} width="80%" />
          </View>
        ) : null}
        {facts.map(([label, value], index) => (
          <KeyValueRow
            key={label}
            divider={index > 0 || Boolean(a?.summary)}
            label={label}
            value={<LongValue>{value}</LongValue>}
          />
        ))}
        {website ? (
          <KeyValueRow
            divider
            label="Website"
            value={
              <Pressable
                accessibilityRole="link"
                hitSlop={6}
                onPress={() => void openArticleLink(website)}
                className="max-w-[62%] active:opacity-60"
              >
                <Text
                  className="text-right text-[13px] font-semibold text-brand-text dark:text-brand-text-dark"
                  numberOfLines={1}
                >
                  {website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                </Text>
              </Pressable>
            }
          />
        ) : null}
        {memberships.length > 0 ? (
          <View className="border-t border-line py-3 dark:border-line-dark">
            <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
              Index memberships
            </Text>
            <View className="mt-2 flex-row flex-wrap gap-1.5">
              {memberships.slice(0, 12).map((tag) => (
                <Badge key={tag.key} label={tag.shortLabel} />
              ))}
            </View>
          </View>
        ) : (
          <View className="h-1" />
        )}
      </View>
    </Section>
  );
}
