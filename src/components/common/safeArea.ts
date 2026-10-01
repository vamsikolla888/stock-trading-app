import type { Edges } from 'react-native-safe-area-context';

/**
 * The safe-area edges a full screen pads by: every one, always. Top and bottom clear the notch,
 * Dynamic Island and home indicator in portrait; left and right clear them once the phone is
 * turned (in portrait they are zero, so they cost nothing). A screen that hides the status bar
 * still keeps the top edge — the camera housing is still there.
 */
export const SCREEN_EDGES: Edges = ['top', 'right', 'bottom', 'left'];

/** A screen whose bottom belongs to something else (the tab bar, a keyboard-pinned bar). */
export const SCREEN_EDGES_NO_BOTTOM: Edges = ['top', 'right', 'left'];
