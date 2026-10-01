import React, { memo, useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';

interface LiveFlashProps {
  /** The live quote's change counter; each new value flashes once. Undefined: no live price. */
  seq: number | undefined;
  dir: 'up' | 'down' | null | undefined;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * A price that just moved: a brief green or red wash behind it, gone in under a second — the
 * cue a trading screen gives that a number is live, without moving the layout. Runs on the UI
 * thread (one shared value per cell); never on the first live price (that is arrival, not
 * movement) and not at all with Reduce Motion on.
 */
export const LiveFlash = memo(function LiveFlash({ seq, dir, children, style }: LiveFlashProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const flash = useSharedValue(0);
  const rising = useSharedValue(1);
  const lastSeq = useRef(seq);

  useEffect(() => {
    const previous = lastSeq.current;
    lastSeq.current = seq;
    if (reduceMotion || seq === undefined || previous === undefined || seq === previous || !dir) {
      return;
    }
    rising.set(dir === 'up' ? 1 : 0);
    flash.set(withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 650 })));
  }, [seq, dir, reduceMotion, flash, rising]);

  const up = colors.accentWash;
  const down = colors.dangerWash;
  const washStyle = useAnimatedStyle(() => ({
    opacity: flash.value,
    backgroundColor: rising.value === 1 ? up : down,
  }));

  return (
    <View style={style}>
      <Animated.View pointerEvents="none" style={[styles.wash, washStyle]} />
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  wash: {
    position: 'absolute',
    top: -1,
    bottom: -1,
    left: -4,
    right: -4,
    borderRadius: 4,
  },
});
