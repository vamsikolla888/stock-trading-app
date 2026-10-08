import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { useScreenLayout } from '@/components/layout/responsive';
import { StackScreen } from '@/components/navigation/StackScreen';
import { Skeleton } from '@/components/ui/Skeleton';
import { AdminOnlyNotice } from '@/features/admin/components/AdminState';
import { isAdminDenied } from '@/features/admin/lib/access';
import { AgentsOutdated, Muted } from '@/features/agents/components/Parts';
import { ResearchView } from '@/features/agents/components/ResearchView';
import { useResearchDetail } from '@/features/agents/hooks';
import { mobileHrefFor } from '@/features/agents/lib/links';
import { jobView, requesterLine } from '@/features/agents/lib/view';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { isServerOutdated } from '@/services/api/contract';
import { useAuthStore } from '@/store/authStore';
import { isApiError } from '@/types/api';

/**
 * One web-research run (web: the run pane of /agents/web-research). Admin-only on the server —
 * research spends the platform's one shared AI budget. Polled every few seconds while the run is
 * queued or researching; a finished run is read once.
 */
export default function ResearchJobScreen() {
  const router = useRouter();
  const layout = useScreenLayout();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const params = useLocalSearchParams<{ jobId?: string | string[] }>();
  const jobId = typeof params.jobId === 'string' ? params.jobId : '';
  const detail = useResearchDetail(jobId, isAdmin);
  const data = detail.data;

  const onRefresh = useCallback(() => detail.refetch(), [detail]);

  if (!isAdmin || isAdminDenied(detail.error)) {
    return (
      <StackScreen title="Research">
        <AdminOnlyNotice message="Research runs spend the platform’s shared AI budget, so they are limited to administrators." />
      </StackScreen>
    );
  }

  if (!data) {
    const notFound =
      !jobId ||
      (isApiError(detail.error) && (detail.error.status === 404 || detail.error.status === 422));
    return (
      <StackScreen title="Research" onRefresh={onRefresh}>
        {isServerOutdated(detail.error) ? (
          <AgentsOutdated what="Web research and the other Agents screens" />
        ) : notFound ? (
          <InlineEmpty
            title="Research run not found"
            message="The AI service no longer has this run, or the link is incomplete."
            action={{
              label: 'Open web research',
              onPress: () => router.replace('/agents/web-research'),
            }}
          />
        ) : detail.error ? (
          <InlineError
            what="this research run"
            error={detail.error}
            onRetry={() => void detail.refetch()}
          />
        ) : (
          <View className="gap-4" accessibilityLabel="Loading the research run">
            <Skeleton height={80} rounded="lg" />
            <Skeleton height={160} rounded="lg" />
            <Skeleton height={120} rounded="lg" />
          </View>
        )}
      </StackScreen>
    );
  }

  const status = jobView(data.status);
  const requesterHref = mobileHrefFor(data.requester.to);

  return (
    <StackScreen title="Research" subtitle={status.label} onRefresh={onRefresh} fill>
      <View className="mb-4 gap-2">
        <StatusPill tone={status.tone} label={status.label} />
        <Text
          selectable
          accessibilityRole="header"
          className="text-[19px] font-bold leading-6 text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.3 }}
        >
          {data.query || 'Untitled question'}
        </Text>
        {requesterHref ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Asked by ${requesterLine(data.requester)}. Open it`}
            hitSlop={6}
            onPress={() => router.push(requesterHref)}
            className="self-start active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              {requesterLine(data.requester)}
            </Text>
          </Pressable>
        ) : (
          <Muted>{requesterLine(data.requester)}</Muted>
        )}
      </View>
      <ResearchView detail={data} wide={layout.columns >= 2} />
    </StackScreen>
  );
}
