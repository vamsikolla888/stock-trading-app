import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConditionsCard } from '@/features/screeners/components/ConditionsCard';
import {
  CustomScreenerFormFields,
  useCustomScreenerForm,
  valuesFromScreener,
} from '@/features/screeners/components/CustomScreenerForm';
import { MatchList } from '@/features/screeners/components/MatchList';
import {
  useBuiltInScreener,
  useCustomScreener,
  useDeleteCustomScreener,
  useRunCustomScan,
  useDuplicateCustomScreener,
  useUpdateCustomScreener,
} from '@/features/screeners/hooks';
import { lastRunLabel, pluralize } from '@/features/screeners/lib/metrics';
import { isScanActive } from '@/features/screeners/lib/scans';
import type { CustomScreener, ScreenerDetail } from '@/features/screeners/types';
import { useIndexCatalog } from '@/features/strategies/hooks';
import { formatNumber } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage, isApiError } from '@/types/api';

// A render failure here shows the error page with a retry, not a crashed app.
export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const DISCLAIMER = 'Not investment advice — review before acting.';

/**
 * One screener and its matches. Built-in screens are the default (Explore links here with
 * just an id); custom screeners arrive with `kind=custom`, because a built-in's id is a slug
 * and a custom one's an ObjectId and the shape difference is not a contract.
 */
export default function ScreenerDetailScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string }>();
  const id = typeof params.id === 'string' ? params.id.trim() : '';
  return params.kind === 'custom' ? <CustomScreenerScreen id={id} /> : <BuiltInScreen id={id} />;
}

/** A missing id never fetches and a deleted (or renamed) screener answers 404 — both are "not found". */
function isNotFound(id: string, error: unknown): boolean {
  return id === '' || (isApiError(error) && error.status === 404);
}

function ScreenerNotFound() {
  const router = useRouter();
  return (
    <InlineEmpty
      title="Screener not found"
      message="It may have been deleted — custom screeners are a shared library, so anyone can remove one — or the link is out of date."
      action={{ label: 'Go to screeners', onPress: () => router.replace('/intel/screeners') }}
    />
  );
}

// ── Built-in ────────────────────────────────────────────────────────────────────────────

function BuiltInScreen({ id }: { id: string }) {
  const query = useBuiltInScreener(id);
  const data = query.data;

  return (
    <StackScreen
      title={data?.label ?? 'Screener'}
      subtitle={data ? matchSubtitle(data.matchCount, data.universeSize, data.runAt) : undefined}
      onRefresh={query.refetch}
    >
      {isNotFound(id, query.error) ? (
        <ScreenerNotFound />
      ) : query.isPending ? (
        <ListSkeleton rows={8} />
      ) : query.error && !data ? (
        <InlineError
          what="this screener"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : data ? (
        <BuiltInBody screener={data} />
      ) : null}
    </StackScreen>
  );
}

function BuiltInBody({ screener }: { screener: ScreenerDetail }) {
  const conditions = screener.conditions.map((c) => `${c.field} ${c.op} ${c.value}`);
  return (
    <View>
      <ConditionsCard
        meta={`${pluralize(conditions.length, 'condition')} · ${screener.timeframe} bars · ${lastRunLabel(screener.runAt)}`}
        tags={[
          `${screener.timeframe} bars`,
          lastRunLabel(screener.runAt),
          `${formatNumber(screener.universeSize, 0)} symbols scanned`,
        ]}
        conditions={conditions}
      />

      <View className="mt-5">
        {screener.matches.length === 0 ? (
          <InlineEmpty
            title={screener.runAt ? 'No matches in the last scan' : 'Not scanned yet'}
            message={
              screener.runAt
                ? 'No stock met these conditions on the latest daily bar. Matches change as prices move.'
                : 'This screen has never been scanned. It fills in after the next scheduled scan, or run all scans from the Screeners tab.'
            }
          />
        ) : (
          <>
            <MatchList
              key={screener.id}
              matches={screener.matches}
              matchCount={screener.matchCount}
              cappedNote="The scan keeps the highest-scoring matches per screen, so this covers the top slice only."
            />
            <Text className="mt-3 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
              Each row shows the values that satisfied the conditions, so a match can be checked
              rather than trusted.
            </Text>
          </>
        )}
      </View>
      <Text className="mt-6 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        {DISCLAIMER}
      </Text>
    </View>
  );
}

function matchSubtitle(matchCount: number, universeSize: number, runAt: string | null): string {
  if (!runAt) return 'Never scanned';
  return `${formatNumber(matchCount, 0)} of ${formatNumber(universeSize, 0)} stocks match`;
}

// ── Custom ──────────────────────────────────────────────────────────────────────────────

function CustomScreenerScreen({ id }: { id: string }) {
  const router = useRouter();
  const navigation = useNavigation();
  const query = useCustomScreener(id);
  const screener = query.data;
  const notFound = isNotFound(id, query.error);
  const remove = useDeleteCustomScreener();
  const duplicate = useDuplicateCustomScreener();

  // The screener's own `runState` is the authority (read with the queue consulted, so a scan
  // the worker lost is `stalled`, never locking the button); while it is active the detail
  // query polls itself.
  const run = useRunCustomScan(id);
  const running = run.isPending || isScanActive(screener);
  const stalled = !running && screener?.runState?.phase === 'stalled';

  const makeCopy = () => {
    if (!screener) return;
    duplicate.mutate(screener.id, {
      onSuccess: (copy) => {
        toast.success('Copy created', copy.name);
        router.replace({ pathname: '/screeners/[id]', params: { id: copy.id, kind: 'custom' } });
      },
      onError: (error) => toast.error("Couldn't copy the screener", getErrorMessage(error)),
    });
  };

  const startScan = () =>
    run.mutate(undefined, {
      onSuccess: (result) =>
        toast.info(
          result.alreadyRunning ? 'A scan is already running' : 'Scan queued',
          'Matches appear here when it finishes.',
        ),
      onError: (error) => toast.error("Couldn't start the scan", getErrorMessage(error)),
    });

  const confirmDelete = () => {
    if (!screener) return;
    Alert.alert(`Delete “${screener.name}”?`, 'Its matches go with it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(screener.id, {
            onSuccess: () => {
              toast.success('Screener deleted');
              if (router.canGoBack()) router.back();
              else router.replace('/intel/screeners');
            },
            onError: (error) => toast.error("Couldn't delete the screener", getErrorMessage(error)),
          }),
      },
    ]);
  };

  // ── Editing in place, with the same form the Screeners tab creates with ──
  const [editing, setEditing] = useState(false);
  const form = useCustomScreenerForm();
  const update = useUpdateCustomScreener(id);

  const startEditing = () => {
    if (!screener) return;
    form.reset(valuesFromScreener(screener));
    update.reset();
    setEditing(true);
  };

  const cancelEditing = () => {
    if (!form.dirty) {
      setEditing(false);
      return;
    }
    Alert.alert('Discard changes?', 'Your edits to this screener will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setEditing(false) },
    ]);
  };

  const saveEdits = async () => {
    if (!form.validation.valid) {
      form.setShowErrors(true);
      toast.error('Check the highlighted fields');
      return;
    }
    try {
      await update.mutateAsync(form.body());
      toast.success('Changes saved', 'Run a scan to see what the new rule matches.');
      setEditing(false);
    } catch {
      // Shown in the banner above the form.
    }
  };

  // Leaving with unsaved edits (back button or gesture) asks first.
  useEffect(() => {
    if (!editing || !form.dirty) return undefined;
    return navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      Alert.alert('Discard changes?', 'Your edits to this screener will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(event.data.action),
        },
      ]);
    });
  }, [editing, form.dirty, navigation]);

  if (editing && screener) {
    return (
      <StackScreen
        title="Edit screener"
        subtitle={screener.name}
        right={
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={cancelEditing}
            className="active:opacity-60"
          >
            <Text className="text-[15px] font-semibold text-ink-muted dark:text-ink-dark-muted">
              Cancel
            </Text>
          </Pressable>
        }
        footer={
          <View className="border-t border-line bg-canvas px-5 py-3 dark:border-line-dark dark:bg-canvas-dark">
            <Button
              label="Save changes"
              loading={update.isPending}
              disabled={update.isPending || !form.dirty}
              fullWidth
              onPress={() => void saveEdits()}
            />
          </View>
        }
      >
        {update.error ? (
          <Banner
            tone="error"
            title="Couldn't save"
            message={getErrorMessage(update.error)}
            className="mb-2"
          />
        ) : null}
        <CustomScreenerFormFields form={form} editing />
      </StackScreen>
    );
  }

  return (
    <StackScreen
      title={screener?.name ?? 'Screener'}
      subtitle={
        screener
          ? screener.status === 'never-run'
            ? 'Never scanned'
            : matchSubtitle(screener.matchCount, screener.universeSize, screener.runAt)
          : undefined
      }
      onRefresh={query.refetch}
      right={
        screener && !notFound ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit screener"
            hitSlop={8}
            onPress={startEditing}
            className="active:opacity-60"
          >
            <Text className="text-[15px] font-semibold text-brand-text dark:text-brand-text-dark">
              Edit
            </Text>
          </Pressable>
        ) : undefined
      }
      footer={
        screener && !notFound ? (
          <View className="border-t border-line bg-canvas px-5 py-3 dark:border-line-dark dark:bg-canvas-dark">
            <Button
              label={running ? 'Scanning…' : screener.runAt ? 'Re-run scan' : 'Run scan'}
              loading={run.isPending}
              disabled={running}
              fullWidth
              onPress={startScan}
            />
          </View>
        ) : undefined
      }
    >
      {notFound ? (
        <ScreenerNotFound />
      ) : query.isPending ? (
        <ListSkeleton rows={8} />
      ) : query.error && !screener ? (
        <InlineError
          what="this screener"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : screener ? (
        <CustomBody
          screener={screener}
          running={running}
          runError={
            run.error
              ? getErrorMessage(run.error)
              : screener.status === 'failed'
                ? (screener.runState?.message ?? screener.lastError ?? null)
                : null
          }
          stalledMessage={
            stalled
              ? (screener.runState?.message ??
                'This scan is marked as queued, but its job is gone — the worker may have restarted. Run it again.')
              : null
          }
          onDelete={confirmDelete}
          deleting={remove.isPending}
          onDuplicate={makeCopy}
          duplicating={duplicate.isPending}
        />
      ) : null}
    </StackScreen>
  );
}

function CustomBody({
  screener,
  running,
  runError,
  stalledMessage,
  onDelete,
  deleting,
  onDuplicate,
  duplicating,
}: {
  screener: CustomScreener;
  running: boolean;
  runError: string | null;
  stalledMessage: string | null;
  onDelete: () => void;
  deleting: boolean;
  onDuplicate: () => void;
  duplicating: boolean;
}) {
  // A stored indexKey is a slug ("niftymidcap150"); the label reads better, with the key as
  // the fallback so the narrowing is never invisible.
  const indices = useIndexCatalog();
  const indexLabel = screener.indexKey
    ? (indices.data?.find((i) => i.key === screener.indexKey)?.label ?? screener.indexKey)
    : null;
  const matches = screener.matches ?? [];
  const exchange = screener.exchange === 'ALL' ? 'NSE + BSE' : screener.exchange;

  const tags = [`${formatNumber(screener.universeSize, 0)} symbols scanned`];
  if (screener.skippedForInsufficientBars > 0) {
    tags.push(
      `${formatNumber(screener.skippedForInsufficientBars, 0)} skipped — too little history`,
    );
  }

  return (
    <View>
      <View className="mb-4 flex-row flex-wrap gap-1.5">
        <Badge label={exchange} />
        {indexLabel ? <Badge label={`${indexLabel} only`} /> : null}
        {screener.minPrice != null ? (
          <Badge label={`Min ₹${formatNumber(screener.minPrice, 0)}`} />
        ) : null}
        {screener.fnoOnly ? <Badge label="F&O names" /> : null}
        {screener.tradeableOnly ? <Badge label="Tradeable only" /> : null}
        <Badge label={lastRunLabel(screener.runAt)} />
        {screener.status === 'failed' ? <Badge label="Last scan failed" variant="danger" /> : null}
      </View>

      {running ? (
        <Banner
          tone={screener.runState?.message ? 'warning' : 'info'}
          className="mb-4"
          message={
            screener.runState?.message ??
            'Checking these conditions against every stock with enough history — this takes a little while. You can leave this screen.'
          }
        />
      ) : stalledMessage ? (
        <Banner
          tone="warning"
          className="mb-4"
          title="The last scan didn't finish"
          message={stalledMessage}
        />
      ) : runError ? (
        <Banner tone="error" className="mb-4" title="Scan failed" message={runError} />
      ) : null}

      <ConditionsCard
        meta={`${pluralize(screener.conditionText.length, 'condition')} · daily bars · ${lastRunLabel(screener.runAt)}`}
        tags={tags}
        conditions={screener.conditionText}
        description={screener.description}
      />

      <View className="mt-5">
        {matches.length === 0 ? (
          <InlineEmpty
            title={
              screener.status === 'never-run'
                ? 'Never scanned'
                : screener.status === 'failed'
                  ? 'The last scan failed'
                  : 'No matches in the last scan'
            }
            message={
              screener.status === 'never-run'
                ? 'Run a scan to see which stocks satisfy these conditions.'
                : screener.status === 'failed'
                  ? 'The reason is shown above. Run the scan again once it is fixed.'
                  : 'No stock satisfied these conditions. Loosening a threshold, or widening the exchange, is usually the reason.'
            }
          />
        ) : (
          <>
            <MatchList
              key={screener.id}
              matches={matches}
              matchCount={screener.matchCount}
              cappedNote="More stocks matched than are stored. The kept ones are the most liquid by traded value — every match satisfies the conditions equally, so there is no strength to rank by."
            />
            <Text className="mt-3 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
              Each row shows the values your conditions compared, so a match can be checked rather
              than trusted.
            </Text>
          </>
        )}
      </View>

      {screener.warnings && screener.warnings.length > 0 ? (
        <View className="mt-5 gap-1.5">
          {screener.warnings.map((warning) => (
            <Text
              key={`${warning.path}:${warning.message}`}
              className="text-xs leading-[17px] text-warning-600 dark:text-warning-dark"
            >
              ⚠ {warning.message}
            </Text>
          ))}
        </View>
      ) : null}
      {screener.fellBack && screener.fellBack.length > 0 ? (
        <Text className="mt-3 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
          Scanned wider than asked: {screener.fellBack.join('; ')}.
        </Text>
      ) : null}

      <View className="mt-8 flex-row justify-center gap-6">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: duplicating }}
          disabled={duplicating}
          onPress={onDuplicate}
          hitSlop={8}
          className="px-2 py-2 active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            {duplicating ? 'Copying…' : 'Duplicate'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: deleting }}
          disabled={deleting}
          onPress={onDelete}
          hitSlop={8}
          className="px-2 py-2 active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-danger-600 dark:text-danger-dark">
            {deleting ? 'Deleting…' : 'Delete screener'}
          </Text>
        </Pressable>
      </View>
      <Text className="mt-3 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Custom screeners are a shared library — changes here are seen by everyone. {DISCLAIMER}
      </Text>
    </View>
  );
}
