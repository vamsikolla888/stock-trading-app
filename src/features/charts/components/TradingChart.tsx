import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { WebView as WebViewInstance, WebViewMessageEvent } from 'react-native-webview';

import type { Candle } from '@/features/market/types';
import { useTheme } from '@/theme/ThemeProvider';
import { palette } from '@/theme/tokens';

import type { ChartType, StudyId } from '../lib/config';
import {
  buildChartPayload,
  buildChartTick,
  type ChartTheme,
  type StudyValues,
} from '../lib/payload';
import { classifyUpdate, type SentSeries } from '../lib/updates';
import { CHART_HTML } from '../web/chartHtml.generated';

type WebViewModule = typeof import('react-native-webview');
let webViewModule: WebViewModule | null | undefined;

/**
 * The WebView, or null in an app binary built before it was added: its module asks for the
 * native half the moment it is imported (TurboModuleRegistry.getEnforcing) and throws when it is
 * missing. Loaded here, guarded, so such a build shows "update the app" instead of crashing the
 * whole chart screen.
 */
function loadWebView(): WebViewModule | null {
  if (webViewModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      webViewModule = require('react-native-webview') as WebViewModule;
    } catch {
      webViewModule = null;
    }
  }
  return webViewModule;
}

export interface TradingChartHandle {
  /** Scroll back to the newest bar. */
  scrollToLatest(): void;
}

export interface TradingChartProps {
  bars: readonly Candle[];
  /** computeStudies(bars, studies) — the caller's, shared with its legend. */
  values: StudyValues;
  chartType: ChartType;
  studies: readonly StudyId[];
  /**
   * Names the series (instrument · interval · history load). A change always redraws in full;
   * within one series the chart works out whether a change is a live tick or older history.
   */
  seriesKey: string;
  prevClose?: number | null;
  hasMore?: boolean;
  onCrosshair?: (time: number | null) => void;
  /** The user scrolled to the oldest bar loaded and `hasMore` was set. */
  onNeedHistory?: () => void;
  onLatestChange?: (atLatest: boolean) => void;
  style?: StyleProp<ViewStyle>;
}

type PageMessage =
  | { type: 'boot' }
  | { type: 'ready' }
  | { type: 'crosshair'; time: number | null }
  | { type: 'edge' }
  | { type: 'latest'; at: boolean }
  | { type: 'error'; message: string };

/** `#rrggbb` + alpha → `rgba()`; anything else is returned as is. */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const n = parseInt(match[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * TradingView's Lightweight Charts in a WebView — the same engine the web client's charts use
 * (and Groww's TradingView charts are a WebView too). React Native computes; the page renders
 * (see web/bridge.js for the protocol). The page is inlined (no network) and the WebView is
 * locked down: no navigation, no zoom, links open in the browser.
 *
 * Updates are DIFFED here: a live price that only moves the forming bar, or opens the next one,
 * goes as a `tick` that updates each series' last point; older history arriving on the left
 * redraws while keeping the view where it was; anything else redraws in full.
 */
export const TradingChart = forwardRef<TradingChartHandle, TradingChartProps>(function TradingChart(
  {
    bars,
    values,
    chartType,
    studies,
    seriesKey,
    prevClose = null,
    hasMore = false,
    onCrosshair,
    onNeedHistory,
    onLatestChange,
    style,
  },
  ref,
) {
  const { colors, isDark } = useTheme();
  const webRef = useRef<WebViewInstance>(null);
  const booted = useRef(false);
  const sent = useRef<SentSeries | null>(null);
  const [ready, setReady] = useState(false);
  // Bumped when the OS kills the WebView's process; remounts it (see onRenderProcessGone).
  const [generation, setGeneration] = useState(0);

  const theme = useMemo<ChartTheme>(
    () => ({
      background: colors.background,
      textMuted: colors.textMuted,
      grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(23,26,31,0.06)',
      crosshair: colors.textFaint,
      labelBackground: isDark ? '#3a4149' : '#4a4e5a',
      up: palette.green,
      down: palette.red,
      accent: colors.accent,
      accentFillTop: withAlpha(colors.accent, 0.28),
      accentFillBottom: withAlpha(colors.accent, 0),
      volumeUp: withAlpha(palette.green, 0.4),
      volumeDown: withAlpha(palette.red, 0.4),
      prevClose: colors.textFaint,
    }),
    [colors, isDark],
  );

  const post = useCallback((message: unknown) => {
    webRef.current?.injectJavaScript(
      `window.__chart&&window.__chart.receive(${JSON.stringify(message)});true;`,
    );
  }, []);

  // Everything that forces a full redraw besides the bars themselves.
  const config = `${chartType}|${studies.join(',')}|${prevClose ?? ''}|${hasMore ? 1 : 0}|${theme.background}`;

  const sync = useCallback(() => {
    if (!booted.current) return;
    const next: SentSeries = { seriesKey, config, bars };
    if (bars.length === 0) return;
    const change = classifyUpdate(sent.current, next);
    const input = { bars, chartType, studies, theme, prevClose, hasMore };
    if (change.kind === 'tick') {
      const tick = buildChartTick(input, change.appended, values);
      if (tick) post({ type: 'tick', tick });
    } else {
      post({
        type: 'data',
        payload: buildChartPayload(input, values),
        prepended: change.prepended,
      });
    }
    sent.current = next;
  }, [bars, chartType, config, hasMore, post, prevClose, seriesKey, studies, theme, values]);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    if (booted.current) post({ type: 'theme', theme });
  }, [post, theme]);

  useImperativeHandle(ref, () => ({ scrollToLatest: () => post({ type: 'latest' }) }), [post]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: PageMessage;
      try {
        message = JSON.parse(event.nativeEvent.data) as PageMessage;
      } catch {
        return;
      }
      switch (message.type) {
        case 'boot':
          booted.current = true;
          sent.current = null;
          post({ type: 'init', theme });
          sync();
          break;
        case 'ready':
          setReady(true);
          break;
        case 'crosshair':
          onCrosshair?.(message.time);
          break;
        case 'edge':
          if (hasMore) onNeedHistory?.();
          break;
        case 'latest':
          onLatestChange?.(message.at);
          break;
        case 'error':
          if (__DEV__) console.warn('[TradingChart]', message.message);
          break;
        default:
          break;
      }
    },
    [hasMore, onCrosshair, onLatestChange, onNeedHistory, post, sync, theme],
  );

  const restart = useCallback(() => {
    booted.current = false;
    sent.current = null;
    setReady(false);
    setGeneration((value) => value + 1);
  }, []);

  const WebView = loadWebView()?.WebView;
  if (!WebView) {
    return (
      <View style={[styles.root, styles.center, styles.pad, style]}>
        <Text className="text-center text-[15px] font-semibold text-ink dark:text-ink-dark">
          Update the app to see this chart
        </Text>
        <Text className="mt-1.5 text-center text-[13px] leading-5 text-ink-muted dark:text-ink-dark-muted">
          The advanced chart needs the latest version of the app. The stock page’s chart works in
          the meantime.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }, style]}>
      <WebView
        key={generation}
        ref={webRef}
        source={{ html: CHART_HTML }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        textZoom={100}
        androidLayerType="hardware"
        style={[styles.web, { backgroundColor: theme.background, opacity: ready ? 1 : 0 }]}
        // The inlined page is the only document; a link (the attribution logo) opens outside.
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === 'about:blank' || request.url.startsWith('data:')) return true;
          if (/^https?:/i.test(request.url)) void Linking.openURL(request.url);
          return false;
        }}
        onRenderProcessGone={restart}
        onContentProcessDidTerminate={restart}
      />
      {!ready ? (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  web: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  pad: { paddingHorizontal: 24 },
});
