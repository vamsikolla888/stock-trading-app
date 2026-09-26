import { useRouter, type Href } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import Bot from 'lucide-react-native/icons/bot';
import ChartCandlestick from 'lucide-react-native/icons/chart-candlestick';
import FlaskConical from 'lucide-react-native/icons/flask-conical';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Star from 'lucide-react-native/icons/star';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { IconComponent } from '@/components/ui/icon';
import { IconTile, type IconTone } from '@/components/ui/IconTile';
import { Section } from '@/components/ui/Section';

interface Tool {
  label: string;
  href: Href;
  Icon: IconComponent;
  tone: IconTone;
}

/**
 * Entry points into the rest of the menu. Tones vary by tile so the grid scans at a glance;
 * the two amber tiles sit on opposite corners.
 */
export const TOOLS: readonly Tool[] = [
  { label: 'Strong picks', href: '/strong-picks', Icon: Star, tone: 'amber' },
  { label: 'Heatmap', href: '/heatmap', Icon: LayoutGrid, tone: 'teal' },
  { label: 'Screeners', href: '/intel/screeners', Icon: SlidersHorizontal, tone: 'blue' },
  { label: 'Signals', href: '/intel/signals', Icon: Sparkles, tone: 'violet' },
  { label: 'F&O', href: '/fno', Icon: ChartCandlestick, tone: 'rose' },
  { label: 'Paper trade', href: '/trade/paper', Icon: FlaskConical, tone: 'green' },
  { label: 'Strategies', href: '/intel/strategies', Icon: Bot, tone: 'slate' },
  { label: 'Alerts', href: '/alerts', Icon: Bell, tone: 'amber' },
];

/** Groww's "Products & tools": a 4-column grid of entry points into the rest of the app. */
export function ProductsAndTools() {
  const router = useRouter();

  return (
    <Section title="Products & tools">
      <View className="flex-row flex-wrap gap-y-4">
        {TOOLS.map(({ label, href, Icon, tone }) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => router.push(href)}
            className="w-1/4 items-center gap-2 active:opacity-70"
          >
            <IconTile Icon={Icon} tone={tone} size="lg" />
            <Text
              className="px-0.5 text-center text-xs font-medium text-ink dark:text-ink-dark"
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Section>
  );
}
