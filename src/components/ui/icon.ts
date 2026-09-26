import type { ComponentType } from 'react';

/** Any per-file lucide icon (`lucide-react-native/icons/*`) — typed locally so nothing imports the barrel. */
export type IconComponent = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;
