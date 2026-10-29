import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ArrowUpDown, ArrowRight, Settings, History, Activity, Loader2, CheckCircle, CheckCircle2, XCircle, ExternalLink, RefreshCw, Info, Copy, QrCode, ArrowUpRight, ArrowDownLeft, Clock, Shield, Wallet, X, Send, Globe, ChevronLeft, ChevronDown, ChevronRight, AlertTriangle, Fingerprint, Lock, Eye, EyeOff, Play, Check, Gift, MessageSquare, Sparkles, Search, Plus } from "lucide-react";
import QRCode from "react-qr-code";
import { CROSS_CHAIN_REGISTRY, ERC20_APPROVE_ABI, CHAIN_ID_MAP } from "@/config/swap-contract";
import { withEvmFailover } from "@/lib/evm-rpc";
import { createPublicClient, http, formatUnits, erc20Abi } from "viem";
import { ChainRegistry } from "@/lib/bridge/chain-registry";
import { calculateSpendableBalance, getNetworkReserve } from "@/config/network-reserve";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence, animate, useSpring, useTransform } from "framer-motion";
import { ArcWalletSecurityCenter } from "./arc-wallet-security-center";
import { useArcWalletAuth } from "@/components/arc-wallet-auth-provider";
import { usePortfolioStore } from "@/lib/portfolio/usePortfolioStore";
import { globalEventBus } from "@/lib/portfolio/EventBus";

const SUPPORTED_CHAINS = [
   "Arc Testnet", "Base Sepolia", "Ethereum Sepolia", "Linea Sepolia",
   "Arbitrum Sepolia", "Optimism Sepolia", "Ink Sepolia", "Unichain Sepolia",
   "Monad Testnet", "Sonic Testnet", "Solana Devnet", "Avalanche Fuji", "HyperEVM Testnet"
];

const EURC_CHAINS = [
   "Arc Testnet", "Base Sepolia", "Ethereum Sepolia", "Solana Devnet"
];

export const WALLET_NETWORKS = [
   {
      id: "All Networks",
      name: "All Networks",
      shortName: "All",
      icon: "/globe.svg",
   },
   {
      id: "Arc Testnet",
      name: "Arc Testnet",
      shortName: "Arc",
      icon: "/arc-logo.png",
   },
   {
      id: "Solana Devnet",
      name: "Solana Devnet",
      shortName: "Solana",
      icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png",
   }
];

function getDisplayToken(token: string | null | undefined) {
   if (!token) return 'Unknown Asset';
   if (token === 'USDC' || token === 'EURC' || token === 'SOL') return token;
   return 'Unknown Asset';
}

function AssetLogo({ symbol, logoUrl, className = "w-8 h-8" }: { symbol: string; logoUrl?: string; className?: string }) {
   if (symbol === "USDC") return <img src="/usdc.svg" alt="USDC" className={`${className} rounded-full object-contain aspect-square shrink-0`} />;
   if (symbol === "ARC") return <img src="/arc-logo.png" alt="ARC" className={`${className} rounded-full object-cover aspect-square shrink-0`} />;
   if (symbol === "SOL") return <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png" alt="SOL" className={`${className} rounded-full object-cover aspect-square shrink-0`} />;
   if (symbol === "INJ") return <img src="/icons/injective.png" alt="INJ" className={`${className} rounded-full object-cover aspect-square shrink-0`} />;
   if (symbol === "EURC") return <img src="https://s2.coinmarketcap.com/static/img/coins/128x128/20641.png" alt="EURC" className={`${className} rounded-full object-cover aspect-square shrink-0`} />;
   if (logoUrl) return <img src={logoUrl} alt={symbol} className={`${className} rounded-full object-cover aspect-square shrink-0`} />;
   return (
      <div className={`${className} rounded-full bg-gradient-to-br from-[#3B82F6]/20 to-[#8B5CF6]/20 flex items-center justify-center text-[10px] font-black text-[var(--text-primary)] border border-slate-200/80 dark:border-white/10 uppercase tracking-tighter shadow-sm shrink-0 aspect-square`}>
         {symbol.slice(0, 3)}
      </div>
   );
}



type ViewState = 'main' | 'send' | 'receive' | 'history' | 'security' | 'asset-detail' | 'import';

export interface GroupedAsset {
   symbol: string;
   name: string;
   logoUrl?: string;
   totalBalanceFormatted: string;
   totalBalanceNum: number;
   usdValue: number;
   chains: Array<{
      network: string;
      balanceFormatted: string;
      balanceNum: number;
      usdValue: number;
      percentage: number;
      address: string;
      isNative: boolean;
   }>;
}

function getChainLogo(chainName: string) {
   const lower = chainName.toLowerCase();
   if (lower.includes("arc")) return "/arc-logo.png";
   if (lower.includes("injective")) return "/icons/injective.png";
   if (lower.includes("solana") || lower.includes("sol")) return "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png";
   if (lower.includes("base")) return "/base.svg";
   if (lower.includes("ink")) return "/icons/ink.svg";
   if (lower.includes("arbitrum")) return "/icons/arbitrum.svg";
   if (lower.includes("optimism")) return "/icons/optimism.svg";
   if (lower.includes("linea")) return "/icons/linea.svg";
   if (lower.includes("monad")) return "/icons/monad.svg";
   if (lower.includes("sonic")) return "/icons/sonic.png";
   if (lower.includes("unichain")) return "/icons/unichain.svg";
   if (lower.includes("avalanche") || lower.includes("fuji")) return "/icons/avalanche.png";
   if (lower.includes("polygon") || lower.includes("amoy")) return "/icons/polygon.png";
   if (lower.includes("ethereum") || lower.includes("sepolia") || lower.includes("eth")) return "/icons/ethereum.svg";
   return "/globe.svg";
}

export function ArcWalletDashboard({ walletAddress, isReadOnly, degradedDetails, isFloating, isOpen = true, securityStatus, onStartSecuritySetup }: { walletAddress: string, isReadOnly: boolean, degradedDetails: any, isFloating?: boolean, isOpen?: boolean, securityStatus?: "FULLY_SECURED" | "SECURITY_SETUP_REQUIRED" | null, onStartSecuritySetup?: () => void }) {
   const { currentNetwork: network, setCurrentNetwork: setNetwork, assets: globalAssets, totalGlobalUsd: totalUsd, isLoading: loading, isRefreshing: refreshing, fetchPortfolio } = usePortfolioStore();
   const [history, setHistory] = useState<any[]>(() => {
      // Restore last known history instantly from localStorage
      if (typeof window !== 'undefined') {
         try {
            const cached = localStorage.getItem('arc_wallet_history_cache');
            if (cached) return JSON.parse(cached);
         } catch {}
      }
      return [];
   });
   const [myAddresses, setMyAddresses] = useState<string[]>([]);
   const [selectedTx, setSelectedTx] = useState<any | null>(null);
   const [hasFetchedHistory, setHasFetchedHistory] = useState<boolean>(() => {
      if (typeof window !== 'undefined') {
         return Boolean(localStorage.getItem('arc_wallet_history_cache'));
      }
      return false;
   });
   const [isHistoryLoading, setIsHistoryLoading] = useState(false);
   const [hasMoreHistory, setHasMoreHistory] = useState<boolean>(true);
   const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState<boolean>(false);
   const historyLenRef = useRef<number>(0);
   const isFetchingMoreRef = useRef<boolean>(false);
   const hasMoreHistoryRef = useRef<boolean>(true);
   const historyScrollContainerRef = useRef<HTMLDivElement | null>(null);
   const sentinelRef = useRef<HTMLDivElement | null>(null);
   const [selectedAsset, setSelectedAsset] = useState<GroupedAsset | null>(null);
   const [selectedChainTab, setSelectedChainTab] = useState<string>('Overview');
   
   const assets = useMemo(() => {
      return (network === 'All Networks'
         ? globalAssets.filter(a => a.network === 'Arc Testnet' || a.network === 'Solana Devnet' || a.totalUsd > 0)
         : globalAssets.filter(a => a.network === network)
      ).map(a => ({
         ...a,
         usdValue: a.totalUsd
      }));
   }, [globalAssets, network]);

   const displayAssets: GroupedAsset[] = useMemo(() => {
      if (network === 'All Networks') {
         const matching = globalAssets.filter(a => a.network === 'Arc Testnet' || a.network === 'Solana Devnet' || a.totalUsd > 0);
         const map = new Map<string, GroupedAsset>();

         matching.forEach(asset => {
            const sym = asset.symbol.toUpperCase();
            const numBal = Number(asset.balanceFormatted) || 0;
            const usd = asset.totalUsd || 0;

            if (!map.has(sym)) {
               map.set(sym, {
                  symbol: asset.symbol,
                  name: asset.name,
                  logoUrl: asset.logoUrl,
                  totalBalanceFormatted: asset.balanceFormatted,
                  totalBalanceNum: numBal,
                  usdValue: usd,
                  chains: [{
                     network: asset.network,
                     balanceFormatted: asset.balanceFormatted,
                     balanceNum: numBal,
                     usdValue: usd,
                     percentage: 0,
                     address: asset.address,
                     isNative: asset.isNative
                  }]
               });
            } else {
               const existing = map.get(sym)!;
               existing.totalBalanceNum += numBal;
               existing.totalBalanceFormatted = existing.totalBalanceNum.toLocaleString(undefined, { maximumFractionDigits: 6 });
               existing.usdValue += usd;
               existing.chains.push({
                  network: asset.network,
                  balanceFormatted: asset.balanceFormatted,
                  balanceNum: numBal,
                  usdValue: usd,
                  percentage: 0,
                  address: asset.address,
                  isNative: asset.isNative
               });
            }
         });

         const list = Array.from(map.values());
         list.forEach(group => {
            group.chains.forEach(c => {
               c.percentage = group.usdValue > 0 
                  ? (c.usdValue / group.usdValue) * 100 
                  : (group.totalBalanceNum > 0 ? (c.balanceNum / group.totalBalanceNum) * 100 : 0);
            });
            group.chains.sort((a, b) => b.usdValue - a.usdValue);
         });
         list.sort((a, b) => b.usdValue - a.usdValue);
         return list;
      } else {
         const matching = globalAssets.filter(a => a.network === network);
         return matching.map(asset => {
            const numBal = Number(asset.balanceFormatted) || 0;
            return {
               symbol: asset.symbol,
               name: asset.name,
               logoUrl: asset.logoUrl,
               totalBalanceFormatted: asset.balanceFormatted,
               totalBalanceNum: numBal,
               usdValue: asset.totalUsd || 0,
               chains: [{
                  network: asset.network,
                  balanceFormatted: asset.balanceFormatted,
                  balanceNum: numBal,
                  usdValue: asset.totalUsd || 0,
                  percentage: 100,
                  address: asset.address,
                  isNative: asset.isNative
               }]
            };
         });
      }
   }, [globalAssets, network]);

   const currentNetworkTotalUsd = useMemo(() => {
      return displayAssets.reduce((sum, a) => sum + (Number(a.usdValue) || 0), 0);
   }, [displayAssets]);

   const [currentView, setCurrentView] = useState<ViewState>('main');
   const [securityFocusSection, setSecurityFocusSection] = useState<'limits' | null>(null);
   const [receiveNetwork, setReceiveNetwork] = useState<"Arc Testnet" | "Solana Devnet" | null>(null);
   const [isProvisioningSolanaInReceive, setIsProvisioningSolanaInReceive] = useState(false);
   const [solanaProvisionError, setSolanaProvisionError] = useState<string | null>(null);
   const [activeTab, setActiveTab] = useState<'send' | 'claim' | 'chat'>('send');
   const [sendNetwork, setSendNetwork] = useState<string>(() => (network && network !== 'All Networks' ? network : 'Arc Testnet'));
   const [isSendNetworkSlideOpen, setIsSendNetworkSlideOpen] = useState(false);
   const [isSendAssetSlideOpen, setIsSendAssetSlideOpen] = useState(false);
   const [assetSearchQuery, setAssetSearchQuery] = useState("");
   const [sendAsset, setSendAsset] = useState("USDC");

   useEffect(() => {
      if (network && network !== 'All Networks') {
         setSendNetwork(network);
      }
   }, [network]);

   const sendNetworkAssets = useMemo(() => {
      const isSolana = sendNetwork.toLowerCase().includes("solana");
      const list = globalAssets.filter(a => a.network.toLowerCase() === sendNetwork.toLowerCase());

      // Ensure core tokens for network are present so users can select them immediately
      if (isSolana) {
         if (!list.some(a => a.symbol === "SOL")) {
            list.unshift({
               network: sendNetwork,
               address: 'native',
               symbol: 'SOL',
               name: 'Solana',
               balance: '0',
               balanceFormatted: '0',
               decimals: 9,
               priceUsd: 104,
               totalUsd: 0,
               logoUrl: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png',
               isNative: true
            });
         }
         if (!list.some(a => a.symbol === "USDC")) {
            list.push({
               network: sendNetwork,
               address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
               symbol: 'USDC',
               name: 'USDC',
               balance: '0',
               balanceFormatted: '0',
               decimals: 6,
               priceUsd: 1,
               totalUsd: 0,
               logoUrl: '/usdc.svg',
               isNative: false
            });
         }
      } else if (sendNetwork.includes("Arc")) {
         if (!list.some(a => a.symbol === "USDC")) {
            list.unshift({
               network: sendNetwork,
               address: 'native',
               symbol: 'USDC',
               name: 'USDC (Gas Token)',
               balance: '0',
               balanceFormatted: '0',
               decimals: 6,
               priceUsd: 1,
               totalUsd: 0,
               logoUrl: '/usdc.svg',
               isNative: true
            });
         }
         if (!list.some(a => a.symbol === "EURC")) {
            list.push({
               network: sendNetwork,
               address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
               symbol: 'EURC',
               name: 'EURC',
               balance: '0',
               balanceFormatted: '0',
               decimals: 6,
               priceUsd: 1.08,
               totalUsd: 0,
               logoUrl: 'https://s2.coinmarketcap.com/static/img/coins/128x128/20641.png',
               isNative: false
            });
         }
      }
      return list;
   }, [globalAssets, sendNetwork]);

   const filteredSendTokens = useMemo(() => {
      const q = assetSearchQuery.trim().toLowerCase();
      if (!q) return sendNetworkAssets;
      return sendNetworkAssets.filter(a => 
         a.symbol.toLowerCase().includes(q) || 
         a.name.toLowerCase().includes(q) ||
         (a.address && a.address.toLowerCase().includes(q))
      );
   }, [sendNetworkAssets, assetSearchQuery]);

   // Ensure sendAsset is valid when switching network
   useEffect(() => {
      if (sendNetworkAssets.length > 0) {
         const exists = sendNetworkAssets.some(a => a.symbol === sendAsset);
         if (!exists) {
            const isSolana = sendNetwork.toLowerCase().includes("solana");
            setSendAsset(isSolana ? "SOL" : "USDC");
            setSendAmount("");
            setSendError(null);
         }
      }
   }, [sendNetwork, sendNetworkAssets, sendAsset]);

   const [isCopied, setIsCopied] = useState(false);
   const [sendAmount, setSendAmount] = useState("");
   const [sendAddress, setSendAddress] = useState("");
   const [sendLoading, setSendLoading] = useState(false);
   const [sendError, setSendError] = useState<string | null>(null);
   const [recipientType, setRecipientType] = useState<"arc" | "external" | null>(null);
   const [sendStep, setSendStep] = useState<"input" | "review" | "success">("input");

   const { requestAuthentication } = useArcWalletAuth();

   const lastRefreshTime = useRef<number>(0);
   const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

   const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
   const [policy, setPolicy] = useState<any>(null);

   const [isBalancesHidden, setIsBalancesHidden] = useState(false);
   const [isNetworkDropdownOpen, setIsNetworkDropdownOpen] = useState(false);
   const [showImportTokenModal, setShowImportTokenModal] = useState(false);
   const [isImportNetworkDropdownOpen, setIsImportNetworkDropdownOpen] = useState(false);
   const [importNetwork, setImportNetwork] = useState<string>("Arc Testnet");
   const [importAddress, setImportAddress] = useState("");
   const [importSymbol, setImportSymbol] = useState("");
   const [importDecimals, setImportDecimals] = useState("");
   const [importName, setImportName] = useState("");
   const [importLoading, setImportLoading] = useState(false);
   const [importDetecting, setImportDetecting] = useState(false);
   const [importError, setImportError] = useState<string | null>(null);
   const [importSuccess, setImportSuccess] = useState<string | null>(null);

   const handleAddressChange = async (val: string) => {
      setImportAddress(val);
      setImportError(null);
      const trimmed = val.trim();
      if (!trimmed) return;

      if (importNetwork === 'Solana Devnet') {
         if (trimmed.length >= 32 && trimmed.length <= 44 && !trimmed.startsWith('0x')) {
            setImportDetecting(true);
            try {
               const { Connection, PublicKey } = await import('@solana/web3.js');
               const conn = new Connection(CROSS_CHAIN_REGISTRY['Solana Devnet']?.rpc || "https://api.devnet.solana.com");
               const pk = new PublicKey(trimmed);
               const supply = await conn.getTokenSupply(pk);
               if (supply?.value?.decimals !== undefined) {
                  setImportDecimals(supply.value.decimals.toString());
               }
               try {
                  const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${trimmed}`);
                  if (dexRes.ok) {
                     const dexData = await dexRes.json();
                     if (dexData?.pairs?.[0]?.baseToken) {
                        const bt = dexData.pairs[0].baseToken;
                        if (bt.symbol && !importSymbol) setImportSymbol(bt.symbol);
                        if (bt.name && !importName) setImportName(bt.name);
                     }
                  }
               } catch (e) {}
            } catch (e) {
               // Ignore detection error
            } finally {
               setImportDetecting(false);
            }
         }
      } else {
         if (trimmed.startsWith('0x') && trimmed.length === 42) {
            setImportDetecting(true);
            try {
               const client = createPublicClient({
                  transport: http(CROSS_CHAIN_REGISTRY['Arc Testnet']?.rpc || "https://5042002.rpc.thirdweb.com")
               });
               const [sym, nm, dec] = await Promise.all([
                  client.readContract({ address: trimmed as `0x${string}`, abi: erc20Abi, functionName: 'symbol' }).catch(() => null),
                  client.readContract({ address: trimmed as `0x${string}`, abi: erc20Abi, functionName: 'name' }).catch(() => null),
                  client.readContract({ address: trimmed as `0x${string}`, abi: erc20Abi, functionName: 'decimals' }).catch(() => null)
               ]);
               if (sym && !importSymbol) setImportSymbol(String(sym));
               if (nm && !importName) setImportName(String(nm));
               if (dec !== null && !importDecimals) setImportDecimals(Number(dec).toString());
            } catch (e) {
               // Ignore detection error
            } finally {
               setImportDetecting(false);
            }
         }
      }
   };

   const handleImportToken = async () => {
      setImportError(null);
      const trimmed = importAddress.trim();
      if (!trimmed) {
         setImportError("Please enter a token address");
         return;
      }

      if (importNetwork === 'Solana Devnet') {
         try {
            const { PublicKey } = await import('@solana/web3.js');
            new PublicKey(trimmed);
         } catch (e) {
            setImportError("Invalid Solana mint address (expected Base58 public key)");
            return;
         }
      } else {
         if (!trimmed.startsWith('0x') || trimmed.length !== 42) {
            setImportError("Invalid EVM contract address (0x...)");
            return;
         }
      }

      const sym = importSymbol.trim().toUpperCase() || (importNetwork === 'Solana Devnet' ? trimmed.slice(0, 4).toUpperCase() : 'TOKEN');
      const dec = importDecimals ? parseInt(importDecimals, 10) : (importNetwork === 'Solana Devnet' ? 6 : 18);
      const nm = importName.trim() || `${sym} Token`;

      setImportLoading(true);
      try {
         const { data: { session } } = await supabase.auth.getSession();
         if (session?.access_token) {
            const res = await fetch('/api/wallet/tokens', {
               method: 'POST',
               headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`
               },
               body: JSON.stringify({
                  tokenAddress: trimmed,
                  network: importNetwork,
                  symbol: sym,
                  decimals: dec,
                  name: nm
               })
            });
            const data = await res.json();
            if (!res.ok || data.error) {
               throw new Error(data.error || "Failed to import token");
            }
         }

         // Always update localStorage fallback cache
         try {
            const cached = localStorage.getItem('arc_custom_tokens');
            let customTokens = cached ? JSON.parse(cached) : [];
            if (!customTokens.some((t: any) => t.address.toLowerCase() === trimmed.toLowerCase() && t.network.toLowerCase() === importNetwork.toLowerCase())) {
               customTokens.push({
                  address: trimmed,
                  network: importNetwork,
                  symbol: sym,
                  name: nm,
                  decimals: dec,
                  addedAt: Date.now()
               });
               localStorage.setItem('arc_custom_tokens', JSON.stringify(customTokens));
            }
         } catch (e) {}

         setImportSuccess(`Token ${sym} successfully imported!`);
         setTimeout(() => {
            setShowImportTokenModal(false);
            setImportSuccess(null);
            setImportAddress("");
            setImportSymbol("");
            setImportDecimals("");
            setImportName("");
            fetchBalances(true);
            setCurrentView('main');
         }, 800);
      } catch (err: any) {
         setImportError(err.message || "Failed to import token");
      } finally {
         setImportLoading(false);
      }
   };

   useEffect(() => {
      const saved = localStorage.getItem('arc_hide_balances');
      if (saved) setIsBalancesHidden(saved === 'true');
   }, []);

   const toggleHideBalances = () => {
      const newVal = !isBalancesHidden;
      setIsBalancesHidden(newVal);
      localStorage.setItem('arc_hide_balances', newVal.toString());
   };

   const [circleSolanaAddress, setCircleSolanaAddress] = useState<string | null>(() => {
      return typeof window !== 'undefined' ? localStorage.getItem('arc_circle_solana_address') : null;
   });

   useEffect(() => {
      const handleSolConnected = (e: any) => {
         if (e.detail?.address) setCircleSolanaAddress(e.detail.address);
      };
      window.addEventListener('arc-solana-wallet-connected', handleSolConnected);

      // Also fetch from API if not yet in state
      const fetchSolanaCircleWallet = async () => {
         try {
            // Clean up any stale external wallet address from legacy localStorage
            if (typeof window !== 'undefined') {
               localStorage.removeItem('last_connected_solana_address');
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const res = await fetch('/api/wallet/lookup', {
               method: 'POST',
               headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json'
               },
               body: JSON.stringify({ blockchain: 'SOL-DEVNET' })
            });
            const data = await res.json();
            if (data.exists && data.wallet?.wallet_address) {
               setCircleSolanaAddress(data.wallet.wallet_address);
               localStorage.setItem('arc_circle_solana_address', data.wallet.wallet_address);
               fetchPortfolio(walletAddress, true);
            } else {
               // Auto-provision genuine Circle DCW Solana wallet for this user
               const provRes = await fetch('/api/wallet/provision', {
                  method: 'POST',
                  headers: {
                     'Authorization': `Bearer ${session.access_token}`,
                     'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ blockchain: 'SOL-DEVNET' })
               });
               const provData = await provRes.json();
               if (provData.wallet?.wallet_address) {
                  setCircleSolanaAddress(provData.wallet.wallet_address);
                  localStorage.setItem('arc_circle_solana_address', provData.wallet.wallet_address);
                  window.dispatchEvent(new CustomEvent('arc-solana-wallet-connected', { detail: { address: provData.wallet.wallet_address } }));
                  fetchPortfolio(walletAddress, true);
               }
            }
         } catch (e) {
            console.warn("Failed to lookup/provision Solana Circle DCW wallet:", e);
         }
      };

      if (!circleSolanaAddress) {
         fetchSolanaCircleWallet();
      }

      return () => window.removeEventListener('arc-solana-wallet-connected', handleSolConnected);
   }, [circleSolanaAddress, walletAddress]);

   const displayReceiveAddress = network === 'Solana Devnet' 
      ? (circleSolanaAddress || "Loading Solana Circle DCW address...") 
      : walletAddress;

   const provisionSolanaInReceive = async () => {
      setIsProvisioningSolanaInReceive(true);
      setSolanaProvisionError(null);
      try {
         const { data: { session } } = await supabase.auth.getSession();
         if (!session) throw new Error("Authentication session missing. Please reconnect wallet.");

         const res = await fetch('/api/wallet/provision', {
            method: 'POST',
            headers: {
               'Authorization': `Bearer ${session.access_token}`,
               'Content-Type': 'application/json'
            },
            body: JSON.stringify({ blockchain: 'SOL-DEVNET' })
         });
         const data = await res.json();
         if (!res.ok || !data.success || !data.wallet?.wallet_address) {
            throw new Error(data.error || "Failed to create Solana Circle wallet");
         }

         const newAddr = data.wallet.wallet_address;
         setCircleSolanaAddress(newAddr);
         if (typeof window !== 'undefined') {
            localStorage.setItem('arc_circle_solana_address', newAddr);
            window.dispatchEvent(new CustomEvent('arc-solana-wallet-connected', { detail: { address: newAddr } }));
         }
         fetchPortfolio(walletAddress, true);
      } catch (err: any) {
         console.error("Solana provisioning error in Receive:", err);
         setSolanaProvisionError(err.message || "Failed to initialize Solana wallet. Please try again.");
      } finally {
         setIsProvisioningSolanaInReceive(false);
      }
   };

   const copyAddress = () => {
      const addrToCopy = displayReceiveAddress || walletAddress;
      if (!addrToCopy || addrToCopy.startsWith("Loading")) return;
      navigator.clipboard.writeText(addrToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1000);
   };

   const fetchHistory = async (isBackgroundPoll = false) => {
      // Only show skeleton if we genuinely have nothing to show (no cache, no prior data)
      if (!isBackgroundPoll && historyLenRef.current === 0 && history.length === 0) {
         setIsHistoryLoading(true);
      }
      try {
         const { data: { session } } = await supabase.auth.getSession();
         if (!session) {
            setIsHistoryLoading(false);
            return;
         }
         const res = await fetch('/api/wallet/history?limit=10&offset=0', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
         });
         const data = await res.json();
         if (data.success) {
            const list = data.history || [];
            setHistory(list);
            historyLenRef.current = list.length;
            // Persist for instant restore on next open
            try { localStorage.setItem('arc_wallet_history_cache', JSON.stringify(list)); } catch {}
            const more = Boolean(data.has_more);
            hasMoreHistoryRef.current = more;
            setHasMoreHistory(more);
            if (data.user_addresses) {
               setMyAddresses(data.user_addresses);
            }
            setHasFetchedHistory(true);

            // Keep selectedTx in sync when history updates with hash or status
            setSelectedTx((prev: any) => {
               if (!prev) return null;
               const updated = list.find((h: any) => h.id === prev.id || (h.circle_tx_id && h.circle_tx_id === prev.circle_tx_id));
               return updated ? { ...prev, ...updated } : prev;
            });
         }
      } catch (e) {
         console.error("Failed to fetch history:", e);
      } finally {
         setIsHistoryLoading(false);
         setHasFetchedHistory(true);
      }
   };

   const fetchMoreHistory = async () => {
      if (isFetchingMoreRef.current || !hasMoreHistoryRef.current || isHistoryLoading) return;
      isFetchingMoreRef.current = true;
      setIsLoadingMoreHistory(true);
      try {
         const { data: { session } } = await supabase.auth.getSession();
         if (!session) {
            isFetchingMoreRef.current = false;
            setIsLoadingMoreHistory(false);
            return;
         }
         const currentOffset = historyLenRef.current;
         const res = await fetch(`/api/wallet/history?limit=10&offset=${currentOffset}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
         });
         const data = await res.json();
         if (data.success) {
            const newItems = data.history || [];
            if (newItems.length > 0) {
               setHistory((prev) => {
                  const existingIds = new Set(prev.map((item: any) => item.id));
                  const filtered = newItems.filter((item: any) => !existingIds.has(item.id));
                  const combined = [...prev, ...filtered];
                  historyLenRef.current = combined.length;
                  return combined;
               });
            }
            const more = newItems.length === 10 && Boolean(data.has_more);
            hasMoreHistoryRef.current = more;
            setHasMoreHistory(more);
         }
      } catch (e) {
         console.error("Failed to fetch more history:", e);
      } finally {
         isFetchingMoreRef.current = false;
         setIsLoadingMoreHistory(false);
      }
   };

   // IntersectionObserver to automatically fetch next 10 when user scrolls near the bottom
   useEffect(() => {
      if (currentView !== 'history') return;
      const sentinel = sentinelRef.current;
      if (!sentinel) return;

      const observer = new IntersectionObserver(
         (entries) => {
            if (entries[0]?.isIntersecting) {
               fetchMoreHistory();
            }
         },
         {
            root: historyScrollContainerRef.current,
            rootMargin: '150px'
         }
      );

      observer.observe(sentinel);
      return () => observer.disconnect();
   }, [currentView, history.length]);

   useEffect(() => {
      const handleRefresh = () => { fetchHistory(); };
      window.addEventListener('refresh-wallet-history', handleRefresh);
      return () => window.removeEventListener('refresh-wallet-history', handleRefresh);
   }, []);

   useEffect(() => {
      if (currentView === 'history') {
         fetchHistory();
      }
   }, [currentView]);

   // Auto-poll history if the open transaction is still waiting for confirmation
   useEffect(() => {
      if (!selectedTx || selectedTx.blockchain_hash || !['PENDING', 'INITIATED'].includes(((selectedTx as any).status || '').toUpperCase())) {
         return;
      }
      const interval = setInterval(() => {
         fetchHistory(true);
      }, 3500);
      return () => clearInterval(interval);
   }, [selectedTx]);

   // Fetch security policy once on mount
   useEffect(() => {
      const fetchPolicy = async () => {
         try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
               const polRes = await fetch("/api/wallet/security", { headers: { Authorization: `Bearer ${session.access_token}` } });
               if (polRes.ok) {
                  const polJson = await polRes.json();
                  if (polJson.policy) setPolicy(polJson.policy);
               }
            }
         } catch (e) {
            console.error("Failed to fetch policy", e);
         }
      };
      fetchPolicy();
   }, []);



   // Smooth counter animation for current network total USD
   const springUsd = useSpring(0, { bounce: 0, duration: 800 });

   useEffect(() => {
      springUsd.set(currentNetworkTotalUsd);
   }, [currentNetworkTotalUsd, springUsd]);

   const displayNumString = useTransform(springUsd, (latest) => latest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
   
   function getExplorerUrl(net: string, hash: string) {
      if (!hash || !net) return undefined;
      const url = ChainRegistry.getExplorerTxUrl(net, hash);
      // Don't return fallback if we don't want a fallback, but fallback is etherscan.
      return url;
   }

   const fetchBalances = useCallback(async (isManual = false) => {
      const now = Date.now();
      if (isManual) {
         if (now - lastRefreshTime.current < 5000) {
            setRefreshMessage("Please wait a few seconds...");
            setTimeout(() => setRefreshMessage(null), 2500);
            return;
         }
      }
      lastRefreshTime.current = now;
      await fetchPortfolio(walletAddress, isManual);
   }, [walletAddress, fetchPortfolio]);
   useEffect(() => {
      if (isFloating && !isOpen) return;
      fetchBalances();
   }, [fetchBalances, isFloating, isOpen]);

   // Ref to avoid stale closures in the realtime callback without forcing a reconnect on network change
   const fetchBalancesRef = useRef(fetchBalances);
   useEffect(() => {
      fetchBalancesRef.current = fetchBalances;
   }, [fetchBalances]);

   useEffect(() => {
      const handleRefresh = async () => {
         if (fetchBalancesRef.current) fetchBalancesRef.current(true);
         fetchHistory(true);
      };

      window.addEventListener('refresh-portfolio', handleRefresh);
      window.addEventListener('refresh-wallet-history', handleRefresh);
      window.addEventListener('arc_autopay_updated', handleRefresh);
      window.addEventListener('arc_payments_synced', handleRefresh);

      return () => {
         window.removeEventListener('refresh-portfolio', handleRefresh);
         window.removeEventListener('refresh-wallet-history', handleRefresh);
         window.removeEventListener('arc_autopay_updated', handleRefresh);
         window.removeEventListener('arc_payments_synced', handleRefresh);
      };
   }, [walletAddress]);

   // Live background polling: automatically update prices & balances every 30 seconds while tab is active
   useEffect(() => {
      if (!walletAddress) return;
      if (isFloating && !isOpen) return;
      const interval = setInterval(() => {
         if (typeof document !== 'undefined' && document.hidden) return;
         if (fetchBalancesRef.current) {
            fetchBalancesRef.current(false);
         }
      }, 30000);

      const onFocus = () => {
         if (isFloating && !isOpen) return;
         const now = Date.now();
         if (now - lastRefreshTime.current < 25000) return;
         if (fetchBalancesRef.current) {
            fetchBalancesRef.current(false);
         }
      };
      window.addEventListener('focus', onFocus);

      return () => {
         clearInterval(interval);
         window.removeEventListener('focus', onFocus);
      };
   }, [walletAddress, isFloating, isOpen]);

   const submitTransfer = async () => {
      setSendError(null);
      setSendLoading(true);
      try {
         const { data: { session } } = await supabase.auth.getSession();
         if (!session) throw new Error("Not authenticated");

         const intentId = crypto.randomUUID();
         const blockchain = sendNetwork.toLowerCase().includes("solana")
            ? "SOL-DEVNET"
            : (sendNetwork.includes("Sepolia") ? "ETH-SEPOLIA" : "ARC-TESTNET");

         const payload: any = {
            blockchain,
            symbol: sendAsset,
            destinationAddress: sendAddress.trim(),
            amount: sendAmount,
            intentId
         };

         let res = await fetch("/api/wallet/transfer", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify(payload)
         });

         let data = await res.json();

         if (data.status === 'PASSKEY_REQUIRED') {
            const authResult = await requestAuthentication(data.threshold || 0, data.has_password || false, data.reason);

            res = await fetch("/api/wallet/transfer", {
               method: "POST",
               headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
               body: JSON.stringify({ ...payload, ...authResult })
            });
            data = await res.json();
         }

         if (data.error) throw new Error(data.error);

         // On success — show flash for 1.5s then reset
         setSendStep("success");
         setTimeout(() => {
            setSendStep("input");
            setSendAddress("");
            setSendAmount("");
            setCurrentView("main");
         }, 1500);

         if (fetchBalancesRef.current) fetchBalancesRef.current(true);
         fetchHistory(true);
         window.dispatchEvent(new Event('refresh-wallet-history'));
         window.dispatchEvent(new Event('refresh-portfolio'));
         globalEventBus.emit('transaction:success', { walletAddress, walletType: 'arcfun' });
         setTimeout(() => {
            if (fetchBalancesRef.current) fetchBalancesRef.current(true);
            fetchHistory(true);
         }, 2500);

      } catch (e: any) {
         let msg = e.message || "Transfer failed";
         const genericErrors = ["Internal Server Error", "Service Error", "Unknown Error", "Unexpected token"];
         if (genericErrors.some(g => msg.includes(g))) {
            msg = "The network is busy or an unexpected error occurred. Please try again.";
         }
         setSendError(msg);
      } finally {
         setSendLoading(false);
      }
   };


   const viewVariants = {
      initial: { x: 50, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: -50, opacity: 0 }
   };

   const renderTopNav = (title: string) => (
      <div className="flex items-center gap-3 mb-4 shrink-0">
         <button
            onClick={() => { setCurrentView('main'); setSendStep('input'); }}
            className="p-1.5 rounded-full bg-[var(--surface-hover)] hover:opacity-90 border border-[var(--border)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
         >
            <ChevronLeft className="w-5 h-5" />
         </button>
         <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">{title}</h2>
      </div>
   );

   return (
      <div
         className="w-full h-full flex flex-col relative overflow-hidden bg-[var(--surface)]"
         style={{
            fontFamily: "var(--font-geist), var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            letterSpacing: "-0.01em",
            fontVariantNumeric: "tabular-nums"
         }}
      >
         {/* Main Content */}
         <div className={`flex-1 min-h-0 ${
            currentView === 'security' || currentView === 'history'
               ? `h-full overflow-hidden flex flex-col ${isFloating ? 'p-0' : 'p-0 pt-2 md:p-8'}`
               : `overflow-y-auto hide-scrollbar ${isFloating ? 'px-3.5 pt-1.5 pb-4' : 'p-4 md:p-8'}`
         }`}>

         {(currentView === 'main' && (isReadOnly || !isFloating || securityStatus === "SECURITY_SETUP_REQUIRED")) && (
            <div className="flex flex-col gap-3 mb-3 shrink-0">
               {isReadOnly && (
                  <div className="py-2.5 px-3.5 bg-yellow-500/10 border border-yellow-500/20 rounded-[12px] flex items-start gap-2.5">
                     <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                     <div className="flex flex-col">
                        <h3 className="font-semibold text-yellow-500 text-[12px]">Read-Only Mode</h3>
                        <p className="text-[11px] text-yellow-500/80 mt-0.5 leading-snug">
                           {degradedDetails?.reason || "Blockchain services are degraded. Transfers are disabled."}
                        </p>
                     </div>
                  </div>
               )}

               {!isFloating && (
                  <div className="hidden md:flex items-center justify-between">
                     <div className="flex items-center gap-3 md:gap-4">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-[10px] md:rounded-[12px] bg-[var(--surface-hover)] border border-[var(--border)] shadow-sm flex items-center justify-center overflow-hidden shrink-0 p-0.5">
                           <img src="/rocket-logo.png" alt="ArcFun Logo" className="w-full h-full object-cover rounded-[8px] md:rounded-[10px]" />
                        </div>
                        <div>
                           <h1 className="text-lg md:text-xl font-semibold tracking-tight text-[var(--text-primary)]">Arcfun Wallet</h1>
                           <div className="flex items-center gap-2 mt-0.5 md:mt-1">
                              <span className="text-[12px] md:text-sm text-[var(--text-muted)] bg-[var(--surface-hover)] px-2 py-0.5 rounded-md tracking-wide">
                                 {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                              </span>
                           </div>
                        </div>
                     </div>
                     <div className="hidden md:flex gap-2 relative">
                        <button onClick={() => setCurrentView('security')} className="bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl px-3 py-1.5 flex items-center gap-2 transition-colors">
                           <Settings className="w-4 h-4" />
                        </button>
                        <div className="relative">
                           <button
                              onClick={() => setIsNetworkDropdownOpen(!isNetworkDropdownOpen)}
                              className="bg-[var(--surface-hover)] border border-[var(--border)] hover:border-slate-300 dark:hover:border-white/20 text-[var(--text-primary)] text-sm font-medium rounded-xl px-3 py-1.5 flex items-center gap-2 transition-all shadow-sm"
                           >
                              {network === 'All Networks' ? (
                                 <Globe className="w-4 h-4 text-black dark:text-white" />
                              ) : (
                                 <img src={network === 'Solana Devnet' ? "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png" : "/arc-logo.png"} alt={network} className="w-4 h-4 rounded-full object-cover" />
                              )}
                              <span>{network}</span>
                              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-70" />
                           </button>
                           {isNetworkDropdownOpen && (
                              <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl z-50 p-1.5 flex flex-col gap-1 backdrop-blur-md">
                                 {WALLET_NETWORKS.map((net) => (
                                    <button
                                       key={net.id}
                                       onClick={() => {
                                          setNetwork(net.id);
                                          setIsNetworkDropdownOpen(false);
                                       }}
                                       className={`flex items-center justify-between p-2 rounded-xl text-left transition-colors ${network === net.id ? 'bg-[var(--surface-hover)] text-[var(--text-primary)] font-bold' : 'hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]'}`}
                                    >
                                       <div className="flex items-center gap-2.5">
                                          {net.id === 'All Networks' ? (
                                             <Globe className="w-4 h-4 text-black dark:text-white" />
                                          ) : (
                                             <img src={net.icon} alt={net.name} className="w-4 h-4 rounded-full object-cover" />
                                          )}
                                          <span className="text-xs">{net.name}</span>
                                       </div>
                                       {network === net.id && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                                    </button>
                                 ))}
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
               )}

               {securityStatus === "SECURITY_SETUP_REQUIRED" && (
                  <button
                     onClick={() => onStartSecuritySetup ? onStartSecuritySetup() : setCurrentView('security')}
                     className="w-full text-left py-2.5 px-3.5 bg-transparent border border-[var(--border)] hover:bg-[var(--surface-hover)] hover:border-[var(--text-muted)] rounded-[12px] flex items-center justify-between gap-3 transition-all group"
                  >
                     <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                        <span className="font-semibold text-[var(--text-primary)] text-[12px]">Security Warning: Complete your Passkey and Password setup</span>
                     </div>
                     <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-all group-hover:translate-x-1" />
                  </button>
               )}
            </div>
         )}

         <div className={`flex-1 relative flex flex-col min-h-0 ${currentView === 'security' || currentView === 'history' ? 'h-full overflow-hidden' : ''}`}>
            <AnimatePresence mode="wait">

               {currentView === 'security' && (
                  <ArcWalletSecurityCenter
                     onBack={() => {
                        setCurrentView('main');
                        setSecurityFocusSection(null);
                     }}
                     initialPolicy={policy}
                     onPolicyChange={(updated) => setPolicy(updated)}
                     isBalancesHidden={isBalancesHidden}
                     toggleHideBalances={toggleHideBalances}
                     onStartSecuritySetup={onStartSecuritySetup}
                     focusSection={securityFocusSection}
                  />
               )}

               {activeTab === 'send' && currentView === 'main' && (
                  <motion.div key="main" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }} className="flex flex-col gap-4">

                     <div className="relative overflow-hidden rounded-[28px] border border-[var(--border)] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-lg flex flex-col pt-5 pb-4 px-5 group bg-[var(--surface)]"
                     >
                        {/* Right-side mild multi-color blue fade */}
                        <div className="absolute inset-y-0 right-0 w-4/5 bg-gradient-to-l from-[#3B82F6]/15 via-[#5351FF]/5 to-transparent pointer-events-none" />

                        {/* Mesh Glow Effects */}
                        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#5351FF] opacity-10 blur-[60px] pointer-events-none" />
                        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#3B82F6] opacity-10 blur-[50px] pointer-events-none" />

                        {/* Topographic overlay (subtle lines) */}
                        <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay pointer-events-none"
                           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z' fill='%23ffffff' fill-opacity='1'/%3E%3C/g%3E%3C/svg%3E")` }}
                        />

                        {/* Header: Balance */}
                        <div className="flex flex-col relative z-30 mb-5">
                           <div className="flex items-center gap-3">
                              <h2
                                 className="font-bold tracking-tight text-[var(--text-primary)] leading-none flex items-center gap-1"
                                 style={{ fontSize: 'clamp(34px, 9vw, 42px)', letterSpacing: '-0.03em' }}
                              >
                                 {loading ? (
                                    <div
                                       className="arc-skeleton-shimmer"
                                       style={{
                                          width: 140,
                                          height: 42,
                                          borderRadius: 12,
                                          border: "1px solid var(--border-soft)",
                                          marginTop: 2,
                                          marginBottom: 2
                                       }}
                                    />
                                 ) : isBalancesHidden ? (
                                    <span>****</span>
                                 ) : (
                                    <>
                                       <span className="text-[28px] md:text-[34px] opacity-75 font-bold">$</span>
                                       <motion.span style={{ fontVariantNumeric: 'tabular-nums' }}>{displayNumString}</motion.span>
                                    </>
                                 )}
                              </h2>
                              <div className="relative flex items-center">
                                 <button
                                    onClick={() => fetchBalances(true)}
                                    disabled={refreshing || isReadOnly}
                                    className={`w-9 h-9 rounded-full bg-[var(--surface-hover)] hover:opacity-90 border border-[var(--border)] flex items-center justify-center transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50 ${refreshing ? "animate-spin text-[#3B82F6]" : ""}`}
                                    title="Refresh Balances"
                                 >
                                    <RefreshCw className="w-4 h-4" />
                                 </button>
                                 <AnimatePresence>
                                    {refreshMessage && (
                                       <motion.div
                                          initial={{ opacity: 0, y: 4 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          exit={{ opacity: 0, y: 4 }}
                                          className="absolute right-0 top-full mt-2 whitespace-nowrap bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded-xl text-[11px] font-medium text-[var(--text-primary)] shadow-lg z-50 flex items-center gap-1.5 backdrop-blur-md"
                                       >
                                          <Clock className="w-3 h-3 text-yellow-500" />
                                          {refreshMessage}
                                       </motion.div>
                                    )}
                                 </AnimatePresence>
                              </div>
                           </div>
                        </div>

                        {/* Quick Actions (Floating inside the card at the bottom) */}
                        <div className="flex items-center justify-between mt-auto relative z-10 px-1">
                           <button disabled={isReadOnly} onClick={() => {
                              if (network === 'Arc Testnet') {
                                 setReceiveNetwork('Arc Testnet');
                              } else if (network === 'Solana Devnet') {
                                 setReceiveNetwork('Solana Devnet');
                              } else {
                                 setReceiveNetwork(null);
                              }
                              setCurrentView('receive');
                           }} className="flex flex-col items-center justify-center gap-2 group disabled:opacity-50 cursor-pointer">
                              <div className="w-[46px] h-[46px] rounded-full bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] flex items-center justify-center group-hover:scale-110 transition-transform shadow-md">
                                 <Play className="w-4 h-4 text-white rotate-90" fill="currentColor" strokeWidth={1} />
                              </div>
                              <span className="text-[11.5px] font-bold text-[var(--text-primary)] tracking-wide">Receive</span>
                           </button>

                           <button disabled={isReadOnly} onClick={() => { setSendStep("input"); setCurrentView('send'); }} className="flex flex-col items-center justify-center gap-2 group disabled:opacity-50">
                              <div className="w-[46px] h-[46px] rounded-full bg-gradient-to-br from-[#B91C1C] to-[#DC2626] flex items-center justify-center group-hover:scale-110 transition-transform shadow-md">
                                 <Play className="w-4 h-4 text-white -rotate-90" fill="currentColor" strokeWidth={1} />
                              </div>
                              <span className="text-[11.5px] font-bold text-[var(--text-primary)] tracking-wide">Send</span>
                           </button>

                           <button onClick={() => setCurrentView('history')} className="flex flex-col items-center justify-center gap-2 group">
                              <div className="w-[46px] h-[46px] rounded-full bg-[var(--surface-hover)] hover:opacity-90 border border-[var(--border)] flex items-center justify-center group-hover:scale-110 transition-all shadow-sm relative overflow-hidden">
                                 <Clock className="w-4 h-4 text-[var(--text-primary)] relative z-10" />
                              </div>
                              <span className="text-[11.5px] font-bold text-[var(--text-primary)] tracking-wide">History</span>
                           </button>

                           <button onClick={() => setCurrentView('security')} className="flex flex-col items-center justify-center gap-2 group">
                              <div className="w-[46px] h-[46px] rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-500/10 dark:hover:bg-slate-500/20 border border-slate-200 dark:border-slate-500/20 flex items-center justify-center group-hover:scale-110 transition-all shadow-sm relative overflow-hidden">
                                 <Settings className="w-4 h-4 text-[var(--text-primary)] relative z-10" />
                              </div>
                              <span className="text-[11.5px] font-bold text-[var(--text-primary)] tracking-wide">Settings</span>
                           </button>
                        </div>
                     </div>

                     {/* Premium Assets List */}
                     <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)] dark:shadow-sm mt-1">
                        <div className="flex items-center justify-between mb-4 px-1">
                           <div className="flex items-center gap-2">
                              <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Your Assets</h3>
                              <span className="text-[10px] font-medium text-[var(--text-muted)] px-1.5 py-0.5 rounded-md bg-[var(--surface-hover)] border border-[var(--border)]">
                                 {network}
                              </span>
                           </div>
                           <div className="flex items-center gap-1.5">
                              <button
                                 onClick={() => {
                                    setImportNetwork(network === 'Solana Devnet' ? 'Solana Devnet' : 'Arc Testnet');
                                    setImportError(null);
                                    setImportAddress("");
                                    setImportSymbol("");
                                    setImportDecimals("");
                                    setImportName("");
                                    setIsImportNetworkDropdownOpen(false);
                                    setCurrentView('import');
                                 }}
                                 className="w-7 h-7 rounded-lg bg-[var(--surface-hover)] hover:opacity-90 border border-[var(--border)] flex items-center justify-center transition-all text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:scale-105"
                                 title="Import Custom Token"
                              >
                                 <Plus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                 onClick={() => fetchBalances(true)}
                                 disabled={refreshing || loading}
                                 className={`w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200/80 dark:border-[var(--border)] flex items-center justify-center transition-all text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:scale-105 ${refreshing ? 'animate-spin text-[#3B82F6]' : ''}`}
                                 title="Refresh Assets"
                              >
                                 <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                           </div>
                        </div>

                        {loading ? (
                           <div className="flex flex-col gap-2 py-1">
                              {Array.from({ length: 3 }).map((_, idx) => (
                                 <div
                                    key={idx}
                                    className="arc-skeleton-shimmer flex items-center justify-between p-3 rounded-2xl border border-[var(--border-soft)]"
                                    style={{ minHeight: 60 }}
                                 >
                                    <div className="flex items-center gap-3.5 flex-1">
                                       <div className="w-9 h-9 rounded-full bg-[var(--border-soft)] flex-shrink-0" />
                                       <div className="flex flex-col gap-1.5 flex-1">
                                          <div className="w-16 h-4 rounded-md bg-[var(--border-soft)]" />
                                          <div className="w-32 h-3 rounded-md bg-[var(--border-soft)]" />
                                       </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                       <div className="w-14 h-4 rounded-md bg-[var(--border-soft)]" />
                                       <div className="w-20 h-3 rounded-md bg-[var(--border-soft)]" />
                                    </div>
                                 </div>
                              ))}
                           </div>
                        ) : (
                           <div className="flex flex-col gap-1">
                              {displayAssets.map((asset, i) => (
                                 <div
                                    key={i}
                                    onClick={() => {
                                       setSelectedAsset(asset);
                                       setSelectedChainTab('Overview');
                                       setCurrentView('asset-detail');
                                    }}
                                    className="flex items-center justify-between p-3 rounded-2xl hover:bg-[var(--surface-hover)] transition-colors group cursor-pointer"
                                 >
                                    <div className="flex items-center gap-3.5">
                                       <div className="relative">
                                          <AssetLogo symbol={asset.symbol} logoUrl={asset.logoUrl} />
                                          {network !== 'All Networks' && (
                                             <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[var(--surface)] rounded-full flex items-center justify-center border border-[var(--border)] shadow-sm overflow-hidden">
                                                <img src={getChainLogo(network)} alt={network} className="w-full h-full object-cover" />
                                             </div>
                                          )}
                                       </div>
                                       <div className="flex flex-col min-w-0">
                                          <div className="flex items-center gap-1.5">
                                             <span className="font-semibold text-[15px] text-[var(--text-primary)] tracking-[-0.01em] group-hover:text-blue-500 transition-colors">{asset.symbol}</span>
                                          </div>
                                          <span className="text-[12.5px] font-normal text-[var(--text-secondary)] tracking-[-0.005em] truncate">
                                             {asset.name} on {network === 'All Networks' 
                                                ? `${asset.chains.length} chain${asset.chains.length > 1 ? 's' : ''}`
                                                : network}
                                          </span>
                                       </div>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0">
                                       <span className="font-semibold text-[15px] text-[var(--text-primary)] tracking-[-0.01em]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                          {isBalancesHidden ? '***' : `$${asset.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                       </span>
                                       <span className="text-[12.5px] font-normal text-[var(--text-secondary)] tracking-[-0.005em]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                          {isBalancesHidden ? '***' : `${Number(asset.totalBalanceFormatted.replace(/,/g, '')).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${asset.symbol}`}
                                       </span>
                                    </div>
                                 </div>
                              ))}
                              {displayAssets.length === 0 && (
                                 <div className="text-center py-6 px-4 flex flex-col items-center justify-center">
                                    <p className="text-xs font-semibold text-[var(--text-secondary)]">No assets found on {network}</p>
                                    <button
                                       onClick={() => {
                                          setImportNetwork(network === 'Solana Devnet' ? 'Solana Devnet' : 'Arc Testnet');
                                          setImportError(null);
                                          setImportAddress("");
                                          setImportSymbol("");
                                          setImportDecimals("");
                                          setImportName("");
                                          setIsImportNetworkDropdownOpen(false);
                                          setCurrentView('import');
                                       }}
                                       className="mt-2 text-xs font-bold text-[#3B82F6] hover:underline flex items-center gap-1"
                                    >
                                       <Plus className="w-3 h-3" /> Import custom token
                                    </button>
                                 </div>
                              )}
                           </div>
                        )}
                     </div>

                  </motion.div>
               )}

               {/* --- SEND VIEW --- */}
               
               {/* --- CLAIM VIEW (EMPTY) --- */}
               {activeTab === 'claim' && (
                  <motion.div key="claim-view" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }} className="flex-1 w-full h-full min-h-[300px]" />
               )}

               {/* --- CHAT VIEW (EMPTY) --- */}
               {activeTab === 'chat' && (
                  <motion.div key="chat-view" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }} className="flex-1 w-full h-full min-h-[300px]" />
               )}

               {activeTab === 'send' && currentView === 'send' && (
                  <motion.div
                     key="send"
                     variants={viewVariants}
                     initial="initial"
                     animate="animate"
                     exit="exit"
                     transition={{ duration: 0.2 }}
                     className={`flex flex-col flex-1 h-full min-h-0 pb-2 relative overflow-hidden ${sendStep === 'success' ? 'justify-center items-center my-auto min-h-[420px]' : ''}`}
                  >
                     {sendStep !== "success" && renderTopNav("Send Assets")}

                     {/* SUCCESS FLASH — 1s, zero backend calls */}
                     {sendStep === "success" && (
                        <motion.div
                           key="success-flash"
                           initial={{ opacity: 0, scale: 0.88 }}
                           animate={{ opacity: 1, scale: 1 }}
                           exit={{ opacity: 0, scale: 1.05 }}
                           transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                           className="flex-1 w-full min-h-[380px] flex flex-col items-center justify-center my-auto gap-5"
                        >
                           {/* Rings + tick */}
                           <div className="relative flex items-center justify-center">
                              <motion.div
                                 animate={{ scale: [1, 1.22, 1], opacity: [0.3, 0, 0.3] }}
                                 transition={{ duration: 0.9, ease: "easeInOut", repeat: Infinity }}
                                 className="absolute w-32 h-32 rounded-full bg-[#00D494]/15"
                              />
                              <div className="w-20 h-20 rounded-full bg-[#00D494]/8 border-2 border-[#00D494]/35 flex items-center justify-center relative overflow-hidden">
                                 <motion.div
                                    initial={{ top: "-20%" }}
                                    animate={{ top: "120%" }}
                                    transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
                                    className="absolute left-0 right-0 h-[1.5px] bg-[#00D494] shadow-[0_0_10px_#00D494] z-10"
                                 />
                                 <svg viewBox="0 0 52 52" className="w-10 h-10 relative z-20" fill="none">
                                    <motion.polyline
                                       points="14,27 23,36 38,18"
                                       stroke="#00D494"
                                       strokeWidth="4.5"
                                       strokeLinecap="round"
                                       strokeLinejoin="round"
                                       initial={{ pathLength: 0, opacity: 0 }}
                                       animate={{ pathLength: 1, opacity: 1 }}
                                       transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
                                    />
                                 </svg>
                              </div>
                           </div>
                           <div className="text-center flex flex-col gap-1">
                              <motion.h4
                                 initial={{ opacity: 0, y: 6 }}
                                 animate={{ opacity: 1, y: 0 }}
                                 transition={{ delay: 0.15, duration: 0.25 }}
                                 className="text-[var(--text-primary)] font-bold text-[15px] tracking-tight"
                              >
                                 Transfer Sent
                              </motion.h4>
                              <motion.p
                                 initial={{ opacity: 0 }}
                                 animate={{ opacity: 1 }}
                                 transition={{ delay: 0.25, duration: 0.25 }}
                                 className="text-[var(--text-muted)] text-[12px] font-medium"
                              >
                                 Your payment is on its way
                              </motion.p>
                           </div>
                        </motion.div>
                     )}

                     {sendStep === "input" && (
                        <div className="flex flex-col flex-1 h-full pb-2">
                           {/* TOP MAIN CARD (Amount, Asset, Balance, Max) */}
                           <div className="bg-[#F8FAFC] dark:bg-[#0c0d14] border border-slate-200/80 dark:border-[var(--border)] rounded-[24px] p-4 mb-4 flex flex-col items-center shadow-sm relative">
                              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">You Send</span>

                              <input
                                 type="number"
                                 placeholder="0"
                                 min="0"
                                 value={sendAmount}
                                 onChange={(e) => {
                                    const val = e.target.value;
                                    // Block negative values
                                    if (val !== "" && Number(val) < 0) return;
                                    setSendAmount(val);
                                    setSendError(null);
                                    const assetObj = sendNetworkAssets.find(a => a.symbol === sendAsset);
                                    if (assetObj && val) {
                                       const isGas = sendNetwork.toLowerCase().includes("solana") ? assetObj.symbol === "SOL" : assetObj.symbol === "USDC";
                                       const spendable = calculateSpendableBalance(assetObj.balanceFormatted, sendNetwork, isGas);
                                       if (Number(val) > spendable) {
                                          const reserve = getNetworkReserve(sendNetwork);
                                          setSendError(`Insufficient spendable balance. Keep at least ${reserve} ${sendAsset} reserved for network fees.`);
                                       }
                                    }
                                 }}
                                 className="w-full bg-transparent text-center text-[40px] font-bold tracking-tighter text-[var(--text-primary)] outline-none mb-1.5 placeholder:text-[var(--text-muted)]/20"
                                 style={{ WebkitAppearance: 'none', margin: 0, MozAppearance: 'textfield' }}
                              />

                              <div className="flex items-center gap-1.5 bg-[var(--surface-hover)] border border-[var(--border)] px-2.5 py-1 rounded-full mb-3.5 shadow-sm">
                                 <AssetLogo symbol={sendAsset} logoUrl={sendNetworkAssets.find(a => a.symbol === sendAsset)?.logoUrl} className="w-4 h-4" />
                                 <span className="text-xs font-bold text-[var(--text-primary)]">{sendAsset}</span>
                              </div>

                              <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2.5 flex items-center justify-between shadow-sm">
                                 <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-[var(--text-muted)] mb-0.5">Available Balance</span>
                                    <span className="text-[13px] font-bold text-[var(--text-primary)]">
                                       {parseFloat(sendNetworkAssets.find(a => a.symbol === sendAsset)?.balanceFormatted || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {sendAsset}
                                    </span>
                                 </div>
                                 <button
                                    onClick={() => {
                                       const assetObj = sendNetworkAssets.find(a => a.symbol === sendAsset);
                                       if (assetObj) {
                                          const isGas = sendNetwork.toLowerCase().includes("solana") ? assetObj.symbol === "SOL" : assetObj.symbol === "USDC";
                                          const spendable = calculateSpendableBalance(assetObj.balanceFormatted, sendNetwork, isGas);
                                          setSendAmount(spendable.toString());
                                          setSendError(null);
                                       }
                                    }}
                                    className="text-[10px] font-bold bg-[var(--surface-hover)] hover:opacity-90 border border-[var(--border)] px-3 py-1.5 rounded-lg text-[var(--text-primary)] transition-colors cursor-pointer"
                                 >
                                    MAX
                                 </button>
                              </div>
                           </div>

                           {/* DESTINATION */}
                           <div className="relative z-10 mb-5">
                              <input
                                 type="text"
                                 placeholder={sendNetwork.toLowerCase().includes("solana") ? "Recipient Solana Address (Base58...)" : "Destination Address (0x...)"}
                                 value={sendAddress}
                                 onChange={(e) => {
                                    setSendAddress(e.target.value);
                                    setRecipientType(null);
                                 }}
                                 onBlur={async (e) => {
                                    const addr = e.target.value.trim();
                                    if (!addr) return;
                                    if (addr.startsWith("0x") && addr.length === 42) {
                                       try {
                                          const { data: authData } = await supabase.auth.getSession();
                                          if (!authData.session) return;
                                          const res = await fetch("/api/wallet/resolve-recipient", {
                                             method: "POST",
                                             headers: { "Content-Type": "application/json", Authorization: `Bearer ${authData.session.access_token}` },
                                             body: JSON.stringify({ address: addr })
                                          });
                                          const data = await res.json();
                                          if (data.isArcUser) setRecipientType("arc");
                                          else setRecipientType("external");
                                       } catch (err) {
                                          setRecipientType("external");
                                       }
                                    } else {
                                       setRecipientType("external");
                                    }
                                 }}
                                 className="w-full bg-[var(--surface-hover)] focus:bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-[13px] rounded-2xl px-4 py-3 outline-none focus:border-[#5351FF] transition-all font-mono placeholder:text-[var(--text-muted)]/50 placeholder:font-sans pr-[85px] shadow-sm"
                              />
                              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                                 {recipientType === "arc" && (
                                    <div className="flex items-center gap-1 text-green-500 bg-green-500/10 px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wide uppercase">
                                       <Shield className="w-3 h-3" /> Arc User
                                    </div>
                                 )}
                                 {recipientType === "external" && (
                                    <div className="flex items-center gap-1 text-[var(--text-muted)] bg-white dark:bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wide uppercase">
                                       <Globe className="w-3 h-3" /> External
                                    </div>
                                 )}
                              </div>
                           </div>

                           {/* GRID for Network & Asset Selectors */}
                           <div className="grid grid-cols-2 gap-3 mb-auto relative z-30">
                              {/* Interactive Network Selector Button */}
                              <div className="relative">
                                 <button
                                    type="button"
                                    onClick={() => {
                                       setIsSendNetworkSlideOpen(true);
                                       setIsAssetDropdownOpen(false);
                                    }}
                                    className="w-full bg-[#F8FAFC] dark:bg-[#0c0d14] border border-slate-200/80 dark:border-[var(--border)] hover:border-slate-300 dark:hover:border-white/20 text-[var(--text-primary)] text-[13px] font-medium rounded-2xl px-3.5 py-2.5 flex items-center justify-between transition-all shadow-sm cursor-pointer group active:scale-[0.98]"
                                 >
                                    <div className="flex items-center gap-2 truncate">
                                       <div className="w-5 h-5 rounded-full bg-white dark:bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0">
                                          {sendNetwork.includes("Arc") ? (
                                             <img src="/arc-logo.png" alt="Arc" className="w-full h-full object-cover" />
                                          ) : sendNetwork.includes("Solana") ? (
                                             <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png" alt="Solana" className="w-full h-full object-cover" />
                                          ) : (
                                             <Globe className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                                          )}
                                       </div>
                                       <span className="truncate font-semibold text-[13px]">{sendNetwork}</span>
                                    </div>
                                    <ChevronDown className="w-4 h-4 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-transform" />
                                 </button>
                              </div>

                              {/* Asset Selector Button */}
                              <div className="relative">
                                 <button
                                    type="button"
                                    onClick={() => {
                                       setIsSendAssetSlideOpen(true);
                                       setIsSendNetworkSlideOpen(false);
                                       setAssetSearchQuery("");
                                    }}
                                    className="w-full bg-[#F8FAFC] dark:bg-[#0c0d14] border border-slate-200/80 dark:border-[var(--border)] hover:border-slate-300 dark:hover:border-white/20 text-[var(--text-primary)] text-[13px] font-medium rounded-2xl px-3.5 py-2.5 outline-none focus:border-[#5351FF] transition-all flex items-center justify-between shadow-sm cursor-pointer group active:scale-[0.98]"
                                 >
                                    <div className="flex items-center gap-2 truncate">
                                       <AssetLogo symbol={sendAsset} logoUrl={sendNetworkAssets.find(a => a.symbol === sendAsset)?.logoUrl} className="w-5 h-5" />
                                       <span className="truncate font-semibold text-[13px]">{sendAsset}</span>
                                    </div>
                                    <ChevronDown className="w-4 h-4 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-transform" />
                                 </button>
                              </div>
                           </div>

                           {/* ERROR & REVIEW BUTTON */}
                           <div className="mt-2 pb-1 relative z-0">
                              {sendError && (
                                 <div className="flex flex-col items-center justify-center gap-1.5 px-1 mb-2">
                                    <p className="text-[var(--accent-red)] text-xs font-medium text-center leading-relaxed">
                                       {sendError}
                                    </p>
                                    {sendError.toLowerCase().includes('limit') && (
                                       <button
                                          type="button"
                                          onClick={() => {
                                             setSendError(null);
                                             setSecurityFocusSection('limits');
                                             setCurrentView('security');
                                          }}
                                          className="text-[#3B82F6] hover:text-[#2563EB] text-[12px] font-semibold flex items-center gap-1 transition-colors cursor-pointer hover:underline group"
                                       >
                                          <span>Please increase the limit</span>
                                          <ChevronRight className="w-3.5 h-3.5 stroke-[2.5] group-hover:translate-x-0.5 transition-transform" />
                                       </button>
                                    )}
                                 </div>
                              )}
                              <button
                                 onClick={() => {
                                    setSendError(null);
                                    const amtNum = parseFloat(sendAmount);
                                    const isSolana = sendNetwork.toLowerCase().includes("solana");
                                    
                                    if (isSolana) {
                                       const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
                                       if (!sendAddress || !base58Regex.test(sendAddress.trim())) {
                                          setSendError("Please enter a valid Solana recipient address (32-44 characters).");
                                          return;
                                       }
                                    } else {
                                       if (!sendAddress || !sendAddress.startsWith("0x") || sendAddress.length !== 42) {
                                          setSendError("Please enter a valid EVM destination address (0x...).");
                                          return;
                                       }
                                    }

                                    if (isNaN(amtNum) || amtNum <= 0) {
                                       setSendError("Amount must be greater than 0.");
                                       return;
                                    }
                                    const assetObj = sendNetworkAssets.find(a => a.symbol === sendAsset);
                                    if (assetObj) {
                                       const isGas = isSolana ? assetObj.symbol === "SOL" : assetObj.symbol === "USDC";
                                       const spendable = calculateSpendableBalance(assetObj.balanceFormatted, sendNetwork, isGas);
                                       if (amtNum > spendable) {
                                          const reserve = getNetworkReserve(sendNetwork);
                                          setSendError(`Insufficient spendable balance. Keep at least ${reserve} ${sendAsset} reserved for network fees.`);
                                          return;
                                       }
                                    }
                                    setSendStep("review");
                                 }}
                                 className="w-full bg-[#27272a] text-white hover:bg-[#3f3f46] border border-[#3f3f46] dark:bg-[#27272a] dark:text-white dark:hover:bg-[#3f3f46] dark:border-white/20 font-semibold rounded-2xl transition-all shadow-sm active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                                 style={{ height: 52, fontSize: 14 }}
                              >
                                 Review Transfer <ArrowRight className="w-4 h-4 ml-1" />
                              </button>
                           </div>

                           {/* NEAT SLIDE SHEET FOR NETWORK SELECTION */}
                           <AnimatePresence>
                              {isSendNetworkSlideOpen && (
                                 <div className="absolute inset-x-0 top-0 -bottom-2 z-50 flex flex-col justify-end overflow-hidden">
                                    <motion.div
                                       initial={{ opacity: 0 }}
                                       animate={{ opacity: 1 }}
                                       exit={{ opacity: 0 }}
                                       onClick={() => setIsSendNetworkSlideOpen(false)}
                                       className="absolute inset-0 bg-white/20 dark:bg-black/20 backdrop-blur-md cursor-pointer transition-all"
                                    />
                                    <motion.div
                                       initial={{ y: "100%" }}
                                       animate={{ y: 0 }}
                                       exit={{ y: "100%" }}
                                       transition={{ type: "spring", damping: 28, stiffness: 320 }}
                                       className="relative bg-white dark:bg-[#0c0d14] border-t border-slate-200/90 dark:border-[var(--border)] rounded-t-[28px] p-4 shadow-2xl z-10 flex flex-col max-h-[85%]"
                                    >
                                       <div className="w-9 h-1 rounded-full bg-slate-300 dark:bg-white/20 mx-auto mb-3 shrink-0" />
                                       
                                       <div className="flex items-center justify-between mb-3 px-1 shrink-0">
                                          <div>
                                             <h3 className="text-[16px] font-bold text-[var(--text-primary)]">Select Network</h3>
                                             <p className="text-[11.5px] text-[var(--text-muted)]">Choose the network to send assets from</p>
                                          </div>
                                          <button
                                             type="button"
                                             onClick={() => setIsSendNetworkSlideOpen(false)}
                                             className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                          >
                                             <X className="w-4 h-4" />
                                          </button>
                                       </div>

                                       <div className="flex flex-col gap-2 overflow-y-auto pb-2">
                                          {[
                                             {
                                                id: "Arc Testnet",
                                                name: "Arc Testnet",
                                                gasToken: "USDC",
                                                type: "EVM Chain",
                                                icon: "/arc-logo.png"
                                             },
                                             {
                                                id: "Solana Devnet",
                                                name: "Solana Devnet",
                                                gasToken: "SOL",
                                                type: "SVM Chain",
                                                icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png"
                                             }
                                          ].map((net) => {
                                             const isSelected = sendNetwork === net.id;
                                             return (
                                                <button
                                                   key={net.id}
                                                   type="button"
                                                   onClick={() => {
                                                      setSendNetwork(net.id);
                                                      setIsSendNetworkSlideOpen(false);
                                                      setSendAmount("");
                                                      setSendError(null);
                                                   }}
                                                   className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                                                      isSelected
                                                         ? 'bg-slate-100 dark:bg-white/10 border-slate-300 dark:border-white/20 shadow-xs'
                                                         : 'bg-[#F8FAFC] dark:bg-white/[0.03] border-slate-200/80 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5'
                                                   }`}
                                                >
                                                   <div className="flex items-center gap-3">
                                                      <img src={net.icon} alt={net.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                                                      <div className="flex flex-col">
                                                         <span className="text-[13.5px] font-bold text-[var(--text-primary)]">{net.name}</span>
                                                         <span className="text-[11px] text-[var(--text-muted)]">Gas: {net.gasToken} • {net.type}</span>
                                                      </div>
                                                   </div>
                                                   {isSelected && (
                                                      <div className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                                                         <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                      </div>
                                                   )}
                                                </button>
                                             );
                                          })}
                                       </div>
                                    </motion.div>
                                 </div>
                              )}
                           </AnimatePresence>

                           {/* NEAT SLIDE SHEET FOR TOKEN SELECTION WITH SEARCH */}
                           <AnimatePresence>
                              {isSendAssetSlideOpen && (
                                 <div className="absolute inset-x-0 top-0 -bottom-2 z-50 flex flex-col justify-end overflow-hidden">
                                    <motion.div
                                       initial={{ opacity: 0 }}
                                       animate={{ opacity: 1 }}
                                       exit={{ opacity: 0 }}
                                       onClick={() => {
                                          setIsSendAssetSlideOpen(false);
                                          setAssetSearchQuery("");
                                       }}
                                       className="absolute inset-0 bg-white/20 dark:bg-black/20 backdrop-blur-md cursor-pointer transition-all"
                                    />
                                    <motion.div
                                       initial={{ y: "100%" }}
                                       animate={{ y: 0 }}
                                       exit={{ y: "100%" }}
                                       transition={{ type: "spring", damping: 28, stiffness: 320 }}
                                       className="relative bg-white dark:bg-[#0c0d14] border-t border-slate-200/90 dark:border-[var(--border)] rounded-t-[28px] p-4 shadow-2xl z-10 flex flex-col max-h-[85%]"
                                    >
                                       <div className="w-9 h-1 rounded-full bg-slate-300 dark:bg-white/20 mx-auto mb-3 shrink-0" />
                                       
                                       <div className="flex items-center justify-between mb-3 px-1 shrink-0">
                                          <div>
                                             <h3 className="text-[16px] font-bold text-[var(--text-primary)]">Select Token</h3>
                                             <p className="text-[11.5px] text-[var(--text-muted)]">Available on {sendNetwork}</p>
                                          </div>
                                          <button
                                             type="button"
                                             onClick={() => {
                                                setIsSendAssetSlideOpen(false);
                                                setAssetSearchQuery("");
                                             }}
                                             className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                          >
                                             <X className="w-4 h-4" />
                                          </button>
                                       </div>

                                       {/* Search Bar */}
                                       <div className="relative mb-3 shrink-0">
                                          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                          <input
                                             type="text"
                                             placeholder="Search token name or symbol..."
                                             value={assetSearchQuery}
                                             onChange={(e) => setAssetSearchQuery(e.target.value)}
                                             className="w-full bg-[#F8FAFC] dark:bg-white/[0.04] border border-slate-200/90 dark:border-[var(--border)] text-[var(--text-primary)] text-[12.5px] rounded-xl pl-9.5 pr-8 py-2.5 outline-none focus:border-[#5351FF] transition-all placeholder:text-[var(--text-muted)]/50"
                                          />
                                          {assetSearchQuery && (
                                             <button
                                                type="button"
                                                onClick={() => setAssetSearchQuery("")}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs p-1 cursor-pointer"
                                             >
                                                <X className="w-3.5 h-3.5" />
                                             </button>
                                          )}
                                       </div>

                                       {/* Token List */}
                                       <div className="flex flex-col gap-2 overflow-y-auto max-h-[300px] pb-2 pr-0.5">
                                          {filteredSendTokens.map((a) => {
                                             const isSelected = sendAsset === a.symbol;
                                             return (
                                                <button
                                                   key={a.symbol + a.address}
                                                   type="button"
                                                   onClick={() => {
                                                      setSendAsset(a.symbol);
                                                      setIsSendAssetSlideOpen(false);
                                                      setAssetSearchQuery("");
                                                      setSendAmount("");
                                                      setSendError(null);
                                                   }}
                                                   className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                                                      isSelected
                                                         ? 'bg-slate-100 dark:bg-white/10 border-slate-300 dark:border-white/20 shadow-xs'
                                                         : 'bg-[#F8FAFC] dark:bg-white/[0.03] border-slate-200/80 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5'
                                                   }`}
                                                >
                                                   <div className="flex items-center gap-3 truncate">
                                                      <AssetLogo symbol={a.symbol} logoUrl={a.logoUrl} className="w-8 h-8 shrink-0" />
                                                      <div className="flex flex-col truncate">
                                                         <span className="text-[13.5px] font-bold text-[var(--text-primary)] truncate">{a.symbol}</span>
                                                         <span className="text-[11px] text-[var(--text-muted)] truncate">{a.name}</span>
                                                      </div>
                                                   </div>

                                                   <div className="flex items-center gap-2 shrink-0 pl-2">
                                                      <div className="flex flex-col items-end">
                                                         <span className="text-[13px] font-mono font-bold text-[var(--text-primary)]">
                                                            {parseFloat(a.balanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                         </span>
                                                         {a.totalUsd > 0 && (
                                                            <span className="text-[10px] text-[var(--text-muted)]">
                                                               ${a.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                         )}
                                                      </div>
                                                      {isSelected && (
                                                         <div className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs shrink-0 ml-1">
                                                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                         </div>
                                                      )}
                                                   </div>
                                                </button>
                                             );
                                          })}

                                          {filteredSendTokens.length === 0 && (
                                             <div className="text-center py-8 flex flex-col items-center justify-center">
                                                <p className="text-xs font-semibold text-[var(--text-secondary)]">No tokens found matching &quot;{assetSearchQuery}&quot;</p>
                                                <p className="text-[11px] text-[var(--text-muted)] mt-1">Make sure you have imported the token contract address</p>
                                             </div>
                                          )}
                                       </div>
                                    </motion.div>
                                 </div>
                              )}
                           </AnimatePresence>
                        </div>
                     )}

                     {sendStep === "review" && (
                        <div className="flex flex-col gap-3 flex-1">
                           <div className="bg-[#F8FAFC] dark:bg-[#0c0d14] border border-slate-200/80 dark:border-[var(--border)] rounded-2xl p-4 flex flex-col items-center justify-center text-center shadow-sm">
                              <p className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">Sending exactly</p>
                              <h3 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight mb-0.5">{sendAmount}</h3>
                              <p className="text-[var(--text-secondary)] font-medium text-xs flex items-center justify-center gap-1.5">
                                 <span>{sendAsset}</span>
                                 {(() => {
                                    const assetObj = sendNetworkAssets.find(a => a.symbol === sendAsset);
                                    const price = assetObj?.priceUsd || (sendAsset === 'SOL' ? 104 : (sendAsset === 'USDC' || sendAsset === 'USDT') ? 1 : 0);
                                    if (price > 0 && sendAmount && !isNaN(Number(sendAmount))) {
                                       return (
                                          <span className="text-[var(--text-muted)] font-mono text-[11px]">
                                             (≈ ${(Number(sendAmount) * price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)
                                          </span>
                                       );
                                    }
                                    return null;
                                 })()}
                              </p>
                           </div>

                           <div className="flex flex-col gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-sm">
                              <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)]">
                                 <span className="text-[var(--text-muted)] font-medium text-xs">Network</span>
                                 <span className="text-[var(--text-primary)] font-medium text-xs">{sendNetwork}</span>
                              </div>
                              <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)]">
                                 <span className="text-[var(--text-muted)] font-medium text-xs">Recipient</span>
                                 <span className="text-[var(--text-primary)] font-mono text-xs">{sendAddress.slice(0, 6)}...{sendAddress.slice(-4)}</span>
                              </div>
                              <div className="flex justify-between items-center py-1.5">
                                 <span className="text-[var(--text-muted)] font-medium text-xs">Remaining</span>
                                 <span className="text-[var(--text-primary)] font-medium text-xs">
                                    {Math.max(0, parseFloat(sendNetworkAssets.find(a => a.symbol === sendAsset)?.balanceFormatted || '0') - Number(sendAmount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {sendAsset}
                                 </span>
                              </div>
                           </div>

                           {recipientType === "external" && (
                              <div className="p-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-start gap-2">
                                 <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                                 <p className="text-[11px] text-yellow-500/90 font-medium leading-relaxed">
                                    Sending to external address. Action is permanent.
                                 </p>
                              </div>
                           )}

                           {sendError && (
                              <div className="flex flex-col items-center justify-center gap-1.5 px-1 my-1">
                                 <p className="text-[var(--accent-red)] text-xs font-medium text-center leading-relaxed">
                                    {sendError}
                                 </p>
                                 {sendError.toLowerCase().includes('limit') && (
                                    <button
                                       type="button"
                                       onClick={() => {
                                          setSendError(null);
                                          setSecurityFocusSection('limits');
                                          setCurrentView('security');
                                       }}
                                       className="text-[#3B82F6] hover:text-[#2563EB] text-[12px] font-semibold flex items-center gap-1 transition-colors cursor-pointer hover:underline group"
                                    >
                                       <span>Please increase the limit</span>
                                       <ChevronRight className="w-3.5 h-3.5 stroke-[2.5] group-hover:translate-x-0.5 transition-transform" />
                                    </button>
                                 )}
                              </div>
                           )}

                           <div className="flex gap-3 mt-auto pt-2">
                              <button
                                 onClick={() => setSendStep("input")}
                                 disabled={sendLoading}
                                 className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-[var(--border)] text-[var(--text-primary)] font-semibold rounded-xl transition-colors text-sm py-2.5"
                              >
                                 Back
                              </button>
                              <button
                                 onClick={submitTransfer}
                                 disabled={sendLoading}
                                 className="cyber-button flex-[2] disabled:opacity-50"
                                 style={{ height: 48, fontSize: 14 }}
                              >
                                 <span className="flex items-center justify-center gap-2 w-full">
                                    {sendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Execute Transfer</>}
                                 </span>
                              </button>
                           </div>
                        </div>
                     )}
                  </motion.div>
               )}

               {/* --- RECEIVE VIEW --- */}
               {currentView === 'receive' && (
                  <motion.div key="receive" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }} className="flex flex-col pb-2 md:pb-6">
                     {/* 1. If no specific network is chosen yet: Select Network Screen */}
                     {receiveNetwork === null && (
                        <div className="flex flex-col">
                           {/* Top Bar with back to main */}
                           <div className="flex items-center gap-3 mb-4 shrink-0">
                              <button
                                 onClick={() => setCurrentView('main')}
                                 className="p-1.5 rounded-full bg-[var(--surface-hover)] hover:opacity-90 border border-[var(--border)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                              >
                                 <ChevronLeft className="w-5 h-5" />
                              </button>
                              <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">Receive</h2>
                           </div>

                           <div className="flex flex-col gap-1 mb-4 px-1">
                              <h3 className="text-[13.5px] font-semibold text-[var(--text-primary)] tracking-tight">Select Network to Receive</h3>
                              <p className="text-[11.5px] text-[var(--text-muted)] leading-relaxed">Choose which blockchain network you want to receive assets on.</p>
                           </div>

                           <div className="flex flex-col gap-2">
                              {/* Option 1: Arc Testnet */}
                              <button
                                 onClick={() => setReceiveNetwork('Arc Testnet')}
                                 className="w-full p-3.5 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-between gap-3 transition-colors text-left group cursor-pointer shadow-xs active:scale-[0.99]"
                              >
                                 <div className="flex items-center gap-3 min-w-0">
                                    <img src="/arc-logo.png" alt="Arc Testnet" className="w-10 h-10 rounded-full object-cover shrink-0 shadow-xs border border-[var(--border-soft)]" />
                                    <div className="flex flex-col min-w-0">
                                       <span className="font-bold text-[14px] text-[var(--text-primary)] tracking-tight">Arc Testnet</span>
                                       <span className="text-[12px] text-[var(--text-muted)] tracking-tight truncate mt-0.5">
                                          {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Arc EVM"}
                                       </span>
                                    </div>
                                 </div>
                                 <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] group-hover:translate-x-0.5 transition-all shrink-0" />
                              </button>

                              {/* Option 2: Solana Devnet */}
                              <button
                                 onClick={() => setReceiveNetwork('Solana Devnet')}
                                 className="w-full p-3.5 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-between gap-3 transition-colors text-left group cursor-pointer shadow-xs active:scale-[0.99]"
                              >
                                 <div className="flex items-center gap-3 min-w-0">
                                    <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png" alt="Solana Devnet" className="w-10 h-10 rounded-full object-cover shrink-0 shadow-xs border border-[var(--border-soft)]" />
                                    <div className="flex flex-col min-w-0">
                                       <span className="font-bold text-[14px] text-[var(--text-primary)] tracking-tight">Solana Devnet</span>
                                       <span className="text-[12px] text-[var(--text-muted)] tracking-tight truncate mt-0.5">
                                          {circleSolanaAddress ? `${circleSolanaAddress.slice(0, 6)}...${circleSolanaAddress.slice(-4)}` : "Circle Solana Wallet"}
                                       </span>
                                    </div>
                                 </div>
                                 <div className="flex items-center gap-2 shrink-0">
                                    {!circleSolanaAddress && (
                                       <span className="text-[11px] font-semibold text-[var(--text-primary)] bg-[var(--surface-hover)] hover:bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 rounded-full shadow-xs transition-colors">
                                          Create
                                       </span>
                                    )}
                                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] group-hover:translate-x-0.5 transition-all" />
                                 </div>
                              </button>
                           </div>
                        </div>
                     )}
                     {/* 2. Arc Testnet Receive View */}
                     {receiveNetwork === 'Arc Testnet' && (
                        <div className="flex flex-col">
                           <div className="flex items-center justify-between mb-3 shrink-0">
                              <div className="flex items-center gap-2.5">
                                 <button
                                    onClick={() => setReceiveNetwork(null)}
                                    className="p-1.5 rounded-full bg-[var(--surface-hover)] hover:opacity-90 border border-[var(--border)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                 >
                                    <ChevronLeft className="w-5 h-5" />
                                 </button>
                                 <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">Receive on Arc</h2>
                              </div>
                              <button
                                 onClick={() => setReceiveNetwork(null)}
                                 className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] transition-colors cursor-pointer"
                              >
                                 Change Network
                              </button>
                           </div>

                           <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[20px] p-5 flex flex-col items-center mt-1 shadow-sm relative overflow-hidden">
                              {/* Premium Gradient Glow */}
                              <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-blue-500/10 to-transparent pointer-events-none" />

                              {/* Network Badge */}
                              <div className="bg-[var(--surface-hover)] border border-[var(--border)] rounded-full px-3 py-1 flex items-center gap-1.5 mb-4 shadow-sm relative z-10">
                                 <img src="/arc-logo.png" alt="Arc" className="w-3.5 h-3.5 rounded-full object-cover" />
                                 <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider">Arc Testnet</span>
                              </div>

                              {/* Crisp White QR Box */}
                              <div className="bg-white p-3 rounded-[16px] shadow-sm mb-4 relative z-10 ring-1 ring-black/5">
                                 <QRCode
                                    value={walletAddress ? (CHAIN_ID_MAP['Arc Testnet'] ? `ethereum:${walletAddress}@${CHAIN_ID_MAP['Arc Testnet']}` : walletAddress) : ""}
                                    size={160}
                                    bgColor="#ffffff"
                                    fgColor="#000000"
                                    className="block"
                                 />
                              </div>

                              {/* Address */}
                              <div className="w-full text-center mb-4 relative z-10">
                                 <p className="text-[12px] font-mono text-[var(--text-secondary)] bg-[var(--surface-hover)] border border-[var(--border)] px-3 py-2.5 rounded-xl break-all shadow-inner leading-snug select-all">
                                    {walletAddress}
                                 </p>
                              </div>

                              {/* Big Copy Button */}
                              <button
                                 onClick={() => {
                                    navigator.clipboard.writeText(walletAddress);
                                    setIsCopied(true);
                                    setTimeout(() => setIsCopied(false), 1200);
                                 }}
                                 className="w-full bg-[var(--text-primary)] text-[var(--bg)] hover:opacity-90 py-3 rounded-xl text-[14px] font-bold transition-all flex items-center justify-center gap-2 relative z-10 active:scale-[0.98] shadow-md cursor-pointer"
                              >
                                 {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                 {isCopied ? "Copied to Clipboard!" : "Copy Address"}
                              </button>
                           </div>

                           <p className="text-[11px] md:text-[12px] text-center text-[var(--text-muted)] mt-4 md:mt-5 px-2 md:px-4 leading-relaxed font-medium">
                              Only send supported assets (USDC, EURC) on <span className="text-[var(--text-primary)] font-bold">Arc Testnet</span> to this address.
                           </p>
                        </div>
                     )}

                     {/* 3. Solana Devnet Receive View: Address Exists */}
                     {receiveNetwork === 'Solana Devnet' && circleSolanaAddress && (
                        <div className="flex flex-col">
                           <div className="flex items-center justify-between mb-3 shrink-0">
                              <div className="flex items-center gap-2.5">
                                 <button
                                    onClick={() => setReceiveNetwork(null)}
                                    className="p-1.5 rounded-full bg-[var(--surface-hover)] hover:opacity-90 border border-[var(--border)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                 >
                                    <ChevronLeft className="w-5 h-5" />
                                 </button>
                                 <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">Receive on Solana</h2>
                              </div>
                              <button
                                 onClick={() => setReceiveNetwork(null)}
                                 className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] transition-colors cursor-pointer"
                              >
                                 Change Network
                              </button>
                           </div>

                           <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[20px] p-5 flex flex-col items-center mt-1 shadow-sm relative overflow-hidden">
                              {/* Premium Gradient Glow */}
                              <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-purple-500/10 to-transparent pointer-events-none" />

                              {/* Network Badge */}
                              <div className="bg-[var(--surface-hover)] border border-[var(--border)] rounded-full px-3 py-1 flex items-center gap-1.5 mb-4 shadow-sm relative z-10">
                                 <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png" alt="Solana" className="w-3.5 h-3.5 rounded-full object-cover" />
                                 <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider">Solana Devnet</span>
                              </div>

                              {/* Crisp White QR Box */}
                              <div className="bg-white p-3 rounded-[16px] shadow-sm mb-4 relative z-10 ring-1 ring-black/5">
                                 <QRCode
                                    value={circleSolanaAddress}
                                    size={160}
                                    bgColor="#ffffff"
                                    fgColor="#000000"
                                    className="block"
                                 />
                              </div>

                              {/* Address */}
                              <div className="w-full text-center mb-4 relative z-10">
                                 <p className="text-[12px] font-mono text-[var(--text-secondary)] bg-[var(--surface-hover)] border border-[var(--border)] px-3 py-2.5 rounded-xl break-all shadow-inner leading-snug select-all">
                                    {circleSolanaAddress}
                                 </p>
                              </div>

                              {/* Big Copy Button */}
                              <button
                                 onClick={() => {
                                    navigator.clipboard.writeText(circleSolanaAddress);
                                    setIsCopied(true);
                                    setTimeout(() => setIsCopied(false), 1200);
                                 }}
                                 className="w-full bg-[var(--text-primary)] text-[var(--bg)] hover:opacity-90 py-3 rounded-xl text-[14px] font-bold transition-all flex items-center justify-center gap-2 relative z-10 active:scale-[0.98] shadow-md cursor-pointer"
                              >
                                 {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                 {isCopied ? "Copied to Clipboard!" : "Copy Solana Address"}
                              </button>
                           </div>

                           <p className="text-[11px] md:text-[12px] text-center text-[var(--text-muted)] mt-4 md:mt-5 px-2 md:px-4 leading-relaxed font-medium">
                              Only send supported assets (SOL, USDC) on <span className="text-[var(--text-primary)] font-bold">Solana Devnet</span> to this address.
                           </p>
                        </div>
                     )}

                     {/* 4. Solana Devnet Receive View: Wallet NOT Created -> Professional Creation Card */}
                     {receiveNetwork === 'Solana Devnet' && !circleSolanaAddress && (
                        <div className="flex flex-col">
                           <div className="flex items-center gap-3 mb-4 shrink-0">
                              <button
                                 onClick={() => setReceiveNetwork(null)}
                                 className="p-1.5 rounded-full bg-[var(--surface-hover)] hover:opacity-90 border border-[var(--border)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                              >
                                 <ChevronLeft className="w-5 h-5" />
                              </button>
                              <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">Solana Account</h2>
                           </div>

                           <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[24px] p-6 flex flex-col items-center shadow-lg relative overflow-hidden">
                              {/* Hero Icon matching Arc Native Style */}
                              <div className="w-16 h-16 rounded-[20px] bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center mb-4 shadow-sm overflow-hidden">
                                 <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png" alt="Solana" className="w-9 h-9 rounded-full object-cover" />
                              </div>

                              <h3 className="text-lg font-bold tracking-tight text-[var(--text-primary)] text-center mb-1">
                                 Create Solana Wallet
                              </h3>
                              <p className="text-[12.5px] text-[var(--text-muted)] text-center max-w-[270px] mb-5 leading-relaxed">
                                 Set up your non-custodial Circle Developer-Controlled Wallet to receive SOL and SPL tokens on Solana Devnet.
                              </p>

                              {/* Feature checkmarks in clean monochrome style */}
                              <div className="w-full flex flex-col gap-2 mb-6">
                                 {[
                                    "Circle Developer-Controlled (DCW)",
                                    "Non-custodial & secure asset storage",
                                    "Zero gas fees to initialize"
                                 ].map((feat, i) => (
                                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--surface-hover)] border border-[var(--border)]">
                                       <Check className="w-4 h-4 text-[var(--text-primary)] shrink-0" />
                                       <span className="text-[12px] font-medium text-[var(--text-secondary)]">{feat}</span>
                                    </div>
                                 ))}
                              </div>

                              {solanaProvisionError && (
                                 <div className="w-full mb-4 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] font-medium flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <span>{solanaProvisionError}</span>
                                 </div>
                              )}

                              {/* Action Button - High contrast ArcFun luxury styling */}
                              <button
                                 onClick={provisionSolanaInReceive}
                                 disabled={isProvisioningSolanaInReceive}
                                 className="w-full py-3 px-4 rounded-full font-bold text-[13.5px] tracking-wide bg-[#27272a] text-white hover:bg-[#3f3f46] border border-[#3f3f46] dark:bg-[#27272a] dark:text-white dark:hover:bg-[#3f3f46] dark:border-white/20 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
                              >
                                 {isProvisioningSolanaInReceive ? (
                                    <>
                                       <Loader2 className="w-4 h-4 animate-spin" />
                                       <span>Creating Solana Wallet...</span>
                                    </>
                                 ) : (
                                    <>
                                       <Plus className="w-4 h-4" />
                                       <span>Create Solana Account</span>
                                    </>
                                 )}
                              </button>
                           </div>
                        </div>
                     )}
                  </motion.div>
               )}
               {/* --- ASSET DETAIL VIEW (PREMIUM CLEAN WALLET STYLE) --- */}
                {currentView === 'asset-detail' && selectedAsset && (
                   <motion.div key="asset-detail" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }} className="flex flex-col pb-4">
                      {/* Top Navigation Bar: Back button, Asset Title & Network Badge */}
                      <div className="flex items-center justify-between mb-4 shrink-0">
                         <div className="flex items-center gap-3">
                            <button
                               onClick={() => setCurrentView('main')}
                               className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200/80 dark:border-[var(--border)] transition-all text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer active:scale-95"
                               title="Back to wallet"
                            >
                               <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="flex items-center gap-2.5">
                               <AssetLogo symbol={selectedAsset.symbol} logoUrl={selectedAsset.logoUrl} className="w-7 h-7 rounded-full shrink-0 shadow-xs" />
                               <div className="flex flex-col">
                                  <h2 className="text-[16px] font-bold tracking-tight text-[var(--text-primary)] leading-tight">
                                     {selectedAsset.name || selectedAsset.symbol}
                                  </h2>
                               </div>
                            </div>
                         </div>

                         <div className="px-2.5 py-1 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] text-[11px] font-semibold text-[var(--text-secondary)]">
                            {selectedAsset.chains?.length || 1} {(selectedAsset.chains?.length || 1) === 1 ? 'Network' : 'Networks'}
                         </div>
                      </div>

                      {/* Hero Balance & Quick Actions Card */}
                      <div className="relative overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--surface)] p-5 mb-4 shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-md flex flex-col items-center text-center">
                         {/* Subtle gradient glow */}
                         <div className="absolute inset-0 bg-gradient-to-b from-[#3B82F6]/5 via-transparent to-transparent pointer-events-none" />
                         <div className="absolute top-0 right-1/4 w-32 h-32 rounded-full bg-[#3B82F6]/10 blur-[40px] pointer-events-none" />

                         <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 relative z-10">
                            Total Balance
                         </span>

                         <div className="flex items-baseline justify-center gap-2 mb-1 relative z-10">
                            <h1 className="text-[38px] font-extrabold tracking-[-0.03em] text-[var(--text-primary)] leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
                               {Number(selectedAsset.totalBalanceFormatted.replace(/,/g, "")).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </h1>
                            <span className="text-[18px] font-bold text-[var(--text-secondary)] tracking-tight">
                               {selectedAsset.symbol}
                            </span>
                         </div>

                         <div className="flex items-center justify-center relative z-10">
                            <span className="text-[15px] font-semibold text-[var(--text-muted)] tracking-tight" style={{ fontVariantNumeric: "tabular-nums" }}>
                               ≈ ${selectedAsset.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                            </span>
                         </div>

                         {/* Action Buttons Row: Send & Receive Side-by-Side */}
                         <div className="grid grid-cols-2 gap-3 w-full mt-6 relative z-10">
                            <button
                               onClick={() => {
                                  let targetNet = "Arc Testnet";
                                  if (selectedAsset.symbol === "SOL" || selectedAsset.chains?.some(c => c.network.toLowerCase().includes("solana"))) {
                                     targetNet = "Solana Devnet";
                                  } else if (selectedAsset.chains && selectedAsset.chains.length > 0) {
                                     const best = [...selectedAsset.chains].sort((a, b) => (b.balanceNum || 0) - (a.balanceNum || 0))[0];
                                     if (best?.network) targetNet = best.network;
                                  }
                                  setSendNetwork(targetNet);
                                  setSendAsset(selectedAsset.symbol);
                                  setSendAmount("");
                                  setSendAddress("");
                                  setSendError(null);
                                  setSendStep("input");
                                  setCurrentView('send');
                               }}
                               className="h-11 rounded-full bg-[#27272a] text-white hover:bg-[#3f3f46] border border-[#3f3f46] dark:bg-[#27272a] dark:text-white dark:hover:bg-[#3f3f46] dark:border-white/20 font-bold text-[13.5px] tracking-wide flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                            >
                               <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                               <span>Send</span>
                            </button>

                            <button
                               onClick={() => {
                                  let targetNet: "Arc Testnet" | "Solana Devnet" = "Arc Testnet";
                                  if (selectedAsset.symbol === "SOL" || selectedAsset.chains?.some(c => c.network.toLowerCase().includes("solana"))) {
                                     targetNet = "Solana Devnet";
                                  } else {
                                     targetNet = "Arc Testnet";
                                  }
                                  setReceiveNetwork(targetNet);
                                  setCurrentView('receive');
                               }}
                               className="h-11 rounded-full bg-[var(--surface-hover)] hover:bg-slate-200 dark:hover:bg-white/10 text-[var(--text-primary)] border border-[var(--border)] font-bold text-[13.5px] tracking-wide flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
                            >
                               <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
                               <span>Receive</span>
                            </button>
                         </div>
                      </div>

                      {/* Network Breakdown Card */}
                      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[22px] p-4 shadow-sm mb-4">
                         <div className="flex items-center justify-between mb-3 px-1">
                            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                               Network Breakdown
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                               Select network to send
                            </span>
                         </div>

                         <div className="flex flex-col gap-1.5">
                            {selectedAsset.chains
                               .filter(c => selectedChainTab === 'Overview' || c.network === selectedChainTab)
                               .map((c) => (
                                  <div
                                     key={c.network}
                                     onClick={() => {
                                        setSendNetwork(c.network);
                                        setSendAsset(selectedAsset.symbol);
                                        setSendAmount("");
                                        setSendAddress("");
                                        setSendError(null);
                                        setSendStep("input");
                                        setCurrentView("send");
                                     }}
                                     className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent hover:border-[var(--border)] transition-all group cursor-pointer"
                                  >
                                     <div className="flex items-center gap-3 min-w-0">
                                        <img src={getChainLogo(c.network)} alt={c.network} className="w-8 h-8 rounded-full object-cover shrink-0 shadow-xs border border-slate-200/60 dark:border-white/10" />
                                        <div className="flex flex-col min-w-0">
                                           <span className="font-semibold text-[13.5px] text-[var(--text-primary)] truncate tracking-[-0.01em]">{c.network}</span>
                                           <span className="text-[11px] font-normal text-[var(--text-secondary)] tracking-[-0.005em]" style={{ fontVariantNumeric: "tabular-nums" }}>{c.percentage.toFixed(2)}% of total</span>
                                        </div>
                                     </div>
                                     <div className="flex flex-col items-end shrink-0">
                                        <span className="font-semibold text-[14px] text-[var(--text-primary)] tracking-[-0.01em]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                           ${c.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[11.5px] font-normal text-[var(--text-secondary)] tracking-[-0.005em]" style={{ fontVariantNumeric: "tabular-nums" }}>
                                           {Number(c.balanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 })} {selectedAsset.symbol}
                                        </span>
                                     </div>
                                  </div>
                               ))}
                         </div>
                      </div>

                   </motion.div>
                )}

                {/* --- HISTORY VIEW --- */}
               {currentView === 'history' && (
                  <motion.div key="history" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }} className="flex flex-col h-full">
                     {renderTopNav("History")}

                     <div 
                        ref={historyScrollContainerRef}
                        onScroll={(e) => {
                           const el = e.currentTarget;
                           if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
                              fetchMoreHistory();
                           }
                        }}
                        className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-3.5"
                     >
                        {isHistoryLoading && history.length === 0 ? (
                           <div className="flex flex-col gap-2 pb-6">
                              {[1, 2, 3, 4, 5].map((idx) => (
                                 <div
                                    key={idx}
                                    className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs w-full animate-pulse"
                                 >
                                    <div className="flex items-center gap-3.5">
                                       <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/10 shrink-0" />
                                       <div className="flex flex-col gap-2">
                                          <div className="w-24 h-3.5 rounded-md bg-slate-200 dark:bg-white/10" />
                                          <div className="w-16 h-2.5 rounded-md bg-slate-100 dark:bg-white/5" />
                                       </div>
                                    </div>
                                    <div className="w-16 h-4 rounded-md bg-slate-200 dark:bg-white/10 shrink-0" />
                                 </div>
                              ))}
                           </div>
                        ) : history.length === 0 ? (
                           <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                              <div className="w-14 h-14 bg-[var(--surface-hover)] rounded-full flex items-center justify-center mb-4">
                                 <Activity className="w-6 h-6 text-[var(--text-muted)]" />
                              </div>
                              <p className="text-[var(--text-primary)] font-medium text-sm mb-1">No Activity Yet</p>
                              <p className="text-xs text-[var(--text-muted)]">Your wallet transactions will appear here.</p>
                           </div>
                        ) : (
                           <div className="flex flex-col gap-2 pb-6">
                              {history.map((tx: any) => {
                                 const isSender = tx.is_sender !== undefined 
                                    ? Boolean(tx.is_sender) 
                                    : (myAddresses.includes((tx.from_wallet || '').toLowerCase()) || (tx.from_wallet || '').toLowerCase() === (walletAddress || '').toLowerCase());
                                 const statusUpper = (tx.status || '').toUpperCase();
                                 const isFailed = ['FAILED', 'CANCELLED'].includes(statusUpper);

                                 let actionTitle = isSender ? 'Sent' : 'Received';
                                 if (isFailed) actionTitle = 'Failed';

                                 let sign = '';
                                 if (!isFailed) {
                                    sign = isSender ? '-' : '+';
                                 }

                                 let amountColor = isSender ? 'text-red-500' : 'text-green-500';
                                 if (isFailed) amountColor = 'text-[var(--text-primary)]';

                                 const txHash = tx.blockchain_hash;

                                 return (
                                    <button
                                       key={tx.id}
                                       onClick={() => setSelectedTx(tx)}
                                       className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm transition-all cursor-pointer hover:bg-[var(--surface-hover)] hover:shadow-md w-full text-left"
                                    >
                                       <div className="flex items-center gap-3.5">
                                          <div className="relative shrink-0">
                                             <AssetLogo symbol={tx.token || 'Unknown Asset'} />
                                          </div>

                                          <div className="flex flex-col justify-center gap-0.5">
                                             <div className="text-[14px] font-bold text-[var(--text-primary)] tracking-wide flex items-center gap-1.5">
                                                <span>{actionTitle} {getDisplayToken(tx.token)}</span>
                                                {tx.type === 'AUTOPAY' && (
                                                   <span className="text-[12.5px] font-bold text-[#1e3a8a] dark:text-[#60a5fa]">
                                                      Autopay
                                                   </span>
                                                )}
                                             </div>
                                             <div className="flex items-center gap-1.5">
                                                <div className="text-[var(--text-muted)] text-[12px] font-medium tracking-wide">
                                                   {(tx.blockchain || network)}
                                                </div>
                                             </div>
                                          </div>
                                       </div>
                                       <div className="text-right flex flex-col justify-center shrink-0">
                                          <div className={`font-bold text-[14.5px] tracking-tight ${amountColor} ${isFailed ? 'line-through opacity-70' : ''}`}>
                                             {sign}{tx.amount} {getDisplayToken(tx.token)}
                                          </div>
                                       </div>
                                    </button>
                                 );
                              })}

                              {/* Bottom Infinite Scroll Sentinel & Loader */}
                              {hasMoreHistory && (
                                 <div ref={sentinelRef} className="py-3 flex flex-col items-center justify-center gap-1.5">
                                    {isLoadingMoreHistory ? (
                                       <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] font-medium">
                                          <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
                                          <span>Loading older transactions...</span>
                                       </div>
                                    ) : (
                                       <button
                                          type="button"
                                          onClick={fetchMoreHistory}
                                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline py-1 px-3 rounded-md hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                                       >
                                          Load more transactions
                                       </button>
                                    )}
                                 </div>
                              )}

                              {!hasMoreHistory && history.length > 0 && (
                                 <div className="text-center py-4 text-[11px] text-[var(--text-muted)] font-medium">
                                    All transactions loaded ({history.length})
                                 </div>
                              )}
                           </div>
                        )}
                     </div>
                  </motion.div>
               )}

            
                {/* --- IMPORT CUSTOM TOKEN VIEW --- */}
                {currentView === 'import' && (
                   <motion.div
                      key="import-token"
                      variants={viewVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={{ duration: 0.2 }}
                      className="flex flex-col h-full"
                   >
                      {renderTopNav("Import Custom Token")}

                      <div className="flex-1 flex flex-col gap-4 max-w-lg mx-auto w-full pb-6 px-0.5">
                         {/* Network Selector Dropdown */}
                         <div className="flex flex-col gap-1.5 relative">
                            <label className="text-[12px] font-semibold text-[var(--text-secondary)] tracking-[-0.01em]">
                               Choose Network
                            </label>
                            <div className="relative">
                               <button
                                  type="button"
                                  onClick={() => setIsImportNetworkDropdownOpen(!isImportNetworkDropdownOpen)}
                                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:opacity-90 text-[var(--text-primary)] flex items-center justify-between shadow-xs transition-all text-left"
                               >
                                  <div className="flex items-center gap-3">
                                     <img
                                        src={importNetwork === 'Solana Devnet' ? "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png" : "/arc-logo.png"}
                                        alt={importNetwork}
                                        className="w-6 h-6 rounded-full object-cover shrink-0"
                                     />
                                     <div className="flex flex-col">
                                        <span className="text-[13.5px] font-semibold tracking-[-0.01em]">{importNetwork}</span>
                                        <span className="text-[11px] text-[var(--text-muted)] font-normal">
                                           {importNetwork === 'Solana Devnet' ? 'Solana SPL Token' : 'Arc EVM Smart Contract'}
                                        </span>
                                     </div>
                                  </div>
                                  <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform duration-200 ${isImportNetworkDropdownOpen ? 'rotate-180 text-[var(--text-primary)]' : ''}`} />
                               </button>

                               {/* Dropdown Menu */}
                               <AnimatePresence>
                                  {isImportNetworkDropdownOpen && (
                                     <>
                                        <div
                                           className="fixed inset-0 z-40"
                                           onClick={() => setIsImportNetworkDropdownOpen(false)}
                                        />
                                        <motion.div
                                           initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                           animate={{ opacity: 1, y: 0, scale: 1 }}
                                           exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                           transition={{ duration: 0.15 }}
                                           className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#0c0c10] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl z-50 p-1.5 flex flex-col gap-1 backdrop-blur-md"
                                        >
                                           {[
                                              { id: 'Arc Testnet', name: 'Arc Testnet', type: 'Arc EVM • ERC-20', icon: '/arc-logo.png' },
                                              { id: 'Solana Devnet', name: 'Solana Devnet', type: 'Solana Devnet • SPL Token', icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png' }
                                           ].map((net) => {
                                              const isSelected = importNetwork === net.id;
                                              return (
                                                 <button
                                                    key={net.id}
                                                    type="button"
                                                    onClick={() => {
                                                       setImportNetwork(net.id);
                                                       setIsImportNetworkDropdownOpen(false);
                                                       setImportAddress("");
                                                       setImportSymbol("");
                                                       setImportDecimals("");
                                                       setImportName("");
                                                       setImportError(null);
                                                    }}
                                                    className={`flex items-center justify-between p-2.5 rounded-xl text-left transition-colors ${
                                                       isSelected
                                                          ? 'bg-slate-100 dark:bg-white/10 text-[var(--text-primary)]'
                                                          : 'hover:bg-slate-50 dark:hover:bg-white/5 text-[var(--text-secondary)]'
                                                    }`}
                                                 >
                                                    <div className="flex items-center gap-3">
                                                       <img src={net.icon} alt={net.name} className="w-5 h-5 rounded-full object-cover shrink-0" />
                                                       <div className="flex flex-col">
                                                          <span className="text-[13px] font-semibold text-[var(--text-primary)] tracking-tight">{net.name}</span>
                                                          <span className="text-[10.5px] text-[var(--text-muted)] font-normal">{net.type}</span>
                                                       </div>
                                                    </div>
                                                    {isSelected && <Check className="w-4 h-4 text-[#3B82F6]" />}
                                                 </button>
                                              );
                                           })}
                                        </motion.div>
                                     </>
                                  )}
                               </AnimatePresence>
                            </div>
                         </div>

                         {/* Address Input */}
                         <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                               <label className="text-[12px] font-semibold text-[var(--text-secondary)] tracking-[-0.01em]">
                                  {importNetwork === 'Solana Devnet' ? 'Solana Mint Address' : 'Contract Address'}
                               </label>
                               {importDetecting && (
                                  <span className="text-[11px] text-[#3B82F6] flex items-center gap-1 font-semibold">
                                     <Loader2 className="w-3 h-3 animate-spin" /> Detecting...
                                  </span>
                               )}
                            </div>
                            <input
                               type="text"
                               value={importAddress}
                               onChange={(e) => handleAddressChange(e.target.value)}
                               placeholder={importNetwork === 'Solana Devnet' ? 'e.g. 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' : '0x...'}
                               className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#3B82F6] font-mono transition-colors shadow-xs"
                            />
                         </div>

                         {/* Symbol & Decimals Row */}
                         <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                               <label className="text-[12px] font-semibold text-[var(--text-secondary)] tracking-[-0.01em]">Symbol</label>
                               <input
                                  type="text"
                                  value={importSymbol}
                                  onChange={(e) => setImportSymbol(e.target.value.toUpperCase())}
                                  placeholder={importNetwork === 'Solana Devnet' ? 'USDC' : 'ARC'}
                                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#3B82F6] uppercase font-bold shadow-xs"
                               />
                            </div>
                            <div className="flex flex-col gap-1.5">
                               <label className="text-[12px] font-semibold text-[var(--text-secondary)] tracking-[-0.01em]">Decimals</label>
                               <input
                                  type="number"
                                  value={importDecimals}
                                  onChange={(e) => setImportDecimals(e.target.value)}
                                  placeholder={importNetwork === 'Solana Devnet' ? '6' : '18'}
                                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#3B82F6] shadow-xs"
                               />
                            </div>
                         </div>

                         {/* Token Name Input */}
                         <div className="flex flex-col gap-1.5">
                            <label className="text-[12px] font-semibold text-[var(--text-secondary)] tracking-[-0.01em]">Token Name (Optional)</label>
                            <input
                               type="text"
                               value={importName}
                               onChange={(e) => setImportName(e.target.value)}
                               placeholder="e.g. My Custom Token"
                               className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#3B82F6] shadow-xs"
                            />
                         </div>

                         {/* Alerts */}
                         {importError && (
                            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-[12px] font-medium flex items-center gap-2">
                               <AlertTriangle className="w-4 h-4 shrink-0" />
                               <span>{importError}</span>
                            </div>
                         )}
                         {importSuccess && (
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[12px] font-medium flex items-center gap-2">
                               <CheckCircle2 className="w-4 h-4 shrink-0" />
                               <span>{importSuccess}</span>
                            </div>
                         )}

                         {/* Action buttons */}
                         <div className="flex items-center gap-3 mt-3">
                            <button
                               type="button"
                               onClick={() => { setCurrentView('main'); setImportError(null); }}
                               className="flex-1 py-2.5 px-4 text-[13px] font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                               Cancel
                            </button>
                            <button
                               type="button"
                               disabled={importLoading || !importAddress.trim()}
                               onClick={handleImportToken}
                               className="flex-1 py-2.5 px-4 text-[13px] font-semibold rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                            >
                               {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                               <span>Import Token</span>
                            </button>
                         </div>
                      </div>
                   </motion.div>
                )}

            </AnimatePresence>

         </div>
         </div>

         {/* Bottom Navigation Bar: Send | Claim | Chat */}
         <div className="shrink-0 px-6 py-2.5 bg-[var(--surface)]/95 border-t border-[var(--border)] z-20 backdrop-blur-md">
            <div className="flex items-center justify-around max-w-[280px] mx-auto">
               <button
                  onClick={() => {
                     setActiveTab('send');
                     setCurrentView('main');
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all text-[12px] cursor-pointer ${
                     activeTab === 'send'
                        ? 'text-[var(--text-primary)] font-semibold bg-[var(--surface-hover)] shadow-xs border border-[var(--border)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium'
                  }`}
               >
                  <Send className={`w-3.5 h-3.5 ${activeTab === 'send' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`} />
                  <span>Send</span>
               </button>

               <button
                  onClick={() => setActiveTab('claim')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all text-[12px] cursor-pointer ${
                     activeTab === 'claim'
                        ? 'text-[var(--text-primary)] font-semibold bg-[var(--surface-hover)] shadow-xs border border-[var(--border)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium'
                  }`}
               >
                  <Gift className={`w-3.5 h-3.5 ${activeTab === 'claim' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`} />
                  <span>Claim</span>
               </button>

               <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all text-[12px] cursor-pointer ${
                     activeTab === 'chat'
                        ? 'text-[var(--text-primary)] font-semibold bg-[var(--surface-hover)] shadow-xs border border-[var(--border)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium'
                  }`}
               >
                  <MessageSquare className={`w-3.5 h-3.5 ${activeTab === 'chat' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`} />
                  <span>Chat</span>
               </button>
            </div>
         </div>

         {/* --- TRANSACTION DETAILS BOTTOM SHEET (ROOT LEVEL) --- */}
         <AnimatePresence>
            {selectedTx && (
               <div className="absolute inset-0 z-50 flex flex-col justify-end overflow-hidden">
                  <motion.div
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     onClick={() => setSelectedTx(null)}
                     className="absolute inset-0 bg-white/20 dark:bg-black/20 backdrop-blur-md cursor-pointer transition-all"
                  />
                  <motion.div
                     initial={{ y: "100%" }}
                     animate={{ y: 0 }}
                     exit={{ y: "100%" }}
                     transition={{ type: "spring", damping: 28, stiffness: 320 }}
                     className="relative bg-white dark:bg-[#0c0d14] border-t border-slate-200/90 dark:border-[var(--border)] rounded-t-[28px] p-5 shadow-2xl z-10 flex flex-col max-h-[85%] overflow-hidden"
                  >
                     <div className="w-9 h-1 rounded-full bg-slate-300 dark:bg-white/20 mx-auto mb-3 shrink-0" />
                     <div className="flex items-center justify-between pb-3 mb-2 border-b border-[var(--border)] shrink-0">
                        <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Transaction Details</h2>
                        <button
                           type="button"
                           onClick={() => setSelectedTx(null)}
                           className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        >
                           <X className="w-4 h-4" />
                        </button>
                     </div>
                     <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col gap-4 pb-4">
                        {(() => {
                           const tx = selectedTx;
                           const isSender = tx.is_sender !== undefined
                              ? Boolean(tx.is_sender)
                              : (myAddresses.some(addr => addr.toLowerCase() === (tx.from_wallet || '').toLowerCase()) || (tx.from_wallet || '').toLowerCase() === (walletAddress || '').toLowerCase());
                           const statusUpper = (tx.status || '').toUpperCase();
                           const isFailed = ['FAILED', 'CANCELLED'].includes(statusUpper);

                           let actionTitle = isSender ? 'Sent' : 'Received';
                           if (isFailed) actionTitle = 'Failed';

                           let sign = '';
                           if (!isFailed) sign = isSender ? '-' : '+';

                           let amountColor = isSender ? 'text-red-500' : 'text-green-500';
                           if (isFailed) amountColor = 'text-[var(--text-primary)]';

                           const txHash = tx.blockchain_hash;
                           const txDate = new Date(tx.created_at || Date.now()).toLocaleString();
                           const explorerUrl = txHash ? getExplorerUrl(tx.blockchain || network, txHash) : null;

                           return (
                              <div className="flex flex-col gap-1">
                                 <div className="flex items-center gap-3 mb-2">
                                    <div className="w-12 h-12 rounded-full bg-[var(--surface-hover)] flex items-center justify-center border border-[var(--border)] shrink-0">
                                       <AssetLogo symbol={tx.token || 'Unknown Asset'} />
                                    </div>
                                    <div>
                                       <div className={`text-2xl font-black tracking-tight ${amountColor}`}>
                                          {sign}{tx.amount} {getDisplayToken(tx.token)}
                                       </div>
                                       <div className="text-[13px] font-medium text-[var(--text-muted)] tracking-wide flex items-center gap-1.5">
                                          <span>{actionTitle} • {tx.blockchain || network}</span>
                                          {tx.type === 'AUTOPAY' && (
                                             <span className="text-[13px] font-bold text-[#1e3a8a] dark:text-[#60a5fa]">
                                                • Autopay
                                             </span>
                                          )}
                                       </div>
                                    </div>
                                 </div>

                                 <div className="flex flex-col mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                                    {/* Date & Time */}
                                    <div className="flex flex-col p-3.5 border-b border-[var(--border)]">
                                       <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase mb-1">Date & Time</span>
                                       <span className="text-[13px] font-semibold text-[var(--text-primary)]">{txDate}</span>
                                    </div>

                                    {/* Sender / Recipient Address */}
                                    <div className="flex flex-col p-3.5 border-b border-[var(--border)]">
                                       <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase mb-1">
                                          {actionTitle === 'Received' ? 'Sender Address' : 'Recipient Address'}
                                       </span>
                                       <div className="flex items-center justify-between gap-2">
                                          <span className="text-[13px] font-mono text-[var(--text-primary)] truncate">
                                             {actionTitle === 'Received' ? (tx.from_wallet || 'External') : (tx.to_wallet || 'External')}
                                          </span>
                                          {((actionTitle === 'Received' && tx.from_wallet) || (actionTitle !== 'Received' && tx.to_wallet)) && (
                                             <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(actionTitle === 'Received' ? tx.from_wallet : tx.to_wallet); }} className="p-1.5 shrink-0 hover:bg-[var(--surface-hover)] rounded-md text-[var(--text-muted)] transition-colors cursor-pointer">
                                                <Copy className="w-4 h-4" />
                                             </button>
                                          )}
                                       </div>
                                    </div>

                                    {/* Transaction Hash */}
                                    {txHash ? (
                                       <div className="flex flex-col p-3.5">
                                          <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase mb-1">Transaction Hash</span>
                                          <div className="flex items-center justify-between gap-2">
                                             <span className="text-[13px] font-mono text-[var(--text-primary)] truncate max-w-[200px]">
                                                {txHash}
                                             </span>
                                             <div className="flex items-center gap-1 shrink-0">
                                                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(txHash); }} className="p-1.5 hover:bg-[var(--surface-hover)] rounded-md text-[var(--text-muted)] transition-colors cursor-pointer">
                                                   <Copy className="w-4 h-4" />
                                                </button>
                                                {explorerUrl && (
                                                   <a href={explorerUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 hover:bg-[var(--surface-hover)] rounded-md text-[var(--text-muted)] transition-colors cursor-pointer">
                                                      <ExternalLink className="w-4 h-4" />
                                                   </a>
                                                )}
                                             </div>
                                          </div>
                                       </div>
                                    ) : (['INITIATED', 'PENDING'].includes(statusUpper) && (
                                       <div className="flex flex-col p-3.5">
                                          <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase mb-1">Transaction Hash</span>
                                          <div className="flex items-center justify-between gap-2 mt-0.5">
                                             <div className="flex items-center gap-2">
                                                <Loader2 className="w-3.5 h-3.5 text-yellow-500 animate-spin" />
                                                <span className="text-[12px] font-medium text-yellow-500">Waiting for blockchain confirmation...</span>
                                             </div>
                                             <button
                                                type="button"
                                                onClick={async (e) => {
                                                   e.stopPropagation();
                                                   await fetchHistory();
                                                }}
                                                className="text-[11px] font-semibold text-blue-500 hover:text-blue-600 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
                                             >
                                                Check now
                                             </button>
                                          </div>
                                       </div>
                                    ))}

                                    {/* Future Extensibility for Bridge/Swap */}
                                    {tx.burn_hash && (
                                       <div className="flex flex-col p-3.5 border-t border-[var(--border)]">
                                          <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase mb-1">Burn Hash</span>
                                          <div className="flex items-center justify-between gap-2">
                                             <span className="text-[13px] font-mono text-[var(--text-primary)] truncate max-w-[200px]">{tx.burn_hash}</span>
                                             <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(tx.burn_hash); }} className="p-1.5 shrink-0 hover:bg-[var(--surface-hover)] rounded-md text-[var(--text-muted)] transition-colors cursor-pointer"><Copy className="w-4 h-4" /></button>
                                          </div>
                                       </div>
                                    )}
                                    {tx.mint_hash && (
                                       <div className="flex flex-col p-3.5 border-t border-[var(--border)]">
                                          <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase mb-1">Mint Hash</span>
                                          <div className="flex items-center justify-between gap-2">
                                             <span className="text-[13px] font-mono text-[var(--text-primary)] truncate max-w-[200px]">{tx.mint_hash}</span>
                                             <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(tx.mint_hash); }} className="p-1.5 shrink-0 hover:bg-[var(--surface-hover)] rounded-md text-[var(--text-muted)] transition-colors cursor-pointer"><Copy className="w-4 h-4" /></button>
                                          </div>
                                       </div>
                                    )}
                                    {tx.swap_hash && (
                                       <div className="flex flex-col p-3.5 border-t border-[var(--border)]">
                                          <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase mb-1">Swap Hash</span>
                                          <div className="flex items-center justify-between gap-2">
                                             <span className="text-[13px] font-mono text-[var(--text-primary)] truncate max-w-[200px]">{tx.swap_hash}</span>
                                             <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(tx.swap_hash); }} className="p-1.5 shrink-0 hover:bg-[var(--surface-hover)] rounded-md text-[var(--text-muted)] transition-colors cursor-pointer"><Copy className="w-4 h-4" /></button>
                                          </div>
                                       </div>
                                    )}

                                    {/* Failure Reason */}
                                    {isFailed && tx.error_reason && (
                                       <div className="flex flex-col p-3.5 border-t border-[var(--border)] bg-red-500/5">
                                          <span className="text-[10px] font-bold text-red-500/80 tracking-wider uppercase mb-1">Failure Reason</span>
                                          <span className="text-[13px] font-semibold text-red-500 break-words">{tx.error_reason}</span>
                                       </div>
                                    )}
                                 </div>
                              </div>
                           );
                        })()}
                     </div>
                  </motion.div>
               </div>
            )}
         </AnimatePresence>

      </div>
   );
}
