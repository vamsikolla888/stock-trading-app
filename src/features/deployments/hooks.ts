import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { useSafeModeRefusalSync } from '@/features/account/hooks';
import { useAuthStore } from '@/store/authStore';

import { deploymentsApi } from './api';
import { detailPollMs } from './lib/view';
import type { DeployInput, DeploymentDetail, DeployTarget } from './types';

/** Detail polls every 30 s while it runs and the market is open (lib/view.ts detailPollMs). */
const POLL_MS = 30_000;
/** A deployment's detail carries hundreds of rows: dropped soon after the screen closes, so it
 *  stays out of the persisted cache every cold start parses. */
const DETAIL_GC_MS = 10 * 60_000;

const targetId = (target: DeployTarget) =>
  target.kind === 'strategy' ? `strategy:${target.strategyId}` : target.key;

export const deploymentKeys = {
  all: ['deployments'] as const,
  mine: (userId: string | undefined) => ['deployments', 'mine', userId ?? ''] as const,
  target: (target: DeployTarget) => ['deployments', targetId(target)] as const,
  list: (target: DeployTarget) => ['deployments', targetId(target), 'list'] as const,
  detail: (target: DeployTarget, id: string) =>
    ['deployments', targetId(target), 'detail', id] as const,
};

/** The platform strategies' summaries carry the caller's deployments (same key as the web's). */
const HOUSE_KEY = ['strategies', 'house'] as const;

const validTarget = (target: DeployTarget) =>
  target.kind === 'platform' || target.strategyId.trim() !== '';

/** The caller's current daily deployments, every strategy — the Strategies list's PAPER / LIVE
 *  chips (GET /strategies/deployments). Keyed by user, so another account never sees them. */
export function useMyDeployments() {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: deploymentKeys.mine(userId),
    queryFn: ({ signal }) => deploymentsApi.mine(signal),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}

/** A strategy's deployments with the live readiness block. Not polled: the detail is. */
export function useDeploymentList(target: DeployTarget, enabled = true) {
  return useQuery({
    queryKey: deploymentKeys.list(target),
    queryFn: ({ signal }) => deploymentsApi.list(target, signal),
    enabled: enabled && validTarget(target),
    staleTime: 30_000,
  });
}

/** One deployment, refreshed every 30 s while it runs, the market is open and it is on screen. */
export function useDeploymentDetail(target: DeployTarget, id: string | null) {
  const focused = useIsFocused();
  return useQuery<DeploymentDetail>({
    queryKey: deploymentKeys.detail(target, id ?? ''),
    queryFn: ({ signal }) => deploymentsApi.detail(target, id!, signal),
    enabled: Boolean(id) && validTarget(target),
    staleTime: 15_000,
    gcTime: DETAIL_GC_MS,
    refetchInterval: (query) => detailPollMs(query.state.data?.deployment, new Date(), POLL_MS),
    subscribed: focused,
  });
}

/** After any change: the target's list and details, the Strategies chips, the platform cards. */
export function refreshDeployments(client: QueryClient, target: DeployTarget) {
  void client.invalidateQueries({ queryKey: deploymentKeys.target(target) });
  void client.invalidateQueries({ queryKey: ['deployments', 'mine'] });
  void client.invalidateQueries({ queryKey: HOUSE_KEY });
}

export function useDeploy(target: DeployTarget) {
  const client = useQueryClient();
  const syncSafeMode = useSafeModeRefusalSync();
  return useMutation({
    mutationFn: (input: DeployInput) => deploymentsApi.deploy(target, input),
    onSuccess: () => refreshDeployments(client, target),
    onError: syncSafeMode,
  });
}

export type DeploymentAction =
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'stop' }
  | { kind: 'square-off'; symbol?: string };

/** Pause / resume / stop (always squaring off, as the web does) / square off one or all. */
export function useDeploymentAction(target: DeployTarget) {
  const client = useQueryClient();
  const syncSafeMode = useSafeModeRefusalSync();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: DeploymentAction }) => {
      if (action.kind === 'pause')
        return { kind: 'deployment' as const, value: await deploymentsApi.pause(target, id) };
      if (action.kind === 'resume')
        return { kind: 'deployment' as const, value: await deploymentsApi.resume(target, id) };
      if (action.kind === 'stop')
        return { kind: 'deployment' as const, value: await deploymentsApi.stop(target, id, true) };
      return {
        kind: 'square-off' as const,
        value: await deploymentsApi.squareOff(target, id, action.symbol),
      };
    },
    onSuccess: () => refreshDeployments(client, target),
    onError: syncSafeMode,
  });
}
