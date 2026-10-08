// The stock page's company profile — GET /stocks/:symbolOrIsin/company (server: modules/
// fundamentals/company-profile.parse.ts and company-profile.service.ts; web mirror:
// stock-analysis/services/companyProfile.service.ts). Every amount is ₹ CRORE; every holding and
// return is a percent. Parsed by lib/normalize.ts before a screen reads it.

export interface CompanyRatios {
  marketCapCr: number | null;
  roe: number | null;
  peTtm: number | null;
  epsTtm: number | null;
  pb: number | null;
  dividendYield: number | null;
  industryPe: number | null;
  bookValue: number | null;
  debtToEquity: number | null;
  faceValue: number | null;
}

/** Yearly: period "2026" (FY ending March 2026), label "FY26". Quarterly: period "2026-06-30",
 *  label "Jun '26". Oldest first. */
export interface StatementPoint {
  period: string;
  label: string;
  value: number;
}

export interface StatementSeries {
  yearly: StatementPoint[];
  quarterly: StatementPoint[];
}

export interface FinancialStatements {
  revenue: StatementSeries;
  profit: StatementSeries;
  /** Yearly only — Groww publishes no quarterly net worth. */
  netWorth: StatementSeries;
}

export interface ShareholdingPeriod {
  periodEnd: string;
  label: string;
  promoters: number | null;
  foreignInstitutions: number | null;
  domesticInstitutions: number | null;
  /** Null when only the five-way summary was available. */
  mutualFunds: number | null;
  otherDomestic: number | null;
  retail: number | null;
  promoterSplit: {
    individual: number | null;
    government: number | null;
    corporation: number | null;
  } | null;
}

export interface ProfilePeer {
  name: string;
  isin: string | null;
  exchange: 'NSE' | 'BSE' | null;
  symbol: string | null;
  marketCapCr: number | null;
  pe: number | null;
  pb: number | null;
  yearHigh: number | null;
  yearLow: number | null;
}

export interface ProfileFund {
  name: string;
  /** Share of the FUND's assets in this stock — not the fund's share of the company. */
  aumPercent: number | null;
  return1y: number | null;
  return3y: number | null;
  return5y: number | null;
}

export interface CompanyAbout {
  summary: string | null;
  industry: string | null;
  parentCompany: string | null;
  headquarters: string | null;
  website: string | null;
  ceo: string | null;
  managingDirector: string | null;
  foundedYear: string | null;
  fnoEnabled: boolean | null;
}

export interface CompanyProfile {
  isin: string;
  companyName: string | null;
  /** 'snapshot' = Groww was unreachable; the analysis engine's stored copy answered. */
  source: 'groww' | 'snapshot';
  fetchedAt: string | null;
  about: CompanyAbout;
  ratios: CompanyRatios;
  financials: { consolidated: FinancialStatements | null; standalone: FinancialStatements | null };
  /** Newest first. */
  shareholding: ShareholdingPeriod[];
  peers: ProfilePeer[];
  mutualFunds: ProfileFund[];
}

export interface CompanyProfileResponse {
  /** not_applicable: an ETF, fund or debenture; unavailable: no Groww page and no snapshot. */
  state: 'ready' | 'not_applicable' | 'delisted' | 'unavailable';
  message: string | null;
  profile: CompanyProfile | null;
  stale: boolean;
}
