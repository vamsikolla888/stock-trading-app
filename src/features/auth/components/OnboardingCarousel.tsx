import React, { memo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';
import { palette, type ThemeColors } from '@/theme/tokens';

type IllustrationProps = { colors: ThemeColors };

// Illustrations are drawn, not bitmaps: nothing to decode at launch, crisp at any density,
// and they follow the theme. They deliberately carry no numbers — a figure on a marketing
// screen reads as somebody's real portfolio.

const MarketsIllustration = memo(function MarketsIllustration({ colors }: IllustrationProps) {
  const candles = [
    { x: 86, wick: [118, 142], body: [124, 138], up: true },
    { x: 108, wick: [112, 136], body: [118, 130], up: false },
    { x: 130, wick: [100, 128], body: [106, 122], up: true },
    { x: 152, wick: [90, 116], body: [96, 110], up: true },
    { x: 174, wick: [92, 112], body: [96, 106], up: false },
    { x: 196, wick: [70, 100], body: [76, 94], up: true },
  ] as const;

  return (
    <Svg width="100%" height="100%" viewBox="0 0 280 200">
      <Circle cx={140} cy={100} r={92} fill={colors.accentWash} />
      <Rect
        x={62}
        y={44}
        width={156}
        height={112}
        rx={16}
        fill={colors.surface}
        stroke={colors.border}
      />
      <Path d="M76 78h128M76 104h128M76 130h128" stroke={colors.border} strokeWidth={1} />
      {candles.map(({ x, wick, body, up }) => {
        const fill = up ? palette.green : palette.red;
        return (
          <React.Fragment key={x}>
            <Path
              d={`M${x} ${wick[0]}V${wick[1]}`}
              stroke={fill}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <Rect x={x - 5} y={body[0]} width={10} height={body[1] - body[0]} rx={2} fill={fill} />
          </React.Fragment>
        );
      })}
      <Path
        d="M86 124L108 118L130 106L152 96L174 98L196 76"
        fill="none"
        stroke={palette.greenStrong}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle
        cx={196}
        cy={76}
        r={5}
        fill={palette.greenStrong}
        stroke={colors.surface}
        strokeWidth={2}
      />
    </Svg>
  );
});

const ReasoningIllustration = memo(function ReasoningIllustration({ colors }: IllustrationProps) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 280 200">
      <Circle cx={140} cy={100} r={92} fill={colors.accentWash} />
      <Rect
        x={58}
        y={50}
        width={164}
        height={100}
        rx={16}
        fill={colors.surface}
        stroke={colors.border}
      />
      <Rect x={74} y={66} width={32} height={32} rx={10} fill={colors.accentWash} />
      <Path d="M90 71L93 79L101 82L93 85L90 93L87 85L79 82L87 79Z" fill={palette.green} />
      <Rect x={116} y={70} width={80} height={8} rx={4} fill={colors.borderStrong} />
      <Rect x={116} y={86} width={56} height={6} rx={3} fill={colors.border} />
      <Rect x={74} y={112} width={132} height={6} rx={3} fill={colors.border} />
      <Rect x={74} y={126} width={100} height={6} rx={3} fill={colors.border} />
      <Circle cx={214} cy={56} r={16} fill={palette.greenStrong} />
      <Path
        d="M207 56l5 5l9-10"
        fill="none"
        stroke={palette.white}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
});

const SecureIllustration = memo(function SecureIllustration({ colors }: IllustrationProps) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 280 200">
      <Circle cx={140} cy={100} r={92} fill={colors.accentWash} />
      <Path
        d="M140 46L184 63V99C184 128 165 147 140 157C115 147 96 128 96 99V63Z"
        fill={colors.surface}
        stroke={palette.greenStrong}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path
        d="M122 101l12 12l24-26"
        fill="none"
        stroke={palette.greenStrong}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
});

const SLIDES = [
  {
    key: 'markets',
    title: 'Invest in stocks, the simple way',
    body: 'Live NSE and BSE prices, charts and top movers — all at a glance.',
    Illustration: MarketsIllustration,
  },
  {
    key: 'reasoning',
    title: 'Ideas that show their reasoning',
    body: 'Every signal explains why, so you can review it before you act.',
    Illustration: ReasoningIllustration,
  },
  {
    key: 'secure',
    title: 'Private and secure',
    body: 'Your session is encrypted and stays on this device.',
    Illustration: SecureIllustration,
  },
] as const;

/** Groww-style onboarding: swipeable illustrated slides with page dots underneath. */
export function OnboardingCarousel() {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };
  const goTo = (next: number) => {
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  return (
    <View className="flex-1">
      <View className="flex-1" onLayout={onLayout}>
        {width > 0 ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
          >
            {SLIDES.map(({ key, title, body, Illustration }) => (
              <View
                key={key}
                accessible
                accessibilityLabel={`${title}. ${body}`}
                style={{ width }}
                className="flex-1 items-center justify-center px-8"
              >
                <View className="aspect-[7/5] w-full max-w-[300px]">
                  <Illustration colors={colors} />
                </View>
                <Text
                  className="mt-8 text-center text-[24px] font-bold leading-[30px] text-ink dark:text-ink-dark"
                  style={{ letterSpacing: -0.7 }}
                >
                  {title}
                </Text>
                <Text className="mt-2.5 text-center text-[15px] leading-[22px] text-ink-muted dark:text-ink-dark-muted">
                  {body}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <View className="flex-row items-center justify-center gap-1.5 py-4">
        {SLIDES.map(({ key }, dot) => {
          const selected = dot === index;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`Slide ${dot + 1} of ${SLIDES.length}`}
              accessibilityState={{ selected }}
              hitSlop={8}
              onPress={() => goTo(dot)}
              className={cn(
                'h-1.5 rounded-full',
                selected ? 'w-5 bg-brand' : 'w-1.5 bg-line-strong dark:bg-line-dark-strong',
              )}
            />
          );
        })}
      </View>
    </View>
  );
}
