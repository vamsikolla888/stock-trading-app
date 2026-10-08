import { render } from '@testing-library/react-native';
import React from 'react';

import { GroupIcon, type GroupIconName } from '../GroupIcon';
import { NAV_ICON_NAMES, NavIcon } from '../NavIcon';

const GROUPS: GroupIconName[] = ['markets', 'trade', 'fno', 'intel', 'agents', 'settings'];

describe('NavIcon', () => {
  it('draws every glyph in the family', () => {
    expect(NAV_ICON_NAMES.length).toBeGreaterThan(30);
    for (const name of NAV_ICON_NAMES) {
      expect(() => render(<NavIcon name={name} color="#111" duoColor="#0a7" />)).not.toThrow();
    }
  });

  it('gives every menu group a glyph, active or not', () => {
    for (const name of GROUPS) {
      expect(() => render(<GroupIcon name={name} color="#111" focused={false} />)).not.toThrow();
      expect(() =>
        render(<GroupIcon name={name} color="#fff" focused variant="primary" />),
      ).not.toThrow();
    }
  });
});
