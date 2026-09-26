// Mirrored from the web client: features/n8n-workflows/services/workflows.service.ts
// (server: modules/n8n/n8n.routes.ts, mounted at /workflows behind requireAuth).

export type WorkflowTriggerType = 'webhook' | 'cron' | 'manual';
export type ExecutionStatus = 'running' | 'success' | 'error';
export type TriggeredBy = 'manual' | 'webhook' | 'cron' | 'retry';

export interface WorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  triggerType: WorkflowTriggerType;
  tags: string[];
  lastRunAt: string | null;
  lastRunStatus: ExecutionStatus | null;
}

export interface WorkflowEnvVar {
  key: string;
  secret: boolean;
  /** Null for a secret once set — its value never comes back down, only `hasValue`. */
  value: string | null;
  hasValue: boolean;
}

export interface WorkflowDetail extends WorkflowSummary {
  notes: string;
  webhookUrl: string | null;
  cronSummary: string | null;
  envVars: WorkflowEnvVar[];
}

export interface WorkflowsSummary {
  total: number;
  active: number;
  failedLast24h: number;
  lastSuccessAt: string | null;
}

export interface WorkflowsListResult {
  workflows: WorkflowSummary[];
  summary: WorkflowsSummary;
}

export interface TestWebhookResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface ExecutionSummary {
  id: string;
  status: ExecutionStatus;
  triggeredBy: TriggeredBy;
  startedAt: string;
  finishedAt: string | null;
}

export interface ExecutionStage {
  key: string;
  label: string;
  status: 'PENDING' | 'OK' | 'FAILED';
  detail: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ExecutionDetail extends ExecutionSummary {
  workflowId: string;
  stages: ExecutionStage[];
  input: unknown;
  output: unknown;
  errorMessage: string | null;
}

export interface ExecutionsPage {
  items: ExecutionSummary[];
  nextCursor: string | null;
}

export interface RunStarted {
  workflowId: string;
  status: 'running';
}

export interface UpdateWorkflowConfigInput {
  notes?: string;
  envVars?: { key: string; secret: boolean; value?: string }[];
}
