import React, { memo, type ReactNode } from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

/**
 * The menu's own icon family, the same drawings as the web client's NavIcon
 * (client/src/shared/components/NavIcon.tsx): one glyph per kind of screen, on a 24px grid with
 * a rounded line, plus a second, FILLED plane in the accent colour. The filled plane is what makes
 * them read as one custom family rather than a stock icon pack. It sits faintly at rest and
 * deepens on the active item.
 *
 * Line work is `currentColor` (the Svg's `color`), so a glyph takes its item's colour: muted at
 * rest, the accent when active, white on the raised Trade button.
 */

interface Glyph {
  /** Filled plane, drawn first, under the line work. */
  duo?: ReactNode;
  line: ReactNode;
}

const dot = (cx: number, cy: number) => (
  <Circle cx={cx} cy={cy} r={0.95} fill="currentColor" stroke="none" />
);

const GLYPHS = {
  /* ── Markets ── */
  marketsTab: {
    line: (
      <>
        <Path d="M4 19.5h16" />
        <Path d="M5 16l4-4 3.2 2.6L19 7" />
        <Path d="M15.5 7H19v3.5" />
      </>
    ),
  },
  today: {
    duo: <Rect x={3.5} y={5} width={17} height={4.5} rx={2} />,
    line: (
      <>
        <Rect x={3.5} y={5} width={17} height={15.5} rx={3} />
        <Path d="M8 3v4M16 3v4M3.5 9.5h17" />
        <Path d="M7.5 17l3-3.2 2.6 1.8 3.9-4.1" />
      </>
    ),
  },
  dailyBrief: {
    duo: <Circle cx={16.5} cy={16.5} r={4.5} />,
    line: (
      <>
        <Path d="M11 21H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8l4 4v3" />
        <Path d="M14.5 3v4h4M8 9h4.5M8 12.5h3" />
        <Circle cx={16.5} cy={16.5} r={4.5} />
        <Path d="M16.5 14.6v2.1l1.4 1" />
      </>
    ),
  },
  strongPicks: {
    duo: (
      <Path d="M11.5 5l2.12 5.09 5.49.44-4.19 3.58 1.28 5.36-4.7-2.87-4.7 2.87 1.28-5.36-4.19-3.58 5.49-.44z" />
    ),
    line: (
      <>
        <Path d="M11.5 5l2.12 5.09 5.49.44-4.19 3.58 1.28 5.36-4.7-2.87-4.7 2.87 1.28-5.36-4.19-3.58 5.49-.44z" />
        <Path d="M19.5 2.5v4M17.5 4.5h4" />
      </>
    ),
  },
  explore: {
    duo: <Path d="M15.5 8.5l-2 5-5 2 2-5z" />,
    line: (
      <>
        <Circle cx={12} cy={12} r={9} />
        <Path d="M15.5 8.5l-2 5-5 2 2-5z" />
      </>
    ),
  },
  ipo: {
    duo: <Path d="M12 2.8c2.9 1.8 4.3 5 4.3 8.9V16H7.7v-4.3c0-3.9 1.4-7.1 4.3-8.9z" />,
    line: (
      <>
        <Path d="M12 2.8c2.9 1.8 4.3 5 4.3 8.9V16H7.7v-4.3c0-3.9 1.4-7.1 4.3-8.9z" />
        <Circle cx={12} cy={9.3} r={1.8} />
        <Path d="M7.7 12.3L5 15.1V17h2.7M16.3 12.3l2.7 2.8V17h-2.7" />
        <Path d="M10.3 18.5c.3 1.3.9 2.2 1.7 2.7.8-.5 1.4-1.4 1.7-2.7" />
      </>
    ),
  },
  heatmap: {
    duo: <Rect x={3} y={3.5} width={8} height={11.5} rx={2.5} />,
    line: (
      <>
        <Rect x={3} y={3.5} width={18} height={17} rx={2.5} />
        <Path d="M11 3.5v17M11 12.5h10M16 12.5v8M3 15h8" />
      </>
    ),
  },
  news: {
    duo: <Rect x={7.5} y={8} width={6.5} height={3} rx={0.9} />,
    line: (
      <>
        <Path d="M4 5h13.5v13.5a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" />
        <Path d="M17.5 9h2a1.5 1.5 0 0 1 1.5 1.5v8a2 2 0 0 1-2 2" />
        <Rect x={7.5} y={8} width={6.5} height={3} rx={0.9} />
        <Path d="M7.5 14.5h6.5M7.5 17.5h4" />
      </>
    ),
  },

  /* ── Trade ── */
  tradeTab: {
    line: (
      <>
        <Path d="M5 8h13M15 5l3 3-3 3" />
        <Path d="M19 16H6M9 13l-3 3 3 3" />
      </>
    ),
  },
  trade: {
    duo: <Circle cx={12} cy={12} r={9} />,
    line: <Path d="M7 9.5h10l-3-3M17 14.5H7l3 3" />,
  },
  wallet: {
    duo: <Path d="M21 11.3h-4a2.2 2.2 0 0 0 0 4.4h4z" />,
    line: (
      <>
        <Rect x={3} y={6.5} width={18} height={13.5} rx={2.5} />
        <Path d="M5 6.5l9.6-3.2a1.5 1.5 0 0 1 2 1.4v1.8" />
        <Path d="M21 11.3h-4a2.2 2.2 0 0 0 0 4.4h4" />
        {dot(17.2, 13.5)}
      </>
    ),
  },
  pie: {
    duo: <Path d="M15 2.6a8.5 8.5 0 0 1 6.4 6.4H15z" />,
    line: (
      <>
        <Path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z" />
        <Path d="M15 2.6a8.5 8.5 0 0 1 6.4 6.4H15z" />
      </>
    ),
  },
  stack: {
    duo: <Rect x={3} y={9} width={15} height={11} rx={2.5} />,
    line: (
      <>
        <Rect x={3} y={9} width={15} height={11} rx={2.5} />
        <Path d="M6.5 6h11.5A2.5 2.5 0 0 1 20.5 8.5v8" />
        <Path d="M6.5 14.5h4.5" />
      </>
    ),
  },
  watch: {
    duo: <Circle cx={12} cy={12} r={3.2} />,
    line: (
      <>
        <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <Circle cx={12} cy={12} r={3.2} />
      </>
    ),
  },
  paperPlane: {
    duo: <Path d="M21 3L10 13l2.6 7.2z" />,
    line: (
      <>
        <Path d="M21 3L3 10.4l7 2.6 2.6 7.2z" />
        <Path d="M21 3L10 13" />
      </>
    ),
  },

  /* ── F&O ── */
  candles: {
    duo: <Rect x={14.5} y={5.5} width={4} height={10} rx={1} />,
    line: (
      <>
        <Rect x={5.5} y={8} width={4} height={8} rx={1} />
        <Path d="M7.5 4.5V8M7.5 16v3.5" />
        <Rect x={14.5} y={5.5} width={4} height={10} rx={1} />
        <Path d="M16.5 3v2.5M16.5 15.5V21" />
      </>
    ),
  },
  coins: {
    duo: <Ellipse cx={12} cy={6.5} rx={7} ry={3} />,
    line: (
      <>
        <Ellipse cx={12} cy={6.5} rx={7} ry={3} />
        <Path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
        <Path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      </>
    ),
  },
  receipt: {
    duo: <Rect x={6} y={3} width={12} height={3.6} />,
    line: (
      <>
        <Path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
        <Path d="M9 9h6M9 12.5h6M9 16h3.5" />
      </>
    ),
  },
  flask: {
    duo: <Path d="M7.9 14h8.2l2.5 4.3a1.2 1.2 0 0 1-1 1.7H6.4a1.2 1.2 0 0 1-1-1.7z" />,
    line: (
      <>
        <Path d="M9.5 3h5M10.5 3v6L5.2 18a2 2 0 0 0 1.7 3h10.2a2 2 0 0 0 1.7-3L13.5 9V3" />
        {dot(12.6, 16.6)}
      </>
    ),
  },
  ladder: {
    duo: <Rect x={7} y={9.5} width={10} height={5} />,
    line: <Path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10" />,
  },
  calendarClock: {
    duo: <Circle cx={17} cy={17} r={4.3} />,
    line: (
      <>
        <Path d="M20.5 11V7.5a3 3 0 0 0-3-3h-11a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3H11" />
        <Path d="M8 2.5v4M16 2.5v4M3.5 9.5h17" />
        <Circle cx={17} cy={17} r={4.3} />
        <Path d="M17 15.1V17l1.3 1" />
      </>
    ),
  },

  /* ── Intelligence ── */
  bulb: {
    duo: (
      <Path d="M8.6 14.4A6 6 0 1 1 15.4 14.4c-.7.6-1.1 1.4-1.1 2.3v.5H9.7v-.5c0-.9-.4-1.7-1.1-2.3z" />
    ),
    line: (
      <>
        <Path d="M8.6 14.4A6 6 0 1 1 15.4 14.4c-.7.6-1.1 1.4-1.1 2.3v.5H9.7v-.5c0-.9-.4-1.7-1.1-2.3z" />
        <Path d="M9.8 20.5h4.4M3 9.5h1.4M19.6 9.5H21M5.4 3.9l1 1M18.6 3.9l-1 1" />
      </>
    ),
  },
  lensChart: {
    duo: <Circle cx={10.5} cy={10.5} r={6.5} />,
    line: (
      <>
        <Circle cx={10.5} cy={10.5} r={6.5} />
        <Path d="M15.3 15.3l5.2 5.2M8 12.7V11M10.5 12.7V8.3M13 12.7V9.6" />
      </>
    ),
  },
  route: {
    duo: <Circle cx={6} cy={18} r={2.6} />,
    line: (
      <>
        <Circle cx={6} cy={18} r={2.6} />
        <Path d="M8.6 18h6.4a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h4.5" />
        <Path d="M17 10V2.8h4.2l-1.5 2.1 1.5 2.1H17" />
      </>
    ),
  },
  funnel: {
    duo: <Path d="M3.5 4.5h17L18 7.5H6z" />,
    line: <Path d="M3.5 4.5h17l-6.5 7.8v6.2l-4 2v-8.2z" />,
  },
  broadcast: {
    duo: <Circle cx={12} cy={12} r={3.4} />,
    line: (
      <>
        <Circle cx={12} cy={12} r={1.9} />
        <Path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 18.6a9.3 9.3 0 0 1 0-13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" />
      </>
    ),
  },
  monitor: {
    duo: <Rect x={2.5} y={4} width={19} height={13.5} rx={2.5} />,
    line: (
      <>
        <Rect x={2.5} y={4} width={19} height={13.5} rx={2.5} />
        <Path d="M9 21h6M12 17.5V21" />
        <Path d="M6 11h2.5l1.5-3 2.5 6 1.5-3h4" />
      </>
    ),
  },
  matrix: {
    duo: <Rect x={9.2} y={9.2} width={5.6} height={5.6} />,
    line: (
      <>
        <Rect x={3.5} y={3.5} width={17} height={17} rx={3} />
        <Path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
      </>
    ),
  },
  cube: {
    duo: <Path d="M12 2.8l8 4.6-8 4.6-8-4.6z" />,
    line: (
      <>
        <Path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z" />
        <Path d="M4 7.4l8 4.6 8-4.6M12 12v9.2" />
      </>
    ),
  },

  /* ── Agents ── */
  robot: {
    duo: <Rect x={4.5} y={7.5} width={15} height={11.5} rx={3.5} />,
    line: (
      <>
        <Rect x={4.5} y={7.5} width={15} height={11.5} rx={3.5} />
        <Path d="M12 7.5V4.6M2.5 12v3M21.5 12v3M9.5 12.2v1.6M14.5 12.2v1.6M10 16.4h4" />
        <Circle cx={12} cy={3.6} r={1} />
      </>
    ),
  },
  chip: {
    duo: <Rect x={5.5} y={5.5} width={13} height={13} rx={2.5} />,
    line: (
      <>
        <Rect x={5.5} y={5.5} width={13} height={13} rx={2.5} />
        <Path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3" />
        <Path d="M8.6 14.6l2.4-2.4 1.8 1.4 2.6-3.1" />
      </>
    ),
  },
  clipboardCheck: {
    duo: <Rect x={9} y={3} width={6} height={3.4} rx={1} />,
    line: (
      <>
        <Path d="M15 4.5h1.5A2.5 2.5 0 0 1 19 7v11.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18.5V7a2.5 2.5 0 0 1 2.5-2.5H9" />
        <Rect x={9} y={3} width={6} height={3.4} rx={1} />
        <Path d="M9 13.6l2.2 2.2 4-4.4" />
      </>
    ),
  },
  globe: {
    duo: <Path d="M12 3c2 2.4 3 5.4 3 9s-1 6.6-3 9c-2-2.4-3-5.4-3-9s1-6.6 3-9z" />,
    line: (
      <>
        <Circle cx={12} cy={12} r={9} />
        <Path d="M3 12h18M12 3c2 2.4 3 5.4 3 9s-1 6.6-3 9c-2-2.4-3-5.4-3-9s1-6.6 3-9z" />
      </>
    ),
  },
  book: {
    duo: <Path d="M12 6.5C10.3 5 7.8 4.5 4 4.5v13c3.8 0 6.3.5 8 2z" />,
    line: (
      <>
        <Path d="M12 6.5C10.3 5 7.8 4.5 4 4.5v13c3.8 0 6.3.5 8 2 1.7-1.5 4.2-2 8-2v-13c-3.8 0-6.3.5-8 2z" />
        <Path d="M12 6.5v13" />
      </>
    ),
  },

  /* ── Settings ── */
  sliders: {
    duo: (
      <>
        <Circle cx={14} cy={7} r={2.2} />
        <Circle cx={9} cy={12} r={2.2} />
        <Circle cx={16} cy={17} r={2.2} />
      </>
    ),
    line: (
      <>
        <Path d="M4 7h7.8M16.2 7H20M4 12h2.8M11.2 12H20M4 17h9.8M18.2 17H20" />
        <Circle cx={14} cy={7} r={2.2} />
        <Circle cx={9} cy={12} r={2.2} />
        <Circle cx={16} cy={17} r={2.2} />
      </>
    ),
  },
  flow: {
    duo: <Rect x={3} y={3.5} width={6.5} height={6.5} rx={1.8} />,
    line: (
      <>
        <Rect x={3} y={3.5} width={6.5} height={6.5} rx={1.8} />
        <Rect x={14.5} y={14} width={6.5} height={6.5} rx={1.8} />
        <Circle cx={17.75} cy={6.75} r={3.25} />
        <Path d="M9.5 6.75h5M17.75 10v4M6.25 10v4.5a2.75 2.75 0 0 0 2.75 2.75h5.5" />
      </>
    ),
  },
  server: {
    duo: <Rect x={3.5} y={4} width={17} height={6.5} rx={2} />,
    line: (
      <>
        <Rect x={3.5} y={4} width={17} height={6.5} rx={2} />
        <Rect x={3.5} y={13.5} width={17} height={6.5} rx={2} />
        <Path d="M11 7.25h6M11 16.75h6" />
        {dot(7, 7.25)}
        {dot(7, 16.75)}
      </>
    ),
  },
  plug: {
    duo: <Path d="M6.5 6.5h11V10a5.5 5.5 0 0 1-11 0z" />,
    line: (
      <>
        <Path d="M9 2.5v4M15 2.5v4" />
        <Path d="M6.5 6.5h11V10a5.5 5.5 0 0 1-11 0z" />
        <Path d="M12 15.5v3a2.5 2.5 0 0 0 2.5 2.5H17" />
      </>
    ),
  },
  shieldCheck: {
    duo: <Path d="M12 2.8l7.5 3v5.4c0 4.6-3.1 8.1-7.5 10-4.4-1.9-7.5-5.4-7.5-10V5.8z" />,
    line: (
      <>
        <Path d="M12 2.8l7.5 3v5.4c0 4.6-3.1 8.1-7.5 10-4.4-1.9-7.5-5.4-7.5-10V5.8z" />
        <Path d="M8.8 12l2.2 2.2 4.4-4.6" />
      </>
    ),
  },

  /* ── Drill-in destinations ── */
  apps: {
    duo: <Rect x={13.5} y={3.5} width={7} height={7} rx={2} />,
    line: (
      <>
        <Rect x={3.5} y={3.5} width={7} height={7} rx={2} />
        <Rect x={13.5} y={3.5} width={7} height={7} rx={2} />
        <Rect x={3.5} y={13.5} width={7} height={7} rx={2} />
        <Rect x={13.5} y={13.5} width={7} height={7} rx={2} />
      </>
    ),
  },
  flame: {
    duo: (
      <Path d="M12 21a3 3 0 0 1-3-3c0-1.8 1.6-2.8 2-4.6 1.6 1 2.6 2.4 2.8 3.6.4-.3.7-.8.8-1.4.9.8 1.4 1.8 1.4 2.4a3 3 0 0 1-3 3z" />
    ),
    line: (
      <Path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-3.6 3-5.6 3.8-9.5 2.2 1.4 3.6 3.6 3.9 6 .9-.8 1.5-2 1.6-3.3 2 1.6 3.7 4.1 3.7 6.8 0 3.4-2.6 6-6.5 6z" />
    ),
  },
  movers: {
    duo: <Rect x={4.5} y={3} width={5} height={18} rx={2.5} />,
    line: <Path d="M7 20V4M3.8 7.2L7 4l3.2 3.2M17 4v16M13.8 16.8L17 20l3.2-3.2" />,
  },
  chartLine: {
    duo: <Path d="M7.5 15l3.5-4 3 2.5 4.5-5.5V20H7.5z" />,
    line: <Path d="M4 4v16h16M7.5 15l3.5-4 3 2.5 4.5-5.5" />,
  },
} satisfies Record<string, Glyph>;

export type NavIconName = keyof typeof GLYPHS;

/** Every glyph name, for tests and pickers. */
export const NAV_ICON_NAMES = Object.keys(GLYPHS) as NavIconName[];

/** How strong the filled plane is: faint at rest, deeper on the active item (as on the web). */
const DUO_OPACITY = { rest: 0.26, active: 0.42 } as const;

interface NavIconProps {
  name: NavIconName;
  /** The line colour. */
  color: string;
  /** The filled plane's colour; usually the theme accent. Defaults to the line colour. */
  duoColor?: string;
  active?: boolean;
  size?: number;
  strokeWidth?: number;
}

export const NavIcon = memo(function NavIcon({
  name,
  color,
  duoColor,
  active = false,
  size = 22,
  strokeWidth = 1.7,
}: NavIconProps) {
  const glyph: Glyph = GLYPHS[name];
  return (
    // Decorative: the button that holds a glyph carries the label.
    <Svg width={size} height={size} viewBox="0 0 24 24" color={color}>
      {glyph.duo ? (
        <G
          fill={duoColor ?? color}
          fillOpacity={active ? DUO_OPACITY.active : DUO_OPACITY.rest}
          stroke="none"
        >
          {glyph.duo}
        </G>
      ) : null}
      <G
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph.line}
      </G>
    </Svg>
  );
});
