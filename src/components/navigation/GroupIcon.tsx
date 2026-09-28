import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right';
import ChartCandlestick from 'lucide-react-native/icons/chart-candlestick';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Sparkles from 'lucide-react-native/icons/sparkles';
import TrendingUp from 'lucide-react-native/icons/trending-up';
import React, { memo } from 'react';

import type { IconComponent } from '@/components/ui/icon';

export type GroupIconName = 'markets' | 'trade' | 'fno' | 'intel' | 'settings';

interface GroupIconProps {
  name: GroupIconName;
  color: string;
  focused: boolean;
  size?: number;
}

const ICONS: Record<GroupIconName, IconComponent> = {
  markets: TrendingUp,
  trade: ArrowLeftRight,
  fno: ChartCandlestick,
  intel: Sparkles,
  settings: SlidersHorizontal,
};

/** Semantic Lucide icons for the five primary destinations. */
export const GroupIcon = memo(function GroupIcon({
  name,
  color,
  focused,
  size = 24,
}: GroupIconProps) {
  const Icon = ICONS[name];
  return <Icon size={size} color={color} strokeWidth={focused ? 2.35 : 1.8} />;
});
