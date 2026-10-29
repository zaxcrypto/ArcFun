"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
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
import { useTheme } from "next-themes";
import { formatUnits } from "viem";
import { ArrowUpRight, ArrowDownRight, RefreshCw, Loader2 } from "lucide-react";

export type Timeframe = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";
export type ChartMode = "candles" | "baseline" | "line";
export type MetricMode = "price" | "marketCap";

interface MemeTokenChartProps {
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  logoUrl?: string;
  spotPrice: bigint; // scaled by 1e18
  quoteTokenSymbol: string;
  quoteTokenPriceUsd?: number;
  realTokenSold: bigint;
  realQuoteReserve: bigint;
  curveProgressBps: bigint;
  isGraduated?: boolean;
  height?: number;
  activities?: any[];
  loadingActivities?: boolean;
}

interface ChartPoint {
  time: UTCTimestamp;
  value: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

export function MemeTokenChart({
  tokenAddress,
  tokenSymbol,
  tokenName,
  logoUrl,
  spotPrice,
  quoteTokenSymbol = "NVDA",
  quoteTokenPriceUsd = 130.0,
  realTokenSold,
  realQuoteReserve,
  curveProgressBps,
  isGraduated = false,
  height = 465,
  activities = [],
  loadingActivities = false,
}: MemeTokenChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const seriesInstanceRef = useRef<ISeriesApi<any> | null>(null);
  const lastWidthRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // User Interactive State
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [chartMode, setChartMode] = useState<ChartMode>("line");
  const [metricMode, setMetricMode] = useState<MetricMode>("price");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Hover crosshair info
  const [hoveredInfo, setHoveredInfo] = useState<{
    value: number;
    delta: number;
    deltaPct: number;
    timeStr: string;
  } | null>(null);

  // Current spot price and market cap calculations
  const spotPriceNum = useMemo(() => {
    try {
      const val = parseFloat(formatUnits(spotPrice, 18));
      return isNaN(val) || val <= 0 ? 0.0000416 : val;
    } catch {
      return 0.0000416;
    }
  }, [spotPrice]);

  const totalSupply = 1_000_000_000;
  const marketCapQuote = spotPriceNum * totalSupply;
  const marketCapUsd = marketCapQuote * quoteTokenPriceUsd;

  // Format price & market cap
  const formatValue = useCallback(
    (val: number | undefined | null): string => {
      if (val === undefined || val === null || isNaN(val)) return "$0.00";
      if (metricMode === "marketCap") {
        if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
        if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
        if (val >= 1_000) return `$${(val / 1_000).toFixed(2)}K`;
        return `$${val.toFixed(2)}`;
      } else {
        if (val < 0.00001) return `${val.toFixed(8)} ${quoteTokenSymbol}`;
        if (val < 0.001) return `${val.toFixed(6)} ${quoteTokenSymbol}`;
        if (val < 1) return `${val.toFixed(4)} ${quoteTokenSymbol}`;
        return `${val.toFixed(2)} ${quoteTokenSymbol}`;
      }
    },
    [metricMode, quoteTokenSymbol]
  );

  const formatDelta = useCallback(
    (diff: number): string => {
      const abs = Math.abs(diff);
      const sign = diff >= 0 ? "+" : "-";
      if (metricMode === "marketCap") {
        if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
        if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
        return `${sign}$${abs.toFixed(2)}`;
      }
      if (abs < 0.00001) return `${sign}${abs.toFixed(8)}`;
      if (abs < 0.001) return `${sign}${abs.toFixed(6)}`;
      return `${sign}${abs.toFixed(4)}`;
    },
    [metricMode]
  );

  // Generate clean chart points: use real on-chain trade activity if present, fallback to clean baseline
  const chartPoints = useMemo(() => {
    const points: ChartPoint[] = [];
    const nowSec = Math.floor(Date.now() / 1000);

    if (activities && activities.length > 0) {
      const sorted = [...activities].sort((a, b) => a.timestamp - b.timestamp);
      let lastTime = 0;

      const firstPriceEth = parseFloat(formatUnits(sorted[0].spotPrice, 18));
      let prevVal = metricMode === "marketCap" ? firstPriceEth * totalSupply * quoteTokenPriceUsd : firstPriceEth;

      // Start point 5 mins before first trade
      const initialTime = (Math.floor(sorted[0].timestamp / 1000) - 300) as UTCTimestamp;
      const initialVal = prevVal * 0.95;
      points.push({
        time: initialTime,
        value: initialVal,
        open: initialVal,
        high: initialVal,
        low: initialVal,
        close: initialVal,
      });
      lastTime = initialTime;

      for (const trade of sorted) {
        let t = Math.floor(trade.timestamp / 1000);
        if (t <= lastTime) {
          t = lastTime + 1;
        }
        lastTime = t;

        const priceEth = parseFloat(formatUnits(trade.spotPrice, 18));
        const val = metricMode === "marketCap" ? priceEth * totalSupply * quoteTokenPriceUsd : priceEth;
        const openVal = prevVal;
        const highVal = Math.max(openVal, val);
        const lowVal = Math.min(openVal, val);

        points.push({
          time: t as UTCTimestamp,
          value: val,
          open: openVal,
          high: highVal,
          low: lowVal,
          close: val,
        });
        prevVal = val;
      }

      // Append current head point
      let endSec = nowSec;
      if (endSec <= lastTime) endSec = lastTime + 1;
      const currentVal = metricMode === "marketCap" ? marketCapUsd : spotPriceNum;
      points.push({
        time: endSec as UTCTimestamp,
        value: currentVal,
        open: prevVal,
        high: Math.max(prevVal, currentVal),
        low: Math.min(prevVal, currentVal),
        close: currentVal,
      });

      return points;
    }

    // Clean flat baseline if 0 trades yet
    const tfMap: Record<Timeframe, { count: number; stepSec: number }> = {
      "1H": { count: 30, stepSec: 120 },
      "1D": { count: 36, stepSec: 2400 },
      "1W": { count: 42, stepSec: 14400 },
      "1M": { count: 48, stepSec: 54000 },
      "1Y": { count: 54, stepSec: 584000 },
      "ALL": { count: 60, stepSec: 720000 },
    };

    const cfg = tfMap[timeframe] || tfMap["1D"];
    const targetValue = metricMode === "marketCap" ? marketCapUsd : spotPriceNum;
    const startTime = nowSec - cfg.count * cfg.stepSec;

    for (let i = 0; i < cfg.count; i++) {
      const t = (startTime + i * cfg.stepSec) as UTCTimestamp;
      points.push({
        time: t,
        value: targetValue,
        open: targetValue,
        high: targetValue,
        low: targetValue,
        close: targetValue,
      });
    }

    return points;
  }, [activities, timeframe, metricMode, marketCapUsd, spotPriceNum, curveProgressBps, tokenAddress]);

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
    const firstPointValue = chartPoints[0]?.value ?? (metricMode === "marketCap" ? marketCapUsd : spotPriceNum);

    if (chartMode === "candles") {
      const series = chart.addSeries(CandlestickSeries, {
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
      });

      const formatted = chartPoints.map((p) => ({
        time: p.time,
        open: p.open ?? p.value,
        high: p.high ?? p.value,
        low: p.low ?? p.value,
        close: p.close ?? p.value,
      }));
      series.setData(formatted as any);
      seriesInstanceRef.current = series;
    } else if (chartMode === "baseline") {
      const series = chart.addSeries(BaselineSeries, {
        baseValue: {
          type: "price",
          price: firstPointValue,
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
        crosshairMarkerBackgroundColor: (chartPoints[chartPoints.length - 1]?.value ?? 0) >= firstPointValue ? "#10b981" : "#ef4444",
        crosshairMarkerBorderWidth: 2,
      });

      const formatted = chartPoints.map((p) => ({
        time: p.time,
        value: p.value,
      }));
      series.setData(formatted as any);
      seriesInstanceRef.current = series;
    } else {
      const series = chart.addSeries(AreaSeries, {
        lineColor: isDark ? "#38bdf8" : "#0284c7",
        topColor: isDark ? "rgba(56, 189, 248, 0.35)" : "rgba(2, 132, 199, 0.25)",
        bottomColor: isDark ? "rgba(7, 9, 14, 0.95)" : "rgba(255, 255, 255, 0.0)",
        lineType: LineType.Curved,
        lineWidth: 2,
        priceLineVisible: true,
        priceLineColor: isDark ? "#38bdf8" : "#0284c7",
        priceLineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 5,
        crosshairMarkerBorderColor: "#ffffff",
        crosshairMarkerBackgroundColor: isDark ? "#38bdf8" : "#0284c7",
        crosshairMarkerBorderWidth: 2,
      });

      const formatted = chartPoints.map((p) => ({
        time: p.time,
        value: p.value,
      }));
      series.setData(formatted as any);
      seriesInstanceRef.current = series;
    }

    chart.timeScale().fitContent();

    // Crosshair movement handler
    chart.subscribeCrosshairMove((param) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        const series = seriesInstanceRef.current;
        if (!param || !param.seriesData || !param.time || !series || !chartPoints.length) {
          setHoveredInfo(null);
          return;
        }
        const data = param.seriesData.get(series) as { value?: number; close?: number } | undefined;
        const val = data?.value ?? data?.close;
        if (val !== undefined) {
          const firstVal = chartPoints[0]?.value || val;
          const delta = val - firstVal;
          const deltaPct = firstVal > 0 ? (delta / firstVal) * 100 : 0;
          const d = new Date((param.time as number) * 1000);
          const timeStr = d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

          setHoveredInfo({
            value: val,
            delta,
            deltaPct,
            timeStr,
          });
        } else {
          setHoveredInfo(null);
        }
      });
    });

    // Resize observer
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
      resizeObserver.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [chartPoints, chartMode, height, isDark, metricMode, marketCapUsd, spotPriceNum]);

  // Delta calculations
  const baseValue = metricMode === "marketCap" ? marketCapUsd : spotPriceNum;
  const firstPointVal = chartPoints[0]?.value ?? baseValue;
  const currentVal = hoveredInfo ? hoveredInfo.value : baseValue;
  const diffVal = hoveredInfo ? hoveredInfo.delta : currentVal - firstPointVal;
  const diffPct = hoveredInfo ? hoveredInfo.deltaPct : firstPointVal > 0 ? (diffVal / firstPointVal) * 100 : 0;
  const isPositive = diffVal >= 0;

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

  const displayTimeStr = hoveredInfo ? hoveredInfo.timeStr : defaultTimeLabel;

  return (
    <div
      className="relative flex flex-col w-full bg-transparent border-0 shadow-none p-0 select-none"
      onMouseLeave={() => setHoveredInfo(null)}
    >
      {/* ── TOP HEADER (Exact Bridge UI Structure) ── */}
      <div className="flex items-start justify-between w-full pb-4 gap-4 flex-wrap">
        {/* Left: Token Identity & Big Live / Hover Price */}
        <div className="flex flex-col">
          {/* Logo + Symbol Label */}
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={tokenSymbol}
                className="w-[18px] h-[18px] rounded-full object-cover shrink-0 select-none pointer-events-none"
              />
            ) : (
              <div className="w-[18px] h-[18px] rounded-full bg-[var(--text-primary)] text-[var(--bg-default)] flex items-center justify-center text-[9px] font-black shrink-0">
                {tokenSymbol.slice(0, 2)}
              </div>
            )}
            <span
              style={{
                fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                letterSpacing: "-0.01em",
              }}
              className="text-sm font-medium text-[var(--text-secondary,#8E8E93)]"
            >
              {tokenName} ({tokenSymbol})
            </span>
          </div>

          {/* Big Hero Value */}
          <h2
            style={{
              fontFamily: "var(--font-inter), var(--font-geist), -apple-system, BlinkMacSystemFont, sans-serif",
              letterSpacing: "-0.015em",
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
            className="text-[36px] sm:text-[40px] text-[var(--text-primary)] leading-none tabular-nums mt-1.5 transition-colors"
          >
            {formatValue(currentVal)}
          </h2>

          {/* Dynamic Change Indicator */}
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
                {formatDelta(diffVal)} ({isPositive ? "+" : ""}
                {diffPct.toFixed(2)}%)
              </span>
            </div>
            <span className="text-slate-400 dark:text-slate-600">·</span>
            <span className="text-[var(--text-muted,#8E8E93)] text-[11px] font-normal transition-colors">
              {displayTimeStr}
            </span>
          </div>
        </div>

        {/* Right: Metric Mode (Price/MCap) + Timeframe Switcher + Chart Mode Icons + Refresh */}
        <div className="flex flex-wrap items-center gap-2 self-start pt-0.5">
          
          {/* Price vs Market Cap Toggle */}
          <div
            style={{
              background: isDark ? "#131824" : "var(--surface-soft, #f1f5f9)",
              border: isDark ? "1px solid #202b40" : "1px solid var(--border-soft, #e2e8f0)",
            }}
            className="flex items-center gap-1 p-1 rounded-full shadow-sm"
          >
            <button
              onClick={() => setMetricMode("price")}
              style={{
                background: metricMode === "price" ? (isDark ? "#25324d" : "#ffffff") : "transparent",
                color: metricMode === "price" ? (isDark ? "#ffffff" : "#0f172a") : (isDark ? "#94a3b8" : "#64748b"),
                border: metricMode === "price" ? (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #cbd5e1") : "1px solid transparent",
                boxShadow: metricMode === "price" ? (isDark ? "none" : "0 1px 3px rgba(0,0,0,0.1)") : "none",
              }}
              className="px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
            >
              Price
            </button>
            <button
              onClick={() => setMetricMode("marketCap")}
              style={{
                background: metricMode === "marketCap" ? (isDark ? "#25324d" : "#ffffff") : "transparent",
                color: metricMode === "marketCap" ? (isDark ? "#ffffff" : "#0f172a") : (isDark ? "#94a3b8" : "#64748b"),
                border: metricMode === "marketCap" ? (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #cbd5e1") : "1px solid transparent",
                boxShadow: metricMode === "marketCap" ? (isDark ? "none" : "0 1px 3px rgba(0,0,0,0.1)") : "none",
              }}
              className="px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
            >
              MCap
            </button>
          </div>

          {/* Chart Style Toggle: Line vs Candlesticks */}
          <div
            style={{
              background: isDark ? "#131824" : "var(--surface-soft, #f1f5f9)",
              border: isDark ? "1px solid #202b40" : "1px solid var(--border-soft, #e2e8f0)",
            }}
            className="flex items-center gap-1 p-1 rounded-full shadow-sm"
          >
            <button
              onClick={() => setChartMode("line")}
              style={{
                background: chartMode === "line" ? (isDark ? "#25324d" : "#ffffff") : "transparent",
                color: chartMode === "line" ? (isDark ? "#ffffff" : "#0f172a") : (isDark ? "#94a3b8" : "#64748b"),
                border: chartMode === "line" ? (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #cbd5e1") : "1px solid transparent",
                boxShadow: chartMode === "line" ? (isDark ? "none" : "0 1px 3px rgba(0,0,0,0.1)") : "none",
              }}
              className="px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
            >
              Line
            </button>
            <button
              onClick={() => setChartMode("candles")}
              style={{
                background: chartMode === "candles" ? (isDark ? "#25324d" : "#ffffff") : "transparent",
                color: chartMode === "candles" ? (isDark ? "#ffffff" : "#0f172a") : (isDark ? "#94a3b8" : "#64748b"),
                border: chartMode === "candles" ? (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #cbd5e1") : "1px solid transparent",
                boxShadow: chartMode === "candles" ? (isDark ? "none" : "0 1px 3px rgba(0,0,0,0.1)") : "none",
              }}
              className="px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
            >
              Candles
            </button>
          </div>

          {/* Timeframe Switcher */}
          <div
            style={{
              background: isDark ? "#131824" : "var(--surface-soft, #f1f5f9)",
              border: isDark ? "1px solid #202b40" : "1px solid var(--border-soft, #e2e8f0)",
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
                    background: isActive ? (isDark ? "#25324d" : "#ffffff") : "transparent",
                    color: isActive ? (isDark ? "#ffffff" : "#0f172a") : (isDark ? "#94a3b8" : "#64748b"),
                    border: isActive ? (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #cbd5e1") : "1px solid transparent",
                    boxShadow: isActive ? (isDark ? "none" : "0 1px 3px rgba(0,0,0,0.1)") : "none",
                  }}
                  className="px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
                >
                  {tf === "ALL" ? "All" : tf}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── CHART CANVAS (Theme-Adaptive Dot Matrix Grid) ── */}
      <div className="relative w-full overflow-hidden" style={{ height }}>
        {/* Minimal Dot Matrix Grid */}
        <div
          className="absolute pointer-events-none z-0"
          style={{
            top: 0,
            left: 0,
            right: 64,
            bottom: 28,
            backgroundImage: isDark
              ? "radial-gradient(#3a4660 1.2px, transparent 1.2px)"
              : "radial-gradient(#cbd5e1 1.2px, transparent 1.2px)",
            backgroundSize: "18px 18px",
            backgroundPosition: "10px 10px",
          }}
        />

        {/* Loading Skeleton Layout */}
        {loadingActivities && (
          <div
            style={{ height }}
            className="absolute inset-0 flex flex-col justify-between p-6 bg-white/80 dark:bg-[#08080a]/85 backdrop-blur-[2px] z-20 rounded-[20px] transition-opacity animate-pulse select-none pointer-events-none"
          >
            {/* Top Guideline Skeleton */}
            <div className="flex justify-between items-center w-full">
              <div className="h-3 w-16 rounded bg-slate-200 dark:bg-zinc-800" />
              <div className="h-[1px] flex-1 mx-3 bg-slate-200/60 dark:bg-zinc-800/60" />
              <div className="h-3 w-14 rounded bg-slate-200 dark:bg-zinc-800" />
            </div>

            {/* Middle Shimmer Guideline & Center Status */}
            <div className="w-full flex flex-col items-center gap-2">
              <div className="h-[1px] w-full bg-slate-200/50 dark:bg-zinc-800/50 mb-2" />
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">Syncing live candle stream...</span>
              </div>
              <div className="h-[1px] w-full bg-slate-200/50 dark:bg-zinc-800/50 mt-2" />
            </div>

            {/* Bottom Guideline Skeleton */}
            <div className="flex justify-between items-center w-full">
              <div className="h-3 w-12 rounded bg-slate-200 dark:bg-zinc-800" />
              <div className="h-[1px] flex-1 mx-3 bg-slate-200/60 dark:bg-zinc-800/60" />
              <div className="h-3 w-12 rounded bg-slate-200 dark:bg-zinc-800" />
            </div>
          </div>
        )}

        {/* Canvas Element */}
        <div ref={chartContainerRef} className="relative z-[2] w-full h-full" />
      </div>
    </div>
  );
}
