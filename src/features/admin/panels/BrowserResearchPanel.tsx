import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid, SplitColumns } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import {
  useBrowserResearch,
  useBrowserResearchRuns,
  useCreateBrowserPairing,
  useRevokeBrowserDevice,
  useSaveBrowserResearch,
  useTestBrowserResearch,
} from '@/features/admin/hooks';
import {
  CONNECTION_STATUS,
  draftFromConfig,
  LIMIT_KEYS,
  LIMIT_RULES,
  parseDomains,
  pairingWarning,
  researchSummary,
  RUN_OUTCOME,
  SCHEDULE_MODES,
  validateGuardrails,
  type GuardrailsDraft,
  type LimitKey,
} from '@/features/admin/lib/browserResearch';
import type {
  BrowserResearchConfig,
  BrowserResearchRun,
  BrowserResearchScheduleMode,
} from '@/features/admin/types';
import { monoFont } from '@/features/settings/components/JsonBlock';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { TextArea } from '@/features/settings/components/TextArea';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatClock, formatDateTime, relativeTime } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const FIELD = { autoCapitalize: 'none', autoCorrect: false, autoComplete: 'off' } as const;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" className="text-[13px] text-danger-600 dark:text-danger-dark">
      {message}
    </Text>
  );
}

function ConnectionCard({ config, now }: { config: BrowserResearchConfig; now: number }) {
  const pair = useCreateBrowserPairing();
  const test = useTestBrowserResearch();
  const revoke = useRevokeBrowserDevice();
  const status = CONNECTION_STATUS[config.connectionStatus] ?? CONNECTION_STATUS.disconnected;
  // A code is only useful while the server is waiting for it; once a browser pairs, hide it.
  const code = config.connectionStatus === 'pairing' ? pair.data : undefined;
  const codeExpired = code ? Date.parse(code.expiresAt) <= now : false;

  const createCode = () => {
    const run = () =>
      pair.mutate(undefined, {
        onError: (error) => toast.error('Couldn’t create a code', getErrorMessage(error)),
      });
    if (!config.tokenConfigured) return run();
    confirmAction({
      title: 'Create a new pairing code?',
      message: pairingWarning(config),
      confirmLabel: 'Create code',
      onConfirm: run,
    });
  };

  const runTest = () =>
    confirmAction({
      title: 'Test the connection?',
      message: `The paired Chrome opens ${config.allowedDomains[0] ?? 'the first allowed domain'} and reads its text. It’s logged under Activity.`,
      confirmLabel: 'Run test',
      onConfirm: () =>
        test.mutate(undefined, {
          onError: (error) => toast.error('Connection test failed', getErrorMessage(error)),
        }),
    });

  const revokeDevice = () =>
    confirmAction({
      title: 'Revoke this browser?',
      message: `${config.deviceName ?? 'The paired Chrome'} loses access at once and has to pair again with a new code.`,
      confirmLabel: 'Revoke',
      destructive: true,
      onConfirm: () =>
        revoke.mutate(undefined, {
          onSuccess: () => {
            pair.reset();
            test.reset();
            toast.success('Browser revoked');
          },
          onError: (error) => toast.error('Couldn’t revoke it', getErrorMessage(error)),
        }),
    });

  return (
    <Card className="gap-1">
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
            Chrome connection
          </Text>
          <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
            {config.lastSeenAt
              ? `Last seen ${relativeTime(config.lastSeenAt, now)}`
              : 'No browser has connected yet'}
          </Text>
        </View>
        <StatusPill tone={status.tone} label={status.label} />
      </View>

      <KeyValueRow
        label="Device"
        value={config.deviceName ?? 'Not paired'}
        divider
        className="mt-2"
      />
      <KeyValueRow label="Transport" value={`WebSocket · ${config.endpoint}`} divider />
      {config.connectionStatus === 'pairing' && config.pairingExpiresAt ? (
        <KeyValueRow
          label="Pairing open until"
          value={`${formatClock(config.pairingExpiresAt)} IST`}
          divider
        />
      ) : null}

      {config.lastError ? (
        <Text
          selectable
          className="mt-1 text-[13px] leading-[19px] text-danger-600 dark:text-danger-dark"
        >
          {config.lastError}
        </Text>
      ) : null}

      {code ? (
        <View className="mt-3 gap-1.5 rounded-field bg-surface-sunk p-3.5 dark:bg-surface-sunk-dark">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            {codeExpired
              ? 'Pairing code expired'
              : `Pairing code · expires ${formatClock(code.expiresAt)}`}
          </Text>
          <Text
            selectable
            accessibilityLabel={`Pairing code ${code.code.split('').join(' ')}`}
            className="text-[22px] font-bold text-ink dark:text-ink-dark"
            style={{ fontFamily: monoFont, letterSpacing: 3, opacity: codeExpired ? 0.4 : 1 }}
          >
            {code.code}
          </Text>
          <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
            Enter it in the Chrome extension and approve only the domains below. The extension
            receives its device token once — it is never shown here.
          </Text>
        </View>
      ) : null}

      <View className="mt-3 flex-row flex-wrap gap-2">
        <Button
          label={config.connectionStatus === 'pairing' ? 'New pairing code' : 'Connect Chrome'}
          size="sm"
          loading={pair.isPending}
          onPress={createCode}
        />
        {config.tokenConfigured ? (
          <Button
            label="Test connection"
            size="sm"
            variant="outline"
            loading={test.isPending}
            onPress={runTest}
          />
        ) : null}
        {config.tokenConfigured ? (
          <Button
            label="Revoke"
            size="sm"
            variant="ghost"
            loading={revoke.isPending}
            onPress={revokeDevice}
          />
        ) : null}
      </View>

      {test.data ? (
        <Banner
          tone={test.data.ok ? 'success' : 'warning'}
          className="mt-3"
          message={
            test.data.ok
              ? `Connected: read ${(test.data.textLength ?? 0).toLocaleString('en-IN')} characters from ${test.data.url ?? 'the page'}.`
              : (test.data.reason ?? 'The browser returned no readable text.')
          }
        />
      ) : null}
    </Card>
  );
}

function GuardrailsForm({ config }: { config: BrowserResearchConfig }) {
  const { colors } = useTheme();
  const save = useSaveBrowserResearch();
  const [draft, setDraft] = useState<GuardrailsDraft>(() => draftFromConfig(config));
  const [dirty, setDirty] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The config polls every 15s; a fresh copy reseeds only a form with no edits in progress.
  const [seededFrom, setSeededFrom] = useState(config);
  if (seededFrom !== config) {
    setSeededFrom(config);
    if (!dirty) setDraft(draftFromConfig(config));
  }

  const result = validateGuardrails(draft);
  const errors = dirty ? result.errors : {};
  const domainCount = parseDomains(draft.domains).length;

  const edit = (patch: Partial<GuardrailsDraft>) => {
    setDirty(true);
    setSaveError(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const editLimit = (key: LimitKey, value: string) =>
    edit({ limits: { ...draft.limits, [key]: value.replace(/[^\d]/g, '') } });

  const submit = () => {
    const payload = result.payload;
    if (!payload) return;
    confirmAction({
      title: 'Save guardrails?',
      message: `${payload.allowedDomains.length} allowed domain${payload.allowedDomains.length === 1 ? '' : 's'}. Connected extensions get the new policy before their next page.`,
      confirmLabel: 'Save',
      onConfirm: () =>
        save.mutate(payload, {
          onSuccess: (saved) => {
            setDirty(false);
            setDraft(draftFromConfig(saved));
            toast.success('Guardrails saved');
          },
          onError: (error) => setSaveError(getErrorMessage(error, 'Couldn’t save the guardrails.')),
        }),
    });
  };

  const modeLabel = SCHEDULE_MODES.find((mode) => mode.key === draft.mode)?.label ?? draft.mode;

  return (
    <View className="gap-4">
      <View className="gap-1.5">
        <TextArea
          label={`Allowed domains · ${domainCount}`}
          value={draft.domains}
          onChangeText={(domains) => edit({ domains })}
          placeholder={'nseindia.com\nmoneycontrol.com'}
          helperText="One per line. Everything else is blocked, including order and login pages."
          minHeight={120}
          {...FIELD}
        />
        <FieldError message={errors.domains} />
      </View>

      <View className="flex-row flex-wrap gap-3">
        {LIMIT_KEYS.map((key) => (
          <View key={key} className="min-w-[128px] flex-1 basis-[40%]">
            <Input
              label={LIMIT_RULES[key].label}
              value={draft.limits[key]}
              onChangeText={(value) => editLimit(key, value)}
              keyboardType="number-pad"
              maxLength={6}
              error={errors[key]}
            />
          </View>
        ))}
      </View>

      <View className="gap-1.5">
        <Text className="text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
          Research schedule
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Research schedule, ${modeLabel}`}
          onPress={() => setModeOpen(true)}
          className="h-12 flex-row items-center rounded-field border border-line-strong bg-canvas px-3.5 active:bg-surface-sunk dark:border-line-dark-strong dark:bg-canvas-dark dark:active:bg-surface-sunk-dark"
        >
          <Text className="flex-1 text-[15px] text-ink dark:text-ink-dark">{modeLabel}</Text>
          <ChevronRight size={18} color={colors.textFaint} />
        </Pressable>
      </View>

      {draft.mode === 'custom' ? (
        <Input
          label="Custom cron (IST)"
          value={draft.cron}
          onChangeText={(cron) => edit({ cron })}
          placeholder="0 8 * * 1-5"
          error={errors.cron}
          style={{ fontFamily: monoFont }}
          {...FIELD}
        />
      ) : null}

      {saveError ? <Banner tone="error" message={saveError} /> : null}

      <Button
        label={dirty ? 'Save guardrails' : 'No changes'}
        fullWidth
        disabled={!dirty || !result.payload}
        loading={save.isPending}
        onPress={submit}
      />

      <OptionSheet
        visible={modeOpen}
        title="Research schedule"
        options={SCHEDULE_MODES}
        value={draft.mode}
        onSelect={(mode: BrowserResearchScheduleMode) => edit({ mode })}
        onClose={() => setModeOpen(false)}
      />
    </View>
  );
}

function ActivityList({ now }: { now: number }) {
  const runs = useBrowserResearchRuns();
  if (runs.isPending) return <ListSkeleton rows={3} />;
  if (!runs.data)
    return (
      <AdminQueryError
        what="research activity"
        error={runs.error}
        onRetry={() => void runs.refetch()}
      />
    );
  if (runs.data.length === 0)
    return (
      <InlineEmpty
        title="No activity yet"
        message="Research runs and connection tests are listed here."
      />
    );
  return (
    <ListCard>
      {runs.data.map((run, index) => {
        const outcome = RUN_OUTCOME[run.outcome] ?? RUN_OUTCOME.failed;
        return (
          <View key={run.id}>
            {index > 0 ? <RowDivider /> : null}
            <View
              accessible
              accessibilityLabel={`${outcome.label}, ${relativeTime(run.createdAt, now)}. ${run.detail}`}
              className="gap-1.5 px-3.5 py-3"
            >
              <View className="flex-row items-center gap-2">
                <StatusPill tone={outcome.tone} label={outcome.label} />
                <Text
                  className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={1}
                >
                  {formatDateTime(run.createdAt)} · {relativeTime(run.createdAt, now)}
                </Text>
              </View>
              <Text
                className="text-[13px] leading-[18px] text-ink dark:text-ink-dark"
                numberOfLines={3}
              >
                {run.detail}
              </Text>
              <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                {run.pagesVisited} page{run.pagesVisited === 1 ? '' : 's'} ·{' '}
                {(run.durationMs / 1000).toFixed(1)}s
              </Text>
            </View>
          </View>
        );
      })}
    </ListCard>
  );
}

/** The page's headline numbers: the connection, the allowlist, and the recent runs. */
function ResearchTiles({
  config,
  runs,
  now,
}: {
  config: BrowserResearchConfig;
  runs: readonly BrowserResearchRun[] | undefined;
  now: number;
}) {
  const layout = useScreenLayout();
  const status = CONNECTION_STATUS[config.connectionStatus] ?? CONNECTION_STATUS.disconnected;
  const summary = runs ? researchSummary(runs) : null;
  return (
    <Grid columns={layout.compact ? 2 : 4} gap={12} className="mb-4">
      <StatTile
        label="Connection"
        value={status.label}
        status={status.tone}
        sub={config.lastSeenAt ? `Seen ${relativeTime(config.lastSeenAt, now)}` : 'No browser yet'}
      />
      <StatTile
        label="Allowed domains"
        value={String(config.allowedDomains.length)}
        sub="Everything else is blocked"
      />
      <StatTile
        label="Recent runs"
        value={summary ? String(summary.runs) : '—'}
        sub={
          summary ? (summary.runs ? `${summary.succeeded} succeeded` : 'None recorded') : undefined
        }
      />
      <StatTile
        label="Pages read"
        value={summary ? summary.pages.toLocaleString('en-IN') : '—'}
        sub="Across recent runs"
      />
    </Grid>
  );
}

/** The admin-owned Chrome research connection, its guardrails and runs (web: Browser research). */
export function BrowserResearchPanel() {
  const layout = useScreenLayout();
  const config = useBrowserResearch();
  const runs = useBrowserResearchRuns();
  const now = useNow(15_000);

  return (
    <StackScreen
      title="Browser research"
      subtitle="Paired Chrome · read-only tools"
      onRefresh={() => Promise.all([config.refetch(), runs.refetch()])}
      fill
    >
      {config.isPending ? (
        <ListSkeleton rows={3} />
      ) : !config.data ? (
        <AdminQueryError
          what="browser research"
          error={config.error}
          onRetry={() => void config.refetch()}
        />
      ) : (
        <>
          <ResearchTiles config={config.data} runs={runs.data} now={now} />
          <ConnectionCard config={config.data} now={now} />

          <SplitColumns
            split={!layout.compact}
            left={
              <Section title="Guardrails" note="Enforced by server and browser">
                <GuardrailsForm config={config.data} />
              </Section>
            }
            right={
              <Section title="Activity" note="Latest 30">
                <ActivityList now={now} />
              </Section>
            }
          />

          <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            All browser activity is read-only. Research signals are informational, not investment
            advice — the recommendation engine keeps using its server-side news pipeline until a
            browser research worker is switched on.
          </Text>
        </>
      )}
    </StackScreen>
  );
}
