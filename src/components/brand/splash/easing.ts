import { Easing } from 'react-native-reanimated';

/**
 * The splash's curves, shared so that things meant to move as one do — the count under the logo
 * reads exactly the share of the rise graph that is drawn. All are worklets (bezierFn).
 */

/** Arrivals: quick to start, long soft landing. */
export const EASE_OUT = Easing.bezierFn(0.22, 1, 0.36, 1);
/** The rise graph and everything travelling with it: a slow start, a slow finish. */
export const EASE_GRAPH = Easing.bezierFn(0.65, 0, 0.35, 1);
/** Fades and the dissolve. */
export const EASE_SOFT = Easing.bezierFn(0.4, 0, 0.2, 1);
/** Overshoots a touch and settles back — the tile's give as it springs in. */
export const BACK_OUT = Easing.bezierFn(0.34, 1.45, 0.64, 1);
