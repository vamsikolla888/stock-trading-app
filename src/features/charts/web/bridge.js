/* eslint-env browser */
/*
 * The chart page's side of the React Native bridge (TradingChart.tsx owns the other side).
 *
 * Runs INSIDE the WebView, next to TradingView's Lightweight Charts. Deliberately thin: it only
 * renders what React Native sends and reports what the user does. Every number — the bars, the
 * live candle, every indicator — is computed in TypeScript (src/features/charts/lib), where it is
 * typed and tested; nothing here does market math.
 *
 * Not imported by the app: scripts/build-chart-html.mjs inlines it into chartHtml.generated.ts.
 * After editing, run `npm run build:chart`.
 *
 *   RN → page   window.__chart.receive(message)
 *     { type: 'init', theme }                        build the chart
 *     { type: 'theme', theme }                       recolour in place
 *     { type: 'data', payload, prepended }           replace every series (prepended: older bars
 *                                                    were added on the left — keep the view still)
 *     { type: 'tick', tick }                         the forming bar and each study's last point
 *     { type: 'latest' }                             scroll back to the newest bar
 *   page → RN   ReactNativeWebView.postMessage(JSON)
 *     { type: 'ready' } · { type: 'crosshair', time } · { type: 'edge' } · { type: 'latest', at }
 *     { type: 'error', message }
 *
 * TIME. The chart has no time-zone setting and draws UTC, so every time is shifted by IST's
 * +5:30 on the way in and back on the way out: the axis reads Indian market time on any phone.
 */
(function () {
  'use strict';

  let LWC = window.LightweightCharts;
  let IST = 19800;
  let EDGE_BARS = 15;

  let root = document.getElementById('chart');
  let chart = null;
  let theme = null;
  let price = null;
  let priceKind = null;
  let volume = null;
  let overlays = {};
  let panes = {};
  let priceLines = [];
  let barCount = 0;
  let edgeArmed = true;
  let atLatest = true;

  function post(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }

  function shift(point) {
    let out = {};
    for (let key in point) out[key] = point[key];
    out.time = point.time + IST;
    return out;
  }

  function shiftAll(points) {
    let out = new Array(points.length);
    for (let i = 0; i < points.length; i++) out[i] = shift(points[i]);
    return out;
  }

  /* ── Formatting ─────────────────────────────────────────────────────────────────── */

  let priceFormat = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  let MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }
  /** Crosshair label: the shifted time read back as UTC fields IS the IST wall clock. */
  function timeLabel(time) {
    let d = new Date(time * 1000);
    let day =
      pad(d.getUTCDate()) + ' ' + MONTHS[d.getUTCMonth()] + " '" + pad(d.getUTCFullYear() % 100);
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return day;
    return day + '  ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  /* ── Building ───────────────────────────────────────────────────────────────────── */

  function chartOptions(t) {
    return {
      autoSize: true,
      layout: {
        background: { type: 'solid', color: t.background },
        textColor: t.textMuted,
        fontSize: 11,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        panes: { separatorColor: t.grid, separatorHoverColor: t.grid, enableResize: true },
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: t.grid },
        horzLines: { color: t.grid },
      },
      crosshair: {
        mode: LWC.CrosshairMode.Normal,
        vertLine: {
          color: t.crosshair,
          labelBackgroundColor: t.labelBackground,
          style: LWC.LineStyle.Dashed,
        },
        horzLine: {
          color: t.crosshair,
          labelBackgroundColor: t.labelBackground,
          style: LWC.LineStyle.Dashed,
        },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        // ~11 pt per bar: candles a finger can read at a glance (the engine's 6 reads as
        // slivers on a phone); pinch still zooms either way.
        barSpacing: 11,
        minBarSpacing: 2,
        // Bars keep their width on resize, so turning to landscape (full screen) shows MORE
        // history rather than the same bars stretched.
        lockVisibleTimeRangeOnResize: false,
      },
      localization: {
        locale: 'en-IN',
        priceFormatter: function (p) {
          return priceFormat.format(p);
        },
        timeFormatter: timeLabel,
      },
      kineticScroll: { touch: true, mouse: false },
      handleScale: {
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
      },
      handleScroll: {
        horzTouchDrag: true,
        vertTouchDrag: false,
        pressedMouseMove: true,
        mouseWheel: true,
      },
    };
  }

  function init(t) {
    theme = t;
    document.documentElement.style.background = t.background;
    chart = LWC.createChart(root, chartOptions(t));
    chart.subscribeCrosshairMove(function (param) {
      post({ type: 'crosshair', time: param && param.time != null ? param.time - IST : null });
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(function (range) {
      if (!range) return;
      // Near the left edge: ask for older history — once, until it has arrived.
      if (edgeArmed && range.from < EDGE_BARS) {
        edgeArmed = false;
        post({ type: 'edge' });
      }
      let latest = range.to >= barCount - 2;
      if (latest !== atLatest) {
        atLatest = latest;
        post({ type: 'latest', at: latest });
      }
    });
    post({ type: 'ready' });
  }

  function seriesFor(kind) {
    let t = theme;
    switch (kind) {
      case 'line':
        return chart.addSeries(LWC.LineSeries, {
          color: t.accent,
          lineWidth: 2,
          priceLineColor: t.accent,
        });
      case 'area':
        return chart.addSeries(LWC.AreaSeries, {
          lineColor: t.accent,
          topColor: t.accentFillTop,
          bottomColor: t.accentFillBottom,
          lineWidth: 2,
        });
      case 'bars':
        return chart.addSeries(LWC.BarSeries, {
          upColor: t.up,
          downColor: t.down,
          thinBars: false,
        });
      case 'hollow':
        return chart.addSeries(LWC.CandlestickSeries, {
          upColor: 'rgba(0,0,0,0)',
          downColor: t.down,
          borderUpColor: t.up,
          borderDownColor: t.down,
          wickUpColor: t.up,
          wickDownColor: t.down,
        });
      default:
        return chart.addSeries(LWC.CandlestickSeries, {
          upColor: t.up,
          downColor: t.down,
          borderVisible: false,
          wickUpColor: t.up,
          wickDownColor: t.down,
        });
    }
  }

  function clearSeries() {
    if (price) chart.removeSeries(price);
    if (volume) chart.removeSeries(volume);
    for (let id in overlays) chart.removeSeries(overlays[id]);
    for (let pid in panes) {
      let list = panes[pid];
      for (let i = 0; i < list.length; i++) chart.removeSeries(list[i].series);
    }
    price = null;
    volume = null;
    overlays = {};
    panes = {};
    priceLines = [];
    // Empty panes left behind by removed studies would keep their space.
    let all = chart.panes();
    for (let p = all.length - 1; p > 0; p--) chart.removePane(p);
  }

  function setData(payload, prepended) {
    let timeScale = chart.timeScale();
    let range = prepended ? timeScale.getVisibleLogicalRange() : null;

    clearSeries();
    priceKind = payload.price.kind;
    price = seriesFor(priceKind);
    price.setData(shiftAll(payload.price.data));
    barCount = payload.price.data.length;

    for (let l = 0; l < payload.priceLines.length; l++) {
      let line = payload.priceLines[l];
      priceLines.push(
        price.createPriceLine({
          price: line.price,
          color: line.color,
          lineWidth: 1,
          lineStyle: LWC.LineStyle.Dashed,
          axisLabelVisible: true,
          title: line.title,
        }),
      );
    }

    if (payload.volume) {
      volume = chart.addSeries(LWC.HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volume.setData(shiftAll(payload.volume));
    }

    for (let o = 0; o < payload.overlays.length; o++) {
      let overlay = payload.overlays[o];
      let s = chart.addSeries(LWC.LineSeries, {
        color: overlay.color,
        lineWidth: overlay.width || 1,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(shiftAll(overlay.data));
      overlays[overlay.id] = s;
    }

    for (let q = 0; q < payload.panes.length; q++) {
      let pane = payload.panes[q];
      let paneIndex = q + 1;
      let made = [];
      for (let k = 0; k < pane.series.length; k++) {
        let spec = pane.series[k];
        let options = {
          color: spec.color,
          lineWidth: 1,
          lastValueVisible: true,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        };
        let series =
          spec.kind === 'histogram'
            ? chart.addSeries(LWC.HistogramSeries, options, paneIndex)
            : chart.addSeries(LWC.LineSeries, options, paneIndex);
        series.setData(shiftAll(spec.data));
        made.push({ id: spec.id, series: series });
        if (spec.levels) {
          for (let v = 0; v < spec.levels.length; v++) {
            series.createPriceLine({
              price: spec.levels[v],
              color: theme.grid,
              lineWidth: 1,
              lineStyle: LWC.LineStyle.Dotted,
              axisLabelVisible: false,
            });
          }
        }
      }
      panes[pane.id] = made;
    }

    let all = chart.panes();
    if (all.length > 1) {
      all[0].setStretchFactor(3);
      for (let a = 1; a < all.length; a++) all[a].setStretchFactor(1);
    }

    // Older bars were added on the left: shift the view by as many, so nothing on screen moves.
    if (range && prepended > 0) {
      timeScale.setVisibleLogicalRange({ from: range.from + prepended, to: range.to + prepended });
    }
    edgeArmed = payload.hasMore;
  }

  function tick(t) {
    if (!price) return;
    price.update(shift(t.price));
    if (t.appended) barCount += 1;
    if (volume && t.volume) volume.update(shift(t.volume));
    for (let id in t.overlays) {
      if (overlays[id] && t.overlays[id]) overlays[id].update(shift(t.overlays[id]));
    }
    for (let pid in t.panes) {
      let list = panes[pid];
      if (!list) continue;
      let points = t.panes[pid];
      for (let i = 0; i < list.length; i++) {
        let point = points[list[i].id];
        if (point) list[i].series.update(shift(point));
      }
    }
  }

  /** Colours only — re-applying the time scale would throw away the user's zoom and scroll. */
  function applyTheme(t) {
    theme = t;
    document.documentElement.style.background = t.background;
    const options = chartOptions(t);
    chart.applyOptions({
      layout: options.layout,
      grid: options.grid,
      crosshair: options.crosshair,
    });
  }

  window.__chart = {
    receive: function (message) {
      try {
        switch (message.type) {
          case 'init':
            if (!chart) init(message.theme);
            break;
          case 'theme':
            applyTheme(message.theme);
            break;
          case 'data':
            setData(message.payload, message.prepended || 0);
            break;
          case 'tick':
            tick(message.tick);
            break;
          case 'latest':
            chart.timeScale().scrollToRealTime();
            break;
        }
      } catch (error) {
        post({ type: 'error', message: String((error && error.message) || error) });
      }
    },
  };

  window.addEventListener('error', function (event) {
    post({ type: 'error', message: String(event.message) });
  });

  post({ type: 'boot' });
})();
