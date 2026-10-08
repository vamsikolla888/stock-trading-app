import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { ShareBar } from '@/components/dashboard/ShareBar';
import { SplitColumns } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { SwitchRow } from '@/features/settings/components/SwitchRow';
import { useTheme } from '@/theme/ThemeProvider';

import { useIndexDecisions } from '../hooks';
import { outcomeShare, pct, plural, RANGES, whole } from '../lib/view';
import type { DecisionOutcome, IndexDecisions, RangeKey } from '../types';
import { BarRow, BotQueryError, ChipRow } from './parts';
import { RunItem } from './rows';

const OUTCOMES: readonly { key: DecisionOutcome; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'hold', label: 'Held' },
  { key: 'error', label: 'Errors' },
];

/**
 * Index trading › Decisions — every scan, HOLDs included, newest first; a row opens the whole
 * debate. The outcome split and the hold reasons answer "why does it hold so often?" for the
 * window; on a wide screen they sit beside the log instead of above it.
 */
export function DecisionsTab({
  range,
  onRange,
}: {
  range: RangeKey;
  onRange: (range: RangeKey) => void;
}) {
  const router = useRouter();
  const layout = useScreenLayout();
  const [outcome, setOutcome] = useState<DecisionOutcome>('all');
  // On by default: about two in five scans are the routine "outside the entry window" HOLD.
  const [hideClosed, setHideClosed] = useState(true);
  const query = useIndexDecisions(range, outcome, hideClosed);

  const filters = (
    <View className="gap-3">
      <ChipRow items={RANGES} value={range} onChange={onRange} label="Range" />
      <ListCard>
        <SwitchRow
          title="Hide out-of-window scans"
          subtitle="Scans outside market hours or the 09:30–14:15 entry window"
          value={hideClosed}
          onValueChange={setHideClosed}
        />
      </ListCard>
    </View>
  );

  if (query.isPending) {
    return (
      <View className="gap-3">
        {filters}
        <ListSkeleton rows={6} />
      </View>
    );
  }
  if (!query.data) {
    return (
      <View className="gap-3">
        {filters}
        <BotQueryError
          what="the decision log"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </View>
    );
  }

  const first = query.data.pages[0];
  const runs = query.data.pages.flatMap((page) => page.runs);
  const c = first?.counts ?? { all: 0, ordered: 0, hold: 0, error: 0, running: 0 };

  const log = (
    <View className="gap-3">
      <ChipRow
        items={OUTCOMES}
        value={outcome}
        onChange={setOutcome}
        label="Outcome"
        counts={{ all: c.all, ordered: c.ordered, hold: c.hold, error: c.error }}
      />
      {c.running > 0 ? (
        <Text className="text-xs text-info dark:text-info-dark">
          {plural(c.running, 'scan')} running now
        </Text>
      ) : null}
      {runs.length === 0 ? (
        <InlineEmpty title="No scan matches this filter in this window" />
      ) : (
        <Panel title="Decision log" meta="every scan, HOLD included" flush>
          {runs.map((run, index) => (
            <View key={run.id}>
              {index > 0 ? <RowDivider /> : null}
              <RunItem
                run={run}
                onPress={() =>
                  router.push({ pathname: '/index-bot/run/[id]', params: { id: run.id } })
                }
              />
            </View>
          ))}
          {query.hasNextPage ? (
            <View className="border-t border-line p-3 dark:border-line-dark">
              <Button
                label="Load older scans"
                variant="ghost"
                size="sm"
                loading={query.isFetchingNextPage}
                onPress={() => void query.fetchNextPage()}
              />
            </View>
          ) : null}
        </Panel>
      )}
      {query.isFetchNextPageError ? (
        <Text className="text-xs text-danger-600 dark:text-danger-dark">
          Couldn’t load older scans. Try again.
        </Text>
      ) : null}
    </View>
  );

  return (
    <View className="gap-3" style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
      {filters}
      <SplitColumns
        split={!layout.compact}
        gap={12}
        left={log}
        right={<DecisionSummary data={first} />}
      />
    </View>
  );
}

/** The window's outcome split and why scans held — counted over every scan, not one page. */
function DecisionSummary({ data }: { data: IndexDecisions | undefined }) {
  const { colors } = useTheme();
  const layout = useScreenLayout();
  if (!data) return null;
  const c = data.counts;
  const finished = c.ordered + c.hold + c.error;
  return (
    <View className={layout.compact ? 'mt-3 gap-3' : 'gap-3'}>
      <Panel title="Outcomes" meta={`${whole(c.all)} scans in this window`}>
        {finished === 0 ? (
          <Text className="py-2 text-[13px] text-ink-muted dark:text-ink-dark-muted">
            No finished scan in this window.
          </Text>
        ) : (
          <>
            <ShareBar
              segments={[
                { label: 'Order placed', value: c.ordered, color: colors.info },
                { label: 'Held', value: c.hold, color: colors.textFaint },
                { label: 'Error', value: c.error, color: colors.warning },
              ]}
            />
            <Text className="mt-2.5 text-xs text-ink-muted dark:text-ink-dark-muted">
              {outcomeShare(c.hold, finished)} held — the safe default ·{' '}
              {outcomeShare(c.ordered, finished)} placed an order
            </Text>
          </>
        )}
      </Panel>
      <Panel title="Why scans held" meta="the whole window">
        {data.reasons.length === 0 ? (
          <Text className="py-2 text-[13px] text-ink-muted dark:text-ink-dark-muted">
            Nothing held in this window.
          </Text>
        ) : (
          <View className="gap-3">
            {data.reasons.map((reason) => (
              <BarRow
                key={reason.key}
                label={reason.label}
                value={`${whole(reason.count)} · ${pct(reason.share)}`}
                share={reason.share}
                tone="neutral"
                note={reason.latest.reason ? `Latest: ${reason.latest.reason}` : undefined}
              />
            ))}
          </View>
        )}
      </Panel>
    </View>
  );
}
