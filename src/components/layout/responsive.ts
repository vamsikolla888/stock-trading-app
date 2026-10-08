import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * How a screen lays itself out at a given usable width — the app's "fill the window" rule (the
 * web owner's standing rule, 2026-09-30): never a narrow column with dead bands beside it. As the
 * window widens a screen ADDS columns — more tiles per row, panels side by side — instead of
 * stretching one column edge to edge. Pure, so the breakpoints are tested.
 */
export interface ScreenLayout {
  /** Usable width: the window minus the side safe areas (a turned phone's notch). */
  width: number;
  /** Side padding of the page. */
  gutter: number;
  /** Width left for content between the gutters. */
  content: number;
  /** Columns for panels: 1 on a phone, 2 on a tablet or a turned phone, 3 on a wide window. */
  columns: 1 | 2 | 3;
  /** Headline number tiles per row. */
  kpiColumns: 2 | 3 | 4 | 6;
  compact: boolean;
}

export function layoutFor(width: number): ScreenLayout {
  const gutter = width >= 1100 ? 32 : width >= 700 ? 24 : 20;
  const content = Math.max(0, width - gutter * 2);
  return {
    width,
    gutter,
    content,
    columns: content >= 1040 ? 3 : content >= 640 ? 2 : 1,
    kpiColumns: content >= 1040 ? 6 : content >= 760 ? 4 : content >= 520 ? 3 : 2,
    compact: content < 640,
  };
}

export function useScreenLayout(): ScreenLayout {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return layoutFor(Math.max(0, width - insets.left - insets.right));
}
