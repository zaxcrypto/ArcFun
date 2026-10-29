"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type EnvironmentMode = "testnet" | "mainnet";

export interface EnvironmentFeatures {
  swapEnabled: boolean;
  bridgeEnabled: boolean;
  recoveryEnabled: boolean;
  historyEnabled: boolean;
  faucetEnabled: boolean;
  deployTokenEnabled: boolean;
}

const TESTNET_FEATURES: EnvironmentFeatures = {
  swapEnabled: true,
  bridgeEnabled: true,
  recoveryEnabled: true,
  historyEnabled: true,
  faucetEnabled: true,
  deployTokenEnabled: true,
};

const MAINNET_FEATURES: EnvironmentFeatures = {
  swapEnabled: true,
  bridgeEnabled: true,
  recoveryEnabled: false,
  historyEnabled: false,
  faucetEnabled: false,
  deployTokenEnabled: false,
};

interface EnvironmentContextType {
  mode: EnvironmentMode;
  features: EnvironmentFeatures;
  setMode: (mode: EnvironmentMode) => void;
}

const EnvironmentContext = createContext<EnvironmentContextType | undefined>(undefined);

export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<EnvironmentMode>("testnet");

  useEffect(() => {
    const saved = localStorage.getItem("arcfun-env") as EnvironmentMode;
    if (saved === "testnet" || saved === "mainnet") {
      setModeState(saved);
    }
  }, []);

  const setMode = (newMode: EnvironmentMode) => {
    if (newMode === mode) return;
    setModeState(newMode);
    localStorage.setItem("arcfun-env", newMode);
  };

  const features = mode === "mainnet" ? MAINNET_FEATURES : TESTNET_FEATURES;

  return (
    <EnvironmentContext.Provider value={{ mode, setMode, features }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext);
  if (context === undefined) {
    throw new Error("useEnvironment must be used within an EnvironmentProvider");
  }
  return context;
}
