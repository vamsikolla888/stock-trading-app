import type { ImageSourcePropType } from 'react-native';

/**
 * Which logo an index wears — the web's lib/indexLogo.ts. Groww's own icon for the six indices
 * it draws one for (the `logo_url` its search returns, saved once onto a white tile so it reads
 * in both themes), else the index's exchange mark, as Groww does (NIFTY NEXT 50 → the NSE logo):
 * an NSE index wears the NSE logo, a BSE index the BSE logo.
 *
 * The bitmaps ship in the app (src/assets/images/index-logos, byte-identical to the web's
 * client/public/index-logos) — no network fetch, so an index row never flashes a placeholder.
 */

export type IndexLogoKey =
  'NIFTY' | 'BANKNIFTY' | 'FINNIFTY' | 'MIDCPNIFTY' | 'SENSEX' | 'BANKEX' | 'NSE' | 'BSE';

const OWN_LOGO = new Set<IndexLogoKey>([
  'NIFTY',
  'BANKNIFTY',
  'FINNIFTY',
  'MIDCPNIFTY',
  'SENSEX',
  'BANKEX',
]);
const BSE_INDICES = new Set(['SENSEX', 'BANKEX', 'SENSEX50']);

/**
 * The logo for an index underlying. Pure. `exchange` (BFO/BSE — the derivative book or the
 * cash venue) settles an unknown BSE index; without it, a name starting "BSE" does.
 */
export function indexLogoKey(underlying: string, exchange?: string | null): IndexLogoKey {
  const u = underlying.trim().toUpperCase();
  if (OWN_LOGO.has(u as IndexLogoKey)) return u as IndexLogoKey;
  const ex = (exchange ?? '').trim().toUpperCase();
  const bse = ex === 'BFO' || ex === 'BSE' || BSE_INDICES.has(u) || u.startsWith('BSE');
  return bse ? 'BSE' : 'NSE';
}

/* Static requires: Metro bundles exactly these eight files, resolved at build time. */
const SOURCES: Readonly<Record<IndexLogoKey, ImageSourcePropType>> = {
  NIFTY: require('../../../assets/images/index-logos/NIFTY.png') as ImageSourcePropType,
  BANKNIFTY: require('../../../assets/images/index-logos/BANKNIFTY.png') as ImageSourcePropType,
  FINNIFTY: require('../../../assets/images/index-logos/FINNIFTY.png') as ImageSourcePropType,
  MIDCPNIFTY: require('../../../assets/images/index-logos/MIDCPNIFTY.png') as ImageSourcePropType,
  SENSEX: require('../../../assets/images/index-logos/SENSEX.png') as ImageSourcePropType,
  BANKEX: require('../../../assets/images/index-logos/BANKEX.png') as ImageSourcePropType,
  NSE: require('../../../assets/images/index-logos/NSE.png') as ImageSourcePropType,
  BSE: require('../../../assets/images/index-logos/BSE.png') as ImageSourcePropType,
};

/** The bundled image for an index underlying — `<Image source={indexLogo('NIFTY')} />`. */
export function indexLogo(underlying: string, exchange?: string | null): ImageSourcePropType {
  return SOURCES[indexLogoKey(underlying, exchange)];
}
