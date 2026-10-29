"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

// Map our tokens to actual supported TradingView symbols for real-time data
const TRADINGVIEW_SYMBOLS: Record<string, string> = {
  "0x940181a94a35a4569e4529a3cdfb74e38fd98631": "COINBASE:AEROUSD", // AERO (Architects)
  "0x532f27101965dd16442e59d40670faf5ebb142e4": "GATEIO:BRETTUSDT", // BRETT (ARCAT)
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "COINBASE:USDCUSD",   // USDC
  "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": "COINBASE:EURCUSDC", // EURC
  "0x4200000000000000000000000000000000000006": "COINBASE:ETHUSD",     // WETH (Wrapped USDC)
};

interface TokenChartProps {
  tokenAddress: string;
  tokenName: string;
}

declare global {
  interface Window {
    TradingView: any;
  }
}

export function TokenChart({ tokenAddress }: TokenChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const symbol = TRADINGVIEW_SYMBOLS[tokenAddress.toLowerCase()] || "COINBASE:ETHUSD";
  const isDark = resolvedTheme === "dark";

  // Load TradingView script
  useEffect(() => {
    if (window.TradingView) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);

    return () => {
      // Keep script in head to avoid reloading it multiple times
    };
  }, []);

  // Initialize TradingView Widget
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !window.TradingView) return;

    const containerId = `tv-chart-${Math.random().toString(36).substring(2, 9)}`;
    const chartDiv = document.createElement("div");
    chartDiv.id = containerId;
    chartDiv.style.width = "100%";
    chartDiv.style.height = "100%";
    
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(chartDiv);

    new window.TradingView.widget({
      autosize: true,
      symbol: symbol,
      interval: "15",
      timezone: "Etc/UTC",
      theme: isDark ? "dark" : "light",
      style: "1",
      locale: "en",
      toolbar_bg: isDark ? "#181c24" : "#ffffff",
      enable_publishing: false,
      hide_side_toolbar: true,
      allow_symbol_change: false,
      container_id: containerId,
      studies: [],
      show_popup_button: false,
      withdateranges: false,
      overrides: {
        "paneProperties.topMargin": 8,
        "paneProperties.bottomMargin": 8,
        "paneProperties.background": isDark ? "#181c24" : "#ffffff",
        "paneProperties.backgroundType": "solid",
        "paneProperties.separatorColor": "rgba(0,0,0,0)",
        "paneProperties.vertGridProperties.color": "rgba(0,0,0,0)",
        "paneProperties.horzGridProperties.color": "rgba(0,0,0,0)",
        "paneProperties.vertGridProperties.style": 2,
        "paneProperties.horzGridProperties.style": 2,
        "scalesProperties.lineColor": "rgba(0,0,0,0)",
        "scalesProperties.textColor": isDark ? "#64748b" : "#94a3b8",
        "timeScale.rightOffset": 5,
      },
      disabled_features: [
        "left_toolbar",
        "context_menus",
        "show_chart_property_page",
        "border_around_the_chart",
        "main_series_scale_menu",
      ],
    });
  }, [scriptLoaded, symbol, isDark]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      {/* Remove TradingView iframe internal border */}
      <style>{`
        .tv-chart-host iframe,
        .tv-chart-host iframe body {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
        }
        .tv-chart-host > div {
          border: none !important;
        }
        .tv-chart-host .tv-embedded-widget {
          border: none !important;
        }
      `}</style>
      <div
        ref={containerRef}
        className="tv-chart-host"
        style={{
          width: "100%",
          height: "100%",
          background: isDark ? "#0a0c10" : "#ffffff",
        }}
      />
      {!scriptLoaded && (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDark ? "#0a0c10" : "#ffffff",
          color: isDark ? "#94a3b8" : "#64748b",
          fontSize: 14,
          fontWeight: 500,
        }}>
          Loading TradingView...
        </div>
      )}
    </div>
  );
}
