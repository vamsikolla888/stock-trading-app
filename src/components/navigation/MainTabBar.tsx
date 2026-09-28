import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/tabs';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroupIcon, type GroupIconName } from '@/components/navigation/GroupIcon';
import { NAV_GROUPS } from '@/config/navigation';
import { useTheme } from '@/theme/ThemeProvider';

const ICON_BY_ROUTE = Object.fromEntries(
  NAV_GROUPS.map((group) => [group.route, group.icon]),
) as Record<string, GroupIconName>;

const VISUAL_ORDER: Record<string, number> = {
  '(markets)': 0,
  fno: 1,
  trade: 2,
  intel: 3,
  settings: 4,
};

const BAR_HORIZONTAL_GUTTER = 18;

/** Reference-inspired pill navigation with Trade elevated as the central primary action. */
export function MainTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { colors, shadows } = useTheme();
  const activeKey = state.routes[state.index]?.key;
  const routes = [...state.routes].sort(
    (left, right) =>
      (VISUAL_ORDER[left.name] ?? Number.MAX_SAFE_INTEGER) -
      (VISUAL_ORDER[right.name] ?? Number.MAX_SAFE_INTEGER),
  );
  const leftPadding = Math.max(insets.left, 14);
  const rightPadding = Math.max(insets.right, 14);
  const barWidth = Math.min(560, Math.max(0, windowWidth - leftPadding - rightPadding));
  const innerBarWidth = Math.max(0, barWidth - BAR_HORIZONTAL_GUTTER * 2);
  const slotWidth = innerBarWidth / Math.max(routes.length, 1);
  const primarySize = Math.max(52, Math.min(64, slotWidth));
  const primaryIconSize = Math.max(22, Math.min(27, primarySize * 0.44));
  const primaryLift = Math.min(16, primarySize * 0.23);
  const bottomPadding =
    Platform.OS === 'android' ? 0 : Platform.OS === 'ios' ? Math.max(insets.bottom, 6) : 0;

  return (
    <View
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
          paddingBottom: bottomPadding,
          paddingLeft: leftPadding,
          paddingRight: rightPadding,
        },
      ]}
    >
      <View
        style={[styles.widthConstraint, Platform.OS === 'android' ? styles.androidLowered : null]}
      >
        <View
          accessibilityRole="tablist"
          style={[
            styles.bar,
            Platform.OS === 'web' ? styles.webBarShadow : shadows.md,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
            Platform.OS === 'android' ? styles.androidBarShadow : null,
          ]}
        >
          {routes.map((route) => {
            const options = descriptors[route.key]?.options;
            const focused = route.key === activeKey;
            const primary = route.name === 'trade';
            const configuredLabel = options?.tabBarLabel ?? options?.title ?? route.name;
            const label = typeof configuredLabel === 'string' ? configuredLabel : route.name;
            const icon = ICON_BY_ROUTE[route.name];

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                void Haptics.selectionAsync();
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            };

            if (primary) {
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={options?.tabBarAccessibilityLabel ?? label}
                  testID={options?.tabBarButtonTestID}
                  hitSlop={6}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  style={({ pressed }) => [
                    styles.slot,
                    styles.primarySlot,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.primaryHalo,
                      Platform.OS === 'web' ? styles.webButtonShadow : shadows.lg,
                      {
                        width: primarySize,
                        height: primarySize,
                        borderRadius: primarySize / 2,
                        backgroundColor: colors.surfaceElevated,
                        transform: [{ translateY: -primaryLift }],
                      },
                      Platform.OS === 'android' ? styles.androidButtonShadow : null,
                    ]}
                  >
                    <View style={[styles.primaryCircle, { backgroundColor: colors.primary }]}>
                      {icon ? (
                        <GroupIcon
                          name={icon}
                          color={colors.primaryText}
                          focused
                          size={primaryIconSize}
                        />
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            }

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={options?.tabBarAccessibilityLabel ?? label}
                testID={options?.tabBarButtonTestID}
                onPress={onPress}
                onLongPress={onLongPress}
                android_ripple={{ color: colors.accentWash, borderless: false }}
                style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
              >
                <View style={styles.contentColumn}>
                  <View style={styles.iconWell}>
                    {icon ? (
                      <GroupIcon
                        name={icon}
                        color={focused ? colors.link : colors.textMuted}
                        focused={focused}
                        size={21}
                      />
                    ) : null}
                  </View>
                  <View style={styles.labelGroup}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      maxFontSizeMultiplier={1.0}
                      style={[
                        styles.label,
                        {
                          color: focused ? colors.link : colors.textMuted,
                          fontWeight: focused ? '700' : '500',
                        },
                      ]}
                    >
                      {label}
                    </Text>
                    <View
                      style={[
                        styles.activeDot,
                        { backgroundColor: focused ? colors.link : 'transparent' },
                      ]}
                    />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    paddingTop: 4,
  },
  widthConstraint: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  androidLowered: {
    transform: [{ translateY: 4 }],
  },
  bar: {
    width: '100%',
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 30,
    paddingHorizontal: BAR_HORIZONTAL_GUTTER,
  },
  slot: {
    minWidth: 0,
    height: 76,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    // No horizontal padding so every slot gets exactly equal flex space.
    paddingTop: 8,
  },
  primarySlot: {
    zIndex: 2,
    paddingTop: 0,
  },
  primaryHalo: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  primaryCircle: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 34,
  },
  contentColumn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWell: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelGroup: {
    marginTop: 4,
    alignItems: 'center',
  },
  label: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: -0.15,
  },
  activeDot: {
    alignSelf: 'center',
    width: 4,
    height: 4,
    marginTop: 3,
    borderRadius: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  androidBarShadow: {
    elevation: 8,
  },
  androidButtonShadow: {
    elevation: 12,
  },
  webBarShadow: {
    boxShadow: '0 8px 24px rgba(24, 34, 31, 0.12)',
  },
  webButtonShadow: {
    boxShadow: '0 10px 24px rgba(0, 128, 94, 0.22)',
  },
});
