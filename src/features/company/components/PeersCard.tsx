import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Section } from '@/components/ui/Section';
import { stockHref } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/formatters';

import { median, sourceCaption } from '../lib/insights';
import type { ProfilePeer } from '../types';

import {
  CardFrame,
  CardNote,
  NUM,
  ProfileGate,
  profileMissingOnServer,
  type ProfileQuery,
} from './CompanyParts';

/**
 * Peers: Groww's peer group with this stock placed among it, ranked by market cap — how big, how
 * expensive, next to whom, in one glance. The peer medians under it are the comparison a reader
 * would otherwise do in their head (a median, so one loss-year P/E of 300 doesn't drag it). A peer
 * opens its own stock page when Groww says where it trades.
 */

type Row = ProfilePeer & { self: boolean };

const cap = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: n >= 100 ? 0 : 2 });

export function PeersCard({
  query,
  symbol,
  exchange,
  companyName,
}: {
  query: ProfileQuery;
  symbol: string;
  exchange: 'NSE' | 'BSE';
  companyName: string | null;
}) {
  const router = useRouter();
  const p = query.data?.profile ?? null;
  const rows = useMemo<Row[]>(() => {
    if (!p || p.peers.length === 0) return [];
    const self: Row = {
      self: true,
      name: companyName ?? p.companyName ?? symbol,
      isin: p.isin,
      exchange,
      symbol,
      marketCapCr: p.ratios.marketCapCr,
      pe: p.ratios.peTtm,
      pb: p.ratios.pb,
      yearHigh: null,
      yearLow: null,
    };
    return [
      self,
      ...p.peers.filter((x) => x.isin !== p.isin).map((x) => ({ ...x, self: false })),
    ].sort((a, b) => (b.marketCapCr ?? -1) - (a.marketCapCr ?? -1));
  }, [p, companyName, symbol, exchange]);
  if (profileMissingOnServer(query)) return null;

  const peers = rows.filter((r) => !r.self);
  const medPe = median(peers.map((r) => r.pe));
  const medPb = median(peers.map((r) => r.pb));

  return (
    <Section title="Peers" note={sourceCaption(query.data)}>
      <ProfileGate query={query} rows={5}>
        {() =>
          rows.length === 0 ? (
            <CardFrame>
              <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
                Groww lists no peers for this company.
              </Text>
            </CardFrame>
          ) : (
            <>
              <View className="overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
                <View className="flex-row border-b border-line px-3.5 py-2 dark:border-line-dark">
                  <Text className="flex-1 text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted">
                    Company
                  </Text>
                  <Text className="w-[84px] text-right text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted">
                    Mkt cap (₹Cr)
                  </Text>
                  <Text className="w-12 text-right text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted">
                    P/E
                  </Text>
                  <Text className="w-12 text-right text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted">
                    P/B
                  </Text>
                </View>
                {rows.map((row, index) => {
                  const linkable = !row.self && row.symbol && row.exchange;
                  const content = (
                    <>
                      <Text
                        className={cn(
                          'flex-1 pr-2 text-[13px]',
                          row.self
                            ? 'font-bold text-ink dark:text-ink-dark'
                            : linkable
                              ? 'font-semibold text-brand-text dark:text-brand-text-dark'
                              : 'text-ink dark:text-ink-dark',
                        )}
                        numberOfLines={1}
                      >
                        {row.name}
                      </Text>
                      <Text
                        className="w-[84px] text-right text-xs text-ink dark:text-ink-dark"
                        style={NUM}
                      >
                        {cap(row.marketCapCr)}
                      </Text>
                      <Text
                        className="w-12 text-right text-xs text-ink dark:text-ink-dark"
                        style={NUM}
                      >
                        {row.pe != null && row.pe <= 0 ? '—' : formatNumber(row.pe, 1)}
                      </Text>
                      <Text
                        className="w-12 text-right text-xs text-ink dark:text-ink-dark"
                        style={NUM}
                      >
                        {formatNumber(row.pb, 1)}
                      </Text>
                    </>
                  );
                  const className = cn(
                    'min-h-[44px] flex-row items-center px-3.5 py-2.5',
                    index > 0 && 'border-t border-line dark:border-line-dark',
                    row.self && 'bg-surface-sunk dark:bg-surface-sunk-dark',
                  );
                  return linkable ? (
                    <Pressable
                      key={row.isin ?? `${row.name}-${index}`}
                      accessibilityRole="link"
                      accessibilityLabel={`${row.name}: market cap ${cap(row.marketCapCr)} crore, P/E ${formatNumber(row.pe, 1)}`}
                      onPress={() => router.push(stockHref(row.symbol!, row.exchange))}
                      className={cn(
                        className,
                        'active:bg-surface-sunk dark:active:bg-surface-sunk-dark',
                      )}
                    >
                      {content}
                    </Pressable>
                  ) : (
                    <View
                      key={row.isin ?? `${row.name}-${index}`}
                      accessible
                      accessibilityLabel={`${row.self ? 'This stock, ' : ''}${row.name}: market cap ${cap(row.marketCapCr)} crore`}
                      className={className}
                    >
                      {content}
                    </View>
                  );
                })}
              </View>
              <CardNote>
                Ranked by market cap; the shaded row is this stock.
                {medPe != null ? ` Peer median P/E ${medPe.toFixed(1)}` : ''}
                {medPb != null
                  ? `${medPe != null ? ',' : ' Peer median'} P/B ${medPb.toFixed(2)}`
                  : ''}
                {medPe != null || medPb != null ? '.' : ''}
              </CardNote>
            </>
          )
        }
      </ProfileGate>
    </Section>
  );
}
