/// <reference types="node" />

import fs from 'fs';
import path from 'path';

import { appConfig } from '@/config/app';
import { NAV_GROUPS, TAB_GROUPS, navGroup } from '@/config/navigation';

import { getHeaderTitle } from '@/lib/navigation/headerTitle';

const APP_DIR = path.join(__dirname, '..', '..', 'app', '(app)');
const TABS_DIR = path.join(APP_DIR, '(tabs)');

describe('NAV_GROUPS', () => {
  it('mirrors the web menu: six groups in order', () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual([
      'Markets',
      'Trade',
      'F&O',
      'Intelligence',
      'Agents',
      'Settings',
    ]);
  });

  it('keeps five bottom tabs; Settings opens from the app bar', () => {
    expect(TAB_GROUPS.map((group) => group.label)).toEqual([
      'Markets',
      'Trade',
      'F&O',
      'Intelligence',
      'Agents',
    ]);
    expect(navGroup('settings').placement).toBe('header');
  });

  it('lists the sub-menus the web shows, in the same order', () => {
    const labels = Object.fromEntries(
      NAV_GROUPS.map((group) => [group.label, group.items.map((item) => item.label)]),
    );
    expect(labels).toEqual({
      Markets: [
        'Today',
        'Daily Brief',
        'Strong picks',
        'Explore',
        'IPOs',
        'Market heatmap',
        'News',
      ],
      Trade: ['Trade', 'mStock portfolio', 'Groww portfolio', 'Watchlists', 'Paper trading'],
      'F&O': ['Explore', 'Positions', 'Orders', 'Paper trading'],
      Intelligence: [
        'Recommendations',
        'Stock analysis',
        'Strategies',
        'Scanner',
        'Signals',
        'Live',
        'Matrix',
        'Build',
      ],
      Agents: ['Overview', 'Index trading', 'Portfolio review', 'Web research', 'Docs'],
      Settings: ['Preferences', 'Automations', 'Admin'],
    });
  });

  it('has a route file and layout behind every group and sub-menu', () => {
    for (const group of NAV_GROUPS) {
      const dir = path.join(group.placement === 'header' ? APP_DIR : TABS_DIR, group.route);
      expect(fs.existsSync(path.join(dir, '_layout.tsx'))).toBe(true);
      for (const item of group.items) {
        expect({
          route: `${group.route}/${item.name}`,
          exists: fs.existsSync(path.join(dir, `${item.name}.tsx`)),
        }).toEqual({ route: `${group.route}/${item.name}`, exists: true });
      }
    }
  });

  it('hides the admin-only screens from non-admins, as the server does', () => {
    const adminOnly = NAV_GROUPS.flatMap((group) => group.items.filter((item) => item.adminOnly));
    expect(adminOnly.map((item) => item.label)).toEqual(['Index trading', 'Web research', 'Admin']);
  });

  it('looks groups up by route and rejects unknown ones', () => {
    expect(navGroup('fno').label).toBe('F&O');
    expect(() => navGroup('nope')).toThrow('Unknown nav group');
  });
});

describe('getHeaderTitle', () => {
  it('maps groups and segments to the expected header titles', () => {
    expect(getHeaderTitle('(markets)')).toBe(appConfig.name);
    expect(getHeaderTitle('markets')).toBe(appConfig.name);
    expect(getHeaderTitle('trade')).toBe('Trade');
    expect(getHeaderTitle('fno')).toBe('F&O');
    expect(getHeaderTitle('intel')).toBe(appConfig.name);
    expect(getHeaderTitle('agents')).toBe('Agents');
    expect(getHeaderTitle('settings')).toBe(appConfig.name);

    expect(getHeaderTitle(undefined, ['(app)', '(tabs)', '(markets)'])).toBe(appConfig.name);
    expect(getHeaderTitle(undefined, ['(app)', '(tabs)', 'trade'])).toBe('Trade');
    expect(getHeaderTitle(undefined, ['(app)', '(tabs)', 'fno'])).toBe('F&O');
    expect(getHeaderTitle(undefined, ['(app)', '(tabs)', 'intel'])).toBe(appConfig.name);
    expect(getHeaderTitle(undefined, ['(app)', '(tabs)', 'agents'])).toBe('Agents');
    expect(getHeaderTitle(undefined, ['(app)', 'settings'])).toBe(appConfig.name);
  });
});
