import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid, SplitColumns } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { SwitchRow } from '@/features/settings/components/SwitchRow';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatDateTime } from '@/features/settings/lib/time';
import { cn } from '@/lib/utils/cn';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import {
  useBackToTestMode,
  useBotRun,
  useDeployLive,
  useKillBot,
  useRunBotNow,
  useTestScan,
} from '../hooks';
import {
  canStartDeploy,
  deployCheck,
  rangeText,
  RISK_FIELDS,
  sampleNote,
  SIGNAL_FIELDS,
  type SettingField,
} from '../lib/settings';
import {
  money,
  pct,
  plural,
  pnlTone,
  premium,
  signedMoney,
  statusTone,
  testScanView,
  type BotTab,
} from '../lib/view';
import type { BotIntent, BotStatus, RunView } from '../types';
import { BotQueryError, Caveat, NUM, pnlClass, TextLink } from './parts';
import { TraceList } from './TraceList';
import { useResolveFlow } from './useResolve';
import type { SettingsDraftController } from './useSettingsDraft';

/**
 * Index trading › Controls — the bot's switch, mode and hard caps (the web's AutoTradeSettings).
 *
 * PAPER IS THE DEFAULT: entries go to the paper F&O book until a person reviews the paper results
 * here and deploys to live by typing the server's phrase; going back to paper is always one
 * confirmation. A TEST SCAN runs the whole pipeline on demand — any time, never an order — and shows
 * every step. The AI cannot change any limit here; these are server-side caps, and every action
 * waits for the server's answer.
 */
export function ControlsTab({
  query,
  controller,
  onTab,
}: {
  query: {
    data: BotStatus | undefined;
    isPending: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  controller: SettingsDraftController;
  onTab: (tab: BotTab) => void;
}) {
  const layout = useScreenLayout();
  const status = query.data;

  if (query.isPending) return <ListSkeleton rows={6} />;
  if (!status || !controller.draft) {
    return (
      <BotQueryError
        what="the bot’s controls"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const live = status.mode === 'live';
  const active = status.recent.find((row) =>
    ['SUBMITTING', 'OPEN', 'EXITING', 'UNKNOWN'].includes(row.status),
  );
  const last = status.runs[0];

  return (
    <View className="gap-3">
      {!status.readiness.aiConfigured ? (
        <Banner
          tone="warning"
          title="The server is not connected to the AI service."
          message="Configure the service connection before arming scans."
        />
      ) : null}
      {status.readiness.aiConfigured && status.readiness.aiReady === false ? (
        <Banner
          tone="warning"
          title="The AI service is not answering — scans cannot reach the debate."
          message={`${status.readiness.aiReason ? `${status.readiness.aiReason} ` : ''}Scans keep retrying.`}
        />
      ) : null}
      {status.storedLiveUnapproved ? (
        <Banner
          tone="warning"
          title="The bot is in PAPER mode."
          message="An older setting asked for live without a deployment, so every new entry stays in the paper F&O book."
        />
      ) : null}
      {live ? (
        <Banner
          tone="warning"
          title="Live mode is selected."
          message="The AI may place real Groww orders without per-trade approval while the bot and the platform master switch are on. Stop entries here any time; open positions stay monitored and protected."
        />
      ) : null}
      {active?.status === 'UNKNOWN' ? (
        <Banner
          tone="error"
          title="An order outcome is uncertain — new entries are blocked."
          message={`Check the ${active.mode === 'live' ? 'Groww position and smart orders' : 'paper F&O book'}, and resolve the entry only once the position is confirmed closed.`}
          action={{ label: 'Open in Trades', onPress: () => onTab('trades') }}
        />
      ) : null}

      <Grid columns={Math.min(layout.kpiColumns, 4)} gap={12}>
        <StatTile
          label="Mode"
          value={live ? 'LIVE' : 'PAPER'}
          sub={live ? 'real Groww orders' : 'simulated orders'}
          status={live ? 'warn' : undefined}
        />
        <StatTile
          label={live ? 'Live automation' : 'Paper automation'}
          value={status.settings.enabled ? 'Armed' : 'Off'}
          sub={`every ${status.settings.cadenceMinutes} min in market hours`}
          status={status.settings.enabled ? (live ? 'warn' : 'ok') : undefined}
        />
        <StatTile
          label="Latest check"
          value={last?.status || 'Not run'}
          sub={last ? formatDateTime(last.at) : 'no decision yet'}
        />
        <StatTile
          label="Month estimate"
          value={signedMoney(status.monthEstimatedNet)}
          sub={
            status.afterAssumedApiFee != null
              ? `${signedMoney(status.afterAssumedApiFee)} after the ${money(status.assumedMonthlyGrowwApiFee)} API fee`
              : 'closed bot trades this month'
          }
          status={pnlTone(status.monthEstimatedNet)}
        />
      </Grid>

      <Grid columns={layout.columns} gap={12} equalHeight={false}>
        <ModePanel status={status} />
        <TestScanPanel status={status} />
        <SwitchPanel status={status} controller={controller} />
      </Grid>

      <SplitColumns
        split={!layout.compact}
        gap={12}
        left={
          <FieldsPanel
            title="Risk caps"
            meta="hard caps the AI cannot change"
            fields={RISK_FIELDS}
            controller={controller}
          />
        }
        right={
          <View className={layout.compact ? 'mt-3' : undefined}>
            <FieldsPanel
              title="Signal thresholds"
              meta="missing or weak evidence means HOLD"
              fields={SIGNAL_FIELDS}
              controller={controller}
            />
          </View>
        }
      />

      <SplitColumns
        split={!layout.compact}
        gap={12}
        left={<RecentOrders status={status} onTab={onTab} />}
        right={
          <View className={layout.compact ? 'mt-3' : undefined}>
            <RecentScans runs={status.runs} onTab={onTab} />
          </View>
        }
      />

      <Caveat>
        {status.pnlCaveat
          ? `${status.pnlCaveat} Historical outcomes look backward; a high model confidence is not a measured win probability.`
          : null}
      </Caveat>
    </View>
  );
}

/** One of the two trading modes, as a radio choice. */
function ModeChoice({
  title,
  detail,
  selected,
  disabled,
  live,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  disabled: boolean;
  live: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const ring = selected ? (live ? colors.warning : colors.accent) : colors.borderStrong;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${title}. ${detail}`}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'flex-row items-start gap-3 rounded-field border px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark',
        selected
          ? live
            ? 'border-warning-600 dark:border-warning-dark'
            : 'border-brand'
          : 'border-line dark:border-line-dark',
        disabled && 'opacity-50',
      )}
    >
      <View
        className="mt-0.5 h-[18px] w-[18px] items-center justify-center rounded-full"
        style={{ borderWidth: 1.5, borderColor: ring }}
      >
        {selected ? (
          <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ring }} />
        ) : null}
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">{title}</Text>
        <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Paper or live. PAPER IS THE DEFAULT: choosing Live opens the typed deployment (the server's own
 * phrase, then a confirmation); choosing Paper while live goes back after a confirmation — it can
 * only reduce risk. The paper results stay in view either way.
 */
function ModePanel({ status }: { status: BotStatus }) {
  const router = useRouter();
  const deploy = useDeployLive();
  const backToPaper = useBackToTestMode();
  const [deploying, setDeploying] = useState(false);
  const [typed, setTyped] = useState('');
  const live = status.mode === 'live';
  const busy = deploy.isPending || backToPaper.isPending;
  const readiness = {
    mode: status.mode,
    liveAvailable: status.readiness.liveAvailable,
    aiConfigured: status.readiness.aiConfigured,
    paperOnly: status.readiness.paperOnly,
    phrase: status.deployPhrase,
  };
  const canStart = canStartDeploy(readiness);
  const check = deployCheck({ ...readiness, typed });
  const t = status.testResults.stats;
  const note = sampleNote(t.closed);

  const cancelDeploy = () => {
    setDeploying(false);
    setTyped('');
  };

  const onPaper = () => {
    if (!live) {
      cancelDeploy();
      return;
    }
    confirmAction({
      title: 'Back to paper trading?',
      message:
        'New entries go to the paper F&O book. Any open live position stays protected by its Groww OCO and monitored until it closes.',
      confirmLabel: 'Back to paper',
      onConfirm: () =>
        backToPaper.mutate(undefined, {
          onSuccess: () => {
            cancelDeploy();
            toast.success('Paper mode selected', 'Future entries are simulated.');
          },
          onError: (error) => toast.error('Couldn’t switch to paper', getErrorMessage(error)),
        }),
    });
  };

  const onDeploy = () => {
    if (!check.ok) return;
    confirmAction({
      title: 'Deploy to live?',
      message:
        'Future qualified entries will place REAL Groww index-option orders with broker-side OCO protection. Safe Mode, the kill switch and the caps on this page still apply.',
      confirmLabel: 'Deploy live',
      destructive: true,
      onConfirm: () =>
        deploy.mutate(typed.trim(), {
          onSuccess: () => {
            cancelDeploy();
            toast.success(
              'Live mode selected',
              'Future qualified entries place real Groww orders.',
            );
          },
          onError: (error) => toast.error('Couldn’t deploy', getErrorMessage(error)),
        }),
    });
  };

  return (
    <Panel
      title="Trading mode"
      right={
        <StatusPill
          tone={live ? 'warn' : 'neutral'}
          label={live ? 'LIVE · real orders' : 'PAPER · simulated'}
        />
      }
    >
      <View accessibilityRole="radiogroup" accessibilityLabel="Trading mode" className="gap-2">
        <ModeChoice
          title="Paper trading"
          detail="Uses the paper F&O book. Start here for backtesting and forward testing."
          selected={!live}
          disabled={busy}
          live={false}
          onPress={onPaper}
        />
        <ModeChoice
          title="Live trading"
          detail="Places real Groww option orders only after every server-side risk gate passes."
          selected={live}
          disabled={busy || (!live && !canStart.ok)}
          live
          onPress={() => {
            if (!live) setDeploying(true);
          }}
        />
      </View>
      {!live && !canStart.ok ? (
        <Text className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {canStart.reason}
        </Text>
      ) : null}

      {deploying && !live ? (
        <View className="mt-3 gap-3">
          <Banner
            tone="warning"
            title="This changes future entries to real money."
            message="Paper results do not guarantee live results. The master switch, fresh Groww data, the stop cap (10% at most), the rupee risk caps, the daily loss limit and the broker-side OCO stay mandatory."
          />
          <Input
            label={`Type ${status.deployPhrase ?? ''} to continue`}
            value={typed}
            onChangeText={setTyped}
            placeholder={status.deployPhrase ?? ''}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            accessibilityLabel="Type the confirmation phrase"
            helperText={check.ok ? undefined : check.reason}
          />
          <View className="flex-row gap-2">
            <Button
              label="Deploy live"
              variant="danger"
              size="sm"
              disabled={!check.ok}
              loading={deploy.isPending}
              onPress={onDeploy}
            />
            <Button
              label="Cancel"
              variant="ghost"
              size="sm"
              disabled={deploy.isPending}
              onPress={cancelDeploy}
            />
          </View>
        </View>
      ) : null}

      <Text className="mt-4 text-xs font-semibold text-ink dark:text-ink-dark">Paper results</Text>
      <View className="mt-1">
        <KeyValueRow label="Closed trades" value={String(t.closed)} />
        <KeyValueRow label="Win rate" value={pct(t.winRate)} divider />
        <KeyValueRow label="Net (estimated)" value={signedMoney(t.net)} trend={t.net} divider />
        <KeyValueRow
          label="Max drawdown"
          value={t.maxDrawdown ? money(-t.maxDrawdown) : t.maxDrawdown === 0 ? '₹0' : '—'}
          divider
        />
      </View>
      <Text className="mt-1 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        {status.testResults.since
          ? `Since ${formatDateTime(status.testResults.since)}`
          : 'Since the bot was first used'}{' '}
        · {plural(t.entries, 'entry', 'entries')}
        {t.open ? ` · ${t.open} open` : ''}
        {note ? ` · ${note}` : ''}
      </Text>

      <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <TextLink
          label="Open paper orders"
          onPress={() => router.push({ pathname: '/fno/paper', params: { view: 'orders' } })}
        />
        {status.readiness.note ? (
          <Text className="flex-1 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            {status.readiness.note}
          </Text>
        ) : null}
      </View>
    </Panel>
  );
}

/** A test scan on demand: the whole pipeline now, followed step by step — never an order. */
function TestScanPanel({ status }: { status: BotStatus }) {
  const testScan = useTestScan();
  const [followId, setFollowId] = useState<string | null>(null);
  const latest = status.dryRuns[0] ?? null;
  // A scan started before this screen opened is followed too, until it finishes.
  const runId = followId ?? (latest?.status === 'RUNNING' ? latest.id : null);
  const followed = useBotRun(runId);
  const shown: RunView | null = (runId ? followed.data : null) ?? latest;
  const running = shown?.status === 'RUNNING';
  const view = shown ? testScanView(shown) : null;

  const start = () =>
    testScan.mutate(undefined, {
      onSuccess: (id) => {
        if (id) setFollowId(id);
        toast.info('Test scan started', 'It never places an order.');
      },
      onError: (error) => toast.error('Couldn’t start a test scan', getErrorMessage(error)),
    });

  return (
    <Panel
      title="Test scan"
      meta="any time · never an order"
      right={
        <Button
          label={running ? 'Scanning…' : 'Run test scan'}
          size="sm"
          variant="outline"
          loading={testScan.isPending}
          disabled={running || !status.readiness.aiConfigured}
          onPress={start}
        />
      }
    >
      {!shown || !view ? (
        <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          Run a test scan to see each step and what the bot would do.
        </Text>
      ) : (
        <>
          <View className="flex-row items-start gap-2">
            <View className="flex-1">
              <StatusPill
                tone={view.tone}
                label={running ? 'Running' : view.tone === 'ok' ? 'Would buy' : 'Finished'}
              />
              <Text className="mt-2 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
                {view.label}
              </Text>
            </View>
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
              {formatDateTime(shown.at)}
            </Text>
          </View>
          {followed.isError && runId ? (
            <Text className="mt-2 text-xs text-danger-600 dark:text-danger-dark">
              Couldn’t follow the test scan: {getErrorMessage(followed.error)}
            </Text>
          ) : null}
          <View className="mt-3">
            <TraceList trace={shown.trace} />
          </View>
        </>
      )}
    </Panel>
  );
}

/** Arm or disarm (applies on Save), a scan now, and the stop. */
function SwitchPanel({
  status,
  controller,
}: {
  status: BotStatus;
  controller: SettingsDraftController;
}) {
  const kill = useKillBot();
  const runNow = useRunBotNow();
  const live = status.mode === 'live';
  const armed = status.settings.enabled;
  const draft = controller.draft!;

  const onRun = () =>
    confirmAction({
      title: live ? 'Run a live scan now?' : 'Run a scan now?',
      message: live
        ? 'If every check passes, the bot may place a real Groww order with OCO protection.'
        : 'If every check passes, the bot may place an order in your paper F&O book.',
      confirmLabel: 'Run scan',
      onConfirm: () =>
        runNow.mutate(undefined, {
          onSuccess: (result) =>
            result.status === 'ALREADY_RUNNING'
              ? toast.info('Already checked', result.reason ?? 'See the decision log.')
              : toast.success('Scan started', 'The decision log updates when research finishes.'),
          onError: (error) => toast.error('Couldn’t start a scan', getErrorMessage(error)),
        }),
    });

  const onKill = () =>
    confirmAction({
      title: 'Stop new entries?',
      message:
        'The bot stops opening positions now. Existing bot positions are still monitored until they close.',
      confirmLabel: 'Stop entries',
      destructive: true,
      onConfirm: () =>
        kill.mutate(undefined, {
          onSuccess: () =>
            toast.success('New entries stopped', 'Existing bot positions are still monitored.'),
          onError: (error) => toast.error('Couldn’t stop entries', getErrorMessage(error)),
        }),
    });

  return (
    <Panel
      title="Controls"
      right={<StatusPill tone={armed ? 'ok' : 'neutral'} label={armed ? 'Armed' : 'Off'} />}
    >
      <ListCard>
        <SwitchRow
          title="Start the bot every trading day"
          subtitle={`Resumes in ${live ? 'LIVE' : 'paper'} mode every weekday, 09:30–14:15 IST, every ${draft.texts.cadenceMinutes || '—'} min. Applies when you save.`}
          value={draft.enabled}
          disabled={controller.saving}
          onValueChange={controller.setEnabled}
        />
      </ListCard>
      {draft.enabled && !status.readiness.aiConfigured ? (
        <Text className="mt-2 text-xs text-warning-600 dark:text-warning-dark">
          The AI service is not configured — the server will refuse to arm the bot.
        </Text>
      ) : null}
      <View className="mt-3 flex-row flex-wrap gap-2">
        <Button
          label="Run a scan now"
          size="sm"
          variant="outline"
          loading={runNow.isPending}
          disabled={!armed || controller.dirty || kill.isPending}
          onPress={onRun}
        />
        <Button
          label="Stop entries"
          size="sm"
          variant="outline"
          loading={kill.isPending}
          disabled={!armed || runNow.isPending}
          onPress={onKill}
        />
      </View>
      <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        {!armed
          ? 'Arm the bot and save to run a scan or stop entries.'
          : controller.dirty
            ? 'Save or discard your changes before running a scan.'
            : 'A scan runs now with the saved caps; one per time slot.'}
      </Text>
    </Panel>
  );
}

/** One editable cap: label and hint, a numeric input with its unit, its range or error. */
function FieldRow({
  field,
  controller,
  first,
}: {
  field: SettingField;
  controller: SettingsDraftController;
  first: boolean;
}) {
  const { colors, isDark } = useTheme();
  const [focused, setFocused] = useState(false);
  const error = controller.errors[field.key];
  const value = controller.draft?.texts[field.key] ?? '';
  return (
    <View
      className={cn('gap-1.5 px-4 py-3', !first && 'border-t border-line dark:border-line-dark')}
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
            {field.label}
          </Text>
          <Text className="mt-0.5 text-[11px] leading-4 text-ink-muted dark:text-ink-dark-muted">
            {field.hint}
          </Text>
        </View>
        <View
          className="h-10 w-[128px] flex-row items-center gap-1.5 rounded-field border bg-canvas px-2.5 dark:bg-canvas-dark"
          style={{
            borderColor: error ? colors.danger : focused ? colors.accent : colors.borderStrong,
            borderWidth: error || focused ? 1.5 : 1,
          }}
        >
          <TextInput
            value={value}
            onChangeText={(text) => controller.setText(field.key, text)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            editable={!controller.saving}
            keyboardType={field.integer ? 'number-pad' : 'decimal-pad'}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            accessibilityLabel={`${field.label}, ${field.unit}`}
            accessibilityHint={error ?? `Between ${rangeText(field)}`}
            className="h-full flex-1 text-right text-[15px] text-ink dark:text-ink-dark"
            style={NUM}
          />
          <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">{field.unit}</Text>
        </View>
      </View>
      <Text
        accessibilityLiveRegion={error ? 'polite' : undefined}
        className={cn(
          'text-right text-[11px]',
          error
            ? 'text-danger-600 dark:text-danger-dark'
            : 'text-ink-faint dark:text-ink-dark-faint',
        )}
      >
        {error ?? `${rangeText(field)} ${field.unit}`}
      </Text>
    </View>
  );
}

function FieldsPanel({
  title,
  meta,
  fields,
  controller,
}: {
  title: string;
  meta: string;
  fields: readonly SettingField[];
  controller: SettingsDraftController;
}) {
  return (
    <Panel title={title} meta={meta} flush>
      {fields.map((field, index) => (
        <FieldRow key={field.key} field={field} controller={controller} first={index === 0} />
      ))}
    </Panel>
  );
}

/** The bot's latest entries; an uncertain one can be resolved here after review. */
function RecentOrders({ status, onTab }: { status: BotStatus; onTab: (tab: BotTab) => void }) {
  const { resolve, pendingId } = useResolveFlow();
  const rows = status.recent.slice(0, 5);
  return (
    <Panel
      title="Recent bot orders"
      meta={status.mode === 'live' ? 'real Groww and paper entries' : 'paper F&O entries'}
      right={<TextLink label="All trades" onPress={() => onTab('trades')} />}
      flush
    >
      {rows.length === 0 ? (
        <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No positions yet.
        </Text>
      ) : (
        rows.map((intent, index) => (
          <View key={intent.intentId}>
            {index > 0 ? <RowDivider /> : null}
            <IntentRow
              intent={intent}
              resolving={pendingId === intent.intentId}
              busy={pendingId != null}
              onResolve={() => resolve(intent)}
            />
          </View>
        ))
      )}
    </Panel>
  );
}

function IntentRow({
  intent,
  resolving,
  busy,
  onResolve,
}: {
  intent: BotIntent;
  resolving: boolean;
  busy: boolean;
  onResolve: () => void;
}) {
  return (
    <View accessible={intent.status !== 'UNKNOWN'} className="gap-1 px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Text
          className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
          numberOfLines={1}
        >
          {intent.tradingSymbol}
        </Text>
        <StatusPill tone={statusTone(intent.status)} label={intent.status || '—'} />
      </View>
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" style={NUM}>
        {intent.mode === 'live' ? 'Live' : 'Paper'} · entry {premium(intent.entry)} · stop{' '}
        {premium(intent.stop)} · target {premium(intent.target)}
      </Text>
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {formatDateTime(intent.createdAt)} · estimated net{' '}
          <Text className={pnlClass(intent.netPnl)}>{signedMoney(intent.netPnl)}</Text>
        </Text>
        {intent.status === 'UNKNOWN' ? (
          <Button
            label="Resolve"
            size="sm"
            variant="outline"
            loading={resolving}
            disabled={busy}
            accessibilityLabel={`Resolve ${intent.tradingSymbol} after review`}
            onPress={onResolve}
          />
        ) : null}
      </View>
    </View>
  );
}

/** The latest scheduled and manual checks, HOLD and errors included. */
function RecentScans({ runs, onTab }: { runs: readonly RunView[]; onTab: (tab: BotTab) => void }) {
  const router = useRouter();
  const rows = runs.slice(0, 5);
  return (
    <Panel
      title="Recent scans"
      meta="every scheduled check"
      right={<TextLink label="Decision log" onPress={() => onTab('decisions')} />}
      flush
    >
      {rows.length === 0 ? (
        <Text className="px-4 pb-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No scans recorded yet.
        </Text>
      ) : (
        rows.map((run, index) => (
          <View key={run.id}>
            {index > 0 ? <RowDivider /> : null}
            <View className="flex-row items-start gap-2 px-4 py-3">
              <View className="flex-1 gap-1">
                <View className="flex-row items-center gap-2">
                  <StatusPill tone={statusTone(run.status)} label={run.status || '—'} />
                  <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
                    {formatDateTime(run.at)}
                  </Text>
                </View>
                <Text
                  className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={2}
                >
                  {run.reason || 'No reason recorded.'}
                </Text>
              </View>
              <TextLink
                label="Open"
                accessibilityLabel={`Open the scan at ${formatDateTime(run.at)}`}
                onPress={() =>
                  router.push({ pathname: '/index-bot/run/[id]', params: { id: run.id } })
                }
              />
            </View>
          </View>
        ))
      )}
    </Panel>
  );
}

/**
 * The sticky Save bar, shown only while the draft differs from the server. Save is disabled while
 * any field is out of range; the server's own answer decides the rest.
 */
export function SaveBar({ controller }: { controller: SettingsDraftController }) {
  const invalid = Object.keys(controller.errors).length > 0;
  return (
    <View className="flex-row items-center gap-3 border-t border-line bg-surface px-5 py-3 dark:border-line-dark dark:bg-surface-dark">
      <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted">
        {invalid ? 'Fix the highlighted values to save.' : 'Unsaved changes to the bot.'}
      </Text>
      <Button
        label="Discard"
        variant="ghost"
        size="sm"
        disabled={controller.saving}
        onPress={controller.discard}
      />
      <Button
        label="Save changes"
        size="sm"
        loading={controller.saving}
        disabled={invalid}
        onPress={controller.save}
      />
    </View>
  );
}
