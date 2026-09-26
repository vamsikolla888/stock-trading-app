import { apiClient } from '@/services/api/client';

import type {
  AllScansStatus,
  CustomScreener,
  CustomScreenerInput,
  EnqueueScanResult,
  RunAllScansResult,
  ScanStatus,
  ScreenerDetail,
} from './types';

const customPath = (id: string) => `/screeners/custom/${encodeURIComponent(id)}`;

/** Same endpoints as the web client's screeners.service.ts. */
export const screenersApi = {
  /** A built-in screener with its matches (the server caps `limit` at 100). */
  async builtIn(id: string, limit = 100): Promise<ScreenerDetail> {
    const { data } = await apiClient.get<ScreenerDetail>(`/screeners/${encodeURIComponent(id)}`, {
      params: { limit },
    });
    return data;
  },
  async customList(): Promise<CustomScreener[]> {
    const { data } = await apiClient.get<{ screeners: CustomScreener[] }>('/screeners/custom');
    return data.screeners;
  },
  async custom(id: string, limit = 200): Promise<CustomScreener> {
    const { data } = await apiClient.get<CustomScreener>(customPath(id), { params: { limit } });
    return data;
  },
  async create(body: CustomScreenerInput): Promise<CustomScreener> {
    const { data } = await apiClient.post<CustomScreener>('/screeners/custom', body);
    return data;
  },
  async update(id: string, body: Partial<CustomScreenerInput>): Promise<CustomScreener> {
    const { data } = await apiClient.patch<CustomScreener>(customPath(id), body);
    return data;
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(customPath(id));
  },
  async runCustomScan(id: string): Promise<EnqueueScanResult> {
    const { data } = await apiClient.post<EnqueueScanResult>(`${customPath(id)}/scan`);
    return data;
  },
  async customScanStatus(id: string): Promise<ScanStatus> {
    const { data } = await apiClient.get<ScanStatus>(`${customPath(id)}/scan-status`);
    return data;
  },
  /** The built-in scan plus every screener the caller owns. */
  async runAll(): Promise<RunAllScansResult> {
    const { data } = await apiClient.post<RunAllScansResult>('/screeners/custom/scan-all');
    return data;
  },
  async allScansStatus(): Promise<AllScansStatus> {
    const { data } = await apiClient.get<AllScansStatus>('/screeners/custom/scan-all-status');
    return data;
  },
};
