import React, { memo } from 'react';

import { NavIcon, type NavIconName } from '@/components/navigation/NavIcon';

export type GroupIconName = 'markets' | 'trade' | 'fno' | 'intel' | 'agents' | 'settings';

interface GroupIconProps {
  name: GroupIconName;
  color: string;
  /** The filled plane's colour (the theme accent). Defaults to `color`. */
  duoColor?: string;
  focused: boolean;
  size?: number;
  /**
   * `primary`: the raised Trade button. Its glyph sits on the accent, so the filled plane stays
   * at its resting strength; at full strength it would wash out the white line work.
   */
  variant?: 'tab' | 'primary';
}

/**
 * Each menu group's glyph, from the app's own duotone family (NavIcon), the same drawings the
 * web menu uses for that group's screens.
 */
const GLYPH: Record<GroupIconName, NavIconName> = {
  markets: 'marketsTab',
  trade: 'tradeTab',
  fno: 'candles',
  intel: 'bulb',
  agents: 'robot',
  settings: 'sliders',
};

export const GroupIcon = memo(function GroupIcon({
  name,
  color,
  duoColor,
  focused,
  size = 24,
  variant = 'tab',
}: GroupIconProps) {
  const primary = variant === 'primary';
  return (
    <NavIcon
      name={GLYPH[name]}
      color={color}
      duoColor={duoColor}
      active={focused && !primary}
      size={size}
      strokeWidth={focused ? 1.9 : 1.7}
    />
  );
});
