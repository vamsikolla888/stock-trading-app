import { useWindowDimensions } from 'react-native';

/**
 * iPhone 13/14-class width used as the design baseline for scaling factors.
 * Chosen because most design handoffs target this class of device; adjust if
 * your design source changes.
 */
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

export const breakpoints = {
  sm: 0,
  md: 480,
  lg: 768, // tablets (portrait)
  xl: 1024, // tablets (landscape) / small desktops
} as const;

export type Breakpoint = keyof typeof breakpoints;

export function getBreakpoint(width: number): Breakpoint {
  if (width >= breakpoints.xl) return 'xl';
  if (width >= breakpoints.lg) return 'lg';
  if (width >= breakpoints.md) return 'md';
  return 'sm';
}

/** Horizontal scaling — use for widths, horizontal padding, font sizes. */
export function scaleWidth(size: number, windowWidth: number): number {
  return (windowWidth / BASE_WIDTH) * size;
}

/** Vertical scaling — use for heights, vertical padding/margins. */
export function scaleHeight(size: number, windowHeight: number): number {
  return (windowHeight / BASE_HEIGHT) * size;
}

/** Moderate scaling dampens the effect for a given factor — good for font sizes on tablets. */
export function scaleModerate(size: number, windowWidth: number, factor = 0.5): number {
  return size + (scaleWidth(size, windowWidth) - size) * factor;
}

export interface ResponsiveInfo {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isTablet: boolean;
  isLandscape: boolean;
  scale: (size: number) => number;
  scaleFont: (size: number) => number;
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();
  const breakpoint = getBreakpoint(width);
  const isLandscape = width > height;

  return {
    width,
    height,
    breakpoint,
    isTablet: breakpoint === 'lg' || breakpoint === 'xl',
    isLandscape,
    scale: (size: number) => scaleWidth(size, width),
    scaleFont: (size: number) => scaleModerate(size, width, 0.3),
  };
}
