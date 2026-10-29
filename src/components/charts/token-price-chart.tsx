"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  AreaSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  UTCTimestamp,
  LineStyle,
  LineType,
} from "lightweight-charts";
import { TokenChartResponse } from "@/app/api/charts/token/route";
import { Loader2, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useTheme } from "next-themes";

export type Timeframe = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";
export type ChartMode = "candles" | "baseline" | "line";

interface TokenPriceChartProps {
  asset?: "USDC" | "EURC" | string;
  className?: string;
  defaultTimeframe?: Timeframe;
  defaultChartMode?: ChartMode;
  height?: number;
}

const clientChartCache: Record<string, { data: TokenChartResponse; timestamp: number }> = {};
const CACHE_TTL_MS = 45000; // 45 seconds

export function TokenPriceChart({
  asset = "USDC",
  className = "",
  defaultTimeframe = "1D",
  defaultChartMode = "line",
  height = 465,
}: TokenPriceChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const seriesInstanceRef = useRef<ISeriesApi<any> | null>(null);
  const lastWidthRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // ── Live polling lifecycle refs ──────────────────────────────────────────────
  // All polling state is kept in refs (not React state) to avoid re-renders.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);   // chained setTimeout handle
  const pollAbortRef = useRef<AbortController | null>(null);                 // in-flight fetch abort
  const isFetchingRef = useRef<boolean>(false);                              // guard: no overlapping requests
  const isMountedRef = useRef<boolean>(true);                                // guard: no state update after unmount
  const isChartVisibleRef = useRef<boolean>(false);                          // from IntersectionObserver
  const timeframeRef = useRef<Timeframe>(defaultTimeframe);                  // always-current timeframe
  const assetRef = useRef<string>(asset);                                    // always-current asset
  const fetchDataRef = useRef<any>(null);                                    // always-current fetchData closure

  useEffect(() => {
    assetRef.current = asset;
  }, [asset]);

  const POLL_INTERVAL_MS = 60_000; // 60 seconds — one request per minute per visible chart

  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe);
  const [chartMode, setChartMode] = useState<ChartMode>(defaultChartMode);
  const [chartData, setChartData] = useState<TokenChartResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Hover state for interactive crosshair
  const [hoveredInfo, setHoveredInfo] = useState<{
    price: number;
    delta: number;
    deltaPct: number;
    timeStr: string;
  } | null>(null);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(null);

  const formatPrice = useCallback((price: number | undefined | null): string => {
    if (price === undefined || price === null || isNaN(price)) return "$0.0000";
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 2) return `$${price.toFixed(5)}`;
    if (price < 10) return `$${price.toFixed(4)}`;
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }, []);

  const formatDelta = useCallback((val: number): string => {
    const abs = Math.abs(val);
    const sign = val >= 0 ? "+" : "-";
    if (abs < 0.001) return `${sign}$${abs.toFixed(5)}`;
    if (abs < 0.01) return `${sign}$${abs.toFixed(4)}`;
    return `${sign}$${abs.toFixed(2)}`;
  }, []);

  const formatHoverTime = useCallback((timestamp: number, tf: Timeframe): string => {
    const d = new Date(timestamp * 1000);
    if (tf === "1H" || tf === "1D") {
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  // ── Core data fetcher (supports AbortController signal) ──────────────────────
  const fetchData = useCallback(
    async (tf: Timeframe, skipLoadingState = false, signal?: AbortSignal, currentAsset?: string) => {
      const targetAsset = currentAsset || assetRef.current || asset || "USDC";
      if (targetAsset === "cirBTC") {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          setError(null);
        }
        return;
      }
      const cacheKey = `${targetAsset}:${tf}`;
      const cached = clientChartCache[cacheKey];
      const now = Date.now();

      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        if (!signal?.aborted && isMountedRef.current && assetRef.current === targetAsset) {
          setChartData(cached.data);
          setError(null);
          if (!skipLoadingState) setIsLoading(false);
        }
      } else if (!skipLoadingState) {
        if (isMountedRef.current && assetRef.current === targetAsset) setIsLoading(true);
      } else {
        if (isMountedRef.current && assetRef.current === targetAsset) setIsRefreshing(true);
      }

      try {
        const res = await fetch(`/api/charts/token?asset=${encodeURIComponent(targetAsset)}&range=${tf}&metric=price`, { signal });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.message || `HTTP ${res.status}: Failed to load chart data`);
        }
        const data: TokenChartResponse = await res.json();
        // Strict guard: ensure response matches active asset and component is mounted
        if (!signal?.aborted && isMountedRef.current && assetRef.current === targetAsset && data.asset === targetAsset) {
          clientChartCache[cacheKey] = { data, timestamp: Date.now() };
          setChartData(data);
          setError(null);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return; // silently ignore aborted requests
        if (!signal?.aborted && isMountedRef.current && assetRef.current === targetAsset) {
          const cached2 = clientChartCache[`${targetAsset}:${tf}`];
          if (!cached2) setError(err.message || "Market data temporarily unavailable");
        }
      } finally {
        if (!signal?.aborted && isMountedRef.current && assetRef.current === targetAsset) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [asset]
  );

  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  // Keep timeframeRef always in sync for the polling closure
  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);

  // Fetch when asset or timeframe changes, resetting any stale crosshair or previous asset data
  useEffect(() => {
    setHoveredInfo(null);
    setHoveredPos(null);

    // Abort in-flight request if asset switched
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
      pollAbortRef.current = null;
    }
    isFetchingRef.current = false;

    const cacheKey = `${asset}:${timeframe}`;
    const cached = clientChartCache[cacheKey];
    if (cached) {
      setChartData(cached.data);
      setError(null);
      setIsLoading(false);
    } else {
      setChartData(null);
      setIsLoading(true);
    }

    fetchData(timeframe, false, undefined, asset);
  }, [asset, timeframe, fetchData]);

  // ── Live polling lifecycle ────────────────────────────────────────────────────
  //
  // shouldPoll = chartMounted && chartVisible && document.visibilityState === 'visible'
  //
  // The timer is a CHAINED setTimeout (not setInterval) so there is never
  // an overlapping second request while one is still in flight.
  //
  // One chart instance = maximum one active timer at any time.
  useEffect(() => {
    isMountedRef.current = true;

    // ── Stops the timer and aborts any in-flight poll fetch ─────────────────
    function stopPolling() {
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (pollAbortRef.current) {
        pollAbortRef.current.abort();
        pollAbortRef.current = null;
      }
      isFetchingRef.current = false;
    }

    // ── Performs one poll tick then schedules the next ───────────────────────
    async function pollOnce() {
      if (isFetchingRef.current) return; // prevent overlapping requests
      if (!isMountedRef.current) return;
      if (!isChartVisibleRef.current) return;
      if (document.visibilityState !== "visible") return;

      isFetchingRef.current = true;
      const ac = new AbortController();
      pollAbortRef.current = ac;

      try {
        // Always call via fetchDataRef to ensure latest asset and closure
        if (fetchDataRef.current) {
          await fetchDataRef.current(timeframeRef.current, true, ac.signal, assetRef.current);
        }
      } finally {
        isFetchingRef.current = false;
        pollAbortRef.current = null;

        // Schedule the NEXT tick only if we should still be polling
        if (
          isMountedRef.current &&
          isChartVisibleRef.current &&
          document.visibilityState === "visible"
        ) {
          pollTimerRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
        }
      }
    }

    // ── Start polling (called whenever shouldPoll transitions to true) ────────
    function startPolling() {
      if (pollTimerRef.current !== null) return; // already running — never duplicate
      if (!isMountedRef.current) return;
      if (!isChartVisibleRef.current) return;
      if (document.visibilityState !== "visible") return;
      // Schedule first tick after POLL_INTERVAL_MS (initial fetch already happened via fetchData)
      pollTimerRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
    }

    // ── visibilitychange: pause/resume based on browser tab focus ────────────
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Tab became visible — if chart is in viewport, do a fresh fetch + restart
        if (isChartVisibleRef.current && isMountedRef.current) {
          if (fetchDataRef.current) {
            fetchDataRef.current(timeframeRef.current, true, undefined, assetRef.current);
          }
          startPolling();
        }
      } else {
        // Tab hidden — stop immediately
        stopPolling();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    // ── IntersectionObserver: chart enters / leaves viewport ─────────────────
    const containerEl = chartContainerRef.current;
    let observer: IntersectionObserver | null = null;

    if (containerEl) {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          const nowVisible = entry.isIntersecting;

          if (nowVisible === isChartVisibleRef.current) return; // no change
          isChartVisibleRef.current = nowVisible;

          if (nowVisible) {
            // Chart scrolled into view — fresh fetch + start polling if tab is visible
            if (document.visibilityState === "visible" && isMountedRef.current) {
              if (fetchDataRef.current) {
                fetchDataRef.current(timeframeRef.current, true, undefined, assetRef.current);
              }
              startPolling();
            }
          } else {
            // Chart scrolled out of view — stop polling immediately
            stopPolling();
          }
        },
        { threshold: 0.1 } // 10% of chart must be visible
      );
      observer.observe(containerEl);
    }

    // ── Cleanup on unmount ────────────────────────────────────────────────────
    return () => {
      isMountedRef.current = false;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (observer) observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← intentionally empty: lifecycle attaches once; all dynamic values read via refs

  // Render Lightweight Charts canvas
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
      seriesInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const initialWidth = Math.max(container.clientWidth || 300, 240);
    lastWidthRef.current = initialWidth;

    const chart = createChart(container, {
      width: initialWidth,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#8492a6" : "#6B7280",
        fontSize: 11,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? "rgba(59, 130, 246, 0.75)" : "rgba(37, 99, 235, 0.6)",
          width: 1,
          style: LineStyle.Dashed,
          visible: true,
          labelVisible: true,
          labelBackgroundColor: isDark ? "#111827" : "#1e293b",
        },
        horzLine: {
          visible: false,
          labelVisible: true,
          labelBackgroundColor: isDark ? "#111827" : "#1e293b",
        },
      },
      rightPriceScale: {
        borderColor: "transparent",
        visible: true,
        scaleMargins: {
          top: 0.12,
          bottom: 0.10,
        },
        autoScale: true,
      },
      timeScale: {
        borderColor: "transparent",
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: false,
        rightOffset: 2,
      },
      handleScroll: false,
      handleScale: false,
    });

    chartInstanceRef.current = chart;

    const basePrice = chartData?.points?.[0]?.value ?? 1.0000;

    const series = chartMode === "candles"
      ? chart.addSeries(CandlestickSeries, {
          upColor: "#10b981",
          downColor: "#ef4444",
          borderVisible: true,
          borderUpColor: "#10b981",
          borderDownColor: "#ef4444",
          wickVisible: true,
          wickUpColor: "#10b981",
          wickDownColor: "#ef4444",
          priceLineVisible: true,
          priceLineColor: isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.25)",
          priceLineStyle: LineStyle.Dotted,
          lastValueVisible: true,
          priceFormat: {
            type: "price",
            precision: 5,
            minMove: 0.00001,
          },
        })
      : chartMode === "baseline"
      ? chart.addSeries(BaselineSeries, {
          baseValue: {
            type: "price",
            price: basePrice,
          },
          topLineColor: "#10b981",
          topFillColor1: isDark ? "rgba(16, 185, 129, 0.35)" : "rgba(16, 185, 129, 0.42)",
          topFillColor2: isDark ? "rgba(7, 9, 14, 0.90)" : "rgba(16, 185, 129, 0.04)",
          bottomLineColor: "#ef4444",
          bottomFillColor1: isDark ? "rgba(7, 9, 14, 0.90)" : "rgba(239, 68, 68, 0.04)",
          bottomFillColor2: isDark ? "rgba(239, 68, 68, 0.35)" : "rgba(239, 68, 68, 0.42)",
          lineWidth: 2,
          lineType: LineType.Curved,
          priceLineVisible: true,
          priceLineColor: isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.25)",
          priceLineStyle: LineStyle.Dotted,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 5,
          crosshairMarkerBorderColor: "#ffffff",
          crosshairMarkerBackgroundColor: (chartData?.currentPrice ?? 1.0) >= basePrice ? "#10b981" : "#ef4444",
          crosshairMarkerBorderWidth: 2,
          priceFormat: {
            type: "price",
            precision: 5,
            minMove: 0.00001,
          },
        })
      : chart.addSeries(AreaSeries, {
          lineColor: isDark ? "#38bdf8" : "#2563eb",
          topColor: isDark ? "rgba(56, 189, 248, 0.38)" : "rgba(37, 99, 235, 0.45)",
          bottomColor: isDark ? "rgba(7, 9, 14, 0.90)" : "rgba(37, 99, 235, 0.04)",
          lineType: LineType.Curved,
          lineWidth: 2,
          priceLineVisible: true,
          priceLineColor: isDark ? "#38bdf8" : "#2563eb",
          priceLineStyle: LineStyle.Dashed,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 5,
          crosshairMarkerBorderColor: "#ffffff",
          crosshairMarkerBackgroundColor: isDark ? "#38bdf8" : "#2563eb",
          crosshairMarkerBorderWidth: 2,
          priceFormat: {
            type: "price",
            precision: 5,
            minMove: 0.00001,
          },
        });

    seriesInstanceRef.current = series;

    // Immediately load cached data if available
    if (chartData?.points && chartData.points.length > 0) {
      if (chartMode === "candles") {
        const formattedPoints = chartData.points.map((p) => ({
          time: p.time as UTCTimestamp,
          open: p.open ?? p.value,
          high: p.high ?? p.value,
          low: p.low ?? p.value,
          close: p.close ?? p.value,
        }));
        series.setData(formattedPoints as any);
      } else {
        const formattedPoints = chartData.points.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.value,
        }));
        series.setData(formattedPoints as any);
      }
      chart.timeScale().fitContent();
    }

    // Crosshair movement subscription (rAF throttled to prevent layout thrashing)
    chart.subscribeCrosshairMove((param) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        if (!param || !param.seriesData || !param.time || !series || !chartData?.points?.length) {
          setHoveredInfo(null);
          setHoveredPos(null);
          return;
        }
        const data = param.seriesData.get(series) as { value?: number; close?: number } | undefined;
        const priceVal = data?.value ?? data?.close;
        if (priceVal !== undefined) {
          const firstPrice = chartData.points[0]?.value || chartData.currentPrice || 1.0;
          const delta = priceVal - firstPrice;
          const deltaPct = firstPrice > 0 ? (delta / firstPrice) * 100 : 0;
          const timeNum = typeof param.time === "number" ? param.time : (param.time as any);
          const timeStr = formatHoverTime(timeNum, timeframe);

          setHoveredInfo({
            price: priceVal,
            delta,
            deltaPct,
            timeStr,
          });
          if (param.point) {
            setHoveredPos({ x: param.point.x, y: param.point.y });
          }
        } else {
          setHoveredInfo(null);
          setHoveredPos(null);
        }
      });
    });

    // ResizeObserver with threshold to avoid micro-jitter & fitContent on width change
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length > 0 && chartInstanceRef.current) {
        const newWidth = Math.floor(entries[0].contentRect.width);
        if (newWidth > 200 && Math.abs(newWidth - lastWidthRef.current) >= 3) {
          lastWidthRef.current = newWidth;
          chartInstanceRef.current.applyOptions({ width: newWidth });
          chartInstanceRef.current.timeScale().fitContent();
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
        seriesInstanceRef.current = null;
      }
    };
  }, [height, timeframe, chartMode, formatHoverTime, isDark]);

  const [liveMicroPrice, setLiveMicroPrice] = useState<number | null>(null);
  const latestAnchorPriceRef = useRef<number>(1.00009);
  const lastPointTimeRef = useRef<number>(0);
  const liveTickCounterRef = useRef<number>(0);

  // Dynamic Theme Options Update (Instant, Zero Wipe)
  useEffect(() => {
    if (!chartInstanceRef.current) return;
    chartInstanceRef.current.applyOptions({
      layout: {
        textColor: isDark ? "#8492a6" : "#475569",
      },
      crosshair: {
        vertLine: {
          labelBackgroundColor: isDark ? "#111827" : "#334155",
        },
      },
    });
  }, [isDark]);

  // Update series data whenever chartData changes
  useEffect(() => {
    if (!seriesInstanceRef.current || !chartData?.points || chartData.points.length === 0) return;

    const lastPoint = chartData.points[chartData.points.length - 1];
    if (lastPoint) {
      latestAnchorPriceRef.current = chartData.currentPrice || lastPoint.value || 1.00009;
      lastPointTimeRef.current = Number(lastPoint.time);
    }

    if (chartMode === "candles") {
      const formattedPoints = chartData.points.map((p) => ({
        time: p.time as UTCTimestamp,
        open: p.open ?? p.value,
        high: p.high ?? p.value,
        low: p.low ?? p.value,
        close: p.close ?? p.value,
      }));
      seriesInstanceRef.current.setData(formattedPoints as any);
    } else {
      const formattedPoints = chartData.points.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.value,
      }));
      seriesInstanceRef.current.setData(formattedPoints as any);
    }

    if (chartInstanceRef.current) {
      chartInstanceRef.current.timeScale().fitContent();
    }
  }, [chartData, chartMode]);

  // Clear any temporary micro price and keep display locked to authentic oracle data
  useEffect(() => {
    setLiveMicroPrice(null);
  }, [chartMode, chartData]);

  const isHovered = hoveredInfo !== null;
  const basePrice = chartData?.currentPrice ?? 1.0;
  const activeUnhoveredPrice = (chartMode === "line" && liveMicroPrice !== null) ? liveMicroPrice : basePrice;
  const currentDisplayPrice = isHovered ? hoveredInfo.price : activeUnhoveredPrice;
  const firstPtVal = chartData?.points?.[0]?.value ?? basePrice;
  const displayDelta = isHovered ? hoveredInfo.delta : (currentDisplayPrice - firstPtVal);
  const displayDeltaPct = isHovered ? hoveredInfo.deltaPct : (firstPtVal > 0 ? (displayDelta / firstPtVal) * 100 : (chartData?.change24hPct ?? 0));
  const isPositive = displayDelta >= 0;

  const defaultTimeLabel =
    timeframe === "1D"
      ? "Past 24h"
      : timeframe === "1H"
      ? "Past 1h"
      : timeframe === "1W"
      ? "Past 1w"
      : timeframe === "1M"
      ? "Past 1m"
      : timeframe === "1Y"
      ? "Past 1y"
      : "All time";

  const displayTimeStr = isHovered ? hoveredInfo.timeStr : defaultTimeLabel;

  if (asset === "cirBTC") {
    return (
      <div
        className={`relative flex flex-col items-center justify-center w-full h-full bg-transparent border-0 shadow-none p-0 select-none ${className}`}
        style={{ minHeight: height || 465 }}
      >
        <span
          style={{
            fontFamily: "var(--font-inter), var(--font-geist), -apple-system, BlinkMacSystemFont, sans-serif",
            letterSpacing: "-0.01em",
          }}
          className="text-sm font-medium text-[var(--text-muted,#8E8E93)] text-center tracking-tight"
        >
          Chart not available
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col w-full bg-transparent border-0 shadow-none p-0 select-none ${className}`}
      onMouseLeave={() => setHoveredInfo(null)}
    >
      {/* ── TOP HEADER (Borderless Logo + USDC + Big Price + Dynamic Hover Indicators & Filters) ── */}
      <div className="flex items-start justify-between w-full pb-4 gap-4">
        {/* Left: Token Identity & Big Live / Hover Price */}
        <div className="flex flex-col">
          {/* Logo + Asset Label */}
          <div className="flex items-center gap-2">
            <img
              src={asset === "cirBTC" ? "/cirbtc.png" : (asset === "EURC" ? "/eurc.png" : "/usdc.png")}
              alt={asset}
              className="w-[18px] h-[18px] rounded-full object-cover shrink-0 select-none pointer-events-none"
            />
            <span
              style={{
                fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                letterSpacing: "-0.01em",
              }}
              className="text-sm font-medium text-[var(--text-secondary,#8E8E93)]"
            >
              {asset}
            </span>
          </div>

          {/* Big Price (Theme-Adaptive Clean, Slim / Medium Typography) */}
          <h2
            style={{
              fontFamily: "var(--font-inter), var(--font-geist), -apple-system, BlinkMacSystemFont, sans-serif",
              letterSpacing: "-0.015em",
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
            className="text-[36px] sm:text-[40px] text-[var(--text-primary)] leading-none tabular-nums mt-1.5 transition-colors"
          >
            {formatPrice(currentDisplayPrice)}
          </h2>

          {/* Dynamic Change Indicator (Dollar delta + Percentage + Timestamp on Hover) */}
          <div className="flex items-center gap-1.5 mt-1.5 text-xs font-medium tracking-tight">
            <div
              className={`flex items-center gap-0.5 font-semibold ${
                isPositive ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500"
              }`}
            >
              {isPositive ? (
                <ArrowUpRight size={14} className="shrink-0 text-emerald-600 dark:text-emerald-500" />
              ) : (
                <ArrowDownRight size={14} className="shrink-0 text-red-600 dark:text-red-500" />
              )}
              <span>
                {formatDelta(displayDelta)} ({isPositive ? "+" : ""}
                {displayDeltaPct.toFixed(2)}%)
              </span>
            </div>
            <span className="text-slate-400 dark:text-slate-600">·</span>
            <span className="text-[var(--text-muted,#8E8E93)] text-[11px] font-normal transition-colors">
              {displayTimeStr}
            </span>
          </div>
        </div>

        {/* Right: Timeframe Switcher, Chart Mode Filter & Refresh Button */}
        <div className="flex flex-wrap items-center gap-2 self-start pt-0.5">
          {/* Timeframe Switcher */}
          <div
            style={{
              background: isDark ? "#151922" : "var(--surface-soft, #f1f5f9)",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border, #e2e8f0)",
            }}
            className="flex items-center gap-1 p-1 rounded-full shadow-sm"
          >
            {(["1H", "1D", "1W", "1M", "1Y", "ALL"] as Timeframe[]).map((tf) => {
              const isActive = timeframe === tf;
              return (
                <button
                  key={tf}
                  onClick={() => {
                    setHoveredInfo(null);
                    setTimeframe(tf);
                  }}
                  style={{
                    background: isActive
                      ? isDark
                        ? "#283040"
                        : "#ffffff"
                      : "transparent",
                    color: isActive
                      ? isDark
                        ? "#ffffff"
                        : "#0f172a"
                      : isDark
                      ? "#94a3b8"
                      : "#64748b",
                    border: isActive
                      ? isDark
                        ? "1px solid rgba(255, 255, 255, 0.12)"
                        : "1px solid rgba(0, 0, 0, 0.08)"
                      : "1px solid transparent",
                    boxShadow: isActive ? (isDark ? "none" : "0 1px 3px rgba(0,0,0,0.08)") : "none",
                  }}
                  className="px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
                >
                  {tf === "ALL" ? "All" : tf}
                </button>
              );
            })}
          </div>

          {/* 3 High-End Outline Chart Type Icons (Candles: Green/Red, Peg: Green, Line: Blue) */}
          <div
            style={{
              background: isDark ? "#151922" : "var(--surface-soft, #f1f5f9)",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border, #e2e8f0)",
            }}
            className="flex items-center gap-1 p-1 rounded-full shadow-sm"
          >
            {/* 1. Candlestick Icon (Green left candle & Red right candle outline) */}
            <button
              onClick={() => setChartMode("candles")}
              title="Candlestick Chart"
              style={{
                background: chartMode === "candles"
                  ? isDark
                    ? "#283040"
                    : "#ffffff"
                  : "transparent",
                border: chartMode === "candles"
                  ? isDark
                    ? "1px solid rgba(255, 255, 255, 0.14)"
                    : "1px solid rgba(0, 0, 0, 0.08)"
                  : "1px solid transparent",
                boxShadow: chartMode === "candles" ? (isDark ? "none" : "0 1px 3px rgba(0,0,0,0.08)") : "none",
                opacity: chartMode === "candles" ? 1 : 0.85,
              }}
              className="p-1.5 rounded-full transition-all cursor-pointer flex items-center justify-center hover:opacity-100"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                {/* Left Green Candle */}
                <line x1="7" y1="2" x2="7" y2="6" stroke={isDark ? "#22c55e" : "#16a34a"} />
                <rect x="4.5" y="6" width="5" height="10" rx="1.2" stroke={isDark ? "#22c55e" : "#16a34a"} fill={chartMode === "candles" ? (isDark ? "rgba(34, 197, 94, 0.3)" : "rgba(22, 163, 74, 0.2)") : "none"} />
                <line x1="7" y1="16" x2="7" y2="22" stroke={isDark ? "#22c55e" : "#16a34a"} />
                {/* Right Red Candle */}
                <line x1="17" y1="4" x2="17" y2="8" stroke={isDark ? "#f43f5e" : "#dc2626"} />
                <rect x="14.5" y="8" width="5" height="9" rx="1.2" stroke={isDark ? "#f43f5e" : "#dc2626"} fill={chartMode === "candles" ? (isDark ? "rgba(244, 63, 94, 0.3)" : "rgba(220, 38, 38, 0.2)") : "none"} />
                <line x1="17" y1="17" x2="17" y2="20" stroke={isDark ? "#f43f5e" : "#dc2626"} />
              </svg>
            </button>

            {/* 2. Baseline / Peg Icon (Neat Green outline curve) */}
            <button
              onClick={() => setChartMode("baseline")}
              title="Baseline Deviation Chart"
              style={{
                background: chartMode === "baseline"
                  ? isDark
                    ? "#283040"
                    : "#ffffff"
                  : "transparent",
                border: chartMode === "baseline"
                  ? isDark
                    ? "1px solid rgba(255, 255, 255, 0.14)"
                    : "1px solid rgba(0, 0, 0, 0.08)"
                  : "1px solid transparent",
                boxShadow: chartMode === "baseline" ? (isDark ? "none" : "0 1px 3px rgba(0,0,0,0.08)") : "none",
                opacity: chartMode === "baseline" ? 1 : 0.85,
              }}
              className="p-1.5 rounded-full transition-all cursor-pointer flex items-center justify-center hover:opacity-100"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="13" x2="22" y2="13" stroke={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)"} strokeDasharray="2 2" strokeWidth="1.5" />
                <path d="M3 16l4.5-7 4 5 4.5-9 5 8" stroke={isDark ? "#22c55e" : "#16a34a"} fill={chartMode === "baseline" ? (isDark ? "rgba(34, 197, 94, 0.25)" : "rgba(22, 163, 74, 0.15)") : "none"} />
              </svg>
            </button>

            {/* 3. Area / Line Icon (Neat Blue outline curve) */}
            <button
              onClick={() => setChartMode("line")}
              title="Line / Area Chart"
              style={{
                background: chartMode === "line"
                  ? isDark
                    ? "#283040"
                    : "#ffffff"
                  : "transparent",
                border: chartMode === "line"
                  ? isDark
                    ? "1px solid rgba(255, 255, 255, 0.14)"
                    : "1px solid rgba(0, 0, 0, 0.08)"
                  : "1px solid transparent",
                boxShadow: chartMode === "line" ? (isDark ? "none" : "0 1px 3px rgba(0,0,0,0.08)") : "none",
                opacity: chartMode === "line" ? 1 : 0.85,
              }}
              className="p-1.5 rounded-full transition-all cursor-pointer flex items-center justify-center hover:opacity-100"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l5-6.5 4 4 5-8.5 4 6" stroke={isDark ? "#38bdf8" : "#2563eb"} fill={chartMode === "line" ? (isDark ? "rgba(56, 189, 248, 0.25)" : "rgba(37, 99, 235, 0.15)") : "none"} />
                <line x1="3" y1="21" x2="21" y2="21" stroke={isDark ? "#38bdf8" : "#2563eb"} strokeOpacity="0.45" strokeWidth="1.5" />
              </svg>
            </button>
          </div>

          <button
            onClick={() => {
              setHoveredInfo(null);
              fetchData(timeframe, true);
            }}
            disabled={isRefreshing || isLoading}
            title="Refresh Price Data"
            style={{
              background: isDark ? "#151922" : "var(--surface-soft, #f1f5f9)",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid var(--border, #e2e8f0)",
              color: isDark ? "#94a3b8" : "#64748b",
            }}
            className="p-2 rounded-full transition-all disabled:opacity-40 cursor-pointer shadow-sm hover:opacity-80"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── CHART CANVAS (Theme-Adaptive Dot Matrix Grid) ── */}
      <div className="relative w-full overflow-hidden" style={{ height }}>
        {/* Uniswap-style Minimal Dot Matrix Grid (Only in chart plotting area, excluded from time & price scales) */}
        <div
          className="absolute pointer-events-none z-0"
          style={{
            top: 0,
            left: 0,
            right: 64,
            bottom: 28,
            backgroundImage: isDark
              ? "radial-gradient(rgba(255, 255, 255, 0.16) 1px, transparent 1px)"
              : "radial-gradient(rgba(15, 23, 42, 0.10) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            backgroundPosition: "10px 10px",
          }}
        />

        {/* Loading Skeleton Layout */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col justify-between p-6 bg-white/80 dark:bg-black/80 backdrop-blur-[2px] animate-pulse select-none pointer-events-none">
            {/* Top Guideline */}
            <div className="flex justify-between items-center w-full">
              <div className="h-3 w-16 rounded bg-slate-200 dark:bg-zinc-800" />
              <div className="h-[1px] flex-1 mx-3 bg-slate-200/60 dark:bg-zinc-800/60" />
              <div className="h-3 w-14 rounded bg-slate-200 dark:bg-zinc-800" />
            </div>

            {/* Center Status Badge */}
            <div className="w-full flex flex-col items-center gap-2">
              <div className="h-[1px] w-full bg-slate-200/50 dark:bg-zinc-800/50 mb-2" />
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">Loading USDC Market Data...</span>
              </div>
              <div className="h-[1px] w-full bg-slate-200/50 dark:bg-zinc-800/50 mt-2" />
            </div>

            {/* Bottom Guideline */}
            <div className="flex justify-between items-center w-full">
              <div className="h-3 w-12 rounded bg-slate-200 dark:bg-zinc-800" />
              <div className="h-[1px] flex-1 mx-3 bg-slate-200/60 dark:bg-zinc-800/60" />
              <div className="h-3 w-12 rounded bg-slate-200 dark:bg-zinc-800" />
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-transparent p-6 text-center gap-3">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-bold text-[var(--text-primary)]">Market data temporarily unavailable</span>
              <span className="text-xs text-[var(--text-muted)] max-w-xs">{error}</span>
            </div>
            <button
              onClick={() => fetchData(timeframe)}
              className="mt-2 px-3.5 py-1.5 rounded-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-500 dark:text-blue-300 text-xs font-bold transition-all cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Canvas Element */}
        <div ref={chartContainerRef} className="relative z-[2] w-full h-full" />
      </div>

      <style jsx global>{`
        #tv-attr-logo,
        a[href*="tradingview.com"] {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
        }
      `}</style>
    </div>
  );
}
