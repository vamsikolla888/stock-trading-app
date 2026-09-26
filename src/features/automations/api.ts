import { apiClient } from '@/services/api/client';

import type {
  ExecutionDetail,
  ExecutionsPage,
  RunStarted,
  TestWebhookResult,
  UpdateWorkflowConfigInput,
  WorkflowDetail,
  WorkflowsListResult,
} from './types';

const path = (workflowId: string) => `/workflows/${encodeURIComponent(workflowId)}`;

export const workflowsApi = {
  async list(): Promise<WorkflowsListResult> {
    const { data } = await apiClient.get<WorkflowsListResult>('/workflows');
    return data;
  },
  async detail(workflowId: string): Promise<WorkflowDetail> {
    const { data } = await apiClient.get<WorkflowDetail>(path(workflowId));
    return data;
  },
  async updateConfig(workflowId: string, body: UpdateWorkflowConfigInput): Promise<WorkflowDetail> {
    const { data } = await apiClient.patch<WorkflowDetail>(path(workflowId), body);
    return data;
  },
  async setActive(workflowId: string, active: boolean): Promise<WorkflowDetail> {
    const { data } = await apiClient.patch<WorkflowDetail>(`${path(workflowId)}/active`, {
      active,
    });
    return data;
  },
  /** Fires the webhook and returns at once — no execution id yet; poll executions for it. */
  async run(workflowId: string): Promise<RunStarted> {
    const { data } = await apiClient.post<RunStarted>(`${path(workflowId)}/run`, {});
    return data;
  },
  /** Waits for the webhook's own response and returns it inline. */
  async test(workflowId: string): Promise<TestWebhookResult> {
    const { data } = await apiClient.post<TestWebhookResult>(`${path(workflowId)}/test`, {});
    return data;
  },
  async executions(
    workflowId: string,
    limit = 20,
    cursor?: string | null,
  ): Promise<ExecutionsPage> {
    const { data } = await apiClient.get<ExecutionsPage>(`${path(workflowId)}/executions`, {
      params: { limit, ...(cursor ? { cursor } : {}) },
    });
    return data;
  },
  async execution(workflowId: string, executionId: string): Promise<ExecutionDetail> {
    const { data } = await apiClient.get<ExecutionDetail>(
      `${path(workflowId)}/executions/${encodeURIComponent(executionId)}`,
    );
    return data;
  },
  /** n8n has no execution-level retry: this starts a fresh run of the workflow's webhook. */
  async retry(workflowId: string, executionId: string): Promise<RunStarted> {
    const { data } = await apiClient.post<RunStarted>(
      `${path(workflowId)}/executions/${encodeURIComponent(executionId)}/retry`,
    );
    return data;
  },
};
