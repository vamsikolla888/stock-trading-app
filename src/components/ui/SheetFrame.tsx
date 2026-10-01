import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/theme/ThemeProvider';

interface SheetFrameProps {
  visible: boolean;
  /** Asked to close — the backdrop, Android's back button, or a swipe down. */
  onRequestClose: () => void;
  /** Android's back button, when it means something else first (a step back inside the sheet). */
  onBackPress?: () => void;
  /** Nothing dismisses the sheet while true (an order in flight). */
  locked?: boolean;
  /** Share of the window height the sheet may take. */
  maxHeight?: number;
  /** Take all of `maxHeight` even when the content is short (long pickers). */
  fill?: boolean;
  /** Lift the sheet over the keyboard (iOS; Android resizes the window itself). */
  avoidKeyboard?: boolean;
  /** The sheet has finished leaving — safe to present the next modal (iOS refuses overlaps). */
  onDismissed?: () => void;
  /** The grab handle and title row: dragging it down dismisses the sheet. */
  handle: React.ReactNode;
  /** Everything under the handle — the scrolling body and any pinned footer. */
  children: React.ReactNode;
  /** The panel's own padding (bottom insets, a top gutter). */
  style?: StyleProp<ViewStyle>;
}

const OPEN = { duration: 280, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 220, easing: Easing.in(Easing.cubic) };
const SETTLE = { damping: 22, stiffness: 260 };
/** A fling faster than this (pt/s) dismisses whatever the distance. */
const FLING_VELOCITY = 900;

/**
 * The frame every bottom sheet shares: RN's Modal (back button and screen-reader focus for free,
 * opens from inside any scroll view), with motion drawn here on the UI thread — the backdrop
 * fades while the panel slides, instead of the Modal's own slide dragging the dim layer up with
 * it — and a swipe down on the handle dismisses, following the finger and springing back when
 * let go early.
 *
 * Safe areas: never taller than the space under the status bar / Dynamic Island, and kept
 * clear of the notch in landscape, where it also stops at a readable width.
 *
 * The Modal stays up through the closing slide and only then unmounts, so a parent can flip
 * `visible` off at once and still see the sheet leave.
 */
export function SheetFrame({
  visible,
  onRequestClose,
  onBackPress,
  locked = false,
  maxHeight = 0.9,
  fill = false,
  avoidKeyboard = false,
  onDismissed,
  handle,
  children,
  style,
}: SheetFrameProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Mounted from the moment it is asked for until its closing slide ends.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const panelHeight = useSharedValue(windowHeight);

  const finish = useCallback(() => {
    setMounted(false);
    if (Platform.OS !== 'ios') onDismissed?.();
  }, [onDismissed]);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      drag.set(0);
      progress.set(withTiming(1, OPEN));
    } else {
      progress.set(
        withTiming(0, CLOSE, (done) => {
          if (done) scheduleOnRN(finish);
        }),
      );
    }
  }, [visible, mounted, progress, drag, finish]);

  const close = useCallback(() => {
    if (!locked) onRequestClose();
  }, [locked, onRequestClose]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!locked)
        .activeOffsetY([-8, 8])
        .failOffsetX([-24, 24])
        .onUpdate((event) => {
          // Down follows the finger; up gives a little, then stops.
          drag.set(event.translationY > 0 ? event.translationY : event.translationY / 6);
        })
        .onEnd((event) => {
          const far = event.translationY > Math.min(panelHeight.get() * 0.3, 160);
          if (event.translationY > 0 && (far || event.velocityY > FLING_VELOCITY)) {
            scheduleOnRN(close);
          } else {
            drag.set(withSpring(0, SETTLE));
          }
        }),
    [locked, drag, panelHeight, close],
  );

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.get() + (1 - progress.get()) * panelHeight.get() }],
  }));

  const onPanelLayout = useCallback(
    (event: LayoutChangeEvent) => {
      panelHeight.set(event.nativeEvent.layout.height);
    },
    [panelHeight],
  );

  if (!mounted) return null;

  const limit = Math.min(windowHeight * maxHeight, windowHeight - insets.top - 8);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onBackPress && !locked ? onBackPress : close}
      onDismiss={Platform.OS === 'ios' ? onDismissed : undefined}
    >
      {/* A Modal is its own native root: gestures inside it need their own handler root. */}
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityState={{ disabled: locked }}
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={avoidKeyboard && Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={[styles.dock, { paddingLeft: insets.left, paddingRight: insets.right }]}
        >
          <Animated.View
            accessibilityViewIsModal
            onLayout={onPanelLayout}
            style={[
              styles.panel,
              { backgroundColor: colors.surface, maxHeight: limit },
              fill ? { height: limit } : null,
              style,
              panelStyle,
            ]}
          >
            <GestureDetector gesture={pan}>
              <Animated.View>{handle}</Animated.View>
            </GestureDetector>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dock: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
});
