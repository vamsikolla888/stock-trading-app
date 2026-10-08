import { useQuery } from '@tanstack/react-query';

import { companyApi } from './api';

export const companyKeys = {
  all: ['stocks', 'company'] as const,
  profile: (exchange: string, symbol: string) => ['stocks', 'company', exchange, symbol] as const,
};

/**
 * The company's profile from Groww (ratios, statements, shareholding, peers, funds, about). One
 * fetch per listing, shared by every company card on the stock page: the figures are quarterly
 * and the server caches them for hours, so a return visit inside ten minutes asks nothing.
 */
export function useCompanyProfile(exchange: 'NSE' | 'BSE', symbol: string, enabled = true) {
  return useQuery({
    queryKey: companyKeys.profile(exchange, symbol),
    queryFn: ({ signal }) => companyApi.profile(exchange, symbol, signal),
    enabled: enabled && symbol.length > 0,
    staleTime: 10 * 60_000,
  });
}
