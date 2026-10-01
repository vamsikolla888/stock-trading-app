import { LayoutAnimation } from 'react-native';

/**
 * Eases the next layout change — a row expanding, a section collapsing — instead of letting it
 * jump: what moves slides, what appears or goes fades. Call it just before the state change.
 * Runs natively (no per-frame JS) and only for that one commit.
 */
export function animateNextLayout(): void {
  LayoutAnimation.configureNext({
    duration: 220,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'easeInEaseOut' },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });
}
