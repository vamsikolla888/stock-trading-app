import { apiClient } from '@/services/api/client';

import type {
  CreateStrategyBody,
  EnqueueBacktestResult,
  GenerationView,
  IndexSummary,
  PairingResult,
  RulesPreview,
  RunStaleResult,
  StartGenerationInput,
  StrategyCatalog,
  StrategyDetail,
  StrategyMatchesResult,
  StrategyPack,
  StrategyRules,
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
  /** A copy with the rules and settings, no results — named "<name> (copy)". */
  async duplicate(id: string): Promise<StrategyDetail> {
    const { data } = await apiClient.post<StrategyDetail>(`${path(id)}/duplicate`);
    return data;
  },
  /**
   * Queues a run. There is no status endpoint any more: the strategy's own `runState` (read
   * with the queue consulted) is the answer, polled on the detail while `active`.
   */
  async runBacktest(id: string): Promise<EnqueueBacktestResult> {
    const { data } = await apiClient.post<EnqueueBacktestResult>(`${path(id)}/backtest`);
    return data;
  },
  /** Every strategy with missing, failed or stale results — at most 30 per call. */
  async runStale(): Promise<RunStaleResult> {
    const { data } = await apiClient.post<RunStaleResult>('/strategies/run-stale');
    return data;
  },
  /** A live check of draft rules — issues, lint and the readback. Pure CPU, never a 422. */
  async preview(rules: unknown, signal?: AbortSignal): Promise<RulesPreview> {
    const { data } = await apiClient.post<RulesPreview>(
      '/strategies/preview',
      { rules },
      { signal },
    );
    return data;
  },
  /** What unsaved rules would buy today (validated — 422 when invalid). */
  async previewMatches(rules: StrategyRules, limit = 25): Promise<StrategyMatchesResult> {
    const { data } = await apiClient.post<StrategyMatchesResult>('/strategies/preview/matches', {
      rules,
      limit,
    });
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
  async generations(limit = 8): Promise<GenerationView[]> {
    const { data } = await apiClient.get<{ generations: GenerationView[] }>(
      '/strategies/generations',
      { params: { limit } },
    );
    return data.generations;
  },
  /** Saves a kept candidate beyond the requested count. Idempotent. */
  async saveCandidate(
    generationId: string,
    index: number,
  ): Promise<{ savedId: string; kind: 'strategy' | 'screener' }> {
    const { data } = await apiClient.post<{ savedId: string; kind: 'strategy' | 'screener' }>(
      `/strategies/generations/${encodeURIComponent(generationId)}/candidates/${index}/save`,
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
  /**
   * Screeners that corroborate the strategy. `explain` is OPT-IN (it spends one AI call with a
   * 20 s ceiling); the deterministic ranking is complete without it.
   */
  async pairing(id: string, explain = false): Promise<PairingResult> {
    const { data } = await apiClient.get<PairingResult>(`${path(id)}/screeners`, {
      params: { explain },
      timeout: explain ? 30_000 : undefined,
    });
    return data;
  },
  /** The index catalogue, for narrowing a universe to one index's constituents. */
  async indices(): Promise<IndexSummary[]> {
    const { data } = await apiClient.get<{ indices: IndexSummary[] }>('/indices');
    return data.indices;
  },
};
