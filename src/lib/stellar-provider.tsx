"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { isConnected as isFreighterConnected, getAddress, signTransaction, requestAccess, isAllowed } from "@stellar/freighter-api";
import { Horizon } from "@stellar/stellar-sdk";
import { fetchLiveStellarUsdcBalance } from "@/lib/stellar/stellar-rpc";

export interface StellarContextType {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  xlmBalance: string;
  usdcBalance: string;
  eurcBalance: string;
  hasUsdcTrustline: boolean;
  hasEurcTrustline: boolean;
  refreshBalances: (pubKey?: string) => Promise<void>;
  signTransaction: (xdr: string) => Promise<string | null>;
}

const StellarContext = createContext<StellarContextType | undefined>(undefined);

export function StellarProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const [xlmBalance, setXlmBalance] = useState("0");
  const [usdcBalance, setUsdcBalance] = useState("0");
  const [eurcBalance, setEurcBalance] = useState("0");
  
  const [hasUsdcTrustline, setHasUsdcTrustline] = useState(false);
  const [hasEurcTrustline, setHasEurcTrustline] = useState(false);

  // Hardcoded for testnet as per phase requirements
  const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
  const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  const EURC_ISSUER = "GCOZOOOTXF2L3LXYUVSVUNU3F5SBC6ZNDB2ZID5H5VFW2UNFDE77H2AL";

  const refreshBalances = useCallback(async (pubKey?: string) => {
    const target = pubKey || address || (typeof window !== "undefined" ? localStorage.getItem("arc_stellar_address") : null);
    if (!target) return;

    let usdc = "0";
    let hasUsdc = false;

    // 1. Fetch live USDC from Alchemy Soroban RPC first (fastest & most reliable)
    try {
      const live = await fetchLiveStellarUsdcBalance(target);
      if (live && live.formatted) {
        usdc = live.formatted;
        hasUsdc = live.balance > 0n;
        setUsdcBalance(usdc);
        setHasUsdcTrustline(hasUsdc);
      }
    } catch (e) {
      console.warn("Live USDC fetch via Soroban failed:", e);
    }

    // 2. Load XLM & EURC from Horizon
    try {
      const account = await horizon.loadAccount(target);
      let xlm = "0", eurc = "0";
      let hasEurc = false;
      
      account.balances.forEach((b: any) => {
        if (b.asset_type === "native") {
          xlm = b.balance;
        } else if (b.asset_code === "USDC") {
          if (b.asset_issuer === USDC_ISSUER || usdc === "0" || !hasUsdc) {
            usdc = b.balance;
            hasUsdc = true;
          }
        } else if (b.asset_code === "EURC") {
          if (b.asset_issuer === EURC_ISSUER || eurc === "0") {
            eurc = b.balance;
            hasEurc = true;
          }
        }
      });

      setXlmBalance(xlm);
      setUsdcBalance(usdc);
      setEurcBalance(eurc);
      setHasUsdcTrustline(hasUsdc);
      setHasEurcTrustline(hasEurc);
    } catch (error) {
      console.warn("Horizon account query failed (fallback to live Soroban data):", error);
      if (!hasUsdc) {
        setUsdcBalance("0");
        setHasUsdcTrustline(false);
      }
      setXlmBalance("0");
      setEurcBalance("0");
      setHasEurcTrustline(false);
    }
  }, [address]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      let allowedRes = await isAllowed();
      
      let allowed = false;
      if (typeof allowedRes === "object" && allowedRes !== null) {
          allowed = (allowedRes as any).isAllowed;
      } else {
          allowed = !!allowedRes;
      }

      let addressToSet = null;

      if (!allowed) {
        const accessRes = await requestAccess();
        if (accessRes && accessRes.address) {
           addressToSet = accessRes.address;
        } else if (accessRes && (accessRes as any).error) {
           console.error("requestAccess() error:", (accessRes as any).error);
        }
      } else {
        const pubKeyRes = await getAddress();
        if (pubKeyRes && pubKeyRes.address) {
           addressToSet = pubKeyRes.address;
        } else if (pubKeyRes && (pubKeyRes as any).error) {
           console.error("getAddress() error:", (pubKeyRes as any).error);
        }
      }

      if (addressToSet) {
        setAddress(addressToSet);
        setIsConnected(true);
        if (typeof window !== "undefined") {
          try { localStorage.setItem("arc_stellar_address", addressToSet); } catch {}
        }
        await refreshBalances(addressToSet);
      }
    } catch (error) {
      console.error("Stellar connect error:", error);
    } finally {
      setIsConnecting(false);
    }
  }, [refreshBalances]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setIsConnected(false);
    setXlmBalance("0");
    setUsdcBalance("0");
    setEurcBalance("0");
    setHasUsdcTrustline(false);
    setHasEurcTrustline(false);
    if (typeof window !== "undefined") {
      try { localStorage.removeItem("arc_stellar_address"); } catch {}
    }
  }, []);

  useEffect(() => {
    // Restore from localStorage first if available
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("arc_stellar_address");
      if (saved) {
        setAddress(saved);
        setIsConnected(true);
        refreshBalances(saved).catch(() => {});
      }
    }

    const initFreighter = async () => {
      const connectedRes = await isFreighterConnected();
      const connected = typeof connectedRes === "object" ? (connectedRes as any).isConnected : !!connectedRes;
      if (connected) {
        const allowedRes = await isAllowed();
        const allowed = typeof allowedRes === "object" ? (allowedRes as any).isAllowed : !!allowedRes;
        if (allowed) {
            const pubKeyRes = await getAddress();
            if (pubKeyRes && pubKeyRes.address) {
                setAddress(pubKeyRes.address);
                setIsConnected(true);
                if (typeof window !== "undefined") {
                  try { localStorage.setItem("arc_stellar_address", pubKeyRes.address); } catch {}
                }
                await refreshBalances(pubKeyRes.address);
            }
        }
      }
    };
    initFreighter().catch(console.error);
  }, []);

  // Poll for account changes in Freighter
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(async () => {
      try {
        const pubKeyRes = await getAddress();
        if (pubKeyRes && pubKeyRes.address && pubKeyRes.address !== address) {
          setAddress(pubKeyRes.address);
          await refreshBalances(pubKeyRes.address);
        }
      } catch (e) {
        // Ignore polling errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isConnected, address, refreshBalances]);

  const signStellarTx = useCallback(async (xdr: string) => {
    try {
      const opts: any = {
        networkPassphrase: "Test SDF Network ; September 2015"
      };
      if (address) {
        opts.address = address;
      }
      const signed: any = await signTransaction(xdr, opts);
      if (typeof signed === "string" && signed.length > 0) {
        return signed;
      }
      if (signed && typeof signed === "object") {
        if (signed.signedTxXdr) {
          return signed.signedTxXdr;
        }
        if (signed.error) {
          const errMsg = typeof signed.error === "object"
            ? (signed.error.message || JSON.stringify(signed.error))
            : String(signed.error);
          if (errMsg.toLowerCase().includes("user declined") || errMsg.toLowerCase().includes("rejected") || errMsg.toLowerCase().includes("locked")) {
            throw new Error("Please make sure your Freighter wallet is unlocked, then refresh the page and try again.");
          }
          throw new Error(errMsg);
        }
      }
      return null;
    } catch (e: any) {
      console.error("Stellar sign transaction error:", e);
      const msg = e?.message || String(e);
      if (msg.includes("rejected") || msg.includes("locked") || msg.includes("declined") || msg.includes("Freighter")) {
        throw new Error("Please make sure your Freighter wallet is unlocked, then refresh the page and try again.");
      }
      throw new Error(msg);
    }
  }, [address]);

  return (
    <StellarContext.Provider
      value={{
        address,
        isConnected,
        isConnecting,
        connect,
        disconnect,
        xlmBalance,
        usdcBalance,
        eurcBalance,
        hasUsdcTrustline,
        hasEurcTrustline,
        refreshBalances,
        signTransaction: signStellarTx,
      }}
    >
      {children}
    </StellarContext.Provider>
  );
}

export function useStellar() {
  const context = useContext(StellarContext);
  if (context === undefined) {
    throw new Error("useStellar must be used within a StellarProvider");
  }
  return context;
}
