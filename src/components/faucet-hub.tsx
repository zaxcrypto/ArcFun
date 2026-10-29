"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink } from "lucide-react";

interface FaucetHubProps {
  isOpen: boolean;
  onClose: () => void;
  sidebarCollapsed?: boolean;
}

const FAUCETS = [
  { name: "Ethereum Sepolia", url: "https://www.alchemy.com/faucets", logo: "/icons/ethereum.svg" },
  { name: "Polygon Amoy Testnet", url: "https://faucet.polygon.technology/", logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/3890.png" },
  { name: "X Layer Testnet", url: "https://web3.okx.com/xlayer/faucet", logo: "/icons/xlayer.png" },
  { name: "OP Sepolia", url: "https://www.alchemy.com/faucets", logo: "/icons/optimism.svg" },
  { name: "Arbitrum Sepolia", url: "https://www.alchemy.com/faucets", logo: "/icons/arbitrum.svg" },
  { name: "Base Sepolia", url: "https://www.alchemy.com/faucets", logo: "/icons/base.svg" },
  { name: "Monad Testnet", url: "https://faucet.monad.xyz/", logo: "/icons/monad.svg" },
  { name: "Injective EVM Testnet", url: "https://testnet.faucet.injective.network/", logo: "/icons/injective.png" },
  { name: "Unichain Sepolia", url: "https://faucet.quicknode.com/unichain/sepolia", logo: "/icons/unichain.svg" },
  { name: "Ink Sepolia", url: "https://inkonchain.com/faucet", logo: "/icons/ink.svg" },
  { name: "Solana Devnet", url: "https://faucet.solana.com/", logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png" },
  { name: "Sonic Testnet", url: "https://testnet.soniclabs.com/account", logo: "/icons/sonic.png" },
  { name: "Linea Sepolia", url: "https://ethfaucet.com/", logo: "/icons/linea.svg" },
  { name: "Avalanche Fuji", url: "https://core.app/tools/testnet-faucet", logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/5805.png" },
  { name: "HyperEVM Testnet", url: "https://faucet.quicknode.com/hyperliquid/testnet", logo: "https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg" },
  { name: "Stellar Testnet", url: "https://lab.stellar.org/account/fund?$=network$id=testnet&label=Testnet&horizonUrl=https:////horizon-testnet.stellar.org&rpcUrl=https:////soroban-testnet.stellar.org&passphrase=Test%20SDF%20Network%20/;%20September%202015;;", logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/512.png" }
];

export function FaucetHub({ isOpen, onClose, sidebarCollapsed = false }: FaucetHubProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="lf-modal-backdrop"
            style={{
              position: "fixed",
              inset: 0,
              pointerEvents: "auto",
            }}
          />

          {/* Panel Container (Desktop: Perfectly centered in workspace, Mobile: Bottom) */}
          <div 
            style={{
              position: "fixed",
              top: 0,
              bottom: 0,
              right: 0,
              left: isMobile ? 0 : (sidebarCollapsed ? 76 : 260),
              display: "flex",
              flexDirection: "column",
              justifyContent: isMobile ? "flex-end" : "center",
              alignItems: "center",
              padding: isMobile ? 0 : "24px",
              pointerEvents: "none",
              zIndex: 1000,
              transition: "left 0.25s ease",
            }}
          >
            <motion.div
              initial={isMobile ? { y: "100%", opacity: 0 } : { y: 20, scale: 0.96, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%", opacity: 0 } : { y: 20, scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full md:w-[480px] flex flex-col bg-[var(--surface)] border-[var(--border)] border-t border-l border-r border-b-0 md:border-b md:rounded-2xl rounded-t-2xl shadow-2xl pointer-events-auto relative z-20 overflow-hidden"
              style={{
                maxHeight: isMobile ? "85vh" : "calc(100vh - 60px)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 md:p-5 border-b border-[var(--border)] shrink-0">
                <div className="flex items-center">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Faucet Hub</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors outline-none focus:ring-2 focus:ring-[var(--border)]"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-[var(--text-muted)]" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex flex-col overflow-y-auto p-4 md:p-5 hide-scrollbar" style={{ gap: 16 }}>

                {/* Primary Faucet */}
                <div
                  className="arena-card flex items-center justify-between p-4 md:p-6 min-h-[80px] md:min-h-[96px]"
                >
                  <div className="flex items-center gap-3 md:gap-5 z-10">
                    <div className="flex items-center -space-x-2 md:-space-x-3">
                      <div className="w-8 h-8 md:w-11 md:h-11 rounded-full bg-[var(--surface)] border-2 md:border-[3px] border-[var(--border)] shadow-sm flex items-center justify-center shrink-0 z-10 overflow-hidden relative">
                        <img src="/circle-brand.png" alt="Circle" className="w-full h-full object-contain p-0.5 md:p-1 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<span class="font-bold text-[12px] md:text-[14px] text-[var(--text-primary)]">C</span>'; }} />
                      </div>
                      <div className="w-8 h-8 md:w-11 md:h-11 rounded-full bg-[var(--surface)] border-2 md:border-[3px] border-[var(--border)] shadow-sm flex items-center justify-center shrink-0 z-20 overflow-hidden relative">
                        <img src="/usdc.png" alt="USDC" className="w-full h-full object-contain p-0.5 md:p-1 rounded-full" />
                      </div>
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="font-bold text-[var(--text-primary)] text-[13px] md:text-base leading-tight">Circle USDC Faucet</span>
                      <span className="text-[9px] md:text-[11px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-0.5 md:mt-1">Primary Testnet Asset</span>
                    </div>
                  </div>

                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="z-10 flex items-center gap-1.5 px-4 py-2 md:px-5 md:py-2.5 rounded-full bg-[var(--text-primary)] text-[var(--bg)] hover:opacity-90 text-[11px] md:text-[13px] font-bold transition-all shadow-md hover:-translate-y-0.5"
                    style={{ textDecoration: "none" }}
                  >
                    Claim <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="flex items-center gap-4 my-1 opacity-60">
                  <div className="h-px bg-[var(--border)] flex-1"></div>
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">Supported Networks</span>
                  <div className="h-px bg-[var(--border)] flex-1"></div>
                </div>

                {/* Secondary Faucets */}
                <div className="flex flex-col gap-2 pb-4">
                  {FAUCETS.map((faucet, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl border border-transparent hover:border-[var(--border)] hover:bg-[var(--bg)] transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--bg)] border border-[var(--border)] p-1.5 flex items-center justify-center shrink-0">
                          <img src={faucet.logo} alt={faucet.name} className="w-full h-full object-contain rounded-full" />
                        </div>
                        <span className="font-semibold text-[var(--text-primary)] text-[14px]">{faucet.name}</span>
                      </div>

                      <a
                        href={faucet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--bg)] hover:border-[var(--text-muted)] text-[var(--text-primary)] text-[11px] font-bold transition-all shadow-sm"
                        style={{ textDecoration: "none" }}
                      >
                        Claim <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    </div>
                  ))}
                </div>

              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
