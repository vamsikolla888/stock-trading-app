export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radii = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 22,
  full: 9999,
} as const;

export const typography = {
  // Platform system fonts (SF Pro / Roboto): zero download, zero startup cost, and
  // already tuned for tabular numerals — the fastest-loading choice for a numbers app.
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
  },
  lineHeight: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 26,
    xl: 28,
    '2xl': 32,
    '3xl': 36,
    '4xl': 40,
  },
} as const;

/**
 * Brand palette shared with the web client (stocks-advisory-platform/client
 * tokens.css, "The Ledger" pass). Green has three roles, never one hex for everything:
 * the vivid fill (#00b386, ~2.7:1 on white — icons/markers only), a button-safe step
 * that clears AA with white labels (#00805e), and a text-safe step for links and
 * gains (#007854). Red follows the same split.
 */
export const palette = {
  white: '#ffffff',
  black: '#000000',

  green: '#00b386',
  greenStrong: '#00805e',
  greenText: '#007854',
  greenWash: '#e4f7f0',

  red: '#eb5b3c',
  redText: '#c0392a',
  redWash: '#fdeee9',

  amberText: '#8a6212',
  amberWash: '#fdf3e0',

  blue: '#2e5fa3',
  blueWash: '#ebf1fa',

  ink: '#171a1f',
  inkMuted: '#4a4e5a',
  inkFaint: '#6a6f7b',
  line: '#eceef2',
  lineStrong: '#d7dae1',
  canvas: '#f7f8fa',

  // Dark theme counterparts (web client [data-theme='dark'] block).
  darkCanvas: '#111417',
  darkSurface: '#1a1e23',
  darkSunk: '#171b1f',
  darkInk: '#eceff3',
  darkInkMuted: '#a2a8b3',
  darkInkFaint: '#828896',
  darkLine: '#252a30',
  darkLineStrong: '#3a4149',
  darkGreenStrong: '#00a97e',
  darkGreenText: '#00d09c',
  darkGreenWash: '#0c2a22',
  darkRedText: '#ff8062',
  darkRedWash: '#2c1712',
  darkAmberText: '#f5bc57',
  darkAmberWash: '#2a2210',
  darkBlue: '#8ab0e6',
  darkBlueWash: '#151e2b',
} as const;

export interface ColorTokens {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSunk: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  textInverted: string;
  /** Vivid brand fill — icons, markers, focus rings. Not for text on white. */
  accent: string;
  accentWash: string;
  /** Button background — AA with white label text. */
  primary: string;
  primaryText: string;
  /** Links and brand-coloured text — AA on the page surface. */
  link: string;
  success: string;
  successWash: string;
  danger: string;
  dangerWash: string;
  warning: string;
  warningWash: string;
  info: string;
  infoWash: string;
  gain: string;
  loss: string;
  overlay: string;
}

export const lightColors: ColorTokens = {
  background: palette.white,
  surface: palette.white,
  surfaceElevated: palette.white,
  surfaceSunk: palette.canvas,
  border: palette.line,
  borderStrong: palette.lineStrong,
  text: palette.ink,
  textMuted: palette.inkMuted,
  textFaint: palette.inkFaint,
  textInverted: palette.white,
  accent: palette.green,
  accentWash: palette.greenWash,
  primary: palette.greenStrong,
  primaryText: palette.white,
  link: palette.greenText,
  success: palette.greenText,
  successWash: palette.greenWash,
  danger: palette.redText,
  dangerWash: palette.redWash,
  warning: palette.amberText,
  warningWash: palette.amberWash,
  info: palette.blue,
  infoWash: palette.blueWash,
  gain: palette.greenText,
  loss: palette.redText,
  overlay: 'rgba(16, 24, 22, 0.5)',
};

export const darkColors: ColorTokens = {
  background: palette.darkCanvas,
  surface: palette.darkSurface,
  surfaceElevated: palette.darkSurface,
  surfaceSunk: palette.darkSunk,
  border: palette.darkLine,
  borderStrong: palette.darkLineStrong,
  text: palette.darkInk,
  textMuted: palette.darkInkMuted,
  textFaint: palette.darkInkFaint,
  textInverted: palette.ink,
  accent: palette.green,
  accentWash: palette.darkGreenWash,
  primary: palette.darkGreenStrong,
  primaryText: palette.white,
  link: palette.darkGreenText,
  success: palette.darkGreenText,
  successWash: palette.darkGreenWash,
  danger: palette.darkRedText,
  dangerWash: palette.darkRedWash,
  warning: palette.darkAmberText,
  warningWash: palette.darkAmberWash,
  info: palette.darkBlue,
  infoWash: palette.darkBlueWash,
  gain: palette.darkGreenText,
  loss: palette.darkRedText,
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const shadows = {
  sm: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#18221f',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  lg: {
    shadowColor: '#007a5d',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

export type ThemeColors = ColorTokens;
