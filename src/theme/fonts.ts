import { isLoaded } from 'expo-font';
import type { TextStyle } from 'react-native';

/**
 * The brand typeface — Inter, as on the web client (its CSS names a proprietary face first, but
 * Inter is what renders). Brand moments only: the wordmark and the launch screen. Interface text
 * stays on the system font (zero cost, and tuned for tabular numbers).
 *
 * Embedded at BUILD time by the expo-font config plugin (app.config.ts), so there is no runtime
 * load and no network: each file is named after its PostScript name, which is the family name on
 * both platforms. Subset to Latin + ₹ (src/assets/fonts, OFL licence alongside).
 */
export const BRAND_FONTS = {
  /** Inter Display — the optical size drawn for large text: the wordmark. */
  display: 'InterDisplay-SemiBold',
  /** Inter at text size: the line under the wordmark. */
  text: 'Inter-Regular',
} as const;

export type BrandFont = keyof typeof BRAND_FONTS;

/** What the system font uses in a binary built before the fonts were embedded (or on web). */
const FALLBACK_WEIGHT: Record<BrandFont, TextStyle['fontWeight']> = {
  display: '600',
  text: '400',
};

const resolved: Partial<Record<BrandFont, boolean>> = {};

function available(font: BrandFont): boolean {
  if (resolved[font] === undefined) {
    try {
      resolved[font] = isLoaded(BRAND_FONTS[font]);
    } catch {
      resolved[font] = false;
    }
  }
  return resolved[font];
}

/**
 * The text style for a brand font. Asked once per font: an embedded font is there for the life
 * of the binary. A custom family carries its own weight — setting `fontWeight` as well makes
 * Android look for a variant that does not exist — so the weight applies only to the fallback.
 */
export function brandFont(font: BrandFont): TextStyle {
  return available(font)
    ? { fontFamily: BRAND_FONTS[font], fontWeight: 'normal' }
    : { fontWeight: FALLBACK_WEIGHT[font] };
}
