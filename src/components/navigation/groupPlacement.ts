import { createContext, useContext } from 'react';

/**
 * True inside a menu group pushed over the tabs (Settings, opened from the app bar). Nothing sits
 * under such a screen, so it pads the bottom safe area itself instead of leaving it to the tab bar.
 */
export const PushedGroupContext = createContext(false);

export function usePushedGroup(): boolean {
  return useContext(PushedGroupContext);
}
