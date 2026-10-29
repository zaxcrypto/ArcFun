"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Loader2, LogOut, ChevronLeft, ArrowRight, ChevronsRight,
  Sun, Moon, Shield, Globe, Copy, Check, ChevronDown, ChevronUp,
  BarChart2, CreditCard, Compass, Pencil, RefreshCw, Plus, X,
  ExternalLink, Wallet, CheckCircle2
} from "lucide-react";
import { useConnect, useAccount, useDisconnect, useBalance } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { useStellar } from "@/lib/stellar-provider";
import { fetchLiveStellarUsdcBalance } from "@/lib/stellar/stellar-rpc";
import { useSuiWallet } from "@/lib/sui-provider";
import { fetchSuiUsdcBalance } from "@/lib/bridge/sui-balance";
import { useTheme } from "next-themes";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { formatUnits, createPublicClient, http, fallback } from "viem";
import { ERC20_APPROVE_ABI } from "@/config/swap-contract";
import { CCTP_DOMAINS, getCctpDomains } from "@/lib/bridge/cctp-provider";
import { ChainRegistry } from "@/lib/bridge/chain-registry";
import { syncArcTestnetRpcInWallet } from "@/lib/evm-rpc";

// ─── Wallet logo CDN fallbacks ──────────────────────────────────────────
export const WALLET_CDN: Record<string, string> = {
  metamask: "https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg",
  walletconnect: "https://avatars.githubusercontent.com/u/37784886?s=200&v=4",
  coinbase: "https://avatars.githubusercontent.com/u/1885080?s=200&v=4",
  rainbow: "https://avatars.githubusercontent.com/u/48327834?s=200&v=4",
  phantom: "https://187760183-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-MVOiF6Zqit57qRLGbn_%2Fuploads%2FGt0Pf76LdwLJGjkPJkOp%2FPhantom_SVG_Icon.svg?alt=media",
  rabby: "https://rabby.io/assets/images/logo.svg",
  okx: "https://avatars.githubusercontent.com/u/64548478?s=200&v=4",
  trust: "https://avatars.githubusercontent.com/u/32179889?s=200&v=4",
  backpack: "https://avatars.githubusercontent.com/u/92887738?s=200&v=4",
  sui: "https://cryptologos.cc/logos/sui-sui-logo.svg?v=040",
  freighter: "https://s2.coinmarketcap.com/static/img/coins/64x64/512.png",
  ethereum: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  solana: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  stellar: "https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png",
  injected: "https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg",
};

export function getWalletFallbackIcon(id: string, name: string): string | null {
  const search = `${id} ${name}`.toLowerCase();
  const key = Object.keys(WALLET_CDN).find(k => search.includes(k));
  return key ? WALLET_CDN[key] : null;
}

const DefaultWalletIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)" }}>
    <rect x="2" y="7" width="20" height="14" rx="3" />
    <path d="M16 3H8L2 7h20l-6-4z" />
    <circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const SuiLogoIcon = ({ size = 18 }: { size?: number }) => (
  <img
    src="https://cryptologos.cc/logos/sui-sui-logo.svg?v=040"
    alt="Sui"
    width={size}
    height={size}
    style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }}
    onError={(e) => {
      (e.currentTarget as HTMLImageElement).src = "/icons/sui.png";
    }}
  />
);

function WalletRow({
  connector,
  disabled,
  isPending,
  onConnect,
}: {
  connector: { id: string; name: string; icon?: string | null; type: "evm" | "solana" | "stellar" | "sui"; connectFn: () => void };
  disabled: boolean;
  isPending?: boolean;
  onConnect: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const iconSrc = !imgFailed
    ? (connector.icon ?? getWalletFallbackIcon(connector.id, connector.name) ?? null)
    : (getWalletFallbackIcon(connector.id, connector.name) ?? null);

  return (
    <button
      disabled={disabled}
      onClick={onConnect}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 14,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.15s ease",
        marginBottom: 8,
        textAlign: "left",
      }}
      className="hover:border-[var(--text-primary)]/40 hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.99]"
    >
      {/* Icon */}
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        background: "var(--surface-soft, rgba(255,255,255,0.05))",
        border: "1px solid var(--border-soft)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        {iconSrc ? (
          <img
            src={iconSrc}
            alt={connector.name}
            width={20}
            height={20}
            style={{ objectFit: "contain", display: "block" }}
            className={connector.name === "Freighter" ? "dark:invert" : ""}
            onError={() => setImgFailed(true)}
          />
        ) : connector.type === "sui" ? (
          <SuiLogoIcon size={18} />
        ) : (
          <DefaultWalletIcon />
        )}
      </div>

      {/* Name */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {connector.name}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>
          {connector.type} Network
        </span>
      </div>

      {/* Arrow or Spinner */}
      {!disabled && (
        isPending ? (
          <Loader2 style={{ width: 16, height: 16, color: "var(--text-primary)", animation: "spin 1s linear infinite", flexShrink: 0 }} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )
      )}
    </button>
  );
}

interface WalletDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  evmAccount?: { address?: string };
  solanaAccount?: { address?: string };
  ensName?: string | null;
  ensAvatar?: string | null;
  admin?: boolean;
  onAdminClick?: () => void;
}

export function WalletDropdown({
  isOpen,
  onClose,
  evmAccount,
  solanaAccount,
  ensName,
  ensAvatar,
  admin,
  onAdminClick
}: WalletDropdownProps) {
  const [hasOpened, setHasOpened] = useState(false);
  const [addView, setAddView] = useState<"evm" | "solana" | "stellar" | "sui" | null>(null);
  const [showWalletsSheet, setShowWalletsSheet] = useState(false);
  const [activeTab, setActiveTab] = useState<"tokens" | "activity">("tokens");
  const [walletFilter, setWalletFilter] = useState<string>("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSuiWalletName, setPendingSuiWalletName] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [sheetSubView, setSheetSubView] = useState<null | "evm" | "solana" | "stellar" | "sui">(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { resolvedTheme, setTheme } = useTheme();
  const { mode } = useEnvironment();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("wallet-dropdown-opened"));
      }
      setHasOpened(true);
      setShowWalletsSheet(false);
      setSheetSubView(null);
      if ((window as any).__openSolanaNext) {
        setAddView("solana");
        (window as any).__openSolanaNext = false;
      } else if ((window as any).__openStellarNext) {
        setAddView("stellar");
        (window as any).__openStellarNext = false;
      } else if ((window as any).__openSuiNext) {
        setAddView("sui");
        (window as any).__openSuiNext = false;
      } else {
        setAddView(null);
      }
    }
  }, [isOpen]);

  const { openConnectModal } = useConnectModal();
  const { connectors, connect, isPending, variables } = useConnect();
  const { disconnect: disconnectEVM } = useDisconnect();
  const { isConnected, address: evmAddress, connector: activeConnector } = useAccount();
  const effectiveEvmAddress = evmAccount?.address || evmAddress;
  const isEvmConnected = Boolean(isConnected || !!effectiveEvmAddress);
  const { data: evmBalanceData, refetch: refetchEvmBalance } = useBalance({ address: effectiveEvmAddress as `0x${string}` | undefined });

  const { wallets, select, connecting: solanaConnecting, connected: solanaConnected, publicKey, disconnect: disconnectSolana, wallet: activeSolanaWallet } = useWallet();
  const solanaPubkeyStr = publicKey ? publicKey.toBase58() : undefined;
  const effectiveSolanaAddress = solanaAccount?.address || solanaPubkeyStr;
  const isSolanaConnected = Boolean(solanaConnected || !!effectiveSolanaAddress);
  const { isConnected: stellarConnected, connect: connectStellar, disconnect: disconnectStellar, address: stellarAddress, isConnecting: stellarConnecting, usdcBalance: stellarUsdcBalance } = useStellar();
  const { isConnected: suiConnected, address: suiAddress, wallets: suiWallets, connectWallet: connectSui, disconnectWallet: disconnectSui, isConnecting: suiConnecting } = useSuiWallet();

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { 
      if (e.key === "Escape") {
        if (sheetSubView !== null) {
          setSheetSubView(null);
        } else if (showWalletsSheet) {
          setShowWalletsSheet(false);
        } else if (addView !== null) {
          setAddView(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, showWalletsSheet, sheetSubView, addView]);

  // Return back once any chain connects
  useEffect(() => {
    if ((addView === "evm" || sheetSubView === "evm") && isEvmConnected) {
      setAddView(null);
      setSheetSubView(null);
    } else if ((addView === "solana" || sheetSubView === "solana") && isSolanaConnected) {
      setAddView(null);
      setSheetSubView(null);
    } else if ((addView === "stellar" || sheetSubView === "stellar") && (stellarConnected || !!stellarAddress)) {
      setAddView(null);
      setSheetSubView(null);
    } else if ((addView === "sui" || sheetSubView === "sui") && (suiConnected || !!suiAddress)) {
      setAddView(null);
      setSheetSubView(null);
    }
  }, [isEvmConnected, isSolanaConnected, stellarConnected, stellarAddress, suiConnected, suiAddress, addView, sheetSubView]);

  const visibleEVMConnectors = [...connectors]
    .filter(c => !["safe", "injected"].includes(c.id))
    .reduce<typeof connectors[number][]>((acc, cur) => {
      if (!acc.some(c => c.name === cur.name)) acc.push(cur);
      return acc;
    }, []);

  const evmConnectors = visibleEVMConnectors.map(c => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    type: "evm" as const,
    connectFn: () => {
      if (c.id === "walletConnect" || c.name.toLowerCase().includes("walletconnect")) {
        if (openConnectModal) {
          openConnectModal();
          return;
        }
      }
      connect({ connector: c });
    }
  }));

  const solanaConnectors = wallets.map(w => ({
    id: w.adapter.name,
    name: w.adapter.name,
    icon: w.adapter.icon,
    type: "solana" as const,
    connectFn: async () => {
      try {
        if (activeSolanaWallet?.adapter?.name === w.adapter.name) {
          await w.adapter.connect();
        } else {
          select(w.adapter.name);
          setTimeout(async () => {
            try {
              await w.adapter.connect();
            } catch (err) {
              console.error("Adapter connect popup error:", err);
            }
          }, 50);
        }
      } catch (e) {
        console.error("Solana connect error:", e);
      }
    }
  }));

  const stellarConnectors = [{
    id: "freighter",
    name: "Freighter",
    icon: WALLET_CDN.freighter,
    type: "stellar" as const,
    connectFn: async () => {
      try {
        await connectStellar();
      } catch (e) {
        console.error("Stellar connect error:", e);
      }
    }
  }];

  const suiConnectors = suiWallets.map(w => ({
    id: w.name,
    name: w.name,
    icon: w.icon || WALLET_CDN.sui,
    type: "sui" as const,
    connectFn: () => {
      setPendingSuiWalletName(w.name);
      connectSui(
        { wallet: w },
        {
          onSuccess: () => setPendingSuiWalletName(null),
          onError: () => setPendingSuiWalletName(null),
          onSettled: () => setPendingSuiWalletName(null),
        }
      );
    }
  }));

  const anyConnected = isEvmConnected || isSolanaConnected || stellarConnected || suiConnected;
  const totalConnected = (isEvmConnected ? 1 : 0) + (isSolanaConnected ? 1 : 0) + (stellarConnected ? 1 : 0) + (suiConnected ? 1 : 0);

  // Disconnect all wallets
  const handleDisconnectAll = () => {
    if (isEvmConnected) disconnectEVM();
    if (isSolanaConnected) disconnectSolana();
    if (stellarConnected) disconnectStellar();
    if (suiConnected) disconnectSui();
    setShowWalletsSheet(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // Primary display identity
  let primaryName = "Connect";
  let primaryRawAddress = "";
  let primaryWalletLogo = WALLET_CDN.ethereum;

  if (ensName) {
    primaryName = ensName;
    primaryRawAddress = effectiveEvmAddress || "";
    primaryWalletLogo = activeConnector?.icon || getWalletFallbackIcon(activeConnector?.id || "", activeConnector?.name || "") || WALLET_CDN.metamask;
  } else if (isEvmConnected && effectiveEvmAddress) {
    primaryName = `${effectiveEvmAddress.slice(0, 6)}...${effectiveEvmAddress.slice(-4)}`;
    primaryRawAddress = effectiveEvmAddress;
    primaryWalletLogo = activeConnector?.icon || getWalletFallbackIcon(activeConnector?.id || "", activeConnector?.name || "") || WALLET_CDN.metamask;
  } else if (isSolanaConnected && effectiveSolanaAddress) {
    primaryName = `${effectiveSolanaAddress.slice(0, 4)}...${effectiveSolanaAddress.slice(-4)}`;
    primaryRawAddress = effectiveSolanaAddress;
    primaryWalletLogo = activeSolanaWallet?.adapter?.icon || WALLET_CDN.phantom || WALLET_CDN.solana;
  } else if (stellarConnected && stellarAddress) {
    primaryName = `${stellarAddress.slice(0, 4)}...${stellarAddress.slice(-4)}`;
    primaryRawAddress = stellarAddress;
    primaryWalletLogo = "/icons/stellar.png";
  } else if (suiConnected && suiAddress) {
    primaryName = `${suiAddress.slice(0, 4)}...${suiAddress.slice(-4)}`;
    primaryRawAddress = suiAddress;
    primaryWalletLogo = WALLET_CDN.sui;
  }
  const primaryAvatar = ensAvatar || (primaryName.includes(".eth") ? `https://euc.li/${primaryName}` : null);

  // List of connected wallet badges for overlapping circle icons
  const connectedWalletLogos: { id: string; name: string; icon: string }[] = [];
  if (isEvmConnected && effectiveEvmAddress) {
    connectedWalletLogos.push({
      id: "evm",
      name: activeConnector?.name || "EVM",
      icon: activeConnector?.icon || getWalletFallbackIcon(activeConnector?.id || "", activeConnector?.name || "") || WALLET_CDN.metamask
    });
  }
  if (isSolanaConnected && effectiveSolanaAddress) {
    connectedWalletLogos.push({
      id: "solana",
      name: activeSolanaWallet?.adapter?.name || "Solana",
      icon: activeSolanaWallet?.adapter?.icon || WALLET_CDN.phantom
    });
  }
  if (stellarConnected) {
    connectedWalletLogos.push({
      id: "stellar",
      name: "Stellar",
      icon: WALLET_CDN.freighter
    });
  }
  if (suiConnected) {
    connectedWalletLogos.push({
      id: "sui",
      name: "Sui",
      icon: WALLET_CDN.sui
    });
  }

  const [usdcBalances, setUsdcBalances] = useState<Record<string, { amount: number; formatted: string }>>({});
  const [isLoadingBalances, setIsLoadingBalances] = useState<boolean>(false);
  const [hasLoadedBalances, setHasLoadedBalances] = useState<boolean>(false);

  // ── Multi-Chain Live USDC Balance Fetcher ──────────────────────────────────────
  const fetchAllUsdcBalances = useCallback(async () => {
    setIsLoadingBalances(true);
    const results: Record<string, { amount: number; formatted: string }> = {};

    const activeChains = ChainRegistry.getActiveChains(mode);

    await Promise.allSettled(
      activeChains.map(async (chainConfig) => {
        const chainName = chainConfig.name;

        // 1. Solana Devnet / Mainnet
        if (chainName.includes("Solana")) {
          if (!isSolanaConnected || !effectiveSolanaAddress) return;
          try {
            const { Connection, PublicKey: SolPublicKey } = await import("@solana/web3.js");
            const mintAddress = chainName === "Solana Devnet"
              ? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
              : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

            const rpc = chainConfig.rpcUrl || "https://api.devnet.solana.com";
            const connection = new Connection(rpc);
            const accounts = await connection.getParsedTokenAccountsByOwner(
              new SolPublicKey(effectiveSolanaAddress),
              { mint: new SolPublicKey(mintAddress) }
            );

            if (accounts.value.length > 0) {
              const balanceInfo = accounts.value[0].account.data.parsed.info.tokenAmount;
              const val = Number(balanceInfo.uiAmount || 0);
              results[chainName] = {
                amount: val,
                formatted: val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
              };
            } else {
              results[chainName] = { amount: 0, formatted: "0.00" };
            }
          } catch (e) {
            results[chainName] = { amount: 0, formatted: "0.00" };
          }
          return;
        }

        // 2. Stellar Testnet
        if (chainName.includes("Stellar")) {
          const addr = stellarAddress || (typeof window !== "undefined" ? localStorage.getItem("arc_stellar_address") : null);
          if (!addr) return;
          try {
            const { balance, decimals } = await fetchLiveStellarUsdcBalance(addr);
            const val = Number(balance) / 10 ** decimals;
            results[chainName] = {
              amount: isNaN(val) ? 0 : val,
              formatted: isNaN(val) ? "0.00" : val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
            };
          } catch {
            const val = parseFloat(stellarUsdcBalance || "0");
            results[chainName] = {
              amount: isNaN(val) ? 0 : val,
              formatted: isNaN(val) ? "0.00" : val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
            };
          }
          return;
        }

        // 3. Sui Testnet
        if (chainName.includes("Sui")) {
          const suiTarget = suiAddress || (suiConnected ? suiAddress : null);
          if (!suiTarget) return;
          try {
            const { balance, decimals } = await fetchSuiUsdcBalance(suiTarget, chainName);
            const val = Number(balance) / 10 ** decimals;
            results[chainName] = {
              amount: val,
              formatted: val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
            };
          } catch {
            results[chainName] = { amount: 0, formatted: "0.00" };
          }
          return;
        }

        // 4. EVM Chains (Base, Arc, Arbitrum, Ethereum, Injective, Monad, etc.)
        if (!isEvmConnected || !effectiveEvmAddress) return;
        const activeDomains = getCctpDomains(mode);
        const cctpDomain = activeDomains[chainName];
        const usdcAddr = (chainName === "Arc Testnet" || chainName === "Arc Mainnet")
          ? ("0x3600000000000000000000000000000000000000" as `0x${string}`)
          : (cctpDomain?.usdc as `0x${string}` | undefined);

        if (!usdcAddr || usdcAddr === "0x0") return;

        try {
          const client = createPublicClient({
            transport: http(chainConfig.rpcUrl, { timeout: 4000, retryCount: 2 }),
          });

          const [bal, dec] = await Promise.all([
            client.readContract({
              address: usdcAddr,
              abi: ERC20_APPROVE_ABI,
              functionName: "balanceOf",
              args: [effectiveEvmAddress as `0x${string}`],
            }),
            client.readContract({
              address: usdcAddr,
              abi: ERC20_APPROVE_ABI,
              functionName: "decimals",
            }).catch(() => 6),
          ]);

          const val = Number(formatUnits(bal as bigint, dec as number));
          results[chainName] = {
            amount: val,
            formatted: val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
          };
        } catch {
          results[chainName] = { amount: 0, formatted: "0.00" };
        }
      })
    );

    setUsdcBalances(results);
    setIsLoadingBalances(false);
    setHasLoadedBalances(true);
  }, [mode, isEvmConnected, effectiveEvmAddress, isSolanaConnected, effectiveSolanaAddress, stellarConnected, stellarAddress, stellarUsdcBalance, suiConnected, suiAddress]);

  useEffect(() => {
    setHasLoadedBalances(false);
  }, [mode, effectiveEvmAddress, effectiveSolanaAddress, stellarAddress, suiAddress]);

  useEffect(() => {
    if (isOpen && anyConnected) {
      fetchAllUsdcBalances();
    }
  }, [isOpen, anyConnected, fetchAllUsdcBalances]);

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (refetchEvmBalance) await refetchEvmBalance();
    await fetchAllUsdcBalances();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // ── Chain Logos & Badges ──────────────────────────────────────────────────
  const CHAIN_BADGES: Record<string, string> = {
    "Arc Testnet": "/arc-logo.png",
    "Arc Mainnet": "/arc-logo.png",
    "Ethereum Sepolia": "/icons/ethereum.svg",
    "Arbitrum Sepolia": "/icons/arbitrum.svg",
    "Arbitrum Mainnet": "/icons/arbitrum.svg",
    "Base Sepolia": "/icons/base.svg",
    "Base Mainnet": "/icons/base.svg",
    "Ink Sepolia": "/icons/ink.svg",
    "Linea Sepolia": "/icons/linea.svg",
    "Monad Testnet": "/icons/monad.svg",
    "Sonic Testnet": "/icons/sonic.png",
    "Unichain Sepolia": "/icons/unichain.svg",
    "Optimism Sepolia": "/icons/optimism.svg",
    "Solana Devnet": "/icons/solana.png",
    "Solana Mainnet": "/icons/solana.png",
    "Injective EVM Testnet": "/icons/injective.png",
    "Stellar Testnet": "/icons/stellar.png",
    "Avalanche Fuji": "/icons/avalanche.png",
    "HyperEVM Testnet": "/icons/hyperevm.png",
    "Polygon Amoy Testnet": "/icons/polygon.png",
    "X Layer Testnet": "/icons/xlayer.png",
    "Sui Testnet": "/icons/sui.png",
  };

  // Build multi-chain USDC portfolio items
  const activeChains = ChainRegistry.getActiveChains(mode);

  const tokenItems = activeChains
    .map((chainConfig) => {
      const chainName = chainConfig.name;
      const isSol = chainName.includes("Solana");
      const isStellar = chainName.includes("Stellar");
      const isSui = chainName.includes("Sui");
      const isEvm = !isSol && !isStellar && !isSui;

      // Only display chains belonging to currently connected wallet ecosystems
      if (isEvm && !isEvmConnected) return null;
      if (isSol && !isSolanaConnected) return null;
      if (isStellar && !stellarConnected) return null;
      if (isSui && !suiConnected) return null;

      const hasBalance = Boolean(usdcBalances[chainName]);
      const balObj = usdcBalances[chainName] || { amount: 0, formatted: "0.00" };
      const chainType = isEvm ? "evm" : isSol ? "solana" : isStellar ? "stellar" : "sui";

      return {
        id: `usdc-${chainName.toLowerCase().replace(/\s+/g, "-")}`,
        symbol: "USDC",
        name: `USDC on ${chainName}`,
        chain: `USDC on ${chainName}`,
        chainId: chainType,
        chainName: chainName,
        amount: balObj.formatted,
        rawAmount: balObj.amount,
        usdValue: `$${balObj.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        icon: "/usdc.png",
        chainBadge: CHAIN_BADGES[chainName] || "/globe.svg",
        hasBalance,
      };
    })
    .filter(Boolean) as {
      id: string;
      symbol: string;
      name: string;
      chain: string;
      chainId: string;
      chainName: string;
      amount: string;
      rawAmount: number;
      usdValue: string;
      icon: string;
      chainBadge: string;
      hasBalance: boolean;
    }[];

  // Sort descending by USDC balance so higher balance chains stay on top
  tokenItems.sort((a, b) => b.rawAmount - a.rawAmount);

  const filteredTokens = walletFilter === "all"
    ? tokenItems
    : tokenItems.filter((t) => t.chainId === walletFilter);

  // Total Portfolio USD is the exact sum of all USDC across all connected chains
  const totalUsdcSum = tokenItems.reduce((acc, curr) => acc + curr.rawAmount, 0);
  const totalUsdDisplay = `$${totalUsdcSum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const isBalancesLoading = !hasLoadedBalances || isRefreshing || Object.keys(usdcBalances).length === 0;

  if (!hasOpened && !isOpen) return null;

  const drawerContent = (
    <>
      {/* ── Invisible Click-Outside Backdrop ────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <div
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99998,
              background: "transparent",
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Slide-Over Drawer Container (AskORO Floating Curved Panel) ─── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            initial={{ x: "calc(100% + 24px)", opacity: 0.7 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "calc(100% + 24px)", opacity: 0.7 }}
            transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.85 }}
            style={{
              position: "fixed",
              top: 8,
              bottom: 8,
              width: 410,
              zIndex: 99999,
              display: "flex",
              flexDirection: "column",
            }}
            className="right-2 sm:right-3.5 max-w-[calc(100vw-16px)] sm:max-w-[calc(100vw-28px)]"
          >
            {/* Outside Borderless Collapse Button [>>] */}
            <button
              onClick={onClose}
              style={{
                position: "absolute",
                top: 18,
                left: -38,
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
                zIndex: 100000,
              }}
              className="hover:bg-black/10 dark:hover:bg-white/10 hover:text-[var(--text-primary)] active:scale-95"
              title="Close drawer"
            >
              <ChevronsRight size={18} />
            </button>

            {/* Inner Drawer Content Container */}
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "var(--surface)",
                borderRadius: "28px",
                border: "1px solid var(--border)",
                boxShadow: "0 12px 40px -8px rgba(0, 0, 0, 0.14), 0 4px 16px -2px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(255, 255, 255, 0.05)",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {/* ── Top Header Bar ────────────────────────────────────────────── */}
              <div style={{
                padding: "18px 22px 10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
                gap: 10
              }}>
                {/* Profile Avatar & Name */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flex: 1,
                  minWidth: 0,
                }}>
                  {/* Show Back button only when inside a nested connect subview */}
                  {addView !== null && (
                    <button
                      onClick={() => setAddView(null)}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        background: "var(--surface-soft, rgba(255,255,255,0.05))",
                        border: "1px solid var(--border)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-primary)",
                        transition: "all 0.15s ease",
                        flexShrink: 0,
                      }}
                      className="hover:scale-105 active:scale-95"
                      title="Back"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}

                {anyConnected ? (
                  <>
                    {/* User Avatar / Connected Wallet Logo */}
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "var(--surface-soft, rgba(255,255,255,0.06))",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      overflow: "hidden",
                      WebkitMaskImage: "-webkit-radial-gradient(white, black)",
                      padding: 0,
                    }}>
                      {primaryAvatar ? (
                        <img
                          src={primaryAvatar}
                          alt={primaryName}
                          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <img
                          src={primaryWalletLogo}
                          alt={primaryName}
                          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }}
                          className={primaryWalletLogo === "/icons/stellar.png" ? "dark:invert" : ""}
                        />
                      )}
                    </div>
                    
                      {/* Name & Address Column */}
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          letterSpacing: "-0.02em",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        }}>
                          {primaryName}
                        </span>
                      </div>

                      {primaryRawAddress && (
                        <button
                          onClick={() => copyToClipboard(primaryRawAddress)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            textAlign: "left",
                            maxWidth: "100%",
                          }}
                          title="Click to copy address"
                        >
                          <span style={{
                            fontSize: 13,
                            fontWeight: 400,
                            color: "var(--text-secondary, #8E8E93)",
                            fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                            letterSpacing: "-0.01em",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {primaryRawAddress.length > 26 
                              ? `${primaryRawAddress.slice(0, 10)}...${primaryRawAddress.slice(-8)}` 
                              : primaryRawAddress}
                          </span>
                          {copiedAddress === primaryRawAddress ? (
                            <Check size={12} style={{ color: "#22c55e", flexShrink: 0 }} />
                          ) : (
                            <Copy size={12} style={{ color: "var(--text-muted)", opacity: 0.6, flexShrink: 0 }} />
                          )}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", minWidth: 0, flex: 1 }}>
                    <span style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      letterSpacing: "-0.02em",
                      fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                    }}>
                      Connect Wallet
                    </span>
                  </div>
                )}
                </div>

                {/* Right Close "X" Button (Mobile only - hidden on desktop) */}
                <button
                  onClick={onClose}
                  type="button"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--surface-soft, rgba(0, 0, 0, 0.04))",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    color: "var(--text-primary)",
                    transition: "all 0.15s ease",
                    flexShrink: 0,
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                  }}
                  className="flex md:hidden items-center justify-center hover:scale-105 active:scale-95 hover:bg-black/10 dark:hover:bg-white/10"
                  title="Close"
                >
                  <X size={15} strokeWidth={2.4} />
                </button>
              </div>

            {/* Divider */}
            <div style={{ height: 1, background: "var(--border-soft)", margin: "0 20px" }} />

            {/* ── Main Scrollable Body ────────────────────────────────────────── */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(255,255,255,0.1) transparent",
                position: "relative",
              }}
              className="px-3.5 sm:px-5 py-4"
            >

              {/* Sub-view: Add / Connect specific wallet */}
              {addView !== null ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(() => {
                    const list = addView === "evm" ? evmConnectors
                               : addView === "solana" ? solanaConnectors
                               : addView === "stellar" ? stellarConnectors
                               : suiConnectors;

                    if (list.length === 0) {
                      return (
                        <div style={{ 
                          padding: "24px 12px", 
                          textAlign: "center", 
                          color: "var(--text-muted)", 
                          fontSize: 13,
                          fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        }}>
                          No wallets detected. Please install extension.
                        </div>
                      );
                    }

                    return list.map((connector) => {
                      const isThisPending = connector.type === "evm"
                        ? (isPending && (variables?.connector as any)?.id === connector.id)
                        : connector.type === "solana" ? (solanaConnecting && activeSolanaWallet?.adapter?.name === connector.id)
                        : connector.type === "stellar" ? (stellarConnecting && !stellarConnected)
                        : (suiConnecting && pendingSuiWalletName === connector.id);

                      const isDisabled = ((isPending || solanaConnecting || stellarConnecting || suiConnecting) && !isThisPending);

                      return (
                        <WalletRow
                          key={`${connector.type}-${connector.id}`}
                          connector={connector}
                          disabled={isDisabled}
                          isPending={isThisPending}
                          onConnect={connector.connectFn}
                        />
                      );
                    });
                  })()}
                </div>
              ) : anyConnected ? (
                /* ── Portfolio View (Relay Style) ────────────────────────── */
                <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 18 }}>
                  
                  {/* Portfolio Balance Inner Card Box - Ultra-clean curved highlight */}
                  <div style={{
                    background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
                    border: "1px solid var(--border)",
                    borderRadius: 22,
                    padding: "20px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ 
                        fontSize: 14, 
                        fontWeight: 400, 
                        color: "var(--text-secondary, #8E8E93)", 
                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        letterSpacing: "-0.01em" 
                      }}>
                        Portfolio balance
                      </span>
                      <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: 4,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "50%",
                          transition: "all 0.15s ease",
                        }}
                        className="hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5"
                        title="Refresh balances"
                      >
                        <RefreshCw size={14} className={isRefreshing ? "animate-spin text-[var(--text-primary)]" : ""} />
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "baseline", marginTop: 4, width: "100%", overflow: "hidden" }}>
                      {isBalancesLoading ? (
                        <div
                          className="arc-skeleton-shimmer"
                          style={{
                            width: 140,
                            height: 38,
                            borderRadius: 10,
                            border: "1px solid var(--border-soft)",
                            marginTop: 2,
                            marginBottom: 2
                          }}
                        />
                      ) : (
                        <h2 style={{ 
                          fontSize: totalUsdDisplay.length > 12 ? 26 : totalUsdDisplay.length > 9 ? 28 : 32, 
                          fontWeight: 700, 
                          color: "var(--text-primary)", 
                          letterSpacing: "-0.03em", 
                          lineHeight: 1.15, 
                          margin: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "100%",
                          fontVariantNumeric: "tabular-nums",
                          fontFamily: "var(--font-geist), var(--font-inter), sans-serif"
                        }}>
                          {totalUsdDisplay}
                        </h2>
                      )}
                    </div>

                    <div style={{ 
                      fontSize: 13.5, 
                      fontWeight: 400, 
                      color: "var(--text-secondary, #8E8E93)",
                      marginTop: 4,
                      letterSpacing: "-0.01em",
                      fontFamily: "var(--font-geist), var(--font-inter), sans-serif"
                    }}>
                      Across {totalConnected} connected {totalConnected === 1 ? 'wallet' : 'wallets'}
                    </div>

                    {/* Stable USD PNL display */}
                    {isBalancesLoading ? (
                      <div
                        className="arc-skeleton-shimmer"
                        style={{
                          width: 140,
                          height: 16,
                          borderRadius: 6,
                          marginTop: 14,
                          border: "1px solid var(--border-soft)"
                        }}
                      />
                    ) : (
                      <div style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: 4, 
                        marginTop: 14,
                        fontSize: 14, 
                        fontWeight: 500, 
                        letterSpacing: "-0.01em",
                        fontVariantNumeric: "tabular-nums",
                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif"
                      }}>
                        <span style={{ color: "var(--text-muted, #8E8E93)" }}>$0.00</span>
                        <span style={{ color: "var(--text-muted, #8E8E93)", margin: "0 2px" }}>·</span>
                        <span style={{ color: "var(--text-muted, #8E8E93)" }}>0.0%</span>
                        <span style={{ 
                          color: "var(--text-muted, #8E8E93)", 
                          marginLeft: 6,
                          fontWeight: 400
                        }}>
                          PNL · 1D
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Tabs: Tokens | Activity */}
                  <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border-soft)", gap: 20 }}>
                    <button
                      onClick={() => setActiveTab("tokens")}
                      style={{
                        paddingBottom: 10,
                        fontSize: 14.5,
                        fontWeight: 600,
                        color: activeTab === "tokens" ? "var(--text-primary)" : "var(--text-muted)",
                        borderBottom: activeTab === "tokens" ? "2px solid var(--text-primary)" : "2px solid transparent",
                        background: "transparent",
                        borderTop: "none",
                        borderLeft: "none",
                        borderRight: "none",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        letterSpacing: "-0.015em",
                      }}
                    >
                      Tokens
                    </button>
                    <button
                      onClick={() => setActiveTab("activity")}
                      style={{
                        paddingBottom: 10,
                        fontSize: 14.5,
                        fontWeight: 600,
                        color: activeTab === "activity" ? "var(--text-primary)" : "var(--text-muted)",
                        borderBottom: activeTab === "activity" ? "2px solid var(--text-primary)" : "2px solid transparent",
                        background: "transparent",
                        borderTop: "none",
                        borderLeft: "none",
                        borderRight: "none",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        letterSpacing: "-0.015em",
                      }}
                    >
                      Activity
                    </button>
                  </div>

                  {activeTab === "tokens" ? (
                    <>
                      {/* Filter Dropdown Pill */}
                      <div style={{ position: "relative" }}>
                        <button
                          onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 12px",
                            borderRadius: 12,
                            background: "var(--surface-soft, rgba(255,255,255,0.05))",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                            fontSize: 12.5,
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                            letterSpacing: "-0.01em",
                          }}
                          className="hover:border-[var(--text-primary)]/40"
                        >
                          <span>{walletFilter === "all" ? "All Wallets" : walletFilter.toUpperCase()}</span>
                          <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
                        </button>

                        {showFilterDropdown && (
                          <div
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              marginTop: 6,
                              zIndex: 50,
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 14,
                              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                              padding: 6,
                              minWidth: 150,
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                            }}
                          >
                            <button
                              onClick={() => { setWalletFilter("all"); setShowFilterDropdown(false); }}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                border: "none",
                                background: walletFilter === "all" ? "var(--surface-soft, rgba(255,255,255,0.08))" : "transparent",
                                color: "var(--text-primary)",
                                fontSize: 12.5,
                                fontWeight: 500,
                                textAlign: "left",
                                cursor: "pointer",
                                fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                              }}
                              className="hover:bg-black/5 dark:hover:bg-white/5"
                            >
                              All Wallets
                            </button>
                            {isEvmConnected && (
                              <button
                                onClick={() => { setWalletFilter("evm"); setShowFilterDropdown(false); }}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: walletFilter === "evm" ? "var(--surface-soft, rgba(255,255,255,0.08))" : "transparent",
                                  color: "var(--text-primary)",
                                  fontSize: 12.5,
                                  fontWeight: 500,
                                  textAlign: "left",
                                  cursor: "pointer",
                                  fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                }}
                                className="hover:bg-black/5 dark:hover:bg-white/5"
                              >
                                EVM
                              </button>
                            )}
                            {isSolanaConnected && (
                              <button
                                onClick={() => { setWalletFilter("solana"); setShowFilterDropdown(false); }}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: walletFilter === "solana" ? "var(--surface-soft, rgba(255,255,255,0.08))" : "transparent",
                                  color: "var(--text-primary)",
                                  fontSize: 12.5,
                                  fontWeight: 500,
                                  textAlign: "left",
                                  cursor: "pointer",
                                  fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                }}
                                className="hover:bg-black/5 dark:hover:bg-white/5"
                              >
                                Solana
                              </button>
                            )}
                            {stellarConnected && (
                              <button
                                onClick={() => { setWalletFilter("stellar"); setShowFilterDropdown(false); }}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: walletFilter === "stellar" ? "var(--surface-soft, rgba(255,255,255,0.08))" : "transparent",
                                  color: "var(--text-primary)",
                                  fontSize: 12.5,
                                  fontWeight: 500,
                                  textAlign: "left",
                                  cursor: "pointer",
                                  fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                }}
                                className="hover:bg-black/5 dark:hover:bg-white/5"
                              >
                                Stellar
                              </button>
                            )}
                            {suiConnected && (
                              <button
                                onClick={() => { setWalletFilter("sui"); setShowFilterDropdown(false); }}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: walletFilter === "sui" ? "var(--surface-soft, rgba(255,255,255,0.08))" : "transparent",
                                  color: "var(--text-primary)",
                                  fontSize: 12.5,
                                  fontWeight: 500,
                                  textAlign: "left",
                                  cursor: "pointer",
                                  fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                }}
                                className="hover:bg-black/5 dark:hover:bg-white/5"
                              >
                                Sui
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Token List */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
                        {filteredTokens.length === 0 && isBalancesLoading ? (
                          Array.from({ length: 4 }).map((_, idx) => (
                            <div
                              key={idx}
                              className="arc-skeleton-shimmer"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 12px",
                                borderRadius: 14,
                                border: "1px solid var(--border-soft)",
                                gap: 10,
                                minHeight: 56
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--border-soft)", flexShrink: 0 }} />
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
                                  <div style={{ width: 60, height: 14, borderRadius: 5, background: "var(--border-soft)" }} />
                                  <div style={{ width: 120, height: 11, borderRadius: 4, background: "var(--border-soft)" }} />
                                </div>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                                <div style={{ width: 55, height: 14, borderRadius: 5, background: "var(--border-soft)" }} />
                                <div style={{ width: 75, height: 11, borderRadius: 4, background: "var(--border-soft)" }} />
                              </div>
                            </div>
                          ))
                        ) : (
                          filteredTokens.map((token) => (
                          <div
                            key={token.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 12px",
                              borderRadius: 14,
                              background: "var(--surface-soft, rgba(255,255,255,0.02))",
                              border: "1px solid var(--border-soft)",
                              transition: "all 0.15s ease",
                              gap: 10,
                            }}
                            className="hover:bg-black/5 dark:hover:bg-white/5 hover:border-[var(--border)]"
                          >
                            {/* Left: Token Icon with Chain Sub-badge + Name */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                              <div style={{ position: "relative", width: 34, height: 34, flexShrink: 0 }}>
                                <img
                                  src={token.icon}
                                  alt={token.symbol}
                                  style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }}
                                />
                                {token.chainBadge && (
                                  <img
                                    src={token.chainBadge}
                                    alt=""
                                    style={{
                                      position: "absolute",
                                      bottom: -1,
                                      right: -1,
                                      width: 14,
                                      height: 14,
                                      borderRadius: "50%",
                                      objectFit: "cover",
                                      display: "block",
                                    }}
                                  />
                                )}
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, overflow: "hidden" }}>
                                <span style={{ 
                                  fontSize: 14.5, 
                                  fontWeight: 600, 
                                  color: "var(--text-primary)",
                                  letterSpacing: "-0.015em",
                                  fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                  whiteSpace: "nowrap",
                                }}>
                                  {token.symbol}
                                </span>
                                <span style={{ 
                                  fontSize: 12, 
                                  color: "var(--text-secondary, #8E8E93)",
                                  fontWeight: 400,
                                  letterSpacing: "-0.01em",
                                  fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}>
                                  <span className="hidden sm:inline">{token.chain}</span>
                                  <span className="sm:hidden">{token.chainName || token.chain.replace(/^USDC on\s+/i, "")}</span>
                                </span>
                              </div>
                            </div>

                            {/* Right: USD Value & Token Amount */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0, textAlign: "right", whiteSpace: "nowrap" }}>
                              {(!token.hasBalance || isRefreshing) ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, padding: "2px 0" }}>
                                  <div
                                    className="arc-skeleton-shimmer"
                                    style={{
                                      width: 58,
                                      height: 15,
                                      borderRadius: 5,
                                      border: "1px solid var(--border-soft)"
                                    }}
                                  />
                                  <div
                                    className="arc-skeleton-shimmer"
                                    style={{
                                      width: 76,
                                      height: 12,
                                      borderRadius: 4,
                                      border: "1px solid var(--border-soft)"
                                    }}
                                  />
                                </div>
                              ) : (
                                <>
                                  <span style={{ 
                                    fontSize: 14.5, 
                                    fontWeight: 600, 
                                    color: "var(--text-primary)", 
                                    fontVariantNumeric: "tabular-nums",
                                    fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                    letterSpacing: "-0.025em",
                                    whiteSpace: "nowrap",
                                  }}>
                                    {token.usdValue}
                                  </span>
                                  <span style={{ 
                                    fontSize: 12, 
                                    color: "var(--text-secondary, #8E8E93)", 
                                    fontVariantNumeric: "tabular-nums",
                                    fontWeight: 400,
                                    fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                                    letterSpacing: "-0.01em",
                                    whiteSpace: "nowrap",
                                  }}>
                                    {token.amount} {token.symbol}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        ))
                        )}
                      </div>
                    </>
                  ) : (
                    /* Activity Tab */
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "40px 20px",
                      textAlign: "center",
                      gap: 8,
                      color: "var(--text-muted)",
                    }}>
                      <Compass size={28} style={{ opacity: 0.5 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>No Recent Activity</span>
                      <span style={{ fontSize: 12 }}>Your cross-chain swaps and bridges will appear here.</span>
                    </div>
                  )}
                </div>
              ) : (
                /* When NO wallet is connected at all (Pinned to top of drawer) */
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* EVM */}
                  <button
                    disabled={!termsAccepted}
                    onClick={() => { if (termsAccepted) setAddView("evm"); }}
                    style={{
                      width: "100%", padding: "12px 16px", borderRadius: 16,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      color: "var(--text-primary)", fontSize: 13, fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      cursor: !termsAccepted ? "not-allowed" : "pointer",
                      opacity: !termsAccepted ? 0.45 : 1,
                      transition: "all 0.15s ease",
                    }}
                    className={termsAccepted ? "hover:border-[var(--text-primary)]/40 hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.99]" : ""}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <img src="https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=024" alt="EVM" style={{ width: 20, height: 20 }} />
                      <span>Connect EVM (MetaMask, OKX)</span>
                    </div>
                    <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                  </button>

                  {/* Solana */}
                  <button
                    disabled={!termsAccepted}
                    onClick={() => { if (termsAccepted) setAddView("solana"); }}
                    style={{
                      width: "100%", padding: "12px 16px", borderRadius: 16,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      color: "var(--text-primary)", fontSize: 13, fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      cursor: !termsAccepted ? "not-allowed" : "pointer",
                      opacity: !termsAccepted ? 0.45 : 1,
                      transition: "all 0.15s ease",
                    }}
                    className={termsAccepted ? "hover:border-[var(--text-primary)]/40 hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.99]" : ""}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <img src="https://cryptologos.cc/logos/solana-sol-logo.svg?v=024" alt="Solana" style={{ width: 20, height: 20 }} />
                      <span>Connect Solana (Phantom, Solflare)</span>
                    </div>
                    <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                  </button>

                  {/* Stellar */}
                  <button
                    disabled={!termsAccepted}
                    onClick={() => { if (termsAccepted) setAddView("stellar"); }}
                    style={{
                      width: "100%", padding: "12px 16px", borderRadius: 16,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      color: "var(--text-primary)", fontSize: 13, fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      cursor: !termsAccepted ? "not-allowed" : "pointer",
                      opacity: !termsAccepted ? 0.45 : 1,
                      transition: "all 0.15s ease",
                    }}
                    className={termsAccepted ? "hover:border-[var(--text-primary)]/40 hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.99]" : ""}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <img src="/icons/stellar.png" alt="Stellar" style={{ width: 20, height: 20 }} className="dark:invert" />
                      <span>Connect Stellar (Freighter)</span>
                    </div>
                    <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                  </button>

                  {/* Sui */}
                  <button
                    disabled={!termsAccepted}
                    onClick={() => { if (termsAccepted) setAddView("sui"); }}
                    style={{
                      width: "100%", padding: "12px 16px", borderRadius: 16,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      color: "var(--text-primary)", fontSize: 13, fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      cursor: !termsAccepted ? "not-allowed" : "pointer",
                      opacity: !termsAccepted ? 0.45 : 1,
                      transition: "all 0.15s ease",
                    }}
                    className={termsAccepted ? "hover:border-[var(--text-primary)]/40 hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.99]" : ""}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <SuiLogoIcon size={20} />
                      <span>Connect Sui (Sui Wallet)</span>
                    </div>
                    <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                  </button>

                  {/* Terms Checkbox Agreement Card (Positioned directly under the 4 chain buttons) */}
                  <div
                    onClick={() => setTermsAccepted(!termsAccepted)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "11px 13px",
                      borderRadius: 14,
                      background: "var(--surface-soft, rgba(255,255,255,0.03))",
                      border: termsAccepted ? "1.5px solid #8b9cf4" : "1.5px solid rgba(120, 120, 140, 0.45)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      marginTop: 4,
                    }}
                    className="hover:border-[var(--text-primary)]/50"
                  >
                    <div
                      style={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 1,
                        flexShrink: 0,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => {
                          e.stopPropagation();
                          setTermsAccepted(e.target.checked);
                        }}
                        style={{
                          position: "absolute",
                          opacity: 0,
                          width: "100%",
                          height: "100%",
                          cursor: "pointer",
                          margin: 0,
                        }}
                      />
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: termsAccepted ? "2px solid #8b9cf4" : "2px solid rgba(140, 140, 160, 0.8)",
                          background: termsAccepted ? "#8b9cf4" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.15s ease",
                          boxShadow: termsAccepted ? "0 0 8px rgba(139,156,244,0.35)" : "none",
                        }}
                      >
                        {termsAccepted && <Check size={13} color="#ffffff" strokeWidth={3.2} />}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-secondary, #8E8E93)",
                        lineHeight: 1.5,
                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        userSelect: "none",
                      }}
                    >
                      By connecting a wallet, you agree to our{" "}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          color: "var(--text-primary)",
                          fontWeight: 600,
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                          cursor: "pointer",
                        }}
                        className="hover:text-[#8b9cf4]"
                      >
                        Terms of Service
                      </a>
                      {", "}
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          color: "var(--text-primary)",
                          fontWeight: 600,
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                          cursor: "pointer",
                        }}
                        className="hover:text-[#8b9cf4]"
                      >
                        Privacy Policy
                      </a>
                      {", and "}
                      <a
                        href="/risk"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          color: "var(--text-primary)",
                          fontWeight: 600,
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                          cursor: "pointer",
                        }}
                        className="hover:text-[#8b9cf4]"
                      >
                        Risk Disclosure
                      </a>
                      {"."}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Fixed Bottom Footer Bar ────────────────────────────────────────── */}
            <div style={{
              padding: "12px 20px 18px",
              background: "var(--surface)",
              borderTop: "1px solid var(--border-soft)",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 10
            }}>
              {/* Bottom Multi-Wallet Bar when connected (Relay Bridge style) */}
              {anyConnected && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px 6px 14px",
                    borderRadius: 9999,
                    background: "var(--surface-soft, rgba(255,255,255,0.04))",
                    border: "1px solid var(--border)",
                    transition: "all 0.15s ease",
                  }}
                  className="hover:border-[var(--text-primary)]/30"
                >
                  {/* Left: Overlapping Circle Logos + X Wallets Connected */}
                  <button
                    onClick={() => setShowWalletsSheet(true)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "transparent",
                      border: "none",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      padding: 0,
                      fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                    }}
                    className="hover:opacity-85"
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      {connectedWalletLogos.map((w, idx) => (
                        <div
                          key={w.id}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: "var(--surface)",
                            border: "1.5px solid var(--surface)",
                            marginLeft: idx > 0 ? -6 : 0,
                            overflow: "hidden",
                            WebkitMaskImage: "-webkit-radial-gradient(white, black)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: connectedWalletLogos.length - idx,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                            padding: 0,
                          }}
                        >
                          <img src={w.icon} alt={w.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }} className={w.id === "stellar" ? "dark:invert" : ""} />
                        </div>
                      ))}
                    </div>

                    <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>
                      {totalConnected} {totalConnected === 1 ? "Wallet Connected" : "Wallets Connected"}
                    </span>
                  </button>

                  {/* Right Actions: (+) Add Wallet + Disconnect All */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {/* (+) Add / Manage Wallets Button */}
                    <button
                      onClick={() => setShowWalletsSheet(true)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s ease",
                      }}
                      className="hover:scale-105 active:scale-95 hover:border-[var(--text-primary)]"
                      title="Manage / Add Wallets"
                    >
                      <Plus size={14} />
                    </button>

                    {/* Disconnect All Wallets Button */}
                    <button
                      onClick={handleDisconnectAll}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 6,
                        color: "#ef4444",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s ease",
                      }}
                      className="hover:scale-110 active:scale-95 opacity-90 hover:opacity-100"
                      title="Disconnect All Wallets"
                    >
                      <LogOut size={16} style={{ color: "#ef4444" }} />
                    </button>
                  </div>
                </div>
              )}

              {/* Terms • Privacy • Risk Disclosure */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontSize: 11,
                color: "var(--text-muted)",
              }}>
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}
                  className="hover:text-[var(--text-primary)] transition-colors"
                >
                  Terms
                </a>
                <span>•</span>
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}
                  className="hover:text-[var(--text-primary)] transition-colors"
                >
                  Privacy
                </a>
                <span>•</span>
                <a
                  href="/risk"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}
                  className="hover:text-[var(--text-primary)] transition-colors"
                >
                  Risk Disclosure
                </a>
              </div>
            </div>

            {/* ── Slide-up Bottom Sheet Modal: All Wallets (Relay Style) ─── */}
            <AnimatePresence>
              {showWalletsSheet && (
                <>
                  {/* Backdrop for the bottom sheet */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => {
                      setShowWalletsSheet(false);
                      setSheetSubView(null);
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.06)",
                      backdropFilter: "blur(2px)",
                      WebkitBackdropFilter: "blur(2px)",
                      borderRadius: "28px",
                      zIndex: 100000,
                    }}
                  />

                  {/* The Bottom Sheet itself */}
                  <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 28, stiffness: 320 }}
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      maxHeight: "88%",
                      background: "var(--surface)",
                      borderTop: "1px solid var(--border)",
                      borderTopLeftRadius: 28,
                      borderTopRightRadius: 28,
                      boxShadow: "0 -8px 30px rgba(0,0,0,0.12)",
                      zIndex: 100001,
                      display: "flex",
                      flexDirection: "column",
                      padding: "20px 20px 24px",
                      overflowY: "auto",
                      gap: 14,
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      {sheetSubView ? (
                        <button
                          onClick={() => setSheetSubView(null)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 15,
                            fontWeight: 700,
                            padding: 0,
                            fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                          }}
                          className="hover:opacity-80"
                        >
                          <ChevronLeft size={18} />
                          <span>Connect {sheetSubView === "evm" ? "EVM" : sheetSubView === "solana" ? "Solana" : sheetSubView === "stellar" ? "Stellar" : "Sui"} Wallet</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                          All Wallets
                        </span>
                      )}

                      <button
                        onClick={() => { setShowWalletsSheet(false); setSheetSubView(null); }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: 4,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "50%",
                        }}
                        className="hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* Sheet Content: Sub-view (Connector List) OR Main View (4 Chain Cards) */}
                    {sheetSubView !== null ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {(() => {
                          const list = sheetSubView === "evm" ? evmConnectors
                                     : sheetSubView === "solana" ? solanaConnectors
                                     : sheetSubView === "stellar" ? stellarConnectors
                                     : suiConnectors;

                          if (list.length === 0) {
                            return (
                              <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                No wallets detected. Please install browser extension.
                              </div>
                            );
                          }

                          return list.map((connector) => {
                            const isThisPending = connector.type === "evm"
                              ? (isPending && (variables?.connector as any)?.id === connector.id)
                              : connector.type === "solana" ? (solanaConnecting && activeSolanaWallet?.adapter?.name === connector.id)
                              : connector.type === "stellar" ? (stellarConnecting && !stellarConnected)
                              : (suiConnecting && pendingSuiWalletName === connector.id);

                            const isDisabled = ((isPending || solanaConnecting || stellarConnecting || suiConnecting) && !isThisPending);

                            return (
                              <WalletRow
                                key={`${connector.type}-${connector.id}`}
                                connector={connector}
                                disabled={isDisabled}
                                isPending={isThisPending}
                                onConnect={connector.connectFn}
                              />
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      /* Main 4 Chain Overview: Connected Wallets at Top, Unconnected Wallets Below */
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

                        {/* ── 1. CONNECTED WALLETS (Ordered: EVM -> Solana -> Stellar -> Sui) ── */}
                        
                        {/* EVM Connected */}
                        {isEvmConnected && effectiveEvmAddress && (
                          <div
                            style={{
                              padding: "11px 14px",
                              borderRadius: 16,
                              background: "var(--surface-soft, rgba(255,255,255,0.03))",
                              border: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <img
                                src={activeConnector?.icon || getWalletFallbackIcon(activeConnector?.id || "", activeConnector?.name || "") || WALLET_CDN.metamask}
                                alt="EVM"
                                style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 6 }}
                              />
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                    {ensName || `${effectiveEvmAddress.slice(0, 6)}...${effectiveEvmAddress.slice(-4)}`}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(effectiveEvmAddress)}
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: copiedAddress === effectiveEvmAddress ? "#10b981" : "var(--text-muted)",
                                      cursor: "pointer",
                                      padding: 2,
                                      display: "flex",
                                      alignItems: "center",
                                    }}
                                    title="Copy address"
                                  >
                                    {copiedAddress === effectiveEvmAddress ? <Check size={12} /> : <Copy size={12} />}
                                  </button>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  EVM
                                </span>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await syncArcTestnetRpcInWallet();
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  background: "var(--surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 8,
                                  padding: "3px 8px",
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                  cursor: "pointer",
                                }}
                                className="hover:border-[var(--text-primary)] transition-all"
                                title="Sync Arc Testnet RPC in Rabby / MetaMask to Alchemy"
                              >
                                <RefreshCw size={11} />
                                <span>Sync RPC</span>
                              </button>

                              <button
                                onClick={() => disconnectEVM()}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "transparent",
                                  border: "none",
                                  padding: 6,
                                  color: "#ef4444",
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                }}
                                className="hover:scale-115 active:scale-95 opacity-85 hover:opacity-100"
                                title="Disconnect EVM wallet"
                              >
                                <LogOut size={16} style={{ color: "#ef4444" }} />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Solana Connected */}
                        {isSolanaConnected && effectiveSolanaAddress && (
                          <div
                            style={{
                              padding: "11px 14px",
                              borderRadius: 16,
                              background: "var(--surface-soft, rgba(255,255,255,0.03))",
                              border: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <img
                                src={activeSolanaWallet?.adapter?.icon || WALLET_CDN.phantom}
                                alt="Solana"
                                style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 6 }}
                              />
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                    {`${effectiveSolanaAddress.slice(0, 4)}...${effectiveSolanaAddress.slice(-4)}`}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(effectiveSolanaAddress)}
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: copiedAddress === effectiveSolanaAddress ? "#10b981" : "var(--text-muted)",
                                      cursor: "pointer",
                                      padding: 2,
                                      display: "flex",
                                      alignItems: "center",
                                    }}
                                    title="Copy address"
                                  >
                                    {copiedAddress === effectiveSolanaAddress ? <Check size={12} /> : <Copy size={12} />}
                                  </button>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  Solana
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => disconnectSolana()}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "transparent",
                                border: "none",
                                padding: 6,
                                color: "#ef4444",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                              className="hover:scale-115 active:scale-95 opacity-85 hover:opacity-100"
                              title="Disconnect Solana wallet"
                            >
                              <LogOut size={16} style={{ color: "#ef4444" }} />
                            </button>
                          </div>
                        )}

                        {/* Stellar Connected */}
                        {stellarConnected && stellarAddress && (
                          <div
                            style={{
                              padding: "11px 14px",
                              borderRadius: 16,
                              background: "var(--surface-soft, rgba(255,255,255,0.03))",
                              border: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <img
                                src="/icons/stellar.png"
                                alt="Stellar"
                                style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 6 }}
                                className="dark:invert"
                              />
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                    {`${stellarAddress.slice(0, 4)}...${stellarAddress.slice(-4)}`}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(stellarAddress)}
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: copiedAddress === stellarAddress ? "#10b981" : "var(--text-muted)",
                                      cursor: "pointer",
                                      padding: 2,
                                      display: "flex",
                                      alignItems: "center",
                                    }}
                                    title="Copy address"
                                  >
                                    {copiedAddress === stellarAddress ? <Check size={12} /> : <Copy size={12} />}
                                  </button>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  Stellar
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => disconnectStellar()}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "transparent",
                                border: "none",
                                padding: 6,
                                color: "#ef4444",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                              className="hover:scale-115 active:scale-95 opacity-85 hover:opacity-100"
                              title="Disconnect Stellar wallet"
                            >
                              <LogOut size={16} style={{ color: "#ef4444" }} />
                            </button>
                          </div>
                        )}

                        {/* Sui Connected */}
                        {suiConnected && suiAddress && (
                          <div
                            style={{
                              padding: "11px 14px",
                              borderRadius: 16,
                              background: "var(--surface-soft, rgba(255,255,255,0.03))",
                              border: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <img
                                src="/icons/sui.png"
                                alt="Sui"
                                style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 6 }}
                              />
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                    {`${suiAddress.slice(0, 4)}...${suiAddress.slice(-4)}`}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(suiAddress)}
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: copiedAddress === suiAddress ? "#10b981" : "var(--text-muted)",
                                      cursor: "pointer",
                                      padding: 2,
                                      display: "flex",
                                      alignItems: "center",
                                    }}
                                    title="Copy address"
                                  >
                                    {copiedAddress === suiAddress ? <Check size={12} /> : <Copy size={12} />}
                                  </button>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  Sui
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => disconnectSui()}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "transparent",
                                border: "none",
                                padding: 6,
                                color: "#ef4444",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                              className="hover:scale-115 active:scale-95 opacity-85 hover:opacity-100"
                              title="Disconnect Sui wallet"
                            >
                              <LogOut size={15} style={{ color: "inherit" }} />
                            </button>
                          </div>
                        )}

                        {/* ── 2. UNCONNECTED WALLETS (Ordered: EVM -> Solana -> Stellar -> Sui) ── */}

                        {/* EVM Unconnected */}
                        {!(isEvmConnected && effectiveEvmAddress) && (
                          <button
                            onClick={() => setSheetSubView("evm")}
                            style={{
                              width: "100%",
                              padding: "11px 14px",
                              borderRadius: 16,
                              background: "var(--surface-soft, rgba(255,255,255,0.03))",
                              border: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "all 0.15s ease",
                            }}
                            className="hover:border-[var(--text-primary)]/40 hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <img src="https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=024" alt="EVM" style={{ width: 22, height: 22 }} />
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  Connect EVM Wallet
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text-secondary, #8E8E93)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  MetaMask, Rabby, Coinbase, OKX
                                </span>
                              </div>
                            </div>
                            <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                          </button>
                        )}

                        {/* Solana Unconnected */}
                        {!(isSolanaConnected && effectiveSolanaAddress) && (
                          <button
                            onClick={() => setSheetSubView("solana")}
                            style={{
                              width: "100%",
                              padding: "11px 14px",
                              borderRadius: 16,
                              background: "var(--surface-soft, rgba(255,255,255,0.03))",
                              border: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "all 0.15s ease",
                            }}
                            className="hover:border-[var(--text-primary)]/40 hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <img src="https://cryptologos.cc/logos/solana-sol-logo.svg?v=024" alt="Solana" style={{ width: 22, height: 22 }} />
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  Connect Solana Wallet
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text-secondary, #8E8E93)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  Phantom, Solflare, Backpack
                                </span>
                              </div>
                            </div>
                            <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                          </button>
                        )}

                        {/* Stellar Unconnected */}
                        {!(stellarConnected && stellarAddress) && (
                          <button
                            onClick={() => setSheetSubView("stellar")}
                            style={{
                              width: "100%",
                              padding: "11px 14px",
                              borderRadius: 16,
                              background: "var(--surface-soft, rgba(255,255,255,0.03))",
                              border: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "all 0.15s ease",
                            }}
                            className="hover:border-[var(--text-primary)]/40 hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <img src="/icons/stellar.png" alt="Stellar" style={{ width: 22, height: 22 }} className="dark:invert" />
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  Connect Stellar Wallet
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text-secondary, #8E8E93)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  Freighter
                                </span>
                              </div>
                            </div>
                            <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                          </button>
                        )}

                        {/* Sui Unconnected */}
                        {!(suiConnected && suiAddress) && (
                          <button
                            onClick={() => setSheetSubView("sui")}
                            style={{
                              width: "100%",
                              padding: "11px 14px",
                              borderRadius: 16,
                              background: "var(--surface-soft, rgba(255,255,255,0.03))",
                              border: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "all 0.15s ease",
                            }}
                            className="hover:border-[var(--text-primary)]/40 hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <SuiLogoIcon size={22} />
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  Connect Sui Wallet
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text-secondary, #8E8E93)", fontFamily: "var(--font-geist), var(--font-inter), sans-serif" }}>
                                  Sui Wallet, Nightly
                                </span>
                              </div>
                            </div>
                            <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                          </button>
                        )}

                      </div>
                    )}

                    {/* Disconnect All Button (shown in main view if any wallet connected) */}
                    {sheetSubView === null && anyConnected && (
                      <button
                        onClick={handleDisconnectAll}
                        style={{
                          width: "100%",
                          padding: "12px 18px",
                          borderRadius: 99,
                          border: "none",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          marginTop: 4,
                          fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        }}
                        className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 active:scale-[0.99]"
                      >
                        <LogOut size={14} />
                        <span>Disconnect All Wallets</span>
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
        )}
      </AnimatePresence>

    </>
  );

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(drawerContent, document.body);
}
