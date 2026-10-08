import { apiClient } from '@/services/api/client';

import { normalizeCompanyProfile } from './lib/normalize';
import type { CompanyProfileResponse } from './types';

/**
 * GET /stocks/:symbolOrIsin/company (server: modules/fundamentals/fundamentals.routes.ts).
 * Read-only — a page view never creates analysis work. A cold cache fetches Groww's page first,
 * which can outlast the default 15 s timeout.
 */
const PROFILE_TIMEOUT_MS = 30_000;

export const companyApi = {
  async profile(
    exchange: 'NSE' | 'BSE',
    symbol: string,
    signal?: AbortSignal,
  ): Promise<CompanyProfileResponse> {
    const { data } = await apiClient.get<unknown>(`/stocks/${encodeURIComponent(symbol)}/company`, {
      params: { exchange },
      timeout: PROFILE_TIMEOUT_MS,
      signal,
    });
    return normalizeCompanyProfile(data);
  },
};
