import type {
  CompanyProfile,
  CompanyProfileResponse,
  FinancialStatements,
  ProfileFund,
  ProfilePeer,
  ShareholdingPeriod,
  StatementPoint,
  StatementSeries,
} from '../types';

/**
 * GET /stocks/:symbol/company is parsed from a third-party page (Groww), cached for days and, when
 * Groww is unreachable, rebuilt from an older snapshot with fewer fields. So it is read once here
 * into a shape where every field exists: arrays are arrays, numbers are finite or null.
 */

type Json = Record<string, unknown>;

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const isObj = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function points(value: unknown): StatementPoint[] {
  return list(value).flatMap((item) => {
    const raw = obj(item);
    const period = text(raw.period);
    const v = num(raw.value);
    return period && v != null ? [{ period, label: text(raw.label) ?? period, value: v }] : [];
  });
}

function series(value: unknown): StatementSeries {
  const raw = obj(value);
  return { yearly: points(raw.yearly), quarterly: points(raw.quarterly) };
}

function statements(value: unknown): FinancialStatements | null {
  if (!isObj(value)) return null;
  const s = {
    revenue: series(value.revenue),
    profit: series(value.profit),
    netWorth: series(value.netWorth),
  };
  const empty = [s.revenue, s.profit, s.netWorth].every(
    (line) => line.yearly.length === 0 && line.quarterly.length === 0,
  );
  return empty ? null : s;
}

function shareholding(value: unknown): ShareholdingPeriod | null {
  const raw = obj(value);
  const periodEnd = text(raw.periodEnd);
  if (!periodEnd) return null;
  const split = isObj(raw.promoterSplit) ? raw.promoterSplit : null;
  return {
    periodEnd,
    label: text(raw.label) ?? periodEnd,
    promoters: num(raw.promoters),
    foreignInstitutions: num(raw.foreignInstitutions),
    domesticInstitutions: num(raw.domesticInstitutions),
    mutualFunds: num(raw.mutualFunds),
    otherDomestic: num(raw.otherDomestic),
    retail: num(raw.retail),
    promoterSplit: split
      ? {
          individual: num(split.individual),
          government: num(split.government),
          corporation: num(split.corporation),
        }
      : null,
  };
}

function peer(value: unknown): ProfilePeer | null {
  const raw = obj(value);
  const name = text(raw.name);
  if (!name) return null;
  return {
    name,
    isin: text(raw.isin),
    exchange: raw.exchange === 'NSE' || raw.exchange === 'BSE' ? raw.exchange : null,
    symbol: text(raw.symbol),
    marketCapCr: num(raw.marketCapCr),
    pe: num(raw.pe),
    pb: num(raw.pb),
    yearHigh: num(raw.yearHigh),
    yearLow: num(raw.yearLow),
  };
}

function fund(value: unknown): ProfileFund | null {
  const raw = obj(value);
  const name = text(raw.name);
  if (!name) return null;
  return {
    name,
    aumPercent: num(raw.aumPercent),
    return1y: num(raw.return1y),
    return3y: num(raw.return3y),
    return5y: num(raw.return5y),
  };
}

const notNull = <T>(value: T | null): value is T => value !== null;

function profile(value: unknown): CompanyProfile | null {
  if (!isObj(value)) return null;
  const about = obj(value.about);
  const ratios = obj(value.ratios);
  const financials = obj(value.financials);
  return {
    isin: text(value.isin) ?? '',
    companyName: text(value.companyName),
    source: value.source === 'snapshot' ? 'snapshot' : 'groww',
    fetchedAt: text(value.fetchedAt),
    about: {
      summary: text(about.summary),
      industry: text(about.industry),
      parentCompany: text(about.parentCompany),
      headquarters: text(about.headquarters),
      website: text(about.website),
      ceo: text(about.ceo),
      managingDirector: text(about.managingDirector),
      foundedYear: text(about.foundedYear) ?? num(about.foundedYear)?.toString() ?? null,
      fnoEnabled: typeof about.fnoEnabled === 'boolean' ? about.fnoEnabled : null,
    },
    ratios: {
      marketCapCr: num(ratios.marketCapCr),
      roe: num(ratios.roe),
      peTtm: num(ratios.peTtm),
      epsTtm: num(ratios.epsTtm),
      pb: num(ratios.pb),
      dividendYield: num(ratios.dividendYield),
      industryPe: num(ratios.industryPe),
      bookValue: num(ratios.bookValue),
      debtToEquity: num(ratios.debtToEquity),
      faceValue: num(ratios.faceValue),
    },
    financials: {
      consolidated: statements(financials.consolidated),
      standalone: statements(financials.standalone),
    },
    shareholding: list(value.shareholding).map(shareholding).filter(notNull),
    peers: list(value.peers).map(peer).filter(notNull),
    mutualFunds: list(value.mutualFunds).map(fund).filter(notNull),
  };
}

const STATES = ['ready', 'not_applicable', 'delisted', 'unavailable'] as const;

export function normalizeCompanyProfile(payload: unknown): CompanyProfileResponse {
  const raw = obj(payload);
  const parsed = profile(raw.profile);
  const state = (STATES as readonly string[]).includes(raw.state as string)
    ? (raw.state as CompanyProfileResponse['state'])
    : parsed
      ? 'ready'
      : 'unavailable';
  return {
    state,
    message: text(raw.message),
    profile: state === 'ready' ? parsed : null,
    stale: raw.stale === true,
  };
}
