import { useRouter } from 'expo-router';
import Check from 'lucide-react-native/icons/check';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import DatabaseZap from 'lucide-react-native/icons/database-zap';
import Search from 'lucide-react-native/icons/search';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { Input } from '@/components/ui/Input';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import { AdminOnlyNotice, AdminQueryError } from '@/features/admin/components/AdminState';
import { NoticeCard } from '@/features/admin/components/OpsBits';
import {
  useConnectServiceBroker,
  useCreateServiceAccount,
  useGenerateRecommendations,
  useRecServiceStatus,
  useServiceBroker,
  useServiceUserOptions,
  useSetServiceUser,
  useVerifyServiceBroker,
} from '@/features/admin/hooks';
import { isAdminDenied, isDependencyUnavailable } from '@/features/admin/lib/access';
import {
  filterServiceUsers,
  MSTOCK_STATUS,
  runOutcomeMessage,
  serviceConnectionState,
  serviceUserDetail,
  serviceUserWarning,
} from '@/features/admin/lib/recommendations';
import type { GenerateRunResult, ServiceUserOption } from '@/features/admin/types';
import { StatusDot, StatusPill } from '@/features/settings/components/StatusPill';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatDateTime, relativeTime } from '@/features/settings/lib/time';
import type { MfaMethod } from '@/features/trading/types';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const PICKER_PREVIEW = 8;
const SECURE_FIELD = {
  autoCapitalize: 'none',
  autoCorrect: false,
  autoComplete: 'off',
  importantForAutofill: 'no',
} as const;

const MFA_OPTIONS: readonly { key: MfaMethod; label: string }[] = [
  { key: 'totp', label: 'Authenticator' },
  { key: 'otp', label: 'SMS code' },
];

function EngineStatusCard({ now }: { now: number }) {
  const status = useRecServiceStatus();
  const data = status.data;
  if (status.isPending) return <ListSkeleton rows={1} />;
  if (!data)
    return (
      <InlineError
        what="the engine’s status"
        error={status.error}
        onRetry={() => void status.refetch()}
      />
    );
  return (
    <View
      accessible
      accessibilityLabel={`mStock data ${data.connected ? 'connected' : 'disconnected'}`}
      className="flex-row items-center gap-3.5 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
    >
      <IconTile
        Icon={data.connected ? DatabaseZap : CircleAlert}
        tone={data.connected ? 'green' : 'rose'}
        size="lg"
      />
      <View className="flex-1">
        <Text
          accessibilityRole="header"
          className="text-base font-bold text-ink dark:text-ink-dark"
        >
          {data.connected ? 'mStock data connected' : 'mStock data disconnected'}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
          {data.lastRefreshedAt
            ? `Session refreshed ${relativeTime(data.lastRefreshedAt, now)}`
            : 'Never refreshed'}
        </Text>
        {!data.connected && data.lastError ? (
          <Text
            selectable
            className="mt-1 text-xs leading-[17px] text-danger-600 dark:text-danger-dark"
          >
            {data.lastError}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function RunCard() {
  const router = useRouter();
  const { today, preMarket } = useGenerateRecommendations();
  const [last, setLast] = useState<{ what: string; result: GenerateRunResult } | null>(null);

  const start = (mutation: typeof today, what: string, title: string, message: string) =>
    confirmAction({
      title,
      message,
      confirmLabel: 'Queue run',
      onConfirm: () =>
        mutation.mutate(undefined, {
          onSuccess: (result) => {
            setLast({ what, result });
            toast.success(result.alreadyRunning ? 'Already queued' : 'Run queued');
          },
          onError: (error) =>
            toast.error(`Couldn’t queue the ${what.toLowerCase()}`, getErrorMessage(error)),
        }),
    });

  return (
    <Card className="gap-3">
      <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        Queues a run on the worker and returns as soon as it’s accepted — picks appear once the
        worker finishes, not when the button returns.
      </Text>
      <Button
        label="Generate today’s picks"
        fullWidth
        loading={today.isPending}
        onPress={() =>
          start(
            today,
            'Generation run',
            'Generate today’s picks?',
            'Runs the full recommendation engine for today, including its AI analysis. The picks appear when the worker finishes.',
          )
        }
      />
      <Button
        label="Run pre-market picker"
        variant="outline"
        fullWidth
        loading={preMarket.isPending}
        onPress={() =>
          start(
            preMarket,
            'Pre-market picker',
            'Run the pre-market picker?',
            'Scans liquid stocks on completed price and volume data and uses AI to write up the picks. Research only — no orders are placed.',
          )
        }
      />
      <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
        The pre-market picker also runs itself on weekdays at 08:15 IST.
      </Text>
      {last ? (
        <Banner
          tone={last.result.alreadyRunning ? 'info' : 'success'}
          message={runOutcomeMessage(last.result, last.what)}
        />
      ) : null}
      <Button
        label="View today’s picks"
        variant="link"
        className="self-start"
        onPress={() => router.push('/intel')}
      />
    </Card>
  );
}

function UserOptionRow({
  option,
  selected,
  inUse,
  onPress,
}: {
  option: ServiceUserOption;
  selected: boolean;
  inUse: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const status = MSTOCK_STATUS[option.mstock.status] ?? MSTOCK_STATUS.not_connected;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${option.email}, ${serviceUserDetail(option)}${inUse ? ', in use now' : ''}`}
      onPress={onPress}
      className="min-h-[56px] flex-row items-center gap-3 px-3.5 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <StatusDot tone={status.tone} />
      <View className="flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
          {option.email}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {serviceUserDetail(option)}
          {inUse ? ' · in use' : ''}
        </Text>
      </View>
      {selected ? <Check size={18} color={colors.link} /> : null}
    </Pressable>
  );
}

function BorrowSessionCard() {
  const { colors } = useTheme();
  const options = useServiceUserOptions();
  const setServiceUser = useSetServiceUser();
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const users = useMemo(() => options.data?.users ?? [], [options.data]);
  const currentId = options.data?.selectedUserId ?? null;
  const selectedId = picked ?? currentId;
  const selected = users.find((user) => user.id === selectedId) ?? null;
  const warning = serviceUserWarning(selected);
  const matches = useMemo(
    () => filterServiceUsers(users, query, selectedId),
    [users, query, selectedId],
  );
  const shown = showAll || query ? matches : matches.slice(0, PICKER_PREVIEW);

  if (options.isPending) return <ListSkeleton rows={3} />;
  if (!options.data)
    return (
      <AdminQueryError what="users" error={options.error} onRetry={() => void options.refetch()} />
    );

  const save = () => {
    if (!selected) return;
    confirmAction({
      title: 'Use this session for the engine?',
      message: `Every user’s recommendations will read market data through ${selected.email}’s mStock session. It applies straight away.`,
      confirmLabel: 'Use it',
      onConfirm: () =>
        setServiceUser.mutate(selected.id, {
          onSuccess: () => {
            setPicked(null);
            toast.success('Engine session updated', selected.email);
          },
          onError: (error) => toast.error('Couldn’t save that choice', getErrorMessage(error)),
        }),
    });
  };

  return (
    <View className="gap-3">
      {users.length > PICKER_PREVIEW ? (
        <Input
          placeholder="Search users by email"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          accessibilityLabel="Search users"
          leftIcon={<Search size={18} color={colors.textFaint} />}
        />
      ) : null}
      <ListCard>
        {shown.length === 0 ? (
          <Text className="px-3.5 py-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
            No user matches “{query.trim()}”.
          </Text>
        ) : (
          shown.map((option, index) => (
            <View key={option.id}>
              {index > 0 ? <RowDivider /> : null}
              <UserOptionRow
                option={option}
                selected={option.id === selectedId}
                inUse={option.id === currentId}
                onPress={() => setPicked(option.id)}
              />
            </View>
          ))
        )}
      </ListCard>
      {!query && !showAll && matches.length > PICKER_PREVIEW ? (
        <Button
          label={`Show all ${matches.length} users`}
          variant="link"
          className="self-start"
          onPress={() => setShowAll(true)}
        />
      ) : null}

      {warning === 'not-connected' ? (
        <NoticeCard tone="info" title="Not connected to mStock">
          This user hasn’t connected mStock yet. They need to connect it under Broker connections
          before the engine can use their session.
        </NoticeCard>
      ) : warning === 'will-go-stale' ? (
        <NoticeCard tone="warn" title="Will go stale">
          This user connected with an SMS code, not an authenticator app. The daily refresh job can
          only renew a TOTP connection, so this session stops working at the next mStock expiry
          unless they reconnect with an authenticator.
        </NoticeCard>
      ) : null}

      <Button
        label={selectedId && selectedId === currentId ? 'In use' : 'Use this session'}
        fullWidth
        disabled={!selected || selected.id === currentId}
        loading={setServiceUser.isPending}
        onPress={save}
      />
    </View>
  );
}

function DedicatedAccountCard() {
  const serviceBroker = useServiceBroker();
  const createAccount = useCreateServiceAccount();
  const connect = useConnectServiceBroker();
  const verify = useVerifyServiceBroker();
  const [formOpen, setFormOpen] = useState(false);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [mfaMethod, setMfaMethod] = useState<MfaMethod>('totp');
  const [fields, setFields] = useState({ apiKey: '', checksum: '', username: '', password: '' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const noServiceUser = isDependencyUnavailable(serviceBroker.error);
  const connection =
    serviceBroker.data?.connections.find((entry) => entry.broker === 'mstock') ?? null;
  const state = serviceConnectionState(connection);
  const ready = Boolean(
    fields.apiKey.trim() && fields.checksum.trim() && fields.username.trim() && fields.password,
  );
  const codeReady = /^\d{4,8}$/.test(code);

  const set = (key: keyof typeof fields) => (value: string) => {
    setError(null);
    setFields((current) => ({ ...current, [key]: value }));
  };

  const closeForm = () => {
    setFormOpen(false);
    setAwaitingCode(false);
    setFields({ apiKey: '', checksum: '', username: '', password: '' });
    setCode('');
    setError(null);
  };

  const create = () =>
    confirmAction({
      title: 'Create the service account?',
      message:
        'Creates (or finds) a dedicated account nobody signs into. Pick it under “Borrow a user’s session” to make it the engine’s account, then connect mStock to it here.',
      confirmLabel: 'Create',
      onConfirm: () =>
        createAccount.mutate(undefined, {
          onSuccess: (result) =>
            toast.success(
              result.created ? 'Service account created' : 'Service account already exists',
              'Select it above and save to use it.',
            ),
          onError: (err) => toast.error('Couldn’t create it', getErrorMessage(err)),
        }),
    });

  const submit = () =>
    connect.mutate(
      {
        apiKey: fields.apiKey.trim(),
        checksum: fields.checksum.trim(),
        username: fields.username.trim(),
        password: fields.password,
        mfaMethod,
      },
      {
        onSuccess: (result) => {
          if (result.status === 'connected') {
            toast.success('Engine account connected');
            closeForm();
            void serviceBroker.refetch();
            return;
          }
          setMfaMethod(result.challenge === 'totp' ? 'totp' : 'otp');
          setAwaitingCode(true);
        },
        onError: (err) => setError(getErrorMessage(err, 'Couldn’t start the connection.')),
      },
    );

  const submitCode = () =>
    verify.mutate(code, {
      onSuccess: () => {
        toast.success('Engine account connected');
        closeForm();
      },
      onError: (err) => setError(getErrorMessage(err, 'That code wasn’t accepted.')),
    });

  return (
    <Card className="gap-1">
      {serviceBroker.isPending ? (
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">Checking…</Text>
      ) : noServiceUser ? (
        <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          No engine account is set yet, so there’s nothing to connect a broker to. Create the
          dedicated account, pick it above and save — then connect mStock here.
        </Text>
      ) : serviceBroker.error ? (
        <Text className="text-[13px] text-danger-600 dark:text-danger-dark">
          {getErrorMessage(serviceBroker.error, 'Couldn’t read the engine account’s connection.')}
        </Text>
      ) : (
        <>
          <KeyValueRow
            label="mStock connection"
            value={<StatusPill tone={state.tone} label={state.label} />}
          />
          {connection?.expiresAt ? (
            <KeyValueRow
              label="Session valid to"
              value={`${formatDateTime(connection.expiresAt)} IST`}
              divider
            />
          ) : null}
          {connection?.lastError ? (
            <Text
              selectable
              className="mt-1 text-xs leading-[17px] text-danger-600 dark:text-danger-dark"
            >
              {connection.lastError}
            </Text>
          ) : null}
        </>
      )}

      {formOpen ? (
        <View className="mt-3 gap-3 border-t border-line pt-4 dark:border-line-dark">
          {error ? <Banner tone="error" message={error} /> : null}
          {awaitingCode ? (
            <>
              <Input
                label={
                  mfaMethod === 'totp' ? 'Code from the authenticator app' : 'Code sent by SMS'
                }
                value={code}
                onChangeText={(text) => {
                  setError(null);
                  setCode(text.replace(/\D/g, '').slice(0, 8));
                }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
              />
              <Button
                label="Verify"
                fullWidth
                disabled={!codeReady}
                loading={verify.isPending}
                onPress={submitCode}
              />
            </>
          ) : (
            <>
              <Input
                label="API key"
                value={fields.apiKey}
                onChangeText={set('apiKey')}
                {...SECURE_FIELD}
              />
              <Input
                label="Checksum"
                value={fields.checksum}
                onChangeText={set('checksum')}
                secureToggle
                {...SECURE_FIELD}
              />
              <Input
                label="mStock user ID"
                value={fields.username}
                onChangeText={set('username')}
                {...SECURE_FIELD}
              />
              <Input
                label="mStock password"
                value={fields.password}
                onChangeText={set('password')}
                secureToggle
                {...SECURE_FIELD}
              />
              <View className="gap-1.5">
                <Text className="text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
                  Daily code via
                </Text>
                <SegmentedControl items={MFA_OPTIONS} value={mfaMethod} onChange={setMfaMethod} />
                <Text className="text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
                  {mfaMethod === 'totp'
                    ? 'Recommended — only an authenticator connection is renewed by the daily refresh job.'
                    : 'An SMS connection needs someone to retype a code every time mStock expires the session.'}
                </Text>
              </View>
              <Button
                label="Continue"
                fullWidth
                disabled={!ready}
                loading={connect.isPending}
                onPress={submit}
              />
            </>
          )}
          <Button label="Cancel" variant="ghost" fullWidth onPress={closeForm} />
        </View>
      ) : (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {!noServiceUser && !serviceBroker.isPending && !serviceBroker.error ? (
            <Button
              label={connection ? 'Reconnect mStock' : 'Connect mStock'}
              size="sm"
              onPress={() => setFormOpen(true)}
            />
          ) : null}
          <Button
            label="Create or find account"
            size="sm"
            variant="outline"
            loading={createAccount.isPending}
            onPress={create}
          />
        </View>
      )}
    </Card>
  );
}

/** Where the recommendation engine reads market data from, and manual runs (web: Recommendations admin). */
export function RecommendationsEnginePanel() {
  const now = useNow();
  const options = useServiceUserOptions();
  const status = useRecServiceStatus();
  const serviceBroker = useServiceBroker();

  const onRefresh = () =>
    Promise.all([options.refetch(), status.refetch(), serviceBroker.refetch()]);

  if (isAdminDenied(options.error)) {
    return (
      <StackScreen title="Recommendations engine" onRefresh={onRefresh}>
        <AdminOnlyNotice message="Your account no longer has administrator access." />
      </StackScreen>
    );
  }

  return (
    <StackScreen
      title="Recommendations engine"
      subtitle="Market-data session and manual runs"
      onRefresh={onRefresh}
    >
      <EngineStatusCard now={now} />

      <Section title="Run the engine">
        <RunCard />
      </Section>

      <Section title="Borrow a user’s session" note="Simplest">
        <BorrowSessionCard />
      </Section>

      <Section title="Dedicated service account" note="No personal session">
        <DedicatedAccountCard />
      </Section>

      <Section title="Which option?">
        <Card>
          <Text className="text-[13px] leading-5 text-ink-muted dark:text-ink-dark-muted">
            Borrowing a session is fine while one person uses the app. Once their connection
            expiring means nobody gets recommendations, the dedicated account is worth the extra
            setup.
          </Text>
        </Card>
      </Section>
    </StackScreen>
  );
}
