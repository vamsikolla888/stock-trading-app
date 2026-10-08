import { apiClient } from '@/services/api/client';
import { requireFields } from '@/services/api/contract';

import {
  engineOf,
  normalizeDeployment,
  normalizeDetail,
  normalizeList,
  normalizeMine,
  normalizeSquareOff,
} from './lib/normalize';
import type {
  DeployInput,
  Deployment,
  DeploymentDetail,
  DeploymentList,
  DeployTarget,
  MyDeployment,
  SquareOffResult,
} from './types';

// Endpoints (server, read-only reference):
//   swing    server/src/modules/swing-deployments/swing-deploy.routes.ts — mounted at
//            /strategies/:strategyId/deployments and /strategies/house/institutional-breakout-swing/deployments
//   intraday server/src/modules/house-strategies/house-strategy.routes.ts — /strategies/house/bb-midband-5m/deployments
//   mine     server/src/modules/strategies/strategy.routes.ts — GET /strategies/deployments
// Specs: server/src/docs/specs/{strategy,house-strategy}.routes.yaml. A server without these routes
// answers 404 "No route matches", which the client turns into SERVER_OUTDATED.

const WHAT = 'Strategy deployments';

/** The object a payload must be, with the fields every screen reads — or SERVER_OUTDATED. */
function shaped(data: unknown, fields: string[]): Record<string, unknown> {
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  return requireFields(record, fields, WHAT);
}

/** Where a target's deployments live. */
export function deployRoot(target: DeployTarget): string {
  return target.kind === 'strategy'
    ? `/strategies/${encodeURIComponent(target.strategyId)}/deployments`
    : `/strategies/house/${target.key}/deployments`;
}

const one = (target: DeployTarget, id: string) => `${deployRoot(target)}/${encodeURIComponent(id)}`;

/** Every write answers `{ deployment }`; a payload without one is a server we cannot read. */
function written(target: DeployTarget, data: unknown): Deployment {
  const deployment = normalizeDeployment(
    (data as { deployment?: unknown } | null)?.deployment,
    engineOf(target),
  );
  if (!deployment) throw new Error('The server’s answer did not describe the deployment.');
  return deployment;
}

export const deploymentsApi = {
  /** The caller's current daily deployments, every strategy — the Strategies list's chips. */
  async mine(signal?: AbortSignal): Promise<MyDeployment[]> {
    const { data } = await apiClient.get<unknown>('/strategies/deployments', { signal });
    return normalizeMine(shaped(data, ['deployments']));
  },

  /** A strategy's deployments (current first, then recent), its defaults and live readiness. */
  async list(target: DeployTarget, signal?: AbortSignal): Promise<DeploymentList> {
    const { data } = await apiClient.get<unknown>(deployRoot(target), { signal });
    return normalizeList(shaped(data, ['deployments', 'defaults', 'live']), engineOf(target));
  },

  async detail(target: DeployTarget, id: string, signal?: AbortSignal): Promise<DeploymentDetail> {
    const { data } = await apiClient.get<unknown>(one(target, id), { signal });
    const detail = normalizeDetail(shaped(data, ['deployment', 'stats']), engineOf(target));
    if (!detail) throw new Error('The server’s answer did not describe the deployment.');
    return detail;
  },

  /** Deploy to paper or live — or save the settings of the running deployment of that mode. The
   *  server checks the typed phrase, the master switch, Safe Mode, the broker and the caps itself. */
  async deploy(target: DeployTarget, input: DeployInput): Promise<Deployment> {
    const { data } = await apiClient.post<unknown>(deployRoot(target), input);
    return written(target, data);
  },

  /** No new entries; open positions keep their exits. */
  async pause(target: DeployTarget, id: string): Promise<Deployment> {
    const { data } = await apiClient.post<unknown>(`${one(target, id)}/pause`, {});
    return written(target, data);
  },

  async resume(target: DeployTarget, id: string): Promise<Deployment> {
    const { data } = await apiClient.post<unknown>(`${one(target, id)}/resume`, {});
    return written(target, data);
  },

  async stop(target: DeployTarget, id: string, squareOff = true): Promise<Deployment> {
    const { data } = await apiClient.post<unknown>(`${one(target, id)}/stop`, { squareOff });
    return written(target, data);
  },

  /** One position (`symbol`) or every open one. */
  async squareOff(target: DeployTarget, id: string, symbol?: string): Promise<SquareOffResult> {
    const { data } = await apiClient.post<unknown>(
      `${one(target, id)}/square-off`,
      symbol ? { symbol } : {},
    );
    return normalizeSquareOff(data);
  },
};
