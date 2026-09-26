/// <reference types="node" />

import fs from 'fs';
import path from 'path';

import { NAV_GROUPS, navGroup } from '@/config/navigation';

const TABS_DIR = path.join(__dirname, '..', '..', 'app', '(app)', '(tabs)');

describe('NAV_GROUPS', () => {
  it('mirrors the web menu: five groups in order', () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual([
      'Markets',
      'Trade',
      'F&O',
      'Intelligence',
      'Settings',
    ]);
  });

  it('lists the sub-menus the web shows, in the same order', () => {
    const labels = Object.fromEntries(
      NAV_GROUPS.map((group) => [group.label, group.items.map((item) => item.label)]),
    );
    expect(labels).toEqual({
      Markets: ['Today', 'Strong picks', 'Explore', 'Market heatmap', 'News'],
      Trade: ['Trade', 'mStock portfolio', 'Groww portfolio', 'Watchlists', 'Paper trading'],
      'F&O': ['Explore', 'Positions', 'Orders', 'Paper trading'],
      Intelligence: [
        'Recommendations',
        'Strategies',
        'Screeners',
        'Signals',
        'Live',
        'Matrix',
        'Build',
      ],
      Settings: ['Preferences', 'Automations', 'Admin'],
    });
  });

  it('has a route file and layout behind every group and sub-menu', () => {
    for (const group of NAV_GROUPS) {
      const dir = path.join(TABS_DIR, group.route);
      expect(fs.existsSync(path.join(dir, '_layout.tsx'))).toBe(true);
      for (const item of group.items) {
        expect({
          route: `${group.route}/${item.name}`,
          exists: fs.existsSync(path.join(dir, `${item.name}.tsx`)),
        }).toEqual({ route: `${group.route}/${item.name}`, exists: true });
      }
    }
  });

  it('hides only the admin console from non-admins', () => {
    const adminOnly = NAV_GROUPS.flatMap((group) => group.items.filter((item) => item.adminOnly));
    expect(adminOnly.map((item) => item.label)).toEqual(['Admin']);
  });

  it('looks groups up by route and rejects unknown ones', () => {
    expect(navGroup('fno').label).toBe('F&O');
    expect(() => navGroup('nope')).toThrow('Unknown nav group');
  });
});
