import type { Href } from 'expo-router';

import type { GroupIconName } from '@/components/navigation/GroupIcon';

/** One entry in a group's sub-tab row. `name` is the route file inside the group folder. */
export interface NavItem {
  name: string;
  label: string;
  href: Href;
  /** Shown only to administrators (the web hides these the same way). */
  adminOnly?: boolean;
}

export interface NavGroup {
  /** The bottom-tab route (folder) name under app/(app)/(tabs). */
  route: string;
  label: string;
  /** Compact label for the bottom navigation on narrow phones. */
  tabLabel?: string;
  icon: GroupIconName;
  items: readonly NavItem[];
}

/**
 * The app's two-tier menu, mirroring the web client's NAV_GROUPS
 * (client/src/shared/constants/nav.ts): five groups as bottom tabs, each with its own row
 * of sub-tabs at the top, Groww-style. Markets is a route group so its first item, Today,
 * is the app's home at "/".
 *
 * Deliberately not here — reached from inside a screen, as on the web: a stock
 * (/stock/…), an order ticket, one news article, a strategy's detail, the option chain,
 * an F&O "see more" list, the expiry calendar, broker connections and the
 * recommendation admin panel.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    route: '(markets)',
    label: 'Markets',
    icon: 'markets',
    items: [
      { name: 'index', label: 'Today', href: '/' },
      { name: 'strong-picks', label: 'Strong picks', href: '/strong-picks' },
      { name: 'explore', label: 'Explore', href: '/explore' },
      { name: 'heatmap', label: 'Market heatmap', href: '/heatmap' },
      { name: 'news', label: 'News', href: '/news' },
    ],
  },
  {
    route: 'trade',
    label: 'Trade',
    icon: 'trade',
    items: [
      { name: 'index', label: 'Trade', href: '/trade' },
      { name: 'mstock', label: 'mStock portfolio', href: '/trade/mstock' },
      { name: 'groww', label: 'Groww portfolio', href: '/trade/groww' },
      { name: 'watchlists', label: 'Watchlists', href: '/trade/watchlists' },
      { name: 'paper', label: 'Paper trading', href: '/trade/paper' },
    ],
  },
  {
    route: 'fno',
    label: 'F&O',
    icon: 'fno',
    items: [
      { name: 'index', label: 'Explore', href: '/fno' },
      { name: 'positions', label: 'Positions', href: '/fno/positions' },
      { name: 'orders', label: 'Orders', href: '/fno/orders' },
      { name: 'paper', label: 'Paper trading', href: '/fno/paper' },
    ],
  },
  {
    route: 'intel',
    label: 'Intelligence',
    tabLabel: 'Insights',
    icon: 'intel',
    items: [
      { name: 'index', label: 'Recommendations', href: '/intel' },
      { name: 'strategies', label: 'Strategies', href: '/intel/strategies' },
      { name: 'screeners', label: 'Screeners', href: '/intel/screeners' },
      { name: 'signals', label: 'Signals', href: '/intel/signals' },
      { name: 'live', label: 'Live', href: '/intel/live' },
      { name: 'matrix', label: 'Matrix', href: '/intel/matrix' },
      { name: 'build', label: 'Build', href: '/intel/build' },
    ],
  },
  {
    route: 'settings',
    label: 'Settings',
    icon: 'settings',
    items: [
      { name: 'index', label: 'Preferences', href: '/settings' },
      { name: 'automations', label: 'Automations', href: '/settings/automations' },
      { name: 'admin', label: 'Admin', href: '/settings/admin', adminOnly: true },
    ],
  },
];

export function navGroup(route: string): NavGroup {
  const group = NAV_GROUPS.find((candidate) => candidate.route === route);
  if (!group) throw new Error(`Unknown nav group "${route}"`);
  return group;
}
