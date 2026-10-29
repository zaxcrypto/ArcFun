"use client";

import React, { useState } from "react";
import { useStellar } from "@/lib/stellar-provider";
import { Loader2, Wallet, LogOut } from "lucide-react";

export function StellarConnectButton() {
  const { address, isConnected, isConnecting, connect, disconnect, xlmBalance, usdcBalance } = useStellar();
  const [isOpen, setIsOpen] = useState(false);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  const formatBalance = (bal: string) => {
    const num = parseFloat(bal);
    if (isNaN(num)) return "0.00";
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors"
        >
          <img src="/icons/stellar.png" alt="Stellar" className="w-4 h-4 rounded-full" onError={(e) => (e.currentTarget.src = 'https://cryptologos.cc/logos/stellar-xlm-logo.png')} />
          {formatAddress(address)}
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400 font-medium">Stellar Testnet</span>
                <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full font-medium">Connected</span>
              </div>
              <p className="font-mono text-sm break-all text-zinc-300">{address}</p>
            </div>
            
            <div className="p-4 space-y-3 border-b border-zinc-800">
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-400">XLM</span>
                <span className="text-sm font-medium">{formatBalance(xlmBalance)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-400">USDC</span>
                <span className="text-sm font-medium">{formatBalance(usdcBalance)}</span>
              </div>
            </div>

            <div className="p-2">
              <button
                onClick={() => { disconnect(); setIsOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={isConnecting}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-sm font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
    >
      {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
      {isConnecting ? "Connecting..." : "Connect Stellar"}
    </button>
  );
}
