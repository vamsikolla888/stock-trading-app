import ExternalLink from 'lucide-react-native/icons/external-link';
import Gauge from 'lucide-react-native/icons/gauge';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useScreenLayout } from '@/components/layout/responsive';
import { ListCard, Section } from '@/components/ui/Section';
import { formatIstDate } from '@/features/home/lib/istTime';
import { openArticleLink } from '@/features/news/lib/openLink';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import type { Tone } from '../lib/format';
import { CONFIDENCE, ZONE, fairSubline, inr, isValued, peerLine, signed } from '../lib/valuation';
import type { IpoValuation } from '../types';

import { Bullets, Collapsible, Muted, NUM, TONE_DOT } from './IpoParts';

interface Level {
  label: string;
  value: string;
  sub: string;
  /** A tone dot before the sub line — the word beside it carries the meaning. */
  tone?: Tone;
}

/** Two levels per row on a phone, four across a wide window; hairlines between cells. */
function Levels({ levels }: { levels: Level[] }) {
  const { compact } = useScreenLayout();
  const cols = compact ? 2 : 4;
  const rows: Level[][] = [];
  for (let i = 0; i < levels.length; i += cols) rows.push(levels.slice(i, i + cols));
  return (
    <View className="overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
      {rows.map((row, r) => (
        <View
          key={row[0]?.label ?? r}
          className={cn('flex-row', r > 0 && 'border-t border-line dark:border-line-dark')}
        >
          {row.map((level, c) => (
            <View
              key={level.label}
              accessible
              accessibilityLabel={`${level.label}: ${level.value}. ${level.sub}`}
              className={cn(
                'flex-1 px-3.5 py-3',
                c > 0 && 'border-l border-line dark:border-line-dark',
              )}
            >
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{level.label}</Text>
              <Text
                className="mt-1 text-[20px] font-bold text-ink dark:text-ink-dark"
                style={[NUM, { letterSpacing: -0.4 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {level.value}
              </Text>
              <View className="mt-0.5 flex-row items-start gap-1.5">
                {level.tone ? (
                  <View className={cn('mt-[5px] h-1.5 w-1.5 rounded-full', TONE_DOT[level.tone])} />
                ) : null}
                <Text
                  className="flex-1 text-[11px] leading-[15px] text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={3}
                >
                  {level.sub}
                </Text>
              </View>
            </View>
          ))}
          {row.length < cols ? (
            <View className="flex-1 border-l border-line dark:border-line-dark" />
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** "● Medium confidence" — outlined, the tone on the dot and the word always there. */
function ConfidenceTag({ tone, word }: { tone: Tone; word: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-0.5 dark:border-line-dark-strong">
      <View className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} />
      <Text className="text-[11px] font-medium text-ink dark:text-ink-dark">{word}</Text>
    </View>
  );
}

/**
 * An IPO's fair value (web: IpoValuationPanel) — the two levels, where the listing price (or the
 * grey-market estimate) stands against them, and every step of the arithmetic. A model estimate
 * from the offer document, and it says so. Hidden on a server that predates it.
 */
export function IpoValuationPanel({ valuation }: { valuation: IpoValuation | null | undefined }) {
  const { colors } = useTheme();
  if (!valuation) return null;
  const v = valuation;
  const valued = isValued(v);
  const vs = v.versusListing;
  const zone = vs ? ZONE[vs.zone] : null;
  const confidence = valued && v.confidence ? CONFIDENCE[v.confidence] : null;
  const read = formatIstDate(v.source?.fetchedAt);

  const levels: Level[] = valued
    ? [
        { label: 'Fair value', value: inr(v.fairValue), sub: fairSubline(v) },
        {
          label: 'Good up to',
          value: inr(v.goodUpTo),
          sub: `Fair value less a ${v.marginOfSafetyPct}% margin of safety`,
        },
        {
          label: vs?.kind === 'listing' ? 'Listing price' : 'Est. listing',
          value: vs ? inr(vs.price) : '—',
          sub:
            vs && zone
              ? `${zone.word} · ${signed(vs.upsidePct)} to fair`
              : 'No grey-market estimate yet',
          tone: zone?.tone,
        },
        {
          label: 'Issue priced at',
          value: v.issuePe == null ? '—' : `${v.issuePe}×`,
          sub: peerLine(v) ?? '—',
        },
      ]
    : [];

  return (
    <Section
      title="Fair value"
      right={
        confidence ? <ConfidenceTag tone={confidence.tone} word={confidence.word} /> : undefined
      }
    >
      {valued ? (
        <>
          <Levels levels={levels} />
          {v.method.length > 0 ? (
            <ListCard className="mt-3">
              <Collapsible title="How this was valued">
                <Bullets items={v.method.map((text) => ({ text }))} empty="" ordered />
              </Collapsible>
            </ListCard>
          ) : null}
        </>
      ) : (
        <View className="flex-row gap-2.5 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          <Gauge size={16} color={colors.textMuted} style={{ marginTop: 1 }} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-ink dark:text-ink-dark">Not valued</Text>
            <Text className="mt-0.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              {v.reason ?? v.error ?? 'The offer document’s figures are not available yet.'}
            </Text>
          </View>
        </View>
      )}

      {v.caveats.length > 0 ? (
        <View
          accessibilityLabel="Figures checked"
          className="mt-3 gap-1.5 rounded-field bg-surface-sunk p-3 dark:bg-surface-sunk-dark"
        >
          {v.caveats.map((caveat) => (
            <View key={caveat} className="flex-row gap-2">
              <View className="mt-[6px] h-1 w-1 rounded-full bg-ink-faint dark:bg-ink-dark-faint" />
              <Text className="flex-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                {caveat}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Muted className="mt-3 text-[11px] leading-4">
        Against the listed peers the offer document names: post-issue EPS × their median P/E, and
        book × their median P/BV plus the fresh issue at face value. A model estimate, not
        investment advice.
      </Muted>
      {v.source ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open the offer-document figures"
          onPress={() => void openArticleLink(v.source?.url)}
          hitSlop={8}
          className="mt-1.5 flex-row items-center gap-1 self-start active:opacity-60"
        >
          <Text className="text-xs font-semibold text-brand-text dark:text-brand-text-dark">
            Offer-document figures{read ? ` · read ${read}` : ''}
          </Text>
          <ExternalLink size={12} color={colors.link} />
        </Pressable>
      ) : null}
    </Section>
  );
}
