import React from 'react';
import { Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { Meter } from '@/components/ui/Meter';
import { StatusPill } from '@/features/settings/components/StatusPill';

import { noDebateLine, pct, plural, signedMoney, traderCall } from '../lib/view';
import type { ArgumentView, EdgeView, RunView } from '../types';
import { NUM } from './parts';

/** A researcher's 0–100 conviction — their own score, labelled as one, never a probability. */
function Conviction({ value }: { value: number | null }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <View className="flex-1">
        <Meter
          value={value}
          tone="neutral"
          height={5}
          accessibilityLabel={`Conviction ${value ?? 'not recorded'} of 100`}
        />
      </View>
      <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={NUM}>
        {value == null ? '—' : `${value}/100`}
      </Text>
    </View>
  );
}

/** One side of the debate: conviction, the case, its evidence and the challenge it answered. */
function ArgumentPanel({ title, arg }: { title: string; arg: ArgumentView | null }) {
  if (!arg) {
    return (
      <Panel title={title}>
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Not recorded for this scan.
        </Text>
      </Panel>
    );
  }
  return (
    <Panel title={title} meta={arg.underlying ?? 'no index'}>
      <Text className="mb-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
        Conviction — the researcher’s own score
      </Text>
      <Conviction value={arg.conviction} />
      {arg.reason ? (
        <Text className="mt-3 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
          {arg.reason}
        </Text>
      ) : null}
      {arg.evidence.length > 0 ? (
        <View className="mt-2.5 gap-1">
          {arg.evidence.map((item, index) => (
            <Text
              key={index}
              className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
            >
              • {item}
            </Text>
          ))}
        </View>
      ) : null}
      {arg.challenge ? (
        <View className="mt-3 rounded-field bg-surface-sunk p-2.5 dark:bg-surface-sunk-dark">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-ink-dark-faint">
            Challenge
          </Text>
          <Text className="mt-0.5 text-xs leading-[17px] text-ink dark:text-ink-dark">
            {arg.challenge}
          </Text>
        </View>
      ) : null}
    </Panel>
  );
}

/** What the code-side risk engine measured: the only probability on the page is this one. */
export function EdgePanel({ edge }: { edge: EdgeView | null }) {
  return (
    <Panel
      title="Risk engine"
      right={
        edge && edge.allowed != null ? (
          <StatusPill
            tone={edge.allowed ? 'ok' : 'neutral'}
            label={edge.allowed ? 'Edge cleared' : 'Edge not cleared'}
          />
        ) : undefined
      }
    >
      {edge ? (
        <>
          <KeyValueRow
            label="History"
            value={`${edge.wins} of ${plural(edge.samples, 'window')}`}
            hint="One-hour windows that hit the target first"
          />
          <KeyValueRow label="Observed win rate" value={pct(edge.observedWinRate, 1)} divider />
          <KeyValueRow
            label="95% lower bound"
            value={pct(edge.wilsonLower95, 1)}
            hint="Wilson bound — the cautious estimate"
            divider
          />
          <KeyValueRow label="Break-even after costs" value={pct(edge.breakEvenRate, 1)} divider />
          {edge.expectedNetAtLowerBound != null ? (
            <KeyValueRow
              label="Expected at the bound"
              value={`${signedMoney(edge.expectedNetAtLowerBound)} per trade`}
              trend={edge.expectedNetAtLowerBound}
              divider
            />
          ) : null}
        </>
      ) : (
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Not reached — the scan stopped before the historical test.
        </Text>
      )}
    </Panel>
  );
}

/**
 * One scan, explained: what each researcher argued, what the trader proposed and what the risk
 * engine measured. The trader's confidence is a research score and is labelled as one.
 */
export function DebateView({ run }: { run: RunView }) {
  const layout = useScreenLayout();
  const d = run.debate;
  if (!d) {
    return (
      <View className="gap-3">
        <Panel title="Debate">
          <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            {noDebateLine(run.reason)}.
          </Text>
        </Panel>
      </View>
    );
  }
  const decision = d.decision;
  return (
    <View className="gap-3">
      <Grid columns={layout.columns} equalHeight={false}>
        <Panel
          title="Trader"
          meta={
            decision.confidence == null
              ? undefined
              : `confidence ${decision.confidence}/100 · a research score`
          }
        >
          <Text className="text-[17px] font-bold text-ink dark:text-ink-dark">
            {traderCall(decision.action, decision.underlying)}
          </Text>
          {decision.stopPct != null && decision.targetPct != null ? (
            <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
              Stop −{decision.stopPct}% · target +{decision.targetPct}% of premium
            </Text>
          ) : null}
          {decision.reason ? (
            <Text className="mt-2.5 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
              {decision.reason}
            </Text>
          ) : null}
        </Panel>
        <EdgePanel edge={run.edge} />
      </Grid>
      <Grid columns={layout.columns} equalHeight={false}>
        <ArgumentPanel title="Bull case" arg={d.bullish} />
        <ArgumentPanel title="Bear challenge" arg={d.bearish} />
        <ArgumentPanel title="Bull rebuttal" arg={d.rebuttal} />
      </Grid>
      {run.reason && run.reason !== decision.reason ? (
        <Panel title="Final word">
          <Text className="text-[13px] leading-[19px] text-ink dark:text-ink-dark">
            {run.reason}
          </Text>
        </Panel>
      ) : null}
    </View>
  );
}
