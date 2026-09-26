import React, { memo } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type GroupIconName = 'markets' | 'trade' | 'fno' | 'intel' | 'settings';

interface GroupIconProps {
  name: GroupIconName;
  color: string;
  focused: boolean;
  size?: number;
}

/**
 * The five main-menu icons, drawn for this app rather than taken from a stock set so the
 * active state can be two-tone: the outline in the tint colour plus a soft fill of the
 * same colour behind it (the way Groww marks its active tab), instead of just a colour
 * swap. 24-unit grid, 1.8 stroke, round caps — matching lucide's weight elsewhere.
 */
export const GroupIcon = memo(function GroupIcon({
  name,
  color,
  focused,
  size = 24,
}: GroupIconProps) {
  const stroke = {
    stroke: color,
    strokeWidth: focused ? 2 : 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  // The fill layer only shows when active, at a low opacity of the tint.
  const fill = { fill: color, fillOpacity: focused ? 0.18 : 0, stroke: 'none' };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'markets' ? (
        <>
          <Path d="M3 17.5l5-5.2 4 3.2 8.5-8.5V20H3z" {...fill} />
          <Path d="M3 17.5l5-5.2 4 3.2 8.5-8.5" {...stroke} />
          <Path d="M15.5 7h5v5" {...stroke} />
          <Path d="M3 20.5h18" {...stroke} />
        </>
      ) : name === 'trade' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...fill} />
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M8 10h8l-2.6-2.6" {...stroke} />
          <Path d="M16 14H8l2.6 2.6" {...stroke} />
        </>
      ) : name === 'fno' ? (
        <>
          <Rect x={5} y={7} width={5} height={9} rx={1.4} {...fill} />
          <Rect x={14} y={5} width={5} height={8} rx={1.4} {...fill} />
          <Path d="M7.5 3.5V7M7.5 16v4.5M16.5 2.5V5M16.5 13v5" {...stroke} />
          <Rect x={5} y={7} width={5} height={9} rx={1.4} {...stroke} />
          <Rect x={14} y={5} width={5} height={8} rx={1.4} {...stroke} />
        </>
      ) : name === 'intel' ? (
        <>
          <Path d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9z" {...fill} />
          <Path d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9z" {...stroke} />
          <Path d="M18 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" {...stroke} />
        </>
      ) : (
        <>
          <Circle cx={15} cy={7} r={2.6} {...fill} />
          <Circle cx={9} cy={17} r={2.6} {...fill} />
          <Path d="M3.5 7h8.9M17.6 7h2.9M3.5 17h2.9M11.6 17h8.9" {...stroke} />
          <Circle cx={15} cy={7} r={2.6} {...stroke} />
          <Circle cx={9} cy={17} r={2.6} {...stroke} />
        </>
      )}
    </Svg>
  );
});
