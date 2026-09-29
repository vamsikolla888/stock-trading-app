import React, { useId, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Note, SummaryLine } from '@/features/fno/components/primitives';
import { formatINR, formatNumber, formatSignedINR } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { boundLabel, payoffGeometry } from '../lib/book';
import type { PayoffAnalysis } from '../types';

const HEIGHT = 200;
const BOX = { padLeft: 6, padRight: 6, padTop: 18, padBottom: 22 };

function describe(a: PayoffAnalysis, underlying?: string): string {
  const parts = [`Expiry payoff${underlying ? ` for ${underlying}` : ''}.`];
  parts.push(
    a.maxProfit == null
      ? 'Maximum profit is unlimited.'
      : `Maximum profit ${formatINR(a.maxProfit)}.`,
  );
  parts.push(
    a.maxLoss == null ? 'Maximum loss is unlimited.' : `Maximum loss ${formatINR(a.maxLoss)}.`,
  );
  if (a.breakEvens.length > 0) {
    parts.push(`Break-even at ${a.breakEvens.map((b) => formatINR(b)).join(' and ')}.`);
  }
  return parts.join(' ');
}

/**
 * The expiry payoff of a basket: profit above the dashed zero line in the gain tone, loss below
 * it in the loss tone (one closed region drawn twice under opposite clips, so the colour changes
 * exactly at the crossing). Break-evens and the spot are marked; an unlimited side gets an arrow
 * at the edge the curve keeps running past, and "Unlimited" is always a word, never a number.
 */
export function PayoffChart({
  analysis,
  spot,
  underlying,
}: {
  analysis: PayoffAnalysis;
  spot?: number | null;
  underlying?: string;
}) {
  const { colors } = useTheme();
  const clipId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [width, setWidth] = useState(0);
  const geo = payoffGeometry(analysis, spot, { width, height: HEIGHT, ...BOX });

  return (
    <View className="gap-3">
      {analysis.points.length < 2 ? (
        <Note>Not enough points to draw a payoff curve for this basket.</Note>
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={describe(analysis, underlying)}
          style={{ height: HEIGHT }}
          onLayout={(e) => {
            const next = Math.floor(e.nativeEvent.layout.width);
            if (next > 0 && next !== width) setWidth(next);
          }}
        >
          {geo ? (
            <Svg width={width} height={HEIGHT}>
              <Defs>
                <ClipPath id={`${clipId}g`}>
                  <Rect x={0} y={0} width={width} height={Math.max(0, geo.zeroY)} />
                </ClipPath>
                <ClipPath id={`${clipId}l`}>
                  <Rect
                    x={0}
                    y={geo.zeroY}
                    width={width}
                    height={Math.max(0, HEIGHT - geo.zeroY)}
                  />
                </ClipPath>
              </Defs>
              <Path d={geo.area} fill={colors.successWash} clipPath={`url(#${clipId}g)`} />
              <Path d={geo.area} fill={colors.dangerWash} clipPath={`url(#${clipId}l)`} />
              <Line
                x1={BOX.padLeft}
                x2={width - BOX.padRight}
                y1={geo.zeroY}
                y2={geo.zeroY}
                stroke={colors.borderStrong}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <Path
                d={geo.line}
                fill="none"
                stroke={colors.gain}
                strokeWidth={2}
                strokeLinejoin="round"
                clipPath={`url(#${clipId}g)`}
              />
              <Path
                d={geo.line}
                fill="none"
                stroke={colors.loss}
                strokeWidth={2}
                strokeLinejoin="round"
                clipPath={`url(#${clipId}l)`}
              />
              {geo.edge ? (
                <Path
                  d={`M${geo.edge.x - 7 * (geo.edge.rightward ? 1 : -1)} ${geo.edge.y - 5} L${geo.edge.x} ${geo.edge.y} L${geo.edge.x - 7 * (geo.edge.rightward ? 1 : -1)} ${geo.edge.y + 5}`}
                  fill="none"
                  stroke={geo.edge.loss ? colors.loss : colors.gain}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {geo.breakEvens.map((b, i) => (
                <React.Fragment key={`${b.value}:${i}`}>
                  <Line
                    x1={b.x}
                    x2={b.x}
                    y1={geo.plotTop}
                    y2={geo.plotBottom}
                    stroke={colors.border}
                    strokeWidth={1}
                  />
                  <Circle
                    cx={b.x}
                    cy={geo.zeroY}
                    r={3.5}
                    fill={colors.surface}
                    stroke={colors.textMuted}
                    strokeWidth={1.5}
                  />
                </React.Fragment>
              ))}
              {geo.spotX != null && spot != null ? (
                <>
                  <Line
                    x1={geo.spotX}
                    x2={geo.spotX}
                    y1={geo.plotTop}
                    y2={geo.plotBottom}
                    stroke={colors.info}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                  <SvgText
                    x={Math.min(Math.max(geo.spotX, 40), width - 40)}
                    y={geo.plotTop - 6}
                    fontSize={10}
                    fill={colors.info}
                    textAnchor="middle"
                  >
                    {`spot ${formatNumber(spot, 0)}`}
                  </SvgText>
                </>
              ) : null}
              <SvgText
                x={BOX.padLeft}
                y={HEIGHT - 6}
                fontSize={10}
                fill={colors.textFaint}
                textAnchor="start"
              >
                {formatNumber(geo.xMin, 0)}
              </SvgText>
              <SvgText
                x={width - BOX.padRight}
                y={HEIGHT - 6}
                fontSize={10}
                fill={colors.textFaint}
                textAnchor="end"
              >
                {formatNumber(geo.xMax, 0)}
              </SvgText>
            </Svg>
          ) : null}
        </View>
      )}

      <View>
        <SummaryLine
          label="Max profit"
          value={boundLabel(analysis.maxProfit, (n) => formatSignedINR(n))}
          valueClassName={
            analysis.maxProfit == null ? 'text-brand-text dark:text-brand-text-dark' : undefined
          }
        />
        <SummaryLine
          label="Max loss"
          value={boundLabel(analysis.maxLoss, (n) => formatSignedINR(n))}
          valueClassName={
            analysis.maxLoss == null ? 'text-danger-600 dark:text-danger-dark' : undefined
          }
        />
        <SummaryLine
          label={analysis.netPremium < 0 ? 'Net premium paid' : 'Net premium received'}
          value={formatINR(Math.abs(analysis.netPremium))}
        />
        <SummaryLine
          label={analysis.breakEvens.length === 1 ? 'Break-even' : 'Break-evens'}
          value={
            analysis.breakEvens.length === 0
              ? '—'
              : analysis.breakEvens.map((b) => formatNumber(b)).join(' · ')
          }
        />
        <SummaryLine
          label="If the underlying went to zero"
          value={formatSignedINR(analysis.profitAtZero)}
          valueClassName={
            analysis.profitAtZero < 0
              ? 'text-danger-600 dark:text-danger-dark'
              : 'text-brand-text dark:text-brand-text-dark'
          }
        />
      </View>
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
        At expiry, against the underlying’s price. The window is centred on tradeable prices, so the
        zero-price case is stated rather than drawn.
      </Text>
    </View>
  );
}
