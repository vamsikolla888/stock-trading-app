import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { workflowsApi } from './api';
import type {
  ExecutionSummary,
  UpdateWorkflowConfigInput,
  WorkflowDetail,
  WorkflowsListResult,
} from './types';

export const workflowKeys = {
  all: ['workflows'] as const,
  list: ['workflows', 'list'] as const,
  detail: (id: string) => ['workflows', 'detail', id] as const,
  executions: (id: string) => ['workflows', 'detail', id, 'executions'] as const,
  execution: (id: string, executionId: string) =>
    ['workflows', 'detail', id, 'execution', executionId] as const,
};

/** Poll faster while a run the user started is being watched; otherwise refresh on focus. */
export function useWorkflows(options: { pollMs?: number | false } = {}) {
  return useQuery({
    queryKey: workflowKeys.list,
    queryFn: workflowsApi.list,
    staleTime: 30_000,
    refetchInterval: options.pollMs ?? false,
  });
}

export function useWorkflow(id: string | undefined) {
  return useQuery({
    queryKey: workflowKeys.detail(id ?? ''),
    queryFn: () => workflowsApi.detail(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

interface ExecutionsPollOptions {
  pollMs?: number;
  /**
   * Poll while this says so about the loaded runs — e.g. until a run started from the app
   * shows up finished. Decided on each fetch, so polling stops the moment it's answered.
   */
  pollWhile?: (items: readonly ExecutionSummary[]) => boolean;
}

export function useWorkflowExecutions(id: string | undefined, options: ExecutionsPollOptions = {}) {
  const { pollMs, pollWhile } = options;
  return useInfiniteQuery({
    queryKey: workflowKeys.executions(id ?? ''),
    queryFn: ({ pageParam }) => workflowsApi.executions(id!, 20, pageParam),
    enabled: Boolean(id),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 15_000,
    refetchInterval: (query) => {
      if (!pollMs || !pollWhile) return false;
      const items = query.state.data?.pages.flatMap((page) => page.items) ?? [];
      return pollWhile(items) ? pollMs : false;
    },
  });
}

/**
 * True once `deadline` (epoch ms) has passed; false again as soon as a new deadline is set.
 * The flip happens in a timer callback, so no render reads the clock.
 */
export function useDeadlinePassed(deadline: number | null): boolean {
  const [passed, setPassed] = useState<number | null>(null);

  useEffect(() => {
    if (deadline === null) return undefined;
    const timer = setTimeout(() => setPassed(deadline), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [deadline]);

  return deadline !== null && passed === deadline;
}

export function useWorkflowExecution(id: string | undefined, executionId: string | null) {
  return useQuery({
    queryKey: workflowKeys.execution(id ?? '', executionId ?? ''),
    queryFn: () => workflowsApi.execution(id!, executionId!),
    enabled: Boolean(id && executionId),
    staleTime: 60_000,
  });
}

/** Writes a fresh detail into both caches, so the list row and the header agree at once. */
function useSyncWorkflow() {
  const queryClient = useQueryClient();
  return (updated: WorkflowDetail) => {
    queryClient.setQueryData(workflowKeys.detail(updated.id), updated);
    queryClient.setQueryData<WorkflowsListResult>(workflowKeys.list, (old) =>
      old
        ? {
            ...old,
            workflows: old.workflows.map((workflow) =>
              workflow.id === updated.id ? { ...workflow, active: updated.active } : workflow,
            ),
          }
        : old,
    );
    void queryClient.invalidateQueries({ queryKey: workflowKeys.list });
  };
}

export function useSetWorkflowActive() {
  const sync = useSyncWorkflow();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      workflowsApi.setActive(id, active),
    onSuccess: sync,
  });
}

export function useUpdateWorkflowConfig() {
  const sync = useSyncWorkflow();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateWorkflowConfigInput }) =>
      workflowsApi.updateConfig(id, body),
    onSuccess: sync,
  });
}

export function useRunWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowsApi.run(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.executions(id) });
    },
  });
}

export function useTestWorkflow() {
  return useMutation({ mutationFn: (id: string) => workflowsApi.test(id) });
}

export function useRetryExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, executionId }: { id: string; executionId: string }) =>
      workflowsApi.retry(id, executionId),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.executions(id) });
    },
  });
}
