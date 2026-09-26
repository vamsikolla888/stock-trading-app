import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Plus from 'lucide-react-native/icons/plus';
import Sparkles from 'lucide-react-native/icons/sparkles';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { useScreeners } from '@/features/market/hooks';
import {
  CustomScreenerFormFields,
  useCustomScreenerForm,
} from '@/features/screeners/components/CustomScreenerForm';
import {
  RunAllScansButton,
  RunAllScansStatus,
  useRunAllScansControl,
} from '@/features/screeners/components/RunAllScans';
import { useCreateCustomScreener, useCustomScreeners } from '@/features/screeners/hooks';
import { lastRunLabel, pluralize } from '@/features/screeners/lib/metrics';
import type { CustomScreener, ScreenerSummary } from '@/features/screeners/types';
import { GenerateSheet } from '@/features/strategies/components/GenerateSheet';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const EXCHANGE_LABEL: Record<CustomScreener['exchange'], string> = {
  NSE: 'NSE',
  BSE: 'BSE',
  ALL: 'NSE + BSE',
};

function customStatusLine(screener: CustomScreener): string {
  if (screener.status === 'queued' || screener.status === 'running') return 'scanning…';
  if (screener.status === 'never-run') return 'never scanned';
  if (screener.status === 'failed') return 'last scan failed';
  return EXCHANGE_LABEL[screener.exchange];
}

/** Name · what it checks · how many stocks it matched. "Never scanned" is never shown as 0. */
function ScreenerRow({
  title,
  subtitle,
  count,
  tone = 'default',
  onPress,
}: {
  title: string;
  subtitle: string;
  count: number | null;
  tone?: 'default' | 'failed';
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}${count !== null ? `, ${pluralize(count, 'match', 'matches')}` : ''}`}
      onPress={onPress}
      className="min-h-[60px] flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={2}>
          {title}
        </Text>
        <Text
          className={cn(
            'mt-0.5 text-xs',
            tone === 'failed'
              ? 'text-danger-600 dark:text-danger-dark'
              : 'text-ink-muted dark:text-ink-dark-muted',
          )}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      {count !== null ? (
        <View
          className={cn(
            'min-w-[36px] items-center rounded-full px-2.5 py-1',
            count > 0
              ? 'bg-brand-wash dark:bg-brand-wash-dark'
              : 'bg-surface-sunk dark:bg-surface-sunk-dark',
          )}
        >
          <Text
            className={cn(
              'text-xs font-bold',
              count > 0
                ? 'text-brand-text dark:text-brand-text-dark'
                : 'text-ink-muted dark:text-ink-dark-muted',
            )}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatNumber(count, 0)}
          </Text>
        </View>
      ) : (
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">—</Text>
      )}
      <ChevronRight size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const EMPTY_BUILT_INS: ScreenerSummary[] = [];
const EMPTY_CUSTOMS: CustomScreener[] = [];

export default function ScreenersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const builtInQuery = useScreeners();
  const customQuery = useCustomScreeners();
  const builtIns = builtInQuery.data ?? EMPTY_BUILT_INS;
  const customs = customQuery.data ?? EMPTY_CUSTOMS;
  const runAll = useRunAllScansControl();
  const [generating, setGenerating] = useState(false);

  // ── Creating a screener happens in place, like the web's editor pane ──
  const [creating, setCreating] = useState(false);
  const form = useCustomScreenerForm();
  const create = useCreateCustomScreener();

  const refresh = useCallback(
    () => Promise.all([builtInQuery.refetch(), customQuery.refetch()]),
    [builtInQuery, customQuery],
  );

  const openBuiltIn = (id: string) => router.push({ pathname: '/screeners/[id]', params: { id } });
  const openCustom = (id: string) =>
    router.push({ pathname: '/screeners/[id]', params: { id, kind: 'custom' } });

  const startCreating = () => {
    form.reset();
    create.reset();
    setCreating(true);
  };

  const cancelCreating = () => {
    if (!form.dirty) {
      setCreating(false);
      return;
    }
    Alert.alert('Discard this screener?', 'What you have entered will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setCreating(false) },
    ]);
  };

  const save = async () => {
    if (!form.validation.valid) {
      form.setShowErrors(true);
      toast.error('Check the highlighted fields', 'A screener needs a name and a condition.');
      return;
    }
    try {
      const created = await create.mutateAsync(form.body());
      toast.success('Screener created', 'Run a scan to see which stocks satisfy it.');
      setCreating(false);
      form.reset();
      openCustom(created.id);
    } catch {
      // Shown in the banner above the form.
    }
  };

  if (creating) {
    return (
      <GroupScreen
        intro="New screener · checked against the latest daily bar of every stock"
        right={<Button label="Cancel" variant="link" size="sm" onPress={cancelCreating} />}
        footer={
          <View className="border-t border-line bg-canvas px-5 pb-3 pt-3 dark:border-line-dark dark:bg-canvas-dark">
            <Button
              label="Create screener"
              loading={create.isPending}
              disabled={create.isPending}
              fullWidth
              onPress={() => void save()}
            />
          </View>
        }
      >
        {create.error ? (
          <Banner
            tone="error"
            title="Couldn't create the screener"
            message={getErrorMessage(create.error)}
            className="mb-2"
          />
        ) : null}
        <CustomScreenerFormFields form={form} editing={false} />
      </GroupScreen>
    );
  }

  const intro =
    builtIns.length > 0
      ? `${builtIns.length} built-in${customs.length > 0 ? ` · ${customs.length} custom` : ''} · NSE + BSE`
      : 'Standing technical conditions, checked across NSE and BSE';

  return (
    <GroupScreen
      intro={intro}
      right={
        <RunAllScansButton busy={runAll.busy} onPress={runAll.start} customCount={customs.length} />
      }
      onRefresh={refresh}
    >
      <RunAllScansStatus progress={runAll.progress} lastError={runAll.lastError} />

      <View className="flex-row gap-2.5">
        <Button
          label="Add screener"
          size="sm"
          className="flex-1"
          leftIcon={<Plus size={16} color={colors.primaryText} />}
          onPress={startCreating}
        />
        <Button
          label="Generate"
          variant="secondary"
          size="sm"
          className="flex-1"
          accessibilityLabel="Generate screeners with AI"
          leftIcon={<Sparkles size={15} color={colors.link} />}
          onPress={() => setGenerating(true)}
        />
      </View>

      {customQuery.isPending ? (
        <Section title="Custom screeners" className="mt-6">
          <ListSkeleton rows={2} />
        </Section>
      ) : customQuery.error && customs.length === 0 ? (
        <Section title="Custom screeners" className="mt-6">
          <InlineError
            what="custom screeners"
            error={customQuery.error}
            onRetry={() => void customQuery.refetch()}
          />
        </Section>
      ) : customs.length > 0 ? (
        <Section title="Custom screeners" note="Shared library" className="mt-6">
          <ListCard>
            {customs.map((screener, index) => (
              <View key={screener.id}>
                {index > 0 ? <RowDivider /> : null}
                <ScreenerRow
                  title={screener.name}
                  subtitle={`${pluralize(screener.conditions.length, 'condition')} · ${customStatusLine(screener)}`}
                  count={screener.status === 'never-run' ? null : screener.matchCount}
                  tone={screener.status === 'failed' ? 'failed' : 'default'}
                  onPress={() => openCustom(screener.id)}
                />
              </View>
            ))}
          </ListCard>
        </Section>
      ) : null}

      <Section title="Built-in" className="mt-6">
        {builtInQuery.isPending ? (
          <ListSkeleton rows={6} />
        ) : builtInQuery.error && builtIns.length === 0 ? (
          <InlineError
            what="screeners"
            error={builtInQuery.error}
            onRetry={() => void builtInQuery.refetch()}
          />
        ) : builtIns.length === 0 ? (
          <InlineEmpty title="No built-in screens are configured" />
        ) : (
          <ListCard>
            {builtIns.map((screener, index) => (
              <View key={screener.id}>
                {index > 0 ? <RowDivider /> : null}
                <ScreenerRow
                  title={screener.label}
                  subtitle={`${pluralize(screener.conditions.length, 'condition')} · ${screener.timeframe} · ${lastRunLabel(screener.runAt)}`}
                  count={screener.runAt === null ? null : screener.matchCount}
                  onPress={() => openBuiltIn(screener.id)}
                />
              </View>
            ))}
          </ListCard>
        )}
      </Section>

      <Text className="mt-4 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
        Each screen is a standing set of conditions checked by a scheduled server-side scan against
        every stock with enough daily history. A screener finds candidates; a strategy decides what
        to do with them.
      </Text>
      <Text className="mt-4 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Not investment advice — review before acting.
      </Text>

      <GenerateSheet visible={generating} kind="screener" onClose={() => setGenerating(false)} />
    </GroupScreen>
  );
}
