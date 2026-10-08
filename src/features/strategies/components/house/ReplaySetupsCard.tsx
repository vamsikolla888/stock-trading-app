import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { ChangeText } from '@/components/market/ChangeText';
import { Button } from '@/components/ui/Button';
import { RowDivider } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { stockHref } from '@/lib/navigation';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';

import {
  dayLabel,
  filterReplaySetups,
  SETUP_STATUS_VIEW,
  type ReplayFilter,
} from '../../lib/houseView';
import type { ReplaySetup } from '../../types';

const NUM = { fontVariant: ['tabular-nums' as const] };
const PAGE = 30;

const FILTERS: readonly { key: ReplayFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trades', label: 'Trades' },
  { key: 'none', label: 'No trade' },
];

/**
 * Every setup the replay found (the newest 200), with how each one ended — including the ones
 * that were never a trade, so the trade count can be checked against the setups behind it.
 */
export function ReplaySetupsCard({ setups }: { setups: readonly ReplaySetup[] }) {
  const router = useRouter();
  const [show, setShow] = useState<ReplayFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const rows = useMemo(() => filterReplaySetups(setups, show), [setups, show]);
  const visible = rows.slice(0, limit);

  return (
    <Panel title="Every setup the replay found" meta={`newest ${setups.length}`} flush>
      <View className="px-4 pb-2">
        <Chips
          items={FILTERS}
          value={show}
          onChange={(key) => {
            setShow(key);
            setLimit(PAGE);
          }}
        />
      </View>
      {visible.length === 0 ? (
        <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          None in this view.
        </Text>
      ) : (
        visible.map((s, index) => {
          const view = SETUP_STATUS_VIEW[s.status];
          return (
            <View key={`${s.symbol}-${s.date}`}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${s.symbol}, setup on ${dayLabel(s.date)}, grade ${s.grade}, ${view.label}${s.returnPct != null ? `, ${formatSignedPercent(s.returnPct, 2)}` : ''}. Open stock`}
                onPress={() => router.push(stockHref(s.symbol, 'NSE'))}
                className="flex-row items-center gap-3 px-4 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                    {s.symbol}
                  </Text>
                  <Text
                    className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={1}
                    style={NUM}
                  >
                    {dayLabel(s.date, false)} · {s.grade} · above {formatINR(s.entry)}
                    {s.exitDate ? ` · out ${dayLabel(s.exitDate, false)}` : ''}
                  </Text>
                </View>
                <View className="items-end gap-1">
                  <StatusPill tone={view.tone} label={view.label} />
                  {s.returnPct != null ? (
                    <ChangeText value={s.returnPct} className="text-xs" style={NUM}>
                      {formatSignedPercent(s.returnPct, 2)}
                    </ChangeText>
                  ) : null}
                </View>
              </Pressable>
            </View>
          );
        })
      )}
      {rows.length > visible.length ? (
        <View className="px-4 pb-3 pt-1">
          <Button
            label={`Show ${Math.min(PAGE, rows.length - visible.length)} more`}
            variant="link"
            onPress={() => setLimit((n) => n + PAGE)}
          />
        </View>
      ) : null}
    </Panel>
  );
}
