import { apiClient } from '@/services/api/client';

import type {
  BacktestJobStatus,
  CreateStrategyBody,
  EnqueueBacktestResult,
  GenerationView,
  IndexSummary,
  PairingResult,
  StartGenerationInput,
  StrategyCatalog,
  StrategyDetail,
  StrategyMatchesResult,
  StrategyPack,
  StrategySummary,
  StrategyTemplate,
  UpdateStrategyBody,
} from './types';

const path = (id: string) => `/strategies/${encodeURIComponent(id)}`;

/** Same endpoints as the web client's strategies.service.ts. */
export const strategiesApi = {
  async list(): Promise<StrategySummary[]> {
    const { data } = await apiClient.get<{ strategies: StrategySummary[] }>('/strategies');
    return data.strategies;
  },
  async templates(): Promise<StrategyTemplate[]> {
    const { data } = await apiClient.get<{ templates: StrategyTemplate[] }>(
      '/strategies/templates',
    );
    return data.templates;
  },
  /** The builder's whole vocabulary — static server-side. */
  async catalog(): Promise<StrategyCatalog> {
    const { data } = await apiClient.get<StrategyCatalog>('/strategies/catalog');
    return data;
  },
  async packs(): Promise<StrategyPack[]> {
    const { data } = await apiClient.get<{ packs: StrategyPack[] }>('/strategies/packs');
    return data.packs;
  },
  async detail(id: string): Promise<StrategyDetail> {
    const { data } = await apiClient.get<StrategyDetail>(path(id));
    return data;
  },
  async create(body: CreateStrategyBody): Promise<StrategyDetail> {
    const { data } = await apiClient.post<StrategyDetail>('/strategies', body);
    return data;
  },
  async update(id: string, body: UpdateStrategyBody): Promise<StrategyDetail> {
    const { data } = await apiClient.patch<StrategyDetail>(path(id), body);
    return data;
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(path(id));
  },
  async runBacktest(id: string): Promise<EnqueueBacktestResult> {
    const { data } = await apiClient.post<EnqueueBacktestResult>(`${path(id)}/backtest`);
    return data;
  },
  async backtestStatus(id: string): Promise<BacktestJobStatus> {
    const { data } = await apiClient.get<BacktestJobStatus>(`${path(id)}/backtest-status`);
    return data;
  },
  async startGeneration(body: StartGenerationInput): Promise<{ generationId: string }> {
    const { data } = await apiClient.post<{ generationId: string }>('/strategies/generate', body);
    return data;
  },
  async generation(id: string): Promise<GenerationView> {
    const { data } = await apiClient.get<GenerationView>(
      `/strategies/generations/${encodeURIComponent(id)}`,
    );
    return data;
  },
  /** What the entry accepts on the latest bar — a multi-second server pass. */
  async matches(id: string, limit = 25): Promise<StrategyMatchesResult> {
    const { data } = await apiClient.get<StrategyMatchesResult>(`${path(id)}/matches`, {
      params: { limit },
    });
    return data;
  },
  /** Screeners that corroborate the strategy; `explain` spends one AI call server-side. */
  async pairing(id: string): Promise<PairingResult> {
    const { data } = await apiClient.get<PairingResult>(`${path(id)}/screeners`, {
      params: { explain: true },
    });
    return data;
  },
  /** The index catalogue, for narrowing a universe to one index's constituents. */
  async indices(): Promise<IndexSummary[]> {
    const { data } = await apiClient.get<{ indices: IndexSummary[] }>('/indices');
    return data.indices;
  },
};
