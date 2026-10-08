import { useRouter } from 'expo-router';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { IconTile } from '@/components/ui/IconTile';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, Section } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import { Bullets, Disclosure, Muted, NUM, Para } from '@/features/agents/components/Parts';
import {
  DIRECTORY,
  FLOWS,
  READING_GUIDE,
  SAFETY_TEXT,
  SCHEDULES,
  TERMS,
  type FlowKey,
} from '@/features/agents/lib/docs';
import { mobileHrefFor } from '@/features/agents/lib/links';
import { useAuthStore } from '@/store/authStore';

const FLOW_TABS = FLOWS.map((flow) => ({ key: flow.key, label: flow.label }));

/**
 * Agents › Docs (web: /agents/docs) — the handbook: the three workflows step by step, who does
 * what, when each agent runs and within which limits, how to read its screens, and where plain
 * code takes over from the model. Sectioned, with the detail behind expandable rows.
 */
export default function AgentsDocsScreen() {
  const router = useRouter();
  const layout = useScreenLayout();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const [flowKey, setFlowKey] = useState<FlowKey>('holdings');
  const flow = FLOWS.find((candidate) => candidate.key === flowKey) ?? FLOWS[0];
  const controls = mobileHrefFor('/agents/index-trading?tab=controls');
  const wide = layout.columns >= 2;

  return (
    <GroupScreen
      fill
      intro="Five AI agents, three workflows — what each one reads, what it returns, and where ordinary code takes over."
    >
      <Grid columns={3}>
        <StatTile label="AI agents" value="5" sub="registered in the AI service" />
        <StatTile label="Workflows" value="3" sub="documented below" />
        <StatTile label="Order tools" value="0" sub="no agent can place an order" />
      </Grid>

      <Section title="How it works">
        <SegmentedControl items={FLOW_TABS} value={flowKey} onChange={setFlowKey} />
        {flow ? (
          <>
            <Text className="mb-3 mt-3 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              {flow.summary}
            </Text>
            <ListCard>
              {flow.steps.map((step, index) => (
                <Disclosure
                  key={`${flow.key}-${step.title}`}
                  title={`${index + 1}. ${step.title}`}
                  meta={step.owner}
                  divider={index > 0}
                >
                  <Para>{step.explanation}</Para>
                  <KeyValueRow divider label="Receives" value={<StepText text={step.receives} />} />
                  <KeyValueRow
                    divider
                    label="Hands off"
                    value={<StepText text={step.handsOff} />}
                  />
                </Disclosure>
              ))}
            </ListCard>
            <Muted className="mt-2">The steps describe the current code, not a live job.</Muted>
          </>
        ) : null}
      </Section>

      <Section title="Who does what">
        <Grid columns={wide ? 2 : 1} equalHeight={false}>
          {DIRECTORY.map((agent) => (
            <ListCard key={agent.id}>
              <Disclosure title={agent.name} meta={agent.category}>
                <Para>{agent.plain}</Para>
                <View className="mt-3 gap-3">
                  <Fact label="What it reads" text={agent.receives} />
                  <Fact label="What it returns" text={agent.produces} />
                  <Fact label="Where it stops" text={agent.boundary} />
                </View>
                <Text
                  className="mt-3 self-start rounded-md bg-surface-sunk px-2 py-1 text-[11px] text-ink-faint dark:bg-surface-sunk-dark dark:text-ink-dark-faint"
                  style={NUM}
                >
                  {agent.id}
                </Text>
              </Disclosure>
            </ListCard>
          ))}
        </Grid>
        <Muted className="mt-2">
          Scheduled sync jobs and the risk guards are separate code, not extra agents.
        </Muted>
      </Section>

      <Section title="When they run">
        <Grid columns={layout.columns} equalHeight={false}>
          {SCHEDULES.map((schedule) => (
            <Panel key={schedule.agent} title={schedule.agent} meta={schedule.access}>
              {schedule.facts.map((fact, index) => (
                <KeyValueRow
                  key={fact.label}
                  divider={index > 0}
                  label={fact.label}
                  value={<StepText text={fact.value} />}
                />
              ))}
            </Panel>
          ))}
        </Grid>
      </Section>

      <Section title="Reading the screens">
        <Grid columns={wide ? 2 : 1} equalHeight={false}>
          {READING_GUIDE.map((guide) => (
            <Panel key={guide.screen} title={guide.screen}>
              <Bullets items={guide.points} />
            </Panel>
          ))}
        </Grid>
      </Section>

      <Section title="A suggestion is never an order">
        <View className="flex-row gap-3 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          <IconTile Icon={ShieldCheck} tone="green" size="md" />
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">
              The server has the final say
            </Text>
            <Para className="mt-1.5">{SAFETY_TEXT}</Para>
            {isAdmin && controls ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Review the index bot's settings"
                hitSlop={6}
                onPress={() => router.push(controls)}
                className="mt-3 self-start active:opacity-60"
              >
                <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                  Review index-bot settings
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Section>

      <Section title="Good to know">
        <ListCard>
          {TERMS.map((term, index) => (
            <Disclosure key={term.term} title={term.term} divider={index > 0}>
              <Para>{term.meaning}</Para>
            </Disclosure>
          ))}
        </ListCard>
      </Section>
    </GroupScreen>
  );
}

/** A right-hand value that wraps, for the longer step and schedule facts. */
function StepText({ text }: { text: string }) {
  return (
    <Text className="max-w-[62%] text-right text-[13px] leading-[18px] text-ink dark:text-ink-dark">
      {text}
    </Text>
  );
}

function Fact({ label, text }: { label: string; text: string }) {
  return (
    <View>
      <Text className="text-[11px] font-semibold text-ink-faint dark:text-ink-dark-faint">
        {label}
      </Text>
      <Text className="mt-0.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {text}
      </Text>
    </View>
  );
}
