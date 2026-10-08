import { apiClient } from '@/services/api/client';

import {
  normalizeAskResult,
  normalizePortfolioReview,
  normalizeResearchDetail,
  normalizeResearchPage,
  normalizeRunResult,
  normalizeSummary,
} from './lib/normalize';
import type {
  AgentsSummary,
  PortfolioReview,
  ResearchDetail,
  ResearchPage,
  ResearchRequest,
  ReviewRunResult,
} from './types';

// Endpoints: server/src/modules/agents/agents.routes.ts and
// server/src/modules/holding-review/holding-review.routes.ts (specs: docs/specs/agents.routes.yaml,
// holding-review.routes.yaml). Both route groups are new in this server version — on an older
// server they answer "No route matches", which the client turns into SERVER_OUTDATED.

/** The hub, the portfolio read and the research proxy each wait on the ai-service. */
const AI_TIMEOUT_MS = 25_000;
const RESEARCH_PAGE = 50;

export const agentsApi = {
  /** Every user; the admin-only parts (index trading, web research) are null for others. */
  async summary(signal?: AbortSignal): Promise<AgentsSummary> {
    const { data } = await apiClient.get<unknown>('/agents/summary', {
      signal,
      timeout: AI_TIMEOUT_MS,
    });
    return normalizeSummary(data);
  },

  /** The caller's own Groww holdings and the verdict in force for each. */
  async portfolioReview(signal?: AbortSignal): Promise<PortfolioReview> {
    const { data } = await apiClient.get<unknown>('/agents/portfolio-review', {
      signal,
      timeout: AI_TIMEOUT_MS,
    });
    return normalizePortfolioReview(data);
  },

  /** The hourly schedule's switch. Turning on is refused (503) while the AI service is not ready. */
  async setPortfolioReviewEnabled(enabled: boolean): Promise<void> {
    await apiClient.put('/portfolio/holding-reviews/settings', { enabled });
  },

  /** Submits every holding now, outside the schedule; collecting / pending ones are skipped. */
  async runPortfolioReview(): Promise<ReviewRunResult> {
    const { data } = await apiClient.post<unknown>(
      '/portfolio/holding-reviews/run',
      {},
      { timeout: 60_000 },
    );
    return normalizeRunResult(data);
  },

  /** Admin. Newest first; `before` is the previous page's `nextBefore`. */
  async researchList(before: string | null, signal?: AbortSignal): Promise<ResearchPage> {
    const { data } = await apiClient.get<unknown>('/agents/web-research', {
      params: { limit: RESEARCH_PAGE, ...(before ? { before } : {}) },
      signal,
      timeout: AI_TIMEOUT_MS,
    });
    return normalizeResearchPage(data);
  },

  /** Admin. The run, its verified result once COMPLETED, and the pages read. */
  async researchDetail(jobId: string, signal?: AbortSignal): Promise<ResearchDetail> {
    const { data } = await apiClient.get<unknown>(
      `/agents/web-research/${encodeURIComponent(jobId)}`,
      { signal, timeout: AI_TIMEOUT_MS },
    );
    return normalizeResearchDetail(data, jobId);
  },

  /** Admin. Starts a research job (202); the answer arrives on the job's own screen. */
  async askResearch(input: ResearchRequest): Promise<{ jobId: string; status: string }> {
    const { data } = await apiClient.post<unknown>('/agents/web-research', input, {
      timeout: AI_TIMEOUT_MS,
    });
    return normalizeAskResult(data);
  },
};
