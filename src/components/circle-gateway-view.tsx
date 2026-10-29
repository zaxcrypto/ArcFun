"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useSignTypedData,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatUnits, parseUnits, zeroAddress, maxUint256, createPublicClient, createWalletClient, custom, http } from "viem";
import {
  ArrowRight,
  Search,
  Check,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  ChevronRight,
  RefreshCw,
  Zap,
  Clock,
  X,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Lock,
  Plus,
} from "lucide-react";
import {
  GATEWAY_NETWORKS,
  GATEWAY_DOMAINS_LIST,
  getGatewayNetworkByDomain,
  GATEWAY_WALLET_TESTNET,
  GATEWAY_MINTER_TESTNET,
  GATEWAY_EIP712_DOMAIN,
  GATEWAY_EIP712_TYPES,
  GATEWAY_WALLET_ABI,
  GATEWAY_MINTER_ABI,
  ERC20_GATEWAY_ABI,
  toGatewayBytes32,
  ARCFUN_FEE_TREASURY_WALLET,
  ARCFUN_PLATFORM_FEE_BPS,
  ARCFUN_MANUAL_FEE_BPS,
} from "@/config/gateway-config";
import { CircleGatewayClient, type GatewayBalanceSource } from "@/lib/bridge/gateway-client";
import { SlideButton } from "./slide-button";
import { supabase } from "@/lib/supabase";
import { checkAttestationOnChain } from "@/lib/gateway/onchain-verifier";

type StepStatus = "idle" | "in_progress" | "success" | "error";

interface GatewayExecutionState {
  isOpen: boolean;
  step: 1 | 2 | 3 | 4 | 5;
  step1Status: StepStatus;
  step2Status: StepStatus;
  step3Status: StepStatus;
  step4Status: StepStatus;
  step5Status: StepStatus;
  sourceTxHash?: string;
  destinationTxHash?: string;
  transferId?: string;
  errorMessage?: string;
  infoMessage?: string;
}

export type PendingTransferStatus =
  | "deposited_indexing"
  | "ready_to_sign"
  | "attestation_ready"
  | "ready_to_mint"
  | "minted"
  | "failed";

export interface PendingGatewayTransfer {
  id: string;
  sourceDomain: number;
  destDomain: number;
  amount: string;
  receiveAmount: string;
  sourceTxHash?: string;
  status: PendingTransferStatus;
  isManualClaim: boolean;
  platformFeePercent: number;
  burnIntentSet?: any;
  attestationPayload?: string;
  operatorSignature?: string;
  destinationTxHash?: string;
  createdAt: number;
}

export type PendingGatewayMint = PendingGatewayTransfer;

function LiveClockIcon({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="12" x2="8.5" y2="8.5" strokeWidth="2" />
      <line
        x1="12"
        y1="12"
        x2="12"
        y2="4"
        strokeWidth="2"
        style={{
          transformOrigin: "12px 12px",
          animation: "spin 2.2s linear infinite",
        }}
      />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function CircleGatewayView() {
  const { address: userAddress, isConnected } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { signTypedDataAsync } = useSignTypedData();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // ─── Network Selection State ────────────────────────────────────────────────
  const [sourceDomain, setSourceDomain] = useState<number | null>(null); // No automatic default
  const [destDomain, setDestDomain] = useState<number | null>(null);     // User chooses chain
  const [networkSelectorView, setNetworkSelectorView] = useState<"from" | "to" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ─── Form State ─────────────────────────────────────────────────────────────
  const [activeMode, setActiveMode] = useState<"claim" | "deposit">("deposit");
  const [amountInput, setAmountInput] = useState<string>("");
  const [fastSpeed, setFastSpeed] = useState<boolean>(true);
  const [customRecipient, setCustomRecipient] = useState<string>("");
  const [isEditingRecipient, setIsEditingRecipient] = useState<boolean>(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // ─── Live Balances & Allowance ──────────────────────────────────────────────
  const [walletUsdcBalances, setWalletUsdcBalances] = useState<Record<number, string>>({});
  const [unifiedBalances, setUnifiedBalances] = useState<Array<{ domain: number; balance: string }>>([]);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [pendingDeposits, setPendingDeposits] = useState<Array<{ domain: number; amount: string; status: string; transactionHash?: string }>>([]);
  const [isUnifiedDetailsOpen, setIsUnifiedDetailsOpen] = useState(false);
  const [isIndexingInfoOpen, setIsIndexingInfoOpen] = useState(false);
  const [isRouteInfoOpen, setIsRouteInfoOpen] = useState(false);
  const [depositFilterTab, setDepositFilterTab] = useState<"ready" | "indexing">("ready");

  // ─── Execution State ────────────────────────────────────────────────────────
  const [execution, setExecution] = useState<GatewayExecutionState>({
    isOpen: false,
    step: 1,
    step1Status: "idle",
    step2Status: "idle",
    step3Status: "idle",
    step4Status: "idle",
    step5Status: "idle",
  });

  // ─── Relayer Gas Pre-Flight & Manual Claim State ────────────────────────────
  const [isSponsoredAvailable, setIsSponsoredAvailable] = useState<boolean>(true);
  const [isManualClaim, setIsManualClaim] = useState<boolean>(false);
  const [isCheckingRelayerGas, setIsCheckingRelayerGas] = useState<boolean>(false);

  const [cachedAttestation, setCachedAttestation] = useState<{
    attestationPayload: string;
    operatorSignature: string;
    transferId?: string;
  } | null>(null);

  // ─── Destination Chain Live Gas Check State ─────────────────────────────────
  const [userDestGasBalance, setUserDestGasBalance] = useState<bigint | null>(null);
  const [estDestGasCost, setEstDestGasCost] = useState<bigint | null>(null);
  const [isCheckingDestGas, setIsCheckingDestGas] = useState<boolean>(false);
  const [gasCountdown, setGasCountdown] = useState<number>(10);
  const [showFeeDetails, setShowFeeDetails] = useState<boolean>(false);

  // ─── Pending Mints / Recoverable Claims State ────────────────────────────────
  const [pendingMints, setPendingMints] = useState<PendingGatewayTransfer[]>([]);
  const pendingMintsRef = useRef<PendingGatewayTransfer[]>([]);
  useEffect(() => {
    pendingMintsRef.current = pendingMints;
  }, [pendingMints]);
  const [resumingTransfer, setResumingTransfer] = useState<PendingGatewayTransfer | null>(null);
  const progressCardRef = useRef<HTMLDivElement>(null);
  const isMintingRef = useRef(false);
  const [expandedPendingDomains, setExpandedPendingDomains] = useState<Record<number, boolean>>({});
  const toggleExpandDomain = (domainId: number) => {
    setExpandedPendingDomains((prev) => ({ ...prev, [domainId]: !prev[domainId] }));
  };

  // ─── Route & Execution Locking State ───────────────────────────────────────
  // When a transfer is actively in-flight or resuming, lock route controls.
  // CRITICAL: NEVER lock controls if Step 1 was cancelled/errored or hasn't succeeded on-chain yet!
  const isTransferLocked = Boolean(
    resumingTransfer ||
    (
      execution.isOpen &&
      execution.step5Status !== "success" &&
      !execution.errorMessage &&
      (
        // In deposit mode, strictly lock only AFTER Step 1 deposit has actually succeeded on-chain
        (activeMode === "deposit" && execution.step1Status === "success") ||
        // In claim mode, lock only while actively processing steps without error
        (activeMode === "claim" && execution.step >= 3 && execution.step3Status !== "error")
      )
    )
  );

  // Only prompt to switch to source network if Step 1 (deposit to gateway wallet) has NOT succeeded yet
  const isDepositPreFlight = !resumingTransfer && (!execution.isOpen || execution.step1Status !== "success");

  // Auto-close network dropdown if route becomes locked
  useEffect(() => {
    if (isTransferLocked && networkSelectorView) {
      setNetworkSelectorView(null);
    }
  }, [isTransferLocked, networkSelectorView]);

  const sourceConfig = useMemo(() => (sourceDomain !== null ? getGatewayNetworkByDomain(sourceDomain) || null : null), [sourceDomain]);
  const destConfig = useMemo(() => (destDomain !== null ? getGatewayNetworkByDomain(destDomain) || null : null), [destDomain]);

  const activeRecipient = useMemo(() => {
    if (customRecipient && customRecipient.startsWith("0x") && customRecipient.length === 42) {
      return customRecipient as `0x${string}`;
    }
    return (userAddress || zeroAddress) as `0x${string}`;
  }, [customRecipient, userAddress]);

  // ─── Fetch On-Chain & Gateway Balances ───────────────────────────────────────
  // Stable refs so publicClient / sourceConfig / destConfig changes don't
  // recreate fetchAllBalances on every render (prevents infinite poll loop)
  const publicClientRef = useRef(publicClient);
  const sourceConfigRef = useRef(sourceConfig);
  const destConfigRef   = useRef(destConfig);
  useEffect(() => { publicClientRef.current = publicClient; }, [publicClient]);
  useEffect(() => { sourceConfigRef.current = sourceConfig; }, [sourceConfig]);
  useEffect(() => { destConfigRef.current   = destConfig;   }, [destConfig]);

  const fetchAllBalances = useCallback(async () => {
    if (!userAddress) return;
    const publicClient  = publicClientRef.current;
    const sourceConfig  = sourceConfigRef.current;
    const destConfig    = destConfigRef.current;
    setIsLoadingBalances(true);

    try {
      // 1. Fetch Unified Gateway Balances
      const balanceData = await CircleGatewayClient.getBalances(userAddress);
      setUnifiedBalances(balanceData.balances || []);

      // 2. Fetch Pending Deposits
      try {
        const depositsData = await CircleGatewayClient.getDeposits(userAddress);
        const pend = (depositsData.deposits || []).filter((d) => d.status === "pending");
        setPendingDeposits(pend);
      } catch {
        setPendingDeposits([]);
      }

      // 3. Fetch Source Chain Wallet USDC Balance
      if (sourceConfig) {
        if (publicClient && publicClient.chain?.id === sourceConfig.chainId) {
          try {
            const bal = (await publicClient.readContract({
              address: sourceConfig.usdcAddress,
              abi: ERC20_GATEWAY_ABI,
              functionName: "balanceOf",
              args: [userAddress],
            })) as bigint;

            setWalletUsdcBalances((prev) => ({
              ...prev,
              [sourceConfig.domainId]: formatUnits(bal, 6),
            }));

            const allow = (await publicClient.readContract({
              address: sourceConfig.usdcAddress,
              abi: ERC20_GATEWAY_ABI,
              functionName: "allowance",
              args: [userAddress, GATEWAY_WALLET_TESTNET],
            })) as bigint;
            setAllowance(allow);
          } catch (e) {
            console.error("Error reading source token balance/allowance on current chain:", e);
          }
        } else if (sourceConfig.rpcUrl) {
          try {
            const rpcRes = await fetch(sourceConfig.rpcUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_call",
                params: [
                  {
                    to: sourceConfig.usdcAddress,
                    data: `0x70a08231000000000000000000000000${userAddress.replace("0x", "")}`,
                  },
                  "latest",
                ],
              }),
            });
            const json = await rpcRes.json();
            if (json.result) {
              const val = BigInt(json.result);
              setWalletUsdcBalances((prev) => ({
                ...prev,
                [sourceConfig.domainId]: formatUnits(val, 6),
              }));
            }
          } catch (e) {
            console.error("Error reading source token balance via RPC:", e);
          }
        }
      }

      // 4. Fetch Dest Chain Wallet USDC Balance
      if (destConfig && destConfig.rpcUrl) {
        try {
          const rpcRes = await fetch(destConfig.rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_call",
              params: [
                {
                  to: destConfig.usdcAddress,
                  data: `0x70a08231000000000000000000000000${userAddress.replace("0x", "")}`,
                },
                "latest",
              ],
            }),
          });
          const json = await rpcRes.json();
          if (json.result) {
            const val = BigInt(json.result);
            setWalletUsdcBalances((prev) => ({
              ...prev,
              [destConfig.domainId]: formatUnits(val, 6),
            }));
          }
        } catch (e) {
          console.error("Error reading dest token balance:", e);
        }
      }
    } catch (err) {
      console.error("Failed to fetch gateway balances:", err);
    } finally {
      setIsLoadingBalances(false);
    }
  // Only re-create when userAddress changes — all other deps via stable refs
  }, [userAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchAllBalances();
    const interval = setInterval(fetchAllBalances, 15000);
    return () => clearInterval(interval);
  }, [fetchAllBalances]);

  // Derived values
  const sourceWalletBalance = sourceDomain !== null ? parseFloat(walletUsdcBalances[sourceDomain] || "0") : 0;
  const destWalletBalance = destDomain !== null ? parseFloat(walletUsdcBalances[destDomain] || "0") : 0;

  const totalUnifiedBalance = useMemo(() => {
    return unifiedBalances.reduce((acc, b) => acc + parseFloat(b.balance || "0"), 0);
  }, [unifiedBalances]);

  const totalIndexingAmount = useMemo(() => {
    return pendingDeposits.reduce((acc, d) => {
      try {
        return acc + parseFloat(formatUnits(BigInt(d.amount), 6));
      } catch {
        return acc;
      }
    }, 0);
  }, [pendingDeposits]);

  const totalPendingAmount = useMemo(() => {
    return pendingMints.reduce((acc, item) => acc + (parseFloat(item.receiveAmount || item.amount) || 0), 0);
  }, [pendingMints]);

  // Group pending transfers by destination chain so multiple transfers appear cleanly as one line
  const groupedPendingMints = useMemo(() => {
    const map = new Map<number, {
      destDomain: number;
      totalAmount: number;
      items: PendingGatewayTransfer[];
      hasReadyToMint: boolean;
    }>();

    for (const item of pendingMints) {
      if (!item || item.status === "minted") continue;
      const d = item.destDomain ?? 26;
      const amt = parseFloat(item.receiveAmount || item.amount || "0");
      const existing = map.get(d);
      if (!existing) {
        map.set(d, {
          destDomain: d,
          totalAmount: amt,
          items: [item],
          hasReadyToMint: item.status === "ready_to_mint" || item.status === "attestation_ready",
        });
      } else {
        existing.totalAmount += amt;
        existing.items.push(item);
        if (item.status === "ready_to_mint" || item.status === "attestation_ready") {
          existing.hasReadyToMint = true;
        }
      }
    }

    return Array.from(map.values());
  }, [pendingMints]);

  const sourceItemWithBalance = useMemo(() => {
    if (sourceDomain === null) return undefined;
    return unifiedBalances.find((b) => b.domain === sourceDomain);
  }, [unifiedBalances, sourceDomain]);

  const unifiedSourceBalance = useMemo(() => {
    return sourceItemWithBalance ? parseFloat(sourceItemWithBalance.balance || "0") : 0;
  }, [sourceItemWithBalance]);

  // ─── Pre-flight Relayer Gas Check ───────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const checkRelayerGas = async () => {
      if (destDomain === null) {
        setIsCheckingRelayerGas(false);
        return;
      }
      setIsCheckingRelayerGas(true);
      try {
        const res = await fetch(`/api/gateway/relayer-status?domain=${destDomain}`);
        const data = await res.json();
        if (!isMounted) return;
        if (data.success) {
          const available = Boolean(data.isSponsoredAvailable);
          setIsSponsoredAvailable(available);
        }
      } catch (e) {
        console.warn("[Relayer Status] Gas check error:", e);
      } finally {
        if (isMounted) setIsCheckingRelayerGas(false);
      }
    };
    checkRelayerGas();
    return () => {
      isMounted = false;
    };
  }, [destDomain]);

  // ─── Pending Transfers Persistence & Recovery (Supabase DB + LocalStorage) ──
  const savePendingMint = useCallback((item: PendingGatewayTransfer) => {
    if (!userAddress || typeof window === "undefined") return;
    const cleanUser = userAddress.toLowerCase();
    const key = `arcfun_pending_transfers_${cleanUser}`;

    // 1. Update React state immediately
    setPendingMints((prev) => {
      const filtered = prev.filter((p) => p.id !== item.id && (!item.sourceTxHash || p.sourceTxHash !== item.sourceTxHash));
      return [item, ...filtered];
    });

    // 2. Persist to LocalStorage for instant refresh recovery
    try {
      const current = localStorage.getItem(key);
      const list: PendingGatewayTransfer[] = current ? JSON.parse(current) : [];
      const filtered = list.filter((p) => p.id !== item.id && (!item.sourceTxHash || p.sourceTxHash !== item.sourceTxHash));
      localStorage.setItem(key, JSON.stringify([item, ...filtered]));
    } catch (e) {
      console.warn("[Pending Transfers] LocalStorage save error:", e);
    }

    // 3. Persist to Supabase Database (Server-side locked and tamper-proof)
    fetch("/api/gateway/transfers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cleanUser ? { "x-wallet-address": cleanUser } : {}),
      },
      body: JSON.stringify({
        id: item.id,
        userAddress: cleanUser,
        sourceDomain: item.sourceDomain,
        destDomain: item.destDomain,
        amount: item.amount,
        receiveAmount: item.receiveAmount,
        sourceTxHash: item.sourceTxHash,
        status: item.status,
        isManualClaim: item.isManualClaim,
        platformFeePercent: item.platformFeePercent,
        burnIntentSet: item.burnIntentSet,
        attestationPayload: item.attestationPayload,
        operatorSignature: item.operatorSignature,
        destinationTxHash: item.destinationTxHash,
      }),
    }).catch((err) => {
      console.warn("[Pending Transfers] Supabase DB sync error:", err);
    });
  }, [userAddress]);

  const removePendingMint = useCallback((id: string, destinationTxHash?: string, force = false, sourceTxHashParam?: string) => {
    if (!userAddress || typeof window === "undefined") return;
    const cleanUser = userAddress.toLowerCase();
    const key = `arcfun_pending_transfers_${cleanUser}`;

    // Find the item to get its sourceTxHash from ref (which is always fresh) or param
    const itemToRemove = pendingMintsRef.current.find((p) => p.id === id || (sourceTxHashParam && p.sourceTxHash === sourceTxHashParam));
    const effectiveSourceHash = (sourceTxHashParam || itemToRemove?.sourceTxHash || (resumingTransfer?.id === id ? resumingTransfer.sourceTxHash : undefined))?.toLowerCase();

    // 1. Remove from React state
    setPendingMints((prev) => prev.filter((p) => p.id !== id && (!effectiveSourceHash || p.sourceTxHash?.toLowerCase() !== effectiveSourceHash)));
    setResumingTransfer((prev) => (prev?.id === id || (effectiveSourceHash && prev?.sourceTxHash?.toLowerCase() === effectiveSourceHash) ? null : prev));

    // 2. Remove from LocalStorage
    try {
      const current = localStorage.getItem(key);
      if (current) {
        const list: PendingGatewayTransfer[] = JSON.parse(current);
        const updated = list.filter((p) => p.id !== id && (!effectiveSourceHash || p.sourceTxHash?.toLowerCase() !== effectiveSourceHash));
        localStorage.setItem(key, JSON.stringify(updated));
      }
      // Also clean old mints key
      const oldKey = `arcfun_pending_mints_${cleanUser}`;
      const oldCurrent = localStorage.getItem(oldKey);
      if (oldCurrent) {
        const oldList: PendingGatewayTransfer[] = JSON.parse(oldCurrent);
        const oldUpdated = oldList.filter((p) => p.id !== id && (!effectiveSourceHash || p.sourceTxHash?.toLowerCase() !== effectiveSourceHash));
        localStorage.setItem(oldKey, JSON.stringify(oldUpdated));
      }

      // Persist minted marker durably so page refresh never resurrects this transfer
      // even if the Supabase POST below is still in-flight
      const mintedMarkersKey = `arcfun_minted_markers_${cleanUser}`;
      const existingMarkers: { ids: string[]; hashes: string[] } = JSON.parse(localStorage.getItem(mintedMarkersKey) || '{"ids":[],"hashes":[]}');
      if (id && !existingMarkers.ids.includes(id.toLowerCase())) existingMarkers.ids.push(id.toLowerCase());
      if (effectiveSourceHash && !existingMarkers.hashes.includes(effectiveSourceHash)) existingMarkers.hashes.push(effectiveSourceHash);
      // Cap at 200 entries to avoid unbounded growth
      if (existingMarkers.ids.length > 200) existingMarkers.ids = existingMarkers.ids.slice(-200);
      if (existingMarkers.hashes.length > 200) existingMarkers.hashes = existingMarkers.hashes.slice(-200);
      localStorage.setItem(mintedMarkersKey, JSON.stringify(existingMarkers));
    } catch (e) {
      console.warn("[Pending Transfers] LocalStorage remove error:", e);
    }

    // 3. Mark as minted / dismissed in Supabase Database so it never resurrects
    const effectiveDestHash = destinationTxHash || (force ? "onchain_completed" : "0x_dismissed");
    fetch("/api/gateway/transfers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cleanUser ? { "x-wallet-address": cleanUser } : {}),
      },
      body: JSON.stringify({
        id,
        userAddress: cleanUser,
        status: "minted",
        destinationTxHash: effectiveDestHash,
        sourceTxHash: effectiveSourceHash || undefined,
        sourceDomain: itemToRemove?.sourceDomain ?? sourceDomain,
        destDomain: itemToRemove?.destDomain ?? destDomain,
        amount: itemToRemove?.amount ?? amountInput ?? "0",
      }),
    }).catch((err) => {
      console.warn("[Pending Transfers] Supabase DB mark minted error:", err);
    });
  }, [userAddress, sourceDomain, destDomain, amountInput, resumingTransfer]);

  const handleClearAllPendingMints = useCallback(() => {
    if (!userAddress || typeof window === "undefined") return;
    const cleanUser = userAddress.toLowerCase();
    setPendingMints([]);
    setResumingTransfer(null);
    try {
      localStorage.removeItem(`arcfun_pending_transfers_${cleanUser}`);
      localStorage.removeItem(`arcfun_pending_mints_${cleanUser}`);
    } catch (e) {
      console.warn("[Pending Transfers] Clear all error:", e);
    }
    // Also permanently clear unminted transfers in Supabase
    fetch(`/api/gateway/transfers?user=${cleanUser}`, {
      method: "DELETE",
      headers: {
        ...(cleanUser ? { "x-wallet-address": cleanUser } : {}),
      },
    }).catch((err) => {
      console.warn("[Pending Transfers] Supabase clear all error:", err);
    });
  }, [userAddress]);

  // Load and sync pending transfers on wallet connect or page refresh
  useEffect(() => {
    if (!userAddress || typeof window === "undefined") {
      setPendingMints([]);
      setResumingTransfer(null);
      return;
    }

    let isMounted = true;
    const cleanUser = userAddress.toLowerCase();

    const loadAndSyncTransfers = async () => {
      let localList: PendingGatewayTransfer[] = [];

      // 1. Instant local read
      try {
        const stored = localStorage.getItem(`arcfun_pending_transfers_${cleanUser}`) ||
                       localStorage.getItem(`arcfun_pending_mints_${cleanUser}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            localList = parsed.filter((p) => p.status !== "minted");
          }
        }
      } catch (e) {
        console.warn("[Pending Transfers] Local read error:", e);
      }

      // 2. Fetch pending transfers from Supabase DB
      let dbList: PendingGatewayTransfer[] = [];
      let mintedIds = new Set<string>();
      let mintedHashes = new Set<string>();

      // 2a. Load local minted markers FIRST (guards against Supabase POST race condition on refresh)
      try {
        const mintedMarkersKey = `arcfun_minted_markers_${cleanUser}`;
        const localMarkers: { ids: string[]; hashes: string[] } = JSON.parse(localStorage.getItem(mintedMarkersKey) || '{"ids":[],"hashes":[]}');
        for (const id of localMarkers.ids) mintedIds.add(id);
        for (const h of localMarkers.hashes) mintedHashes.add(h);
      } catch {}

      try {
        const res = await fetch(`/api/gateway/transfers?user=${cleanUser}`, {
          headers: {
            ...(cleanUser ? { "x-wallet-address": cleanUser } : {}),
          },
        });
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.transfers)) {
            dbList = data.transfers.map((t: any) => ({
              id: t.id,
              sourceDomain: t.source_domain,
              destDomain: t.dest_domain,
              amount: t.amount?.toString() || "0",
              receiveAmount: t.receive_amount?.toString() || t.amount?.toString() || "0",
              sourceTxHash: t.source_tx_hash || undefined,
              status: t.status as PendingTransferStatus,
              isManualClaim: Boolean(t.is_manual_claim),
              platformFeePercent: Number(t.platform_fee_percent || 0.01),
              burnIntentSet: t.burn_intent_set || undefined,
              attestationPayload: t.attestation_payload || undefined,
              operatorSignature: t.operator_signature || undefined,
              destinationTxHash: t.destination_tx_hash || undefined,
              createdAt: new Date(t.created_at).getTime(),
            }));
          }

          // Merge Supabase-provided minted markers with local ones
          for (const id of (data.mintedIds || [])) mintedIds.add(id.toLowerCase());
          for (const h of (data.mintedHashes || [])) mintedHashes.add(h.toLowerCase());

          // Purge local items already minted
          localList = localList.filter((item) => {
            if (item.id && mintedIds.has(item.id.toLowerCase())) return false;
            if (item.sourceTxHash && mintedHashes.has(item.sourceTxHash.toLowerCase())) return false;
            return true;
          });

          // Also purge DB items that local markers already know are minted
          // (handles the race where Supabase POST hasn't completed yet)
          dbList = dbList.filter((item) => {
            if (item.id && mintedIds.has(item.id.toLowerCase())) return false;
            if (item.sourceTxHash && mintedHashes.has(item.sourceTxHash.toLowerCase())) return false;
            return true;
          });
        }
      } catch (e) {
        console.warn("[Pending Transfers] Supabase fetch error:", e);
      }

      // 2b. Query Circle Gateway Indexer to reconcile live active deposits vs completed/stale ones
      const liveCircleDeposits = new Map<string, any>();
      try {
        const circleDepositsRes = await CircleGatewayClient.getDeposits(cleanUser);
        if (circleDepositsRes && Array.isArray(circleDepositsRes.deposits)) {
          for (const d of circleDepositsRes.deposits) {
            const txHash = d.transactionHash?.toLowerCase();
            if (txHash) {
              liveCircleDeposits.set(txHash, d);
            }
          }
        }
      } catch (e) {
        console.warn("[Pending Transfers] Circle deposits discovery error:", e);
      }

      // 2c. On-Chain Attestation Verification: check whether ready_to_mint transfers are already minted or expired on-chain
      const unmintedReadyTransfers = dbList.filter((item) => (item.status === "ready_to_mint" || item.status === "attestation_ready") && item.attestationPayload && item.operatorSignature);
      if (unmintedReadyTransfers.length > 0) {
        await Promise.all(
          unmintedReadyTransfers.map(async (item) => {
            try {
              const onChainStatus = await checkAttestationOnChain(item.destDomain, item.attestationPayload, item.operatorSignature);
              if (onChainStatus.isAlreadyMinted || onChainStatus.isExpired) {
                removePendingMint(item.id, onChainStatus.isAlreadyMinted ? "onchain_completed" : "0x_expired", true, item.sourceTxHash);
                mintedIds.add(item.id.toLowerCase());
                if (item.sourceTxHash) mintedHashes.add(item.sourceTxHash.toLowerCase());
              }
            } catch (checkErr) {
              console.warn("[Pending Transfers] On-chain check warning:", checkErr);
            }
          })
        );
      }

      // Reconcile:
      // 1. If a transfer has status === 'deposited_indexing', check if it is active in Circle's live queue.
      // If NOT in live Circle deposits and createdAt is older than 60s, Circle already finalized/indexed it.
      // 2. If a transfer has status === 'ready_to_mint', check if it is older than 20 minutes.
      // Circle Gateway EIP-712 attestations expire within ~15-20 mins on-chain (maxBlockHeight).
      const now = Date.now();
      const ATTESTATION_MAX_AGE_MS = 20 * 60 * 1000; // 20 minutes max block height validity
      const staleIndexingIds: string[] = [];
      const expiredAttestationIds: string[] = [];

      dbList = dbList.filter((item) => {
        if (item.id && mintedIds.has(item.id.toLowerCase())) return false;
        if (item.sourceTxHash && mintedHashes.has(item.sourceTxHash.toLowerCase())) return false;

        if (item.status === "deposited_indexing") {
          const hash = item.sourceTxHash?.toLowerCase();
          const isCurrentlyIndexing = hash && liveCircleDeposits.has(hash);
          const isBrandNew = item.createdAt && (now - item.createdAt) < 60000;
          if (!isCurrentlyIndexing && !isBrandNew) {
            staleIndexingIds.push(item.id);
            return false;
          }
        }
        if (item.status === "ready_to_mint" || item.status === "attestation_ready") {
          if (item.createdAt && (now - item.createdAt) > ATTESTATION_MAX_AGE_MS) {
            expiredAttestationIds.push(item.id);
            return false;
          }
        }
        return true;
      });

      // Local storage reconciliation:
      // Discard items already marked minted, expired (>20m), or unconfirmed local ghosts (>3m with 0 DB records)
      localList = localList.filter((item) => {
        if (item.id && mintedIds.has(item.id.toLowerCase())) return false;
        if (item.sourceTxHash && mintedHashes.has(item.sourceTxHash.toLowerCase())) return false;

        if (item.status === "deposited_indexing") {
          const hash = item.sourceTxHash?.toLowerCase();
          const isCurrentlyIndexing = hash && liveCircleDeposits.has(hash);
          const isBrandNew = item.createdAt && (now - item.createdAt) < 60000;
          if (!isCurrentlyIndexing && !isBrandNew) {
            return false;
          }
        }
        if (item.status === "ready_to_mint" || item.status === "attestation_ready") {
          if (!item.createdAt || (now - item.createdAt) > ATTESTATION_MAX_AGE_MS) {
            return false;
          }
        }
        if (dbList.length === 0 && (!item.createdAt || (now - item.createdAt) > 180000)) {
          return false;
        }
        return true;
      });

      // Background cleanup for stale records in Supabase
      const toCleanup = [...staleIndexingIds, ...expiredAttestationIds];
      if (toCleanup.length > 0) {
        for (const staleId of toCleanup) {
          fetch("/api/gateway/transfers", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(cleanUser ? { "x-wallet-address": cleanUser } : {}),
            },
            body: JSON.stringify({
              id: staleId,
              userAddress: cleanUser,
              status: "minted",
              destinationTxHash: "0x_expired_attestation",
              sourceDomain: 0,
              destDomain: 26,
              amount: 0,
            }),
          }).catch(() => {});
        }
      }

      // Discover any active in-flight deposits from Circle that aren't yet tracked
      for (const [txHash, d] of liveCircleDeposits.entries()) {
        if (mintedHashes.has(txHash) || mintedIds.has(txHash)) continue;
        const alreadyTracked = dbList.some((p) => p.sourceTxHash?.toLowerCase() === txHash) ||
                               localList.some((p) => p.sourceTxHash?.toLowerCase() === txHash);
        if (!alreadyTracked) {
          const discoveredItem: PendingGatewayTransfer = {
            id: `circle_${d.domain}_${txHash.slice(0, 10)}`,
            sourceDomain: d.domain,
            destDomain: d.domain === 26 ? 6 : 26,
            amount: d.amount || "0",
            receiveAmount: d.amount || "0",
            sourceTxHash: d.transactionHash,
            status: "deposited_indexing",
            isManualClaim: false,
            platformFeePercent: 0.01,
            createdAt: Date.now(),
          };
          dbList.push(discoveredItem);
        }
      }

      if (!isMounted) return;

      // 3. Deduplicate and merge Local + DB strictly by sourceTxHash (fallback to id)
      const mergedMap = new Map<string, PendingGatewayTransfer>();
      for (const item of [...localList, ...dbList]) {
        if (!item || item.status === "minted") continue;
        const key = item.sourceTxHash ? item.sourceTxHash.toLowerCase() : item.id;
        const existing = mergedMap.get(key);
        if (!existing) {
          mergedMap.set(key, item);
        } else {
          // If existing is deposited_indexing but current has attestation / ready_to_mint, use newer state
          if (existing.status === "deposited_indexing" && (item.status === "ready_to_mint" || item.status === "attestation_ready")) {
            mergedMap.set(key, { ...existing, ...item });
          } else {
            mergedMap.set(key, { ...item, ...existing });
          }
        }
      }

      const mergedTransfers = Array.from(mergedMap.values())
        .filter((t) => t.status !== "minted")
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      setPendingMints(mergedTransfers);

      // Save merged & purged list back to local storage (or clear if empty)
      try {
        if (mergedTransfers.length === 0) {
          localStorage.removeItem(`arcfun_pending_transfers_${cleanUser}`);
          localStorage.removeItem(`arcfun_pending_mints_${cleanUser}`);
        } else {
          localStorage.setItem(`arcfun_pending_transfers_${cleanUser}`, JSON.stringify(mergedTransfers));
        }
      } catch {}

      // 4. Auto Mid-Flow Resumption: If user has an in-flight unminted transfer and card is closed
      if (mergedTransfers.length > 0 && !execution.isOpen) {
        const latest = mergedTransfers[0];
        setResumingTransfer(latest);
        setAmountInput(latest.amount); // Strictly lock amount input!
        setSourceDomain(latest.sourceDomain);
        setDestDomain(latest.destDomain);
        setIsManualClaim(latest.isManualClaim);

        if (latest.status === "ready_to_mint" || latest.status === "attestation_ready") {
          // Attestation ready: Restore Step 5 for destination mint
          if (latest.attestationPayload && latest.operatorSignature) {
            setCachedAttestation({
              attestationPayload: latest.attestationPayload,
              operatorSignature: latest.operatorSignature,
              transferId: latest.id,
            });
          }
          setExecution({
            isOpen: true,
            step: 5,
            step1Status: "success",
            step2Status: "success",
            step3Status: "success",
            step4Status: "success",
            step5Status: "idle",
            sourceTxHash: latest.sourceTxHash,
            transferId: latest.id,
            errorMessage: undefined,
            infoMessage: `Deposit confirmed on-chain. Ready to mint on ${getGatewayNetworkByDomain(latest.destDomain)?.name || "destination chain"}.`,
          });
        } else if (latest.status === "deposited_indexing") {
          // Only auto-open if it is genuinely active right now in live Circle deposits
          const hash = latest.sourceTxHash?.toLowerCase();
          if (hash && liveCircleDeposits.has(hash)) {
            setExecution({
              isOpen: true,
              step: 2,
              step1Status: "success",
              step2Status: "in_progress",
              step3Status: "idle",
              step4Status: "idle",
              step5Status: "idle",
              sourceTxHash: latest.sourceTxHash,
              transferId: latest.id,
              errorMessage: undefined,
            });
          }
        }
      }
    };

    loadAndSyncTransfers();

    return () => {
      isMounted = false;
    };
  }, [userAddress]);

  // ── Supabase Realtime Gateway Webhook Listener (Instant Reactive State) ───
  useEffect(() => {
    if (!userAddress || typeof window === "undefined") return;
    const cleanUser = userAddress.toLowerCase();

    const channel = supabase
      .channel(`gateway_transfers_realtime_${cleanUser}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gateway_pending_transfers",
          filter: `user_address=eq.${cleanUser}`,
        },
        (payload) => {
          const newRecord = payload.new as any;
          if (!newRecord) return;

          // 1. If webhook marks deposit as finalized (ready_to_sign)
          if (newRecord.status === "ready_to_sign") {
            setExecution((prev) => {
              // Advance to Step 3 (EIP-712 Signing) if actively at Step 2
              if (prev.isOpen && prev.step === 2 && prev.step2Status === "in_progress") {
                return {
                  ...prev,
                  step: 3,
                  step2Status: "success",
                  step3Status: "idle", // Never auto-sign; user must review and click sign!
                  infoMessage: "Deposit finalized on Circle Gateway. Please sign to authorize transfer.",
                  errorMessage: undefined,
                };
              }
              return prev;
            });

            // Update pending mint list
            setPendingMints((prev) =>
              prev.map((p) => (p.id === newRecord.id ? { ...p, status: "ready_to_sign" } : p))
            );
          }

          // 2. If webhook marks destination mint as completed (minted)
          if (newRecord.status === "minted") {
            const destTx = newRecord.destination_tx_hash;
            removePendingMint(newRecord.id, destTx);
            setExecution((prev) => {
              if (prev.isOpen && (prev.transferId === newRecord.id || prev.step === 5)) {
                return {
                  ...prev,
                  step5Status: "success",
                  destinationTxHash: destTx || prev.destinationTxHash || "onchain_completed",
                  errorMessage: undefined,
                  infoMessage: undefined,
                };
              }
              return prev;
            });
            setTimeout(fetchAllBalances, 1500);
          }

          // 3. If webhook marks mint as forwarded by Circle (mint_processing)
          if (newRecord.status === "mint_processing") {
            setExecution((prev) => {
              if (prev.isOpen && prev.transferId === newRecord.id && prev.step5Status !== "success") {
                return {
                  ...prev,
                  step5Status: "in_progress",
                  infoMessage: "Circle Forwarding Service is executing destination mint on-chain...",
                };
              }
              return prev;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userAddress, removePendingMint, fetchAllBalances]);

  const parsedAmount = parseFloat(amountInput) || 0;
  const parsedAmountUnits = useMemo(() => {
    try {
      if (!amountInput || amountInput === "." || isNaN(Number(amountInput))) {
        return 0n;
      }
      const clean = amountInput.endsWith(".") ? amountInput.slice(0, -1) : amountInput;
      if (!clean || isNaN(Number(clean))) return 0n;
      const parts = clean.split(".");
      const truncated = parts.length === 2 ? `${parts[0]}.${parts[1].slice(0, 6)}` : parts[0];
      return parseUnits(truncated || "0", 6);
    } catch {
      return 0n;
    }
  }, [amountInput]);

  // ─── Live Dynamic Destination Gas Check (10s auto-refresh on amount + manual claim) ──
  const fetchDestGas = useCallback(async () => {
    if (!userAddress || !destConfig?.rpcUrl) return;
    setIsCheckingDestGas(true);
    try {
      const client = createPublicClient({
        transport: http(destConfig.rpcUrl),
      });
      const [gp, bal] = await Promise.all([
        client.getGasPrice().catch(() => 0n),
        client.getBalance({ address: userAddress }).catch(() => 0n),
      ]);
      // 200,000 gas units for gatewayMint * 1.5x buffer
      const safeGasUnits = 200000n;
      const gasWithBuffer = (gp * safeGasUnits * 15n) / 10n;
      setEstDestGasCost(gasWithBuffer);
      setUserDestGasBalance(bal);
    } catch (e) {
      console.warn("[Dest Gas Check] Failed:", e);
    } finally {
      setIsCheckingDestGas(false);
    }
  }, [userAddress, destConfig?.rpcUrl]);

  // Initial fetch on destination domain or wallet change
  useEffect(() => {
    fetchDestGas();
  }, [fetchDestGas, destDomain]);

  // 10-second countdown interval active ONLY when user entered amount and manual claim is enabled
  useEffect(() => {
    const isTimerActive = activeMode === "deposit" && parsedAmount > 0 && isManualClaim;
    if (!isTimerActive) {
      setGasCountdown(10);
      return;
    }

    const timer = setInterval(() => {
      setGasCountdown((prev) => {
        if (prev <= 1) {
          fetchDestGas();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeMode, parsedAmount, isManualClaim, fetchDestGas]);

  const isUserDestGasSufficient = useMemo(() => {
    if (!isManualClaim) return true;
    if (userDestGasBalance === null || estDestGasCost === null) return true;
    return userDestGasBalance >= estDestGasCost;
  }, [isManualClaim, userDestGasBalance, estDestGasCost]);

  const estDestGasFormatted = useMemo(() => {
    const symbol = destConfig?.nativeCurrency?.symbol || "ETH";
    if (!estDestGasCost || estDestGasCost === 0n) return `~0.0001 ${symbol}`;
    const num = parseFloat(formatUnits(estDestGasCost, 18));
    if (num < 0.00001) return `< 0.00001 ${symbol}`;
    return `~${num.toFixed(5)} ${symbol}`;
  }, [estDestGasCost, destConfig]);

  // Estimated destination gas cost in USD/USDC equivalent
  const estDestGasUsd = useMemo(() => {
    if (!estDestGasCost || estDestGasCost === 0n) return 0.005;
    const nativeAmount = parseFloat(formatUnits(estDestGasCost, 18));
    if (destDomain === 26) {
      // Arc Testnet native currency is USDC
      return nativeAmount;
    }
    if (destDomain === 1) {
      // Avalanche Fuji native currency is AVAX (~$25)
      return nativeAmount * 25;
    }
    // Base Sepolia (6), Arbitrum Sepolia (3), Optimism Sepolia (2), Ethereum Sepolia (0) native is ETH (~$2,600)
    return nativeAmount * 2600;
  }, [estDestGasCost, destDomain]);

  // ─── Backend Relayer Fee Deficit Protection ──────────────────────────────────
  // If user bridges a small amount (e.g. 10 USDC), the 1% fee is 0.10 USDC.
  // If destination gas is $0.50 USDC, ArcFun relayer would lose money if sponsored!
  // Hence, we detect fee deficit and auto-enforce Manual Claim (0.5% fee, user pays gas).
  const isSponsoredDeficit = useMemo(() => {
    if (activeMode !== "deposit" || parsedAmount <= 0) return false;
    const platformFeeSponsored = parsedAmount * 0.01;
    return platformFeeSponsored < estDestGasUsd;
  }, [activeMode, parsedAmount, estDestGasUsd]);



  const userDestGasFormatted = useMemo(() => {
    const symbol = destConfig?.nativeCurrency?.symbol || "ETH";
    if (userDestGasBalance === null) return `0 ${symbol}`;
    const num = parseFloat(formatUnits(userDestGasBalance, 18));
    if (num <= 0) return `0 ${symbol}`;
    if (num < 0.0001) return `< 0.0001 ${symbol}`;
    return `${num.toFixed(4)} ${symbol}`;
  }, [userDestGasBalance, destConfig]);

  // Platform Fee: 1% for Sponsored Mint, 0.5% for Manual Claim (0 in Claim mode)
  const platformFeePercent = activeMode === "claim" ? 0 : (isManualClaim ? 0.005 : 0.01);
  const platformFee = parsedAmount * platformFeePercent;

  // Circle Gateway Protocol Fee: separate from ArcFun platform fee (~0.02 USDC on L2s/Arc, 1.1 USDC on Ethereum L1)
  const circleProtocolFee = parsedAmount <= 0
    ? 0
    : (sourceDomain === 0 ? 1.1 : 0.02);

  const totalDeductedFee = platformFee + circleProtocolFee;
  const receiveAmount = parsedAmount > totalDeductedFee ? parsedAmount - totalDeductedFee : 0;
  
  const isSameChainRoute = Boolean(sourceDomain !== null && destDomain !== null && sourceDomain === destDomain);

  // On Arc Testnet (Domain 26), USDC is the native gas token.
  const isArcGasReserveShortage =
    activeMode === "deposit" &&
    sourceDomain === 26 &&
    parsedAmount > 0 &&
    (sourceWalletBalance - parsedAmount < 0.05);

  // Circle Gateway requires maxFee of 1.1 on Ethereum L1, 0.02 on L2s/Avalanche/Arc
  const minRequiredFee = sourceDomain === 0 ? 1.1 : 0.02;

  const isBelowMinFee = parsedAmount > 0 && (
    parsedAmount <= totalDeductedFee || receiveAmount <= 0
  );

  const isSourceBalanceBelowMinFee =
    activeMode === "claim" &&
    unifiedSourceBalance > 0 &&
    unifiedSourceBalance <= minRequiredFee;

  const isInsufficientSourceBalance = parsedAmount > 0 && (
    activeMode === "claim"
      ? (parsedAmount > (unifiedSourceBalance + 0.00001) || unifiedSourceBalance <= minRequiredFee)
      : (parsedAmount > sourceWalletBalance || isArcGasReserveShortage)
  );

  const formatDisplayBalance = (bal: number) => {
    if (!bal || bal <= 0) return "0 USDC";
    if (bal < 0.00001) return "< 0.0001 USDC";
    if (bal < 1) {
      return `${parseFloat(bal.toFixed(6))} USDC`;
    }
    return `${bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDC`;
  };

  const estimatedTimeDisplay = useMemo(() => {
    if (unifiedSourceBalance >= parsedAmount && parsedAmount > 0) {
      return "~1-3 seconds (Instant Gateway)";
    }
    if (sourceDomain === 1) {
      return "~8 - 15 Seconds (Avalanche Sub-Second Finality)";
    }
    return "~1 - 10 Mins (L2 Finality)";
  }, [unifiedSourceBalance, parsedAmount, sourceDomain]);

  // ─── Reset Execution Helper ───────────────────────────────────────────────
  const resetExecution = useCallback(() => {
    setExecution({
      isOpen: false,
      step: 1,
      step1Status: "idle",
      step2Status: "idle",
      step3Status: "idle",
      step4Status: "idle",
      step5Status: "idle",
      errorMessage: undefined,
      infoMessage: undefined,
      sourceTxHash: undefined,
      destinationTxHash: undefined,
      transferId: undefined,
    });
    setCachedAttestation(null);
    if (typeof window !== "undefined" && window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
    if (typeof document !== "undefined") {
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    }
  }, []);

  // ─── Dismiss Active Resumed Transfer (Keeps record saved in dropdown) ───────
  const handleDismissResumption = useCallback(() => {
    setResumingTransfer(null);
    resetExecution();
    setAmountInput("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    const scrollContainer = document.querySelector(".main-scroll-container");
    if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
  }, [resetExecution]);

  // ─── Swap Networks ──────────────────────────────────────────────────────────
  const handleSwapNetworks = () => {
    resetExecution();
    const prevSrc = sourceDomain;
    const prevDest = destDomain;
    setSourceDomain(prevDest);
    setDestDomain(prevSrc);
    setNetworkSelectorView(null);
  };

  // ─── Network Switch Helper with wallet_addEthereumChain Fallback ───────────
  const handleSwitchNetwork = async (targetConfig: any) => {
    if (!targetConfig) return;
    try {
      if (switchChainAsync) {
        await switchChainAsync({ chainId: targetConfig.chainId });
        return;
      }
    } catch (wagmiErr: any) {
      console.warn("[Circle Gateway] switchChainAsync failed, trying window.ethereum fallback:", wagmiErr);
      if (
        wagmiErr?.name === "UserRejectedRequestError" ||
        wagmiErr?.code === 4001 ||
        wagmiErr?.message?.toLowerCase().includes("user rejected") ||
        wagmiErr?.message?.toLowerCase().includes("user denied")
      ) {
        throw wagmiErr;
      }
    }

    if (typeof window !== "undefined" && (window as any).ethereum) {
      const hexChainId = "0x" + targetConfig.chainId.toString(16);
      try {
        await (window as any).ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: hexChainId }],
        });
      } catch (switchError: any) {
        if (
          switchError.code === 4902 ||
          switchError?.message?.includes("4902") ||
          switchError?.message?.includes("Unrecognized chain")
        ) {
          await (window as any).ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: hexChainId,
                chainName: targetConfig.name,
                nativeCurrency: targetConfig.nativeCurrency,
                rpcUrls: [targetConfig.rpcUrl],
                blockExplorerUrls: [targetConfig.explorerUrl],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
    }
  };

  // Helper to obtain a viem WalletClient bound directly to target chain
  const getDestinationWalletClient = async (targetConfig: any) => {
    if (!targetConfig) return null;
    if (typeof window !== "undefined" && (window as any).ethereum && userAddress) {
      try {
        return createWalletClient({
          account: userAddress,
          chain: {
            id: targetConfig.chainId,
            name: targetConfig.name,
            nativeCurrency: targetConfig.nativeCurrency,
            rpcUrls: {
              default: { http: [targetConfig.rpcUrl] },
              public: { http: [targetConfig.rpcUrl] },
            },
          },
          transport: custom((window as any).ethereum),
        });
      } catch (e) {
        console.warn("[getDestinationWalletClient] fallback to wagmi walletClient:", e);
      }
    }
    return walletClient;
  };

  // ─── Direct Claim Available Source Balance to Arc Testnet ──────────────────
  const handleClaimToArc = (targetDomain?: number) => {
    resetExecution();
    // Prefer domain with balance >= minimum required fee (1.1 on Eth, 0.011 on L2s)
    const validBalanceItem = unifiedBalances.find((b) => {
      const bal = parseFloat(b.balance || "0");
      const minFee = b.domain === 0 ? 1.1 : 0.011;
      return bal >= minFee;
    }) || unifiedBalances.find((b) => parseFloat(b.balance || "0") > 0);

    const domainWithBalance = targetDomain !== undefined
      ? targetDomain
      : (validBalanceItem?.domain || 6); // default to Base Sepolia
    
    const balanceItem = unifiedBalances.find((b) => b.domain === domainWithBalance);
    const amountToClaim = balanceItem ? balanceItem.balance : "0";
    
    setSourceDomain(domainWithBalance);
    if (domainWithBalance === 26) {
      setDestDomain(6); // If claiming from Arc, destination is Base
    } else {
      setDestDomain(26); // Default destination is Arc Testnet
    }
    setAmountInput(amountToClaim);
  };

  // ─── Step 3 to 5: Gasless Burn Intent + Relayer Mint Pipeline ───────────────
  const handleTransferAndMint = async (
    overrideAmount?: number,
    overrideSourceDomain?: number,
    overrideDestDomain?: number
  ) => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    if (!walletClient || !userAddress) {
      alert("Wallet not ready");
      return;
    }

    // Strict Anti-Tamper: If resuming an in-flight deposit, amount is strictly locked to the on-chain deposit!
    let effectiveAmount = resumingTransfer
      ? parseFloat(resumingTransfer.amount)
      : (overrideAmount !== undefined ? overrideAmount : parsedAmount);
    let effectiveSourceDomain = resumingTransfer
      ? resumingTransfer.sourceDomain
      : (overrideSourceDomain !== undefined ? overrideSourceDomain : sourceDomain);
    const effectiveDestDomain = resumingTransfer
      ? resumingTransfer.destDomain
      : (overrideDestDomain !== undefined ? overrideDestDomain : destDomain);

    if (effectiveSourceDomain === null || effectiveSourceDomain === undefined || effectiveDestDomain === null || effectiveDestDomain === undefined) {
      alert("Please select both source and destination chains.");
      return;
    }

    if (effectiveAmount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    const effectiveSourceConfig = getGatewayNetworkByDomain(effectiveSourceDomain);
    const effectiveDestConfig = getGatewayNetworkByDomain(effectiveDestDomain);

    if (!effectiveSourceConfig || !effectiveDestConfig) {
      alert("Please select valid source and destination chains.");
      return;
    }

    let attestationRes: any = null;
    let pendingItem: PendingGatewayTransfer | null = null;

    try {
      setExecution((prev) => ({
        ...prev,
        isOpen: true,
        step: 3,
        step1Status: "success",
        step2Status: "success",
        step3Status: "in_progress",
        step4Status: "idle",
        step5Status: "idle",
        errorMessage: undefined,
      }));

      // 0. Verify available balance with Circle Gateway API
      const balanceData = await CircleGatewayClient.getBalances(userAddress);
      let srcItem = balanceData.balances.find((b) => b.domain === effectiveSourceDomain);
      let available = srcItem ? parseFloat(srcItem.balance) : 0;

      // In Claim Mode: Depositor must have at least the minimum forwarder fee available in Circle Gateway
      const minRequiredFee = effectiveSourceConfig.domainId === 0 ? 1.1 : 0.011;
      if (activeMode === "claim" && available < minRequiredFee) {
        setExecution((prev) => ({
          ...prev,
          isOpen: true,
          step: 3,
          step3Status: "error",
          errorMessage: `Minimum ${minRequiredFee} USDC required to claim from ${effectiveSourceConfig.name} (Circle testnet fee: ${minRequiredFee} USDC). Available: ${available.toFixed(2)} USDC.`,
        }));
        return;
      }

      // If deposit is still indexing on Circle Gateway, keep user in Step 2 indexing
      if (available < effectiveAmount) {
        setExecution((prev) => ({
          ...prev,
          isOpen: true,
          step: 2,
          step1Status: "success",
          step2Status: "in_progress",
          step3Status: "idle",
          errorMessage: undefined,
          infoMessage: `Circle Gateway is indexing your deposit on ${effectiveSourceConfig.name}. Available: ${available.toFixed(2)} USDC, Required: ${effectiveAmount.toFixed(2)} USDC.`,
        }));
        return;
      }

      setExecution((prev) => ({
        ...prev,
        isOpen: true,
        step: 3,
        step1Status: "success",
        step2Status: "success",
        step3Status: "in_progress",
        step4Status: "idle",
        step5Status: "idle",
        errorMessage: undefined,
      }));

      // 1. Construct TransferSpec and BurnIntent
      const salt = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}` as `0x${string}`;
      const feeSalt = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}` as `0x${string}`;

      const effectiveAmountUnits = parseUnits(effectiveAmount.toFixed(6), 6);

      // ArcFun Platform Fee Calculation: 1% (100 bps) or 0.5% (50 bps) in Manual Claim
      const feeBps = isManualClaim ? ARCFUN_MANUAL_FEE_BPS : ARCFUN_PLATFORM_FEE_BPS;
      const rawPlatformFeeUnits = (effectiveAmountUnits * feeBps) / 10000n;

      // Base fallback fees
      let userMaxFeeUnits = parseUnits(effectiveSourceConfig.domainId === 0 ? "1.1" : "0.015", 6);
      let feeMaxFeeUnits = parseUnits(effectiveSourceConfig.domainId === 0 ? "1.1" : "0.015", 6);
      let maxBlockHeight = maxUint256;

      const userTransferSpec = {
        version: 1,
        sourceDomain: effectiveSourceConfig.domainId,
        destinationDomain: effectiveDestConfig.domainId,
        sourceContract: toGatewayBytes32(GATEWAY_WALLET_TESTNET),
        destinationContract: toGatewayBytes32(GATEWAY_MINTER_TESTNET),
        sourceToken: toGatewayBytes32(effectiveSourceConfig.usdcAddress),
        destinationToken: toGatewayBytes32(effectiveDestConfig.usdcAddress),
        sourceDepositor: toGatewayBytes32(userAddress),
        destinationRecipient: toGatewayBytes32(activeRecipient),
        sourceSigner: toGatewayBytes32(userAddress),
        destinationCaller: toGatewayBytes32(zeroAddress),
        value: effectiveAmountUnits,
        salt,
        hookData: "0x" as `0x${string}`,
      };

      const feeTransferSpec = {
        version: 1,
        sourceDomain: effectiveSourceConfig.domainId,
        destinationDomain: effectiveDestConfig.domainId,
        sourceContract: toGatewayBytes32(GATEWAY_WALLET_TESTNET),
        destinationContract: toGatewayBytes32(GATEWAY_MINTER_TESTNET),
        sourceToken: toGatewayBytes32(effectiveSourceConfig.usdcAddress),
        destinationToken: toGatewayBytes32(effectiveDestConfig.usdcAddress),
        sourceDepositor: toGatewayBytes32(userAddress),
        destinationRecipient: toGatewayBytes32(ARCFUN_FEE_TREASURY_WALLET),
        sourceSigner: toGatewayBytes32(userAddress),
        destinationCaller: toGatewayBytes32(zeroAddress),
        value: rawPlatformFeeUnits,
        salt: feeSalt,
        hookData: "0x" as `0x${string}`,
      };

      // Dynamically fetch exact Circle Gateway maxFee & maxBlockHeight for each intent
      try {
        const estRequests: any[] = [{ spec: userTransferSpec }];
        if (rawPlatformFeeUnits > parseUnits("0.02", 6)) {
          estRequests.push({ spec: feeTransferSpec });
        }
        const estRes: any = await CircleGatewayClient.estimateTransfer(estRequests);
        const intents = Array.isArray(estRes) ? estRes : estRes?.body || [];
        if (intents[0]?.burnIntent?.maxFee) {
          userMaxFeeUnits = BigInt(intents[0].burnIntent.maxFee);
        }
        if (intents[0]?.burnIntent?.maxBlockHeight) {
          maxBlockHeight = BigInt(intents[0].burnIntent.maxBlockHeight);
        }
        if (intents[1]?.burnIntent?.maxFee) {
          feeMaxFeeUnits = BigInt(intents[1].burnIntent.maxFee);
        }
      } catch (estErr) {
        console.warn("[Circle Gateway] Fee estimate fallback:", estErr);
      }

      // Total Circle forwarder operator fees for both intents
      const totalOperatorFees = userMaxFeeUnits + feeMaxFeeUnits;

      // Check if fee is eligible to create Intent 2:
      // Platform fee MUST cover both forwarder fees so treasury receives positive USDC
      const isFeeEligible = rawPlatformFeeUnits > (totalOperatorFees + parseUnits("0.005", 6));
      const platformFeeUnits = isFeeEligible ? rawPlatformFeeUnits : 0n;

      // Treasury receives net platform fee, operator protocol fees kept separate
      const treasuryNetUnits = isFeeEligible ? platformFeeUnits : 0n;
      feeTransferSpec.value = treasuryNetUnits;

      // User receives effectiveAmount minus platform fee minus operator protocol fees
      const userReceiveUnits = isFeeEligible
        ? (effectiveAmountUnits > (platformFeeUnits + totalOperatorFees)
            ? effectiveAmountUnits - platformFeeUnits - totalOperatorFees
            : 0n)
        : (effectiveAmountUnits > userMaxFeeUnits ? effectiveAmountUnits - userMaxFeeUnits : 0n);

      if (userReceiveUnits <= 0n) {
        throw new Error(
          `Amount is too low to cover Circle Gateway protocol fee (${formatUnits(userMaxFeeUnits, 6)} USDC).`
        );
      }

      userTransferSpec.value = userReceiveUnits;

      // Pre-flight balance check: total required must not exceed depositor's balance in Gateway
      if (activeMode === "claim") {
        const requiredTotalUnits = userTransferSpec.value + userMaxFeeUnits + (isFeeEligible ? feeTransferSpec.value + feeMaxFeeUnits : 0n);
        const availableUnits = parseUnits((unifiedSourceBalance || 0).toFixed(6), 6);
        if (requiredTotalUnits > availableUnits) {
          throw new Error(
            `Insufficient Gateway balance: Required ${formatUnits(requiredTotalUnits, 6)} USDC (including ${formatUnits(userMaxFeeUnits, 6)} Circle Gateway fee), but available balance is ${formatUnits(availableUnits, 6)} USDC.`
          );
        }
      }

      const userBurnIntent = {
        maxBlockHeight,
        maxFee: userMaxFeeUnits,
        spec: userTransferSpec,
      };

      let signature: `0x${string}`;

      if (isFeeEligible && treasuryNetUnits > 0n) {
        const feeBurnIntent = {
          maxBlockHeight,
          maxFee: feeMaxFeeUnits, // Verified non-zero fee matching Circle operator requirements
          spec: feeTransferSpec,
        };

        const burnIntentSet = {
          intents: [userBurnIntent, feeBurnIntent],
        };

        // 2. Sign EIP-712 BurnIntentSet Typed Data (Gasless! Single Wallet Popup!)
        signature = await signTypedDataAsync({
          domain: GATEWAY_EIP712_DOMAIN,
          types: GATEWAY_EIP712_TYPES,
          primaryType: "BurnIntentSet",
          message: burnIntentSet,
        });

        setExecution((prev) => ({
          ...prev,
          step: 4,
          step3Status: "success",
          step4Status: "in_progress",
        }));

        // 3. Submit BurnIntentSet to Circle Gateway API & Request Attestation
        attestationRes = await CircleGatewayClient.createTransferAttestation([
          {
            burnIntentSet,
            signature,
          },
        ]);
      } else {
        // Fallback: Single BurnIntent if fee is 0
        signature = await signTypedDataAsync({
          domain: GATEWAY_EIP712_DOMAIN,
          types: GATEWAY_EIP712_TYPES,
          primaryType: "BurnIntent",
          message: userBurnIntent,
        });

        setExecution((prev) => ({
          ...prev,
          step: 4,
          step3Status: "success",
          step4Status: "in_progress",
        }));

        attestationRes = await CircleGatewayClient.createTransferAttestation([
          {
            burnIntent: userBurnIntent,
            signature,
          },
        ]);
      }

      let attestationPayload = attestationRes.attestation;
      let operatorSignature = attestationRes.signature;

      // Handle documented edge case: if attestation/signature were omitted synchronously, poll for them
      if (!attestationPayload || !operatorSignature) {
        setExecution((prev) => ({
          ...prev,
          transferId: attestationRes.transferId,
        }));
        const polled = await CircleGatewayClient.pollTransferStatus(attestationRes.transferId);
        attestationPayload = polled.attestation?.payload;
        operatorSignature = polled.attestation?.signature;
        if (!attestationPayload || !operatorSignature) {
          throw new Error("Attestation signature is still processing on Circle Gateway. Please track transfer ID: " + attestationRes.transferId);
        }
      }

      // Cache attestation for seamless retry in Manual Claim & persist to storage
      setCachedAttestation({
        attestationPayload,
        operatorSignature,
        transferId: attestationRes.transferId,
      });

      const transferId = resumingTransfer?.id || attestationRes.transferId || salt;
      const currentSourceTxHash = resumingTransfer?.sourceTxHash || execution.sourceTxHash;
      pendingItem = {
        id: transferId,
        sourceDomain: effectiveSourceConfig.domainId,
        destDomain: effectiveDestConfig.domainId,
        amount: effectiveAmount.toFixed(4),
        receiveAmount: (isFeeEligible ? Number(userReceiveUnits) / 1e6 : effectiveAmount).toFixed(4),
        sourceTxHash: currentSourceTxHash,
        isManualClaim,
        platformFeePercent: isManualClaim ? 0.005 : 0.01,
        attestationPayload,
        operatorSignature,
        createdAt: resumingTransfer ? resumingTransfer.createdAt : Date.now(),
        status: "ready_to_mint",
      };
      savePendingMint(pendingItem);
      setResumingTransfer(pendingItem);

      setExecution((prev) => ({
        ...prev,
        step: 5,
        step4Status: "success",
        step5Status: "in_progress",
        transferId: attestationRes.transferId,
      }));

      // 4. Step 5: Destination Mint (Manual Claim vs Sponsored Mint)
      if (isManualClaim) {
        if (isMintingRef.current) return;
        isMintingRef.current = true;
        try {
          // Manual Claim / Self-Mint: User switches to destination chain and calls gatewayMint
          if (currentChainId !== effectiveDestConfig.chainId) {
            try {
              setExecution((prev) => ({
                ...prev,
                step: 5,
                step5Status: "in_progress",
                errorMessage: undefined,
                infoMessage: `Please switch your wallet to ${effectiveDestConfig.name} to complete mint.`,
              }));
              await handleSwitchNetwork(effectiveDestConfig);
            } catch (switchErr: any) {
              console.warn("[Transfer & Mint] Network switch failed/cancelled:", switchErr);
              setExecution((prev) => ({
                ...prev,
                step: 5,
                step5Status: "error",
                errorMessage: `Please switch your wallet to ${effectiveDestConfig.name} to mint.`,
                infoMessage: undefined,
              }));
              return;
            }
          }

          const activeClient = await getDestinationWalletClient(effectiveDestConfig);
          if (!activeClient) {
            throw new Error("Wallet not connected. Please connect your wallet to mint.");
          }

          const formattedAttestation = (attestationPayload.startsWith("0x") ? attestationPayload : `0x${attestationPayload}`) as `0x${string}`;
          const formattedSignature = (operatorSignature.startsWith("0x") ? operatorSignature : `0x${operatorSignature}`) as `0x${string}`;

          const destTxHash = await activeClient.writeContract({
            address: GATEWAY_MINTER_TESTNET,
            abi: GATEWAY_MINTER_ABI,
            functionName: "gatewayMint",
            args: [formattedAttestation, formattedSignature],
          });

          removePendingMint(pendingItem?.id || transferId, destTxHash, false, currentSourceTxHash);
          setExecution((prev) => ({
            ...prev,
            destinationTxHash: destTxHash,
            step5Status: "success",
            errorMessage: undefined,
          }));
        } finally {
          isMintingRef.current = false;
        }
      } else {
        // Sponsored Mint via ArcFun Backend Relayer (ArcFun pays gas!)
        const mintRes = await fetch("/api/gateway/mint", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(userAddress ? { "x-wallet-address": userAddress.toLowerCase() } : {}),
          },
          body: JSON.stringify({
            attestationPayload,
            signature: operatorSignature,
            destinationDomain: effectiveDestConfig.domainId,
            transferId: attestationRes.transferId,
            recipient: activeRecipient,
            userWallet: userAddress,
            sourceTxHash: currentSourceTxHash,
          }),
        });

        const mintJson = await mintRes.json();
        if (mintJson.alreadyMintedOrExpired) {
          removePendingMint(pendingItem?.id || transferId, undefined, true, currentSourceTxHash);
          setExecution((prev) => ({
            ...prev,
            destinationTxHash: "onchain_completed",
            step5Status: "success",
            errorMessage: undefined,
          }));
          setTimeout(fetchAllBalances, 1500);
          return;
        }
        if (!mintRes.ok || !mintJson.success) {
          const errStr = (mintJson.error || "").toLowerCase();
          if (mintJson.expired || errStr.includes("expired") || errStr.includes("a31dc54b")) {
            removePendingMint(pendingItem?.id || transferId, undefined, true, currentSourceTxHash);
            setExecution((prev) => ({
              ...prev,
              step: 5,
              step5Status: "error",
              errorMessage: "Attestation expired on-chain. Your USDC is safe in your Gateway balance! Please initiate a fresh claim to sign and mint.",
            }));
            setTimeout(fetchAllBalances, 1500);
            return;
          }
          if (mintJson.alreadyMinted || errStr.includes("already") || errStr.includes("reverted")) {
            removePendingMint(pendingItem?.id || transferId, undefined, true, currentSourceTxHash);
            setExecution((prev) => ({
              ...prev,
              destinationTxHash: "onchain_completed",
              step5Status: "success",
              errorMessage: undefined,
            }));
            setTimeout(fetchAllBalances, 1500);
            return;
          }
          throw new Error(mintJson.error || "Relayer mint execution failed.");
        }

        removePendingMint(pendingItem?.id || transferId, mintJson.txHash, false, currentSourceTxHash);
        setExecution((prev) => ({
          ...prev,
          destinationTxHash: mintJson.txHash,
          step5Status: "success",
        }));
      }

      // Refresh balances
      setTimeout(fetchAllBalances, 2000);
    } catch (err: any) {
      console.error("[Transfer & Mint] Error:", err);
      const errMsg = (err?.message || "").toLowerCase();
      if (errMsg.includes("expired") || errMsg.includes("a31dc54b")) {
        const idToRemove = pendingItem?.id || attestationRes?.transferId || resumingTransfer?.id;
        if (idToRemove) removePendingMint(idToRemove, undefined, true);
        setExecution((prev) => ({
          ...prev,
          step: 5,
          step5Status: "error",
          errorMessage: "Attestation expired on-chain. Your USDC is safe in your Gateway balance! The expired transfer has been cleared so you can transfer again.",
        }));
        setTimeout(fetchAllBalances, 1500);
        return;
      }
      if (errMsg.includes("already") || errMsg.includes("reverted")) {
        const idToRemove = pendingItem?.id || attestationRes?.transferId || resumingTransfer?.id;
        if (idToRemove) removePendingMint(idToRemove, undefined, true);
        setExecution((prev) => ({
          ...prev,
          destinationTxHash: "onchain_completed",
          step5Status: "success",
          errorMessage: undefined,
        }));
        setTimeout(fetchAllBalances, 1500);
        return;
      }

      const isUserRejected =
        err?.message?.toLowerCase().includes("user rejected") ||
        err?.message?.toLowerCase().includes("user denied") ||
        err?.message?.toLowerCase().includes("rejected the request") ||
        err?.message?.toLowerCase().includes("user cancelled") ||
        err?.name === "UserRejectedRequestError";

      setExecution((prev) => ({
        ...prev,
        isOpen: true,
        step: prev.step === 4 || prev.step === 5 ? prev.step : 3,
        step1Status: "success",
        step2Status: "success",
        step3Status: prev.step === 4 || prev.step === 5 ? prev.step3Status : "error",
        step4Status: prev.step === 4 ? "error" : prev.step4Status,
        step5Status: prev.step === 5 ? "error" : prev.step5Status,
        errorMessage: isUserRejected
          ? "Signature was cancelled in your wallet. Click 'Retry Signature' to sign again."
          : parseUserFriendlyError(err, "Transfer & Mint failed. Please retry."),
      }));
    }
  };

  // ─── Manual Destination Mint Fallback ───────────────────────────────────────
  const handleManualMint = async () => {
    if (!cachedAttestation) return;
    if (isMintingRef.current) return;
    isMintingRef.current = true;
    try {
      const effectiveDestConfig = (destDomain !== null ? getGatewayNetworkByDomain(destDomain) : null) || destConfig;
      if (!effectiveDestConfig) return;
      if (currentChainId !== effectiveDestConfig.chainId) {
        setExecution((prev) => ({
          ...prev,
          step: 5,
          step5Status: "in_progress",
          errorMessage: undefined,
          infoMessage: `Please switch your wallet to ${effectiveDestConfig.name} to complete mint.`,
        }));
        await handleSwitchNetwork(effectiveDestConfig);
        return;
      }

      setExecution((prev) => ({
        ...prev,
        step: 5,
        step5Status: "in_progress",
        errorMessage: undefined,
      }));

      const activeClient = await getDestinationWalletClient(effectiveDestConfig);
      if (!activeClient) {
        throw new Error("Wallet not connected. Please connect your wallet.");
      }

      const formattedAttestation = (cachedAttestation.attestationPayload.startsWith("0x") ? cachedAttestation.attestationPayload : `0x${cachedAttestation.attestationPayload}`) as `0x${string}`;
      const formattedSignature = (cachedAttestation.operatorSignature.startsWith("0x") ? cachedAttestation.operatorSignature : `0x${cachedAttestation.operatorSignature}`) as `0x${string}`;

      const destTxHash = await activeClient.writeContract({
        address: GATEWAY_MINTER_TESTNET,
        abi: GATEWAY_MINTER_ABI,
        functionName: "gatewayMint",
        args: [formattedAttestation, formattedSignature],
      });

      if (cachedAttestation.transferId) {
        removePendingMint(cachedAttestation.transferId, destTxHash);
      }

      setExecution((prev) => ({
        ...prev,
        destinationTxHash: destTxHash,
        step5Status: "success",
        errorMessage: undefined,
      }));
      setTimeout(fetchAllBalances, 2000);
    } catch (err: any) {
      console.error("[Manual Mint] Error:", err);
      setExecution((prev) => ({
        ...prev,
        step: 5,
        step5Status: "error",
        errorMessage: parseUserFriendlyError(err, "Manual destination mint failed in wallet."),
      }));
    } finally {
      isMintingRef.current = false;
    }
  };

  // ─── Execute / Retry Stored Pending Mint from Dropdown ───────────────────────
  const handleExecutePendingMint = async (item: PendingGatewayMint) => {
    setIsUnifiedDetailsOpen(false);
    setCachedAttestation({
      attestationPayload: item.attestationPayload || "",
      operatorSignature: item.operatorSignature || "",
      transferId: item.id,
    });
    setIsManualClaim(item.isManualClaim);
    setDestDomain(item.destDomain);

    const targetConfig = getGatewayNetworkByDomain(item.destDomain) || destConfig;
    if (!targetConfig) return;

    setExecution({
      isOpen: true,
      step: 5,
      step1Status: "success",
      step2Status: "success",
      step3Status: "success",
      step4Status: "success",
      step5Status: "in_progress",
      transferId: item.id,
      errorMessage: undefined,
    });

    try {
      if (item.isManualClaim) {
        if (currentChainId !== targetConfig.chainId) {
          try {
            setExecution((prev) => ({
              ...prev,
              step: 5,
              step5Status: "in_progress",
              errorMessage: undefined,
              infoMessage: `Please switch your wallet to ${targetConfig.name} to complete mint.`,
            }));
            await handleSwitchNetwork(targetConfig);
          } catch (switchErr: any) {
            console.warn("[Execute Pending Mint] Network switch failed/cancelled:", switchErr);
            setExecution((prev) => ({
              ...prev,
              step: 5,
              step5Status: "error",
              errorMessage: `Please switch your wallet to ${targetConfig.name} to mint.`,
              infoMessage: undefined,
            }));
            return;
          }
        }
        const activeClient = await getDestinationWalletClient(targetConfig);
        if (!activeClient) {
          throw new Error("Wallet not connected. Please connect your wallet to mint.");
        }
        const formattedAttestation = ((item.attestationPayload || "").startsWith("0x") ? item.attestationPayload : `0x${item.attestationPayload}`) as `0x${string}`;
        const formattedSignature = ((item.operatorSignature || "").startsWith("0x") ? item.operatorSignature : `0x${item.operatorSignature}`) as `0x${string}`;

        const destTxHash = await activeClient.writeContract({
          address: GATEWAY_MINTER_TESTNET,
          abi: GATEWAY_MINTER_ABI,
          functionName: "gatewayMint",
          args: [formattedAttestation, formattedSignature],
        });

        removePendingMint(item.id, destTxHash, false, item.sourceTxHash);
        setExecution((prev) => ({
          ...prev,
          destinationTxHash: destTxHash,
          step5Status: "success",
          errorMessage: undefined,
        }));
      } else {
        const mintRes = await fetch("/api/gateway/mint", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(userAddress ? { "x-wallet-address": userAddress.toLowerCase() } : {}),
          },
          body: JSON.stringify({
            attestationPayload: item.attestationPayload,
            signature: item.operatorSignature,
            destinationDomain: item.destDomain,
            transferId: item.id,
            recipient: activeRecipient,
            userWallet: userAddress,
            sourceTxHash: item.sourceTxHash,
          }),
        });
        const mintJson = await mintRes.json();
        if (mintJson.alreadyMintedOrExpired) {
          removePendingMint(item.id, undefined, true, item.sourceTxHash);
          setExecution((prev) => ({
            ...prev,
            destinationTxHash: "onchain_completed",
            step5Status: "success",
            errorMessage: undefined,
          }));
          setTimeout(fetchAllBalances, 1500);
          return;
        }
        if (!mintRes.ok || !mintJson.success) {
          const errStr = (mintJson.error || "").toLowerCase();
          if (mintJson.expired || errStr.includes("expired") || errStr.includes("a31dc54b")) {
            removePendingMint(item.id, undefined, true, item.sourceTxHash);
            setExecution((prev) => ({
              ...prev,
              step: 5,
              step5Status: "error",
              errorMessage: "Attestation expired on-chain. Your USDC is safe in your Gateway balance! The expired item has been cleared so you can transfer again.",
            }));
            setTimeout(fetchAllBalances, 1500);
            return;
          }
          if (mintJson.alreadyMinted || errStr.includes("already") || errStr.includes("reverted")) {
            removePendingMint(item.id, undefined, true, item.sourceTxHash);
            setExecution((prev) => ({
              ...prev,
              destinationTxHash: "onchain_completed",
              step5Status: "success",
              errorMessage: undefined,
            }));
            setTimeout(fetchAllBalances, 1500);
            return;
          }
          throw new Error(mintJson.error || "Relayer mint execution failed.");
        }
        removePendingMint(item.id, mintJson.txHash, false, item.sourceTxHash);
        setExecution((prev) => ({
          ...prev,
          destinationTxHash: mintJson.txHash,
          step5Status: "success",
        }));
      }
      setTimeout(fetchAllBalances, 2000);
    } catch (err: any) {
      console.error("[Execute Pending Mint] Error:", err);
      const errMsg = (err?.message || "").toLowerCase();
      if (errMsg.includes("expired") || errMsg.includes("a31dc54b")) {
        removePendingMint(item.id, undefined, true, item.sourceTxHash);
        setExecution((prev) => ({
          ...prev,
          step: 5,
          step5Status: "error",
          errorMessage: "Pending transfer expired on-chain. Your USDC is safe in your Gateway balance! The expired item has been cleared so you can transfer again.",
        }));
        setTimeout(fetchAllBalances, 1500);
        return;
      }
      if (errMsg.includes("already") || errMsg.includes("reverted")) {
        removePendingMint(item.id, undefined, true, item.sourceTxHash);
        setExecution((prev) => ({
          ...prev,
          destinationTxHash: "onchain_completed",
          step5Status: "success",
          errorMessage: undefined,
        }));
        setTimeout(fetchAllBalances, 1500);
        return;
      }
      setExecution((prev) => ({
        ...prev,
        step: 5,
        step5Status: "error",
        errorMessage: parseUserFriendlyError(err, "Destination mint failed."),
      }));
    }
  };

  // ─── Resume Stored Pending Transfer from Dropdown (Zero Gas!) ──────────────
  const handleResumePendingTransfer = (item: PendingGatewayTransfer) => {
    setIsUnifiedDetailsOpen(false);
    setResumingTransfer(item);
    setSourceDomain(item.sourceDomain);
    setDestDomain(item.destDomain);
    setAmountInput(item.amount);
    setIsManualClaim(item.isManualClaim);

    if (item.status === "ready_to_mint" || item.status === "attestation_ready") {
      handleExecutePendingMint(item);
      return;
    }

    // Check if balance has already been indexed on Circle Gateway
    const balanceItem = unifiedBalances.find((b) => b.domain === item.sourceDomain);
    const avail = balanceItem ? parseFloat(balanceItem.balance) : 0;
    const isIndexed = avail >= parseFloat(item.amount);

    setExecution({
      isOpen: true,
      step: isIndexed ? 3 : 2,
      step1Status: "success",
      step2Status: isIndexed ? "success" : "in_progress",
      step3Status: isIndexed ? "in_progress" : "idle",
      step4Status: "idle",
      step5Status: "idle",
      sourceTxHash: item.sourceTxHash,
      transferId: item.id,
      errorMessage: undefined,
    });

    if (isIndexed) {
      handleTransferAndMint(parseFloat(item.amount), item.sourceDomain, item.destDomain);
    }
  };

  // ─── User Friendly Error Parser ─────────────────────────────────────────────
  const parseUserFriendlyError = (err: any, defaultMsg: string): string => {
    if (!err) return defaultMsg;
    const msg = typeof err === "string" ? err : err?.message || "";
    const lower = msg.toLowerCase();

    if (
      lower.includes("user rejected") ||
      lower.includes("user denied") ||
      lower.includes("rejected the request") ||
      lower.includes("transaction was rejected") ||
      lower.includes("user cancelled") ||
      lower.includes("user canceled") ||
      err?.name === "UserRejectedRequestError"
    ) {
      return "Transaction was cancelled in your wallet.";
    }
    if (lower.includes("insufficient funds") || lower.includes("exceeds balance") || lower.includes("gas required exceeds allowance")) {
      return "Insufficient funds in your wallet to cover gas fee.";
    }
    if (lower.includes("chain not configured") || lower.includes("unsupported chain") || lower.includes("does not match the target chain")) {
      return "Network mismatch. Please switch your wallet network and retry.";
    }
    if (lower.includes("connector not connected") || lower.includes("wallet not connected")) {
      return "Wallet disconnected. Please reconnect your wallet.";
    }
    if (lower.includes("network error") || lower.includes("fetch failed") || lower.includes("failed to fetch")) {
      return "Network connection issue. Please check your RPC connection and retry.";
    }

    // Return the first clean sentence without raw stack traces
    const firstLine = msg.split("\n")[0].replace(/^Error:\s*/i, "").trim();
    if (
      firstLine.length > 0 &&
      firstLine.length < 80 &&
      !firstLine.includes("ContractFunctionExecutionError") &&
      !firstLine.includes("Request Arguments") &&
      !firstLine.includes("0x")
    ) {
      return firstLine;
    }

    return defaultMsg;
  };

  // ─── Auto-Finality Watcher for Step 2 Indexing ──────────────────────────
  const isFinalityPollingRef = useRef(false);

  useEffect(() => {
    // Only active when waiting for Circle Gateway to index deposit at Step 2
    if (!execution.isOpen || execution.step !== 2 || execution.step2Status !== "in_progress") {
      isFinalityPollingRef.current = false;
      return;
    }

    if (!userAddress) return;

    let isMounted = true;

    const checkIndexFinality = async () => {
      if (isFinalityPollingRef.current) return;
      isFinalityPollingRef.current = true;

      try {
        const balanceData = await CircleGatewayClient.getBalances(userAddress);
        if (!isMounted) return;

        // Check if balance on sourceDomain (or alternate domain with balance >= parsedAmount) is ready
        let srcB = balanceData.balances.find((b) => b.domain === sourceDomain);
        let avail = srcB ? parseFloat(srcB.balance) : 0;
        let detectedDomain = sourceDomain;

        if (avail < parsedAmount) {
          const alternate = balanceData.balances.find((b) => {
            const bal = parseFloat(b.balance || "0");
            const minFee = b.domain === 0 ? 1.1 : 0.011;
            return bal >= parsedAmount && bal >= minFee;
          });
          if (alternate) {
            avail = parseFloat(alternate.balance);
            detectedDomain = alternate.domain;
          }
        }

        if (avail >= parsedAmount && parsedAmount > 0) {
          // Deposit is indexed by Circle Gateway! Advance to Step 3 and automatically trigger EIP-712 signing in wallet
          setUnifiedBalances(balanceData.balances || []);
          setExecution((prev) => ({
            ...prev,
            step1Status: "success",
            step2Status: "success",
            step: 3,
            step3Status: "in_progress",
            errorMessage: undefined,
          }));
          const targetSource = detectedDomain ?? sourceDomain ?? undefined;
          const targetDest = destDomain ?? undefined;
          setTimeout(() => {
            handleTransferAndMint(parsedAmount, targetSource, targetDest);
          }, 350);
          return;
        }
      } catch (err) {
        console.warn("[Gateway Finality Watcher] Check warning:", err);
      } finally {
        isFinalityPollingRef.current = false;
      }
    };

    // Immediate check so if balance is already present, user doesn't wait
    checkIndexFinality();

    // Gentle 4-second poll interval without spamming
    const interval = setInterval(checkIndexFinality, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      isFinalityPollingRef.current = false;
    };
  }, [execution.isOpen, execution.step, execution.step2Status, userAddress, sourceDomain, parsedAmount]);

  // ─── Auto-Resume Step 5 Destination Mint when Wallet Switches to Destination Chain ───
  useEffect(() => {
    if (
      !isMintingRef.current &&
      execution.isOpen &&
      execution.step === 5 &&
      isManualClaim &&
      cachedAttestation &&
      execution.step5Status === "error" &&
      !execution.destinationTxHash
    ) {
      const targetDomain = resumingTransfer?.destDomain ?? destDomain;
      const targetConfig = targetDomain !== null && targetDomain !== undefined ? getGatewayNetworkByDomain(targetDomain) : destConfig;
      if (!targetConfig) return;
      if (currentChainId === targetConfig.chainId) {
        console.log("[Circle Gateway] Destination network matched! Auto-prompting manual mint in wallet...");
        setExecution((prev) => ({
          ...prev,
          step5Status: "in_progress",
          errorMessage: undefined,
        }));
        handleManualMint();
      }
    }
  }, [currentChainId, execution.isOpen, execution.step, isManualClaim, cachedAttestation, execution.step5Status, execution.destinationTxHash, destDomain, destConfig, resumingTransfer]);

  // ─── Auto-Scroll into view when Progress UI opens or advances (Mobile & Desktop) ───
  useEffect(() => {
    // Keep window scroll locked at 0 so header and sidebar logo are never pushed off-screen
    if (typeof window !== "undefined" && window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
    if (typeof document !== "undefined") {
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    }

    if (execution.isOpen && progressCardRef.current) {
      const timer = setTimeout(() => {
        const scrollContainer = document.querySelector(".main-scroll-container");
        if (scrollContainer && progressCardRef.current) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const cardRect = progressCardRef.current.getBoundingClientRect();
          const offset = cardRect.bottom - containerRect.bottom;
          if (offset > 0) {
            scrollContainer.scrollBy({ top: offset + 35, behavior: "smooth" });
          }
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [execution.isOpen, execution.step]);

  // ─── Step 1 & 2: Deposit Flow ───────────────────────────────────────────────
  const handleDepositFlow = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    if (!sourceConfig || !destConfig) {
      alert("Please select both source and destination chains.");
      return;
    }

    if (currentChainId !== sourceConfig.chainId) {
      try {
        await handleSwitchNetwork(sourceConfig);
      } catch (err) {
        console.error("Chain switch failed:", err);
        return;
      }
    }

    if (!walletClient || !publicClient || !userAddress) {
      alert("Wallet not ready.");
      return;
    }

    setExecution({
      isOpen: true,
      step: 1,
      step1Status: "in_progress",
      step2Status: "idle",
      step3Status: "idle",
      step4Status: "idle",
      step5Status: "idle",
      errorMessage: undefined,
    });

    try {
      // 1. ERC20 Token Approval if needed
      if (allowance < parsedAmountUnits) {
        const approveTx = await walletClient.writeContract({
          address: sourceConfig.usdcAddress,
          abi: ERC20_GATEWAY_ABI,
          functionName: "approve",
          args: [GATEWAY_WALLET_TESTNET, maxUint256],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        setAllowance(maxUint256);
      }

      // 2. Deposit into GatewayWallet Contract
      const depositTx = await walletClient.writeContract({
        address: GATEWAY_WALLET_TESTNET,
        abi: GATEWAY_WALLET_ABI,
        functionName: "deposit",
        args: [sourceConfig.usdcAddress, parsedAmountUnits],
      });

      // Record deposit immediately into both LocalStorage and Supabase DB
      const initialTransfer: PendingGatewayTransfer = {
        id: depositTx,
        sourceDomain: sourceConfig.domainId,
        destDomain: destConfig.domainId,
        amount: parsedAmount.toFixed(4),
        receiveAmount: receiveAmount.toFixed(4),
        sourceTxHash: depositTx,
        status: "deposited_indexing",
        isManualClaim,
        platformFeePercent: isManualClaim ? 0.005 : 0.01,
        createdAt: Date.now(),
      };
      savePendingMint(initialTransfer);
      setResumingTransfer(initialTransfer);

      setExecution((prev) => ({
        ...prev,
        sourceTxHash: depositTx,
        step1Status: "success",
        step: 2,
        step2Status: "in_progress",
        errorMessage: undefined,
      }));

      await publicClient.waitForTransactionReceipt({ hash: depositTx });
      fetchAllBalances();
    } catch (err: any) {
      console.error("[Deposit Flow] Error:", err);
      setExecution((prev) => ({
        ...prev,
        step1Status: prev.step === 1 ? "error" : prev.step1Status,
        step2Status: prev.step === 2 ? "error" : prev.step2Status,
        errorMessage: parseUserFriendlyError(err, "Deposit transaction was cancelled or failed."),
      }));
    }
  };

  // Priority ordering: Arc (26) 1st, Avalanche (1) 2nd, Base (6) 3rd, Arbitrum (3) 4th, Optimism (2) 5th
  const NETWORK_SORT_ORDER: Record<number, number> = {
    26: 1, // Arc Testnet
    1: 2,  // Avalanche Fuji
    6: 3,  // Base Sepolia
    3: 4,  // Arbitrum Sepolia
    2: 5,  // Optimism Sepolia
  };

  // Filtered networks for selector (sorted by priority)
  const filteredNetworks = useMemo(() => {
    return GATEWAY_DOMAINS_LIST.filter(
      (n) =>
        n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.shortName.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => {
      const orderA = NETWORK_SORT_ORDER[a.domainId] ?? 99;
      const orderB = NETWORK_SORT_ORDER[b.domainId] ?? 99;
      return orderA - orderB;
    });
  }, [searchQuery]);

  // Sorted Gateway Networks for Dropdown: Highest balance on top, lowest/0 balance at bottom
  const sortedGatewayDomains = useMemo(() => {
    return [...GATEWAY_DOMAINS_LIST].sort((a, b) => {
      const rawBalA = parseFloat(unifiedBalances.find((item) => item.domain === a.domainId)?.balance || "0");
      const rawBalB = parseFloat(unifiedBalances.find((item) => item.domain === b.domainId)?.balance || "0");

      // Treat dust (< 0.01) as 0 so genuine claimable amounts are strictly at the top
      const valA = rawBalA >= 0.01 ? rawBalA : 0;
      const valB = rawBalB >= 0.01 ? rawBalB : 0;

      // 1. Sort by claimable value descending (highest first)
      if (Math.abs(valB - valA) > 0.000001) {
        return valB - valA;
      }

      // 2. Tie breaker: priority order (Arc first, Avalanche second, etc.)
      const orderA = NETWORK_SORT_ORDER[a.domainId] ?? 99;
      const orderB = NETWORK_SORT_ORDER[b.domainId] ?? 99;
      return orderA - orderB;
    });
  }, [unifiedBalances]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1440,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "20px 0 160px 0",
      }}
    >
      <div
        className="swap-card-wrapper"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          width: "100%",
          maxWidth: 440,
          margin: "0 auto",
          flexShrink: 0,
          paddingBottom: 40,
        }}
      >
        
        {/* ─── 1. Sleek Unified Gateway Pool & Balance Card ─── */}
        <div
          className="lf-card swap-main-card"
          style={{
            width: "100%",
            borderRadius: 24,
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            position: "relative",
          }}
        >
          {/* Header Row: Title on Left, Refresh + Info on Right */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #8E8E93)", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                Your Gateway Balance
              </span>
              <button
                type="button"
                onClick={() => setIsRouteInfoOpen(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: 2,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                }}
                className="hover:text-[var(--text-primary)]"
                title="How Circle Gateway & ArcFun work"
              >
                <Info size={13} />
              </button>
              <button
                type="button"
                onClick={() => setIsRouteInfoOpen(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary, #6b7280)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "0 2px",
                  alignItems: "center",
                  transition: "all 0.15s ease",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  whiteSpace: "nowrap",
                }}
                className="hidden sm:inline-flex hover:text-[var(--text-primary)] active:scale-95"
                title="How Circle Gateway & ArcFun work"
              >
                How it works
              </button>
            </div>

            <button
              type="button"
              onClick={fetchAllBalances}
              disabled={isLoadingBalances}
              title="Refresh Balances"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
                flexShrink: 0,
              }}
              className="hover:text-[var(--text-primary)] hover:bg-white/5 active:scale-90"
            >
              <RefreshCw size={13} style={{ animation: isLoadingBalances ? "spin 1s linear infinite" : "none" }} />
            </button>
          </div>

          {/* Main Compact Row: [USDC Logo] $XXX.XX USDC  ───  [Claim ▾] */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderRadius: 16,
              background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
              border: "1px solid var(--border)",
              gap: 8,
            }}
          >
            {/* Left: USDC Logo + Big Balance */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexShrink: 1 }}>
              <img
                src="/usdc.png"
                alt="USDC"
                style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }}
              />
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexWrap: "nowrap", minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.02em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {totalUnifiedBalance.toFixed(2)}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  USDC
                </span>

                {totalPendingAmount > 0 && (
                  <span
                    className="hidden sm:inline-flex"
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "var(--text-secondary, #71717a)",
                      background: "var(--surface-soft, rgba(0, 0, 0, 0.04))",
                      border: "1px solid var(--border)",
                      padding: "2px 7px",
                      borderRadius: 999,
                      marginLeft: 4,
                      alignItems: "center",
                      gap: 3,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                    title={`${totalPendingAmount.toFixed(2)} USDC ready to mint in pending list below`}
                  >
                    <span>+{totalPendingAmount.toFixed(2)} Pending</span>
                  </span>
                )}
              </div>
            </div>

            {/* Right: Dropdown Toggle Button [Claim ▾] */}
            <button
              type="button"
              onClick={() => setIsUnifiedDetailsOpen(!isUnifiedDetailsOpen)}
              style={{
                background: (totalUnifiedBalance > 0 || totalPendingAmount > 0) ? "var(--text-primary)" : "var(--surface-soft, rgba(255,255,255,0.06))",
                color: (totalUnifiedBalance > 0 || totalPendingAmount > 0) ? "var(--surface)" : "var(--text-muted)",
                border: "none",
                borderRadius: 9999,
                padding: "6px 14px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                boxShadow: "none",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
              className="active:scale-95 hover:opacity-90"
            >
              <span>{pendingMints.length > 0 ? `Claim (${pendingMints.length})` : "Claim"}</span>
              <motion.span
                animate={{ rotate: isUnifiedDetailsOpen ? 180 : 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: "inline-flex", alignItems: "center" }}
              >
                <ChevronDown size={13} strokeWidth={2.5} />
              </motion.span>
            </button>
          </div>

          {/* Dedicated Indexing in Progress Status Box */}
          {pendingDeposits.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 16,
                background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
                border: "1px solid var(--border)",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--surface, rgba(255, 255, 255, 0.06))",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    flexShrink: 0,
                  }}
                >
                  <LiveClockIcon size={16} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Indexing in Progress
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
                      (Awaiting Finality)
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                      {totalIndexingAmount.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                      USDC
                    </span>
                    {pendingDeposits.length > 0 && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 2 }}>
                        on {getGatewayNetworkByDomain(pendingDeposits[0].domain)?.shortName || "Network"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsIndexingInfoOpen(!isIndexingInfoOpen)}
                style={{
                  background: isIndexingInfoOpen ? "var(--surface, rgba(255, 255, 255, 0.08))" : "transparent",
                  border: "1px solid var(--border)",
                  color: isIndexingInfoOpen ? "var(--text-primary)" : "var(--text-muted)",
                  borderRadius: "50%",
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "all 0.15s ease",
                }}
                title="What is Indexing?"
                className="hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] active:scale-95"
              >
                <Info size={14} />
              </button>
            </div>
          )}

          {/* Expandable Indexing Info Explanation Box */}
          <AnimatePresence initial={false}>
            {isIndexingInfoOpen && (
              <motion.div
                key="gateway-indexing-info"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: 0.2, ease: "easeInOut" },
                }}
                style={{ overflow: "hidden" }}
              >
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: "var(--surface-soft, rgba(255, 255, 255, 0.04))",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    lineHeight: 1.55,
                    color: "var(--text-secondary)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 12.5 }}>
                      About Gateway Deposit Indexing
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsIndexingInfoOpen(false)}
                      style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2 }}
                      className="hover:text-[var(--text-primary)]"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <p style={{ margin: 0 }}>
                    Your deposit transaction was confirmed on the blockchain! Circle Gateway nodes are currently validating block confirmations to guarantee finality.
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "7px 11px",
                      borderRadius: 10,
                      background: "var(--surface, rgba(255, 255, 255, 0.06))",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <LiveClockIcon size={13} className="text-[var(--text-primary)]" />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-primary)" }}>
                      Estimated Indexing Time: {pendingDeposits[0]?.domain === 1 ? "~8 to 15 seconds (Sub-Second L1)" : "~5 to 20 minutes"}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    No action needed from you. Once indexed, your funds will automatically move to Your Gateway Balance and be ready to claim or transfer to any chain!
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dropdown Panel: Opened when isUnifiedDetailsOpen is true */}
          <AnimatePresence initial={false}>
            {isUnifiedDetailsOpen && (
              <motion.div
                key="gateway-balance-dropdown"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: 0.22, ease: "easeInOut" },
                }}
                style={{
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    paddingTop: 8,
                    paddingBottom: 2,
                  }}
                >
                  {/* Pending Mints (Action Required) */}
                  {pendingMints.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: "8px 10px",
                        borderRadius: 12,
                        background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
                        border: "1px solid var(--border)",
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, whiteSpace: "nowrap", flexWrap: "nowrap", padding: "0 2px", minWidth: 0, overflow: "hidden" }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                          Pending Transfers ({pendingMints.length})
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                            {pendingMints.some((m) => m.status === "deposited_indexing") ? "Indexing" : "Action Required"}
                          </span>
                          <button
                            type="button"
                            onClick={handleClearAllPendingMints}
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "var(--text-muted)",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              padding: "0 2px",
                              textDecoration: "underline",
                              textUnderlineOffset: 2,
                              whiteSpace: "nowrap",
                            }}
                            className="hover:text-[var(--text-primary)]"
                            title="Clear pending transfer history"
                          >
                            Clear all
                          </button>
                        </div>
                      </div>

                      {groupedPendingMints.map((group) => {
                        const net = getGatewayNetworkByDomain(group.destDomain) || GATEWAY_NETWORKS[26];
                        const isExpanded = Boolean(expandedPendingDomains[group.destDomain]);
                        const isSingle = group.items.length === 1;
                        const singleItem = group.items[0];

                        return (
                          <div
                            key={`group-${group.destDomain}`}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              padding: "7px 10px",
                              borderRadius: 12,
                              background: "var(--surface, rgba(255, 255, 255, 0.04))",
                              border: "1px solid var(--border)",
                            }}
                          >
                            {/* Main Group Row: Strictly 1 line on desktop and mobile */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                minWidth: 0,
                                whiteSpace: "nowrap",
                                flexWrap: "nowrap",
                              }}
                            >
                              {/* Left: Chain Icon + Name + Count Badge (if > 1) */}
                              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flexShrink: 1, overflow: "hidden", whiteSpace: "nowrap" }}>
                                <img
                                  src={net.icon}
                                  alt={net.name}
                                  style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                                  onError={(e) => {
                                    e.currentTarget.src = "/globe.svg";
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {net.shortName || net.name}
                                </span>
                                {!isSingle && (
                                  <span
                                    style={{
                                      fontSize: 9.5,
                                      fontWeight: 700,
                                      color: "var(--text-muted)",
                                      background: "var(--surface-soft, rgba(0, 0, 0, 0.04))",
                                      border: "1px solid var(--border)",
                                      padding: "1px 5px",
                                      borderRadius: 99,
                                      flexShrink: 0,
                                      lineHeight: 1.2,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {group.items.length}
                                  </span>
                                )}
                              </div>

                              {/* Right: Total Amount + Action Button + Expand Arrow (if > 1) */}
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap", flexWrap: "nowrap" }}>
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "var(--text-primary)",
                                    fontVariantNumeric: "tabular-nums",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {group.totalAmount.toFixed(2)}{" "}
                                  <span style={{ fontSize: 10, fontWeight: 500, color: "var(--text-muted)" }}>USDC</span>
                                </span>

                                {isSingle ? (
                                  <>
                                    {singleItem.status === "ready_to_mint" || singleItem.status === "attestation_ready" ? (
                                      <button
                                        type="button"
                                        onClick={() => handleExecutePendingMint(singleItem)}
                                        style={{
                                          background: "var(--text-primary)",
                                          color: "var(--surface)",
                                          border: "none",
                                          borderRadius: 9999,
                                          padding: "3px 9px",
                                          fontSize: 11,
                                          fontWeight: 600,
                                          cursor: "pointer",
                                          whiteSpace: "nowrap",
                                          transition: "all 0.15s ease",
                                        }}
                                        className="hover:opacity-90 active:scale-95"
                                      >
                                        Mint
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleResumePendingTransfer(singleItem)}
                                        style={{
                                          background: "var(--surface-soft, rgba(0, 0, 0, 0.05))",
                                          color: "var(--text-primary)",
                                          border: "1px solid var(--border)",
                                          borderRadius: 9999,
                                          padding: "3px 9px",
                                          fontSize: 11,
                                          fontWeight: 600,
                                          cursor: "pointer",
                                          whiteSpace: "nowrap",
                                          transition: "all 0.15s ease",
                                        }}
                                        className="hover:bg-[var(--border)] active:scale-95"
                                      >
                                        Resume
                                      </button>
                                    )}
                                    {singleItem.status === "minted" && (
                                      <button
                                        type="button"
                                        onClick={() => removePendingMint(singleItem.id, singleItem.destinationTxHash)}
                                        title="Dismiss completed transfer"
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "var(--text-muted)",
                                          cursor: "pointer",
                                          padding: "3px",
                                          borderRadius: "50%",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          transition: "all 0.15s ease",
                                        }}
                                        className="hover:text-[var(--text-primary)] hover:bg-white/5 active:scale-90"
                                      >
                                        <X size={12} strokeWidth={2} />
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {group.hasReadyToMint ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const readyItem = group.items.find((i) => i.status === "ready_to_mint" || i.status === "attestation_ready");
                                          if (readyItem) handleExecutePendingMint(readyItem);
                                        }}
                                        style={{
                                          background: "var(--text-primary)",
                                          color: "var(--surface)",
                                          border: "none",
                                          borderRadius: 9999,
                                          padding: "3px 9px",
                                          fontSize: 11,
                                          fontWeight: 600,
                                          cursor: "pointer",
                                          whiteSpace: "nowrap",
                                          transition: "all 0.15s ease",
                                        }}
                                        className="hover:opacity-90 active:scale-95"
                                        title="Mint ready transfer"
                                      >
                                        Mint
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleResumePendingTransfer(group.items[0])}
                                        style={{
                                          background: "var(--surface-soft, rgba(0, 0, 0, 0.05))",
                                          color: "var(--text-primary)",
                                          border: "1px solid var(--border)",
                                          borderRadius: 9999,
                                          padding: "3px 9px",
                                          fontSize: 11,
                                          fontWeight: 600,
                                          cursor: "pointer",
                                          whiteSpace: "nowrap",
                                          transition: "all 0.15s ease",
                                        }}
                                        className="hover:bg-[var(--border)] active:scale-95"
                                      >
                                        Resume
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => toggleExpandDomain(group.destDomain)}
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "var(--text-muted)",
                                        cursor: "pointer",
                                        padding: "2px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderRadius: 4,
                                      }}
                                      className="hover:text-[var(--text-primary)]"
                                      title={isExpanded ? "Collapse transfers" : "Expand transfers"}
                                    >
                                      <ChevronDown
                                        size={13}
                                        style={{
                                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                          transition: "transform 0.2s ease",
                                        }}
                                      />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Expanded Sub-items (Strictly single-line rows) */}
                            {!isSingle && isExpanded && (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 4,
                                  paddingTop: 5,
                                  borderTop: "1px dashed var(--border-soft)",
                                }}
                              >
                                {group.items.map((item, idx) => {
                                  const isItemReady = item.status === "ready_to_mint" || item.status === "attestation_ready";
                                  const amtNum = parseFloat(item.receiveAmount || item.amount || "0");
                                  return (
                                    <div
                                      key={item.id || idx}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "4px 6px",
                                        borderRadius: 8,
                                        background: "var(--surface-soft, rgba(0, 0, 0, 0.02))",
                                        fontSize: 11,
                                        gap: 8,
                                        whiteSpace: "nowrap",
                                        flexWrap: "nowrap",
                                        minWidth: 0,
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
                                        <span style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: "monospace", flexShrink: 0 }}>
                                          #{idx + 1}
                                        </span>
                                        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>
                                          {amtNum.toFixed(2)} USDC
                                        </span>
                                        <span style={{ fontSize: 9.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                          ({isItemReady ? "Ready" : "Indexing"})
                                        </span>
                                      </div>

                                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, whiteSpace: "nowrap" }}>
                                        {isItemReady ? (
                                          <button
                                            type="button"
                                            onClick={() => handleExecutePendingMint(item)}
                                            style={{
                                              background: "var(--text-primary)",
                                              color: "var(--surface)",
                                              border: "none",
                                              borderRadius: 9999,
                                              padding: "2px 7px",
                                              fontSize: 10,
                                              fontWeight: 600,
                                              cursor: "pointer",
                                              whiteSpace: "nowrap",
                                            }}
                                            className="hover:opacity-90 active:scale-95"
                                          >
                                            Mint
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => handleResumePendingTransfer(item)}
                                            style={{
                                              background: "transparent",
                                              color: "var(--text-primary)",
                                              border: "1px solid var(--border)",
                                              borderRadius: 9999,
                                              padding: "2px 7px",
                                              fontSize: 10,
                                              fontWeight: 600,
                                              cursor: "pointer",
                                              whiteSpace: "nowrap",
                                            }}
                                            className="hover:bg-[var(--border)] active:scale-95"
                                          >
                                            Resume
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Render curved row for each supported Gateway Network */}
                  {sortedGatewayDomains.map((net) => {
                    const b = unifiedBalances.find((item) => item.domain === net.domainId);
                    const balNum = b ? parseFloat(b.balance) : 0;
                    const hasClaimableBalance = balNum >= 0.01;
                    const isSelected = activeMode === "claim" && sourceDomain === net.domainId;

                    return (
                      <div
                        key={net.domainId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "9px 12px",
                          borderRadius: 14,
                          background: isSelected
                            ? "var(--surface-soft, rgba(255, 255, 255, 0.08))"
                            : "var(--surface-soft, rgba(255, 255, 255, 0.03))",
                          border: isSelected
                            ? "1px solid var(--text-primary)"
                            : "1px solid var(--border)",
                          transition: "all 0.15s ease",
                          gap: 10,
                          whiteSpace: "nowrap",
                          flexWrap: "nowrap",
                          minWidth: 0,
                        }}
                      >
                        {/* Left: Chain Icon + Chain Name */}
                        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
                          <div style={{ position: "relative", width: 22, height: 22, flexShrink: 0 }}>
                            <img
                              src={net.icon}
                              alt={net.name}
                              style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }}
                              onError={(e) => {
                                e.currentTarget.src = "/globe.svg";
                              }}
                            />
                          </div>
                          <div style={{ minWidth: 0, overflow: "hidden" }}>
                            <span
                              style={{
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "block",
                              }}
                            >
                              {net.shortName || net.name}
                            </span>
                          </div>
                        </div>

                        {/* Right: Balance + Claim Action Button */}
                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              fontVariantNumeric: "tabular-nums",
                              letterSpacing: "-0.01em",
                              color: hasClaimableBalance ? "var(--text-primary)" : "var(--text-muted)",
                            }}
                          >
                            {balNum.toFixed(2)}{" "}
                            <span style={{ fontSize: 10.5, fontWeight: 500, color: "var(--text-muted)" }}>USDC</span>
                          </span>

                          {hasClaimableBalance && (
                            <button
                              type="button"
                              disabled={isTransferLocked}
                              onClick={() => {
                                if (isTransferLocked) return;
                                resetExecution();
                                setActiveMode("claim");
                                setSourceDomain(net.domainId);
                                // Ensure destination is NOT the same as source
                                if (net.domainId === 26) {
                                  setDestDomain(6); // If source is Arc, dest goes to Base
                                } else {
                                  setDestDomain(26); // Default dest is Arc
                                }
                                setAmountInput(b ? b.balance : balNum.toString());
                                setIsUnifiedDetailsOpen(false); // Close dropdown cleanly
                              }}
                              title={isTransferLocked ? "A transfer is currently in progress. Complete or dismiss it first." : undefined}
                              style={{
                                background: "var(--surface-soft, rgba(0, 0, 0, 0.05))",
                                color: "var(--text-primary)",
                                border: "1px solid var(--border)",
                                borderRadius: 9999,
                                padding: "4px 10px",
                                fontSize: 11.5,
                                fontWeight: 600,
                                cursor: isTransferLocked ? "not-allowed" : "pointer",
                                opacity: isTransferLocked ? 0.45 : 1,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                boxShadow: "none",
                                transition: "all 0.15s ease",
                                whiteSpace: "nowrap",
                              }}
                              className={isTransferLocked ? "" : "hover:bg-[var(--border)] active:scale-95"}
                            >
                              <span>Claim</span>
                              <ChevronRight size={12} strokeWidth={2.5} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Indexing Balance Row(s) if any */}
                  {pendingDeposits.length > 0 ? (
                    pendingDeposits.map((d, i) => {
                      const net = getGatewayNetworkByDomain(d.domain) || GATEWAY_NETWORKS[6];
                      const amt = parseFloat(formatUnits(BigInt(d.amount), 6));
                      return (
                        <div
                          key={`pending-${i}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
                            border: "1px solid var(--border)",
                            borderRadius: 14,
                            padding: "9px 12px",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                            <div style={{ position: "relative", width: 22, height: 22, flexShrink: 0 }}>
                              <img
                                src="/usdc.png"
                                alt="USDC"
                                style={{ width: 22, height: 22, borderRadius: "50%" }}
                              />
                              <img
                                src={net.icon}
                                alt={net.name}
                                style={{
                                  position: "absolute",
                                  bottom: -2,
                                  right: -2,
                                  width: 11,
                                  height: 11,
                                  borderRadius: "50%",
                                  border: "1.5px solid var(--surface)",
                                  objectFit: "cover",
                                }}
                                onError={(e) => {
                                  e.currentTarget.src = "/globe.svg";
                                }}
                              />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 9.5, color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 4 }}>
                                <span>Indexing</span>
                                <span style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "none", fontWeight: 500 }}>({net.shortName || net.name})</span>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                                {amt.toFixed(2)} <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)" }}>USDC</span>
                              </div>
                            </div>
                          </div>

                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "3px 8px",
                              borderRadius: 9999,
                              color: "var(--text-muted)",
                              background: "var(--surface, rgba(255, 255, 255, 0.06))",
                              border: "1px solid var(--border)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4.5,
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            <LiveClockIcon size={11} className="text-[var(--text-muted)]" />
                            <span>Please Wait...</span>
                          </span>
                        </div>
                      );
                    })
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ─── Mode Switcher Pill: [ Deposit | Claim ] ─── */}
        <div
          className="mode-pill-track"
          style={isTransferLocked ? { opacity: 0.55, pointerEvents: "none" } : undefined}
          title={isTransferLocked ? "Mode selection is locked during an active transfer" : undefined}
        >
          {/* 1. Deposit Tab */}
          <button
            type="button"
            disabled={isTransferLocked}
            onClick={() => {
              if (isTransferLocked) return;
              setActiveMode("deposit");
              resetExecution();
            }}
            className={`mode-pill-btn ${activeMode === "deposit" ? "active" : ""}`}
            style={isTransferLocked ? { cursor: "not-allowed" } : undefined}
          >
            <span>Deposit</span>
          </button>

          {/* 2. Claim Tab */}
          <button
            type="button"
            disabled={isTransferLocked}
            onClick={() => {
              if (isTransferLocked) return;
              setActiveMode("claim");
              resetExecution();
            }}
            className={`mode-pill-btn ${activeMode === "claim" ? "active" : ""}`}
            style={isTransferLocked ? { cursor: "not-allowed" } : undefined}
          >
            <span>Claim</span>
          </button>
        </div>

        {/* ─── 2. Ultra-Clean Modern Gateway Card ─── */}
        <div
          className="lf-card swap-main-card"
          style={{
            width: "100%",
            padding: "20px 20px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            borderRadius: 26,
            position: "relative",
          }}
        >
          {/* Active Transfer In-Progress Banner (if route is locked) */}
          {isTransferLocked && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 6px 5px 14px",
                borderRadius: 9999,
                background: "var(--surface-soft, rgba(255, 255, 255, 0.04))",
                border: "1px solid var(--border)",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
                letterSpacing: "-0.01em",
              }}
            >
              <span className="hidden sm:inline whitespace-nowrap">Route Locked · Transfer in Progress</span>
              <span className="sm:hidden whitespace-nowrap text-[11px]">Transfer in Progress</span>
              <button
                type="button"
                onClick={handleDismissResumption}
                style={{
                  background: "var(--surface, #ffffff)",
                  border: "1px solid var(--border)",
                  borderRadius: 9999,
                  padding: "3.5px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
                className="hover:bg-black/5 dark:hover:bg-white/10 active:scale-95"
                title="Start another transfer while current transfer completes in the background"
              >
                <Plus size={11} strokeWidth={2.5} className="text-[var(--text-primary)]" />
                <span>New Transfer</span>
              </button>
            </div>
          )}

          {/* Network Selection Bar: [ (icon) Source Chain v ] -> [ (icon) Dest Chain v ] */}
          <div style={{ position: "relative", width: "100%", zIndex: networkSelectorView ? 90 : 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                width: "100%",
                padding: "2px 0",
              }}
            >
              {/* Source Chain Pill */}
              <button
                type="button"
                disabled={isTransferLocked}
                onClick={() => {
                  if (isTransferLocked) return;
                  setNetworkSelectorView(networkSelectorView === "from" ? null : "from");
                  setSearchQuery("");
                }}
                className={isTransferLocked ? "px-2.5 sm:px-3" : "px-2.5 sm:px-3 hover:border-zinc-500/50 active:scale-[0.98]"}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  borderRadius: 999,
                  background: networkSelectorView === "from" ? "var(--surface-soft, rgba(255,255,255,0.08))" : "var(--surface-soft, rgba(255,255,255,0.04))",
                  border: `1px solid ${networkSelectorView === "from" ? "var(--text-primary)" : "var(--border)"}`,
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: isTransferLocked ? "not-allowed" : "pointer",
                  opacity: isTransferLocked ? 0.75 : 1,
                  transition: "all 0.15s ease",
                  minWidth: 0,
                  height: 40,
                }}
                title={isTransferLocked ? "Source chain is locked while transfer is executing" : undefined}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  {sourceConfig ? (
                    <>
                      <img
                        src={sourceConfig.icon}
                        alt={sourceConfig.name}
                        style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                        className="w-[18px] h-[18px] sm:w-[20px] sm:h-[20px]"
                        onError={(e) => {
                          e.currentTarget.src = "/globe.svg";
                        }}
                      />
                      <span className="hidden sm:inline truncate">{sourceConfig.shortName || sourceConfig.name}</span>
                      <span className="sm:hidden truncate text-[12px]">{sourceConfig.domainId === 1 ? "Avax" : (sourceConfig.shortName || sourceConfig.name)}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-[18px] h-[18px] sm:w-[20px] sm:h-[20px] rounded-full flex items-center justify-center bg-white/10 dark:bg-white/10 flex-shrink-0">
                        <img src="/globe.svg" alt="Select" className="w-3.5 h-3.5 opacity-60" />
                      </div>
                      <span className="text-[12.5px] sm:text-[13px] font-medium text-[var(--text-muted)] truncate">Select chain</span>
                    </>
                  )}
                </div>
                {!isTransferLocked ? (
                  <ChevronDown
                    size={14}
                    style={{
                      color: "var(--text-muted)",
                      flexShrink: 0,
                      transform: networkSelectorView === "from" ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}
                  />
                ) : (
                  <Lock size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                )}
              </button>

              {/* Arrow / Swap Icon */}
              <button
                type="button"
                disabled={isTransferLocked}
                onClick={isTransferLocked ? undefined : handleSwapNetworks}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: isTransferLocked ? "not-allowed" : "pointer",
                  opacity: isTransferLocked ? 0.35 : 1,
                  flexShrink: 0,
                  transition: "all 0.15s ease",
                }}
                className={`w-6 sm:w-7 h-6 sm:h-7 ${isTransferLocked ? "" : "hover:text-[var(--text-primary)] hover:scale-110 active:scale-90"}`}
                title={isTransferLocked ? "Route locked during transfer" : "Swap Networks"}
              >
                <ArrowRight size={15} />
              </button>

              {/* Destination Chain Pill */}
              <button
                type="button"
                disabled={isTransferLocked}
                onClick={() => {
                  if (isTransferLocked) return;
                  setNetworkSelectorView(networkSelectorView === "to" ? null : "to");
                  setSearchQuery("");
                }}
                className={isTransferLocked ? "px-2.5 sm:px-3" : "px-2.5 sm:px-3 hover:border-zinc-500/50 active:scale-[0.98]"}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  borderRadius: 999,
                  background: networkSelectorView === "to" ? "var(--surface-soft, rgba(255,255,255,0.08))" : "var(--surface-soft, rgba(255,255,255,0.04))",
                  border: `1px solid ${networkSelectorView === "to" ? "var(--text-primary)" : "var(--border)"}`,
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: isTransferLocked ? "not-allowed" : "pointer",
                  opacity: isTransferLocked ? 0.75 : 1,
                  transition: "all 0.15s ease",
                  minWidth: 0,
                  height: 40,
                }}
                title={isTransferLocked ? "Destination chain is locked while transfer is executing" : undefined}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  {destConfig ? (
                    <>
                      <img
                        src={destConfig.icon}
                        alt={destConfig.name}
                        style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                        className="w-[18px] h-[18px] sm:w-[20px] sm:h-[20px]"
                        onError={(e) => {
                          e.currentTarget.src = "/globe.svg";
                        }}
                      />
                      <span className="hidden sm:inline truncate">{destConfig.shortName || destConfig.name}</span>
                      <span className="sm:hidden truncate text-[12px]">{destConfig.domainId === 1 ? "Avax" : (destConfig.shortName || destConfig.name)}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-[18px] h-[18px] sm:w-[20px] sm:h-[20px] rounded-full flex items-center justify-center bg-white/10 dark:bg-white/10 flex-shrink-0">
                        <img src="/globe.svg" alt="Select" className="w-3.5 h-3.5 opacity-60" />
                      </div>
                      <span className="text-[12.5px] sm:text-[13px] font-medium text-[var(--text-muted)] truncate">Select chain</span>
                    </>
                  )}
                </div>
                {!isTransferLocked ? (
                  <ChevronDown
                    size={14}
                    style={{
                      color: "var(--text-muted)",
                      flexShrink: 0,
                      transform: networkSelectorView === "to" ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}
                  />
                ) : (
                  <Lock size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                )}
              </button>
            </div>

            {/* Dropdown Popover */}
            {networkSelectorView && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 95 }}
                  onClick={() => setNetworkSelectorView(null)}
                />

                <div
                  className="chain-picker-dropdown"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 18,
                    padding: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    boxShadow: "0 18px 40px -4px rgba(0, 0, 0, 0.45)",
                    zIndex: 100,
                    backdropFilter: "blur(16px)",
                  }}
                >
                  {/* Search Bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "var(--surface-soft, rgba(0,0,0,0.03))",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "8px 12px",
                    }}
                  >
                    <Search size={14} style={{ color: "var(--text-muted)" }} />
                    <input
                      type="text"
                      placeholder="Search network..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: 13, width: "100%" }}
                    />
                  </div>

                  {/* Network List */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 220, overflowY: "auto" }}>
                    {filteredNetworks.map((net) => {
                      const isSelected = (networkSelectorView === "from" ? sourceDomain : destDomain) === net.domainId;
                      const isOppositeChain = (networkSelectorView === "to" ? sourceDomain : destDomain) === net.domainId;
                      const netBalance = unifiedBalances.find((b) => b.domain === net.domainId);
                      const balNum = netBalance ? parseFloat(netBalance.balance) : 0;
                      return (
                        <button
                          key={net.domainId}
                          type="button"
                          onClick={() => {
                            resetExecution();
                            if (networkSelectorView === "from") {
                              setSourceDomain(net.domainId);
                              if (destDomain === net.domainId) {
                                setDestDomain(null);
                              }
                              if (activeMode === "claim" && balNum > 0 && netBalance) {
                                setAmountInput(netBalance.balance);
                              }
                            } else {
                              if (sourceDomain === net.domainId) {
                                setSourceDomain(null);
                              }
                              setDestDomain(net.domainId);
                            }
                            setNetworkSelectorView(null);
                            setSearchQuery("");
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "9px 12px",
                            borderRadius: 12,
                            background: isSelected ? "var(--surface-soft, rgba(255, 255, 255, 0.06))" : "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-primary)",
                            fontWeight: isSelected ? 700 : 500,
                            fontSize: 13.5,
                            textAlign: "left",
                            transition: "all 0.12s ease",
                            width: "100%",
                          }}
                          className="hover:bg-white/5 active:scale-[0.98]"
                        >
                          <img
                            src={net.icon}
                            alt={net.name}
                            style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                            onError={(e) => {
                              e.currentTarget.src = "/globe.svg";
                            }}
                          />
                          <span className="truncate">{net.name}</span>
                          {networkSelectorView === "to" && isOppositeChain && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#f59e0b", marginLeft: "auto", paddingRight: 4 }}>
                              (Swaps Source)
                            </span>
                          )}
                          {activeMode === "claim" && networkSelectorView === "from" && balNum > 0 && (
                            <span
                              style={{
                                fontSize: 11.5,
                                fontWeight: 700,
                                fontVariantNumeric: "tabular-nums",
                                color: "var(--text-primary)",
                                marginLeft: "auto",
                                paddingRight: 6,
                              }}
                            >
                              {balNum.toFixed(2)} USDC
                            </span>
                          )}
                          {/* Speed vs Slow Clean Text (No border, no background) */}
                          {(!isOppositeChain || networkSelectorView !== "to") && (
                            <span
                              style={{
                                marginLeft: activeMode === "claim" && networkSelectorView === "from" && balNum > 0 ? 0 : "auto",
                                fontSize: 12,
                                fontWeight: (net.domainId === 26 || net.domainId === 1) ? 600 : 500,
                                color: (net.domainId === 26 || net.domainId === 1)
                                  ? "var(--text-primary)"
                                  : "var(--text-muted)",
                                flexShrink: 0,
                                paddingRight: 4,
                              }}
                            >
                              {(net.domainId === 26 || net.domainId === 1) ? "Speed" : "Slow"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Big Typographic Amount Input Area */}
          <div
            onClick={() => amountInputRef.current?.focus()}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "18px 0 8px",
              cursor: "text",
              width: "100%",
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "100%", gap: 8 }}>
              <input
                ref={amountInputRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="0"
                value={amountInput}
                disabled={isTransferLocked}
                onChange={(e) => {
                  if (isTransferLocked) return;
                  let val = e.target.value.replace(/,/g, ".");
                  // If user types "." directly, format as "0."
                  if (val === ".") val = "0.";
                  // Only allow numbers and max one decimal point
                  if (val !== "" && !/^[0-9]*\.?[0-9]*$/.test(val)) return;
                  // Max 6 decimal places for USDC
                  if (val.includes(".")) {
                    const [, decPart] = val.split(".");
                    if (decPart && decPart.length > 6) return;
                  }
                  if (execution.isOpen && !isTransferLocked) {
                    resetExecution();
                  }
                  if (resumingTransfer && !isTransferLocked) {
                    setResumingTransfer(null);
                  }
                  // Clean unwanted leading zero like "0100" -> "100" while allowing "0." or "0"
                  if (val.length > 1 && val.startsWith("0") && val[1] !== ".") {
                    val = val.replace(/^0+/, "");
                  }
                  setAmountInput(val);
                }}
                onKeyDown={(e) => {
                  if (e.key === "-" || e.key === "e") e.preventDefault();
                }}
                data-hero-input="true"
                className="amount-hero-input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-[var(--text-muted)] placeholder:opacity-30"
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: amountInput.length > 10 ? 34 : amountInput.length > 7 ? 46 : 60,
                  fontWeight: 300,
                  color: isInsufficientSourceBalance ? "#dc2626" : "var(--text-primary)",
                  transition: "color 0.18s ease, font-size 0.15s ease",
                  textAlign: "right",
                  width: `${Math.max(1.1, (amountInput || "0").length + 0.1)}ch`,
                  maxWidth: "calc(100% - 70px)",
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Inter', -apple-system, sans-serif",
                  opacity: isTransferLocked ? 0.8 : 1,
                  cursor: isTransferLocked ? "not-allowed" : "text",
                  padding: 0,
                  margin: 0,
                  lineHeight: 1,
                  height: "auto",
                  verticalAlign: "middle",
                }}
              />
              <span
                style={{
                  fontSize: amountInput.length > 10 ? 14 : amountInput.length > 7 ? 16 : 18,
                  fontWeight: 400,
                  color: "var(--text-muted, #94a3b8)",
                  letterSpacing: "0.01em",
                  lineHeight: 1,
                  flexShrink: 0,
                  userSelect: "none",
                  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
                  display: "inline-flex",
                  alignItems: "center",
                  paddingBottom: "2px",
                }}
              >
                USDC
              </span>
            </div>

            {/* Subtitle: Clean borderless warning when insufficient balance, otherwise compact balance pill */}
            {isInsufficientSourceBalance ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, marginTop: 12 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    color: "#dc2626",
                    fontSize: 13,
                    fontWeight: 450,
                    letterSpacing: "-0.01em",
                    whiteSpace: "nowrap",
                    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="#dc2626"
                    style={{ flexShrink: 0 }}
                  >
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-10v6h2V7h-2z" />
                  </svg>
                  <span>
                    You have {formatDisplayBalance(activeMode === "claim" ? unifiedSourceBalance : sourceWalletBalance)} on {sourceConfig ? (sourceConfig.shortName || sourceConfig.name) : "selected chain"}
                  </span>
                </div>

                {!isTransferLocked && sourceConfig && (
                  <button
                    type="button"
                    onClick={() => {
                      if (execution.isOpen && !isTransferLocked) {
                        resetExecution();
                      }
                      if (resumingTransfer && !isTransferLocked) {
                        setResumingTransfer(null);
                      }
                      if (activeMode === "claim") {
                        setAmountInput(sourceItemWithBalance ? sourceItemWithBalance.balance : unifiedSourceBalance.toString());
                      } else {
                        // On Arc Testnet, reserve 0.05 USDC for gas
                        const maxSpendable = sourceDomain === 26
                          ? Math.max(0, sourceWalletBalance - 0.05).toString()
                          : sourceWalletBalance.toString();
                        setAmountInput(maxSpendable);
                      }
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "2px 8px",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#0284c7",
                      cursor: "pointer",
                      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
                    }}
                    className="hover:underline active:opacity-75"
                  >
                    Max
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 10px",
                    borderRadius: 9999,
                    background: "var(--surface-soft, rgba(0, 0, 0, 0.03))",
                    border: "1px solid var(--border-soft)",
                    color: "var(--text-muted)",
                    fontSize: 11.5,
                    fontWeight: 500,
                    letterSpacing: "-0.01em",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>
                    {!sourceConfig
                      ? "Select source chain"
                      : activeMode === "claim"
                      ? isSourceBalanceBelowMinFee
                        ? `Available: ${formatDisplayBalance(unifiedSourceBalance)} (Below min ${minRequiredFee} USDC fee)`
                        : `Available: ${formatDisplayBalance(unifiedSourceBalance)}`
                      : `Balance: ${formatDisplayBalance(sourceWalletBalance)}`}
                  </span>
                </div>

                {!isTransferLocked && sourceConfig && (
                  <button
                    type="button"
                    onClick={() => {
                      if (execution.isOpen && !isTransferLocked) {
                        resetExecution();
                      }
                      if (resumingTransfer && !isTransferLocked) {
                        setResumingTransfer(null);
                      }
                      if (activeMode === "claim") {
                        setAmountInput(sourceItemWithBalance ? sourceItemWithBalance.balance : unifiedSourceBalance.toString());
                      } else {
                        // On Arc Testnet, reserve 0.05 USDC for gas
                        const maxSpendable = sourceDomain === 26
                          ? Math.max(0, sourceWalletBalance - 0.05).toString()
                          : sourceWalletBalance.toString();
                        setAmountInput(maxSpendable);
                      }
                    }}
                    style={{
                      background: "var(--surface-soft, rgba(0, 0, 0, 0.04))",
                      border: "1px solid var(--border)",
                      borderRadius: 9999,
                      padding: "3px 9px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#0284c7",
                      cursor: "pointer",
                      letterSpacing: "-0.01em",
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap",
                    }}
                    className="hover:bg-[var(--border)] active:scale-95"
                  >
                    Max
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Recipient Row (in Claim Mode) */}
          {activeMode === "claim" && (
            <div
              className="swap-input-box"
              style={{
                borderRadius: 16,
                padding: "11px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600, flexShrink: 0 }}>Recipient</span>
              {!isEditingRecipient ? (
                <div
                  onClick={() => setIsEditingRecipient(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontSize: 13,
                    fontWeight: 500,
                    transition: "color 0.15s ease",
                  }}
                  className="hover:text-[var(--text-primary)]"
                >
                  <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12.5 }}>
                    {activeRecipient ? `${activeRecipient.slice(0, 6)}...${activeRecipient.slice(-4)}` : "Connect Wallet"}
                  </span>
                  <ChevronRight size={15} style={{ color: "var(--text-muted)" }} />
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "flex-end" }}>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={customRecipient}
                    onChange={(e) => setCustomRecipient(e.target.value)}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 999,
                      padding: "6px 12px",
                      color: "var(--text-primary)",
                      fontSize: 12,
                      fontFamily: "var(--font-mono), monospace",
                      width: "160px",
                      maxWidth: "100%",
                      outline: "none",
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => setIsEditingRecipient(false)}
                    style={{
                      background: "var(--text-primary)",
                      color: "var(--surface)",
                      border: "none",
                      borderRadius: 999,
                      padding: "6px 14px",
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap",
                    }}
                    className="hover:opacity-90 active:scale-95"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── Transaction Summary Breakdown (Time, Fee, Route) ─── */}
          <div
            style={{
              padding: "11px 14px",
              borderRadius: 14,
              background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 12.5,
            }}
          >
            {/* 1. Estimated Time */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>Estimated Time</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", flexShrink: 0 }}>
                <Clock size={12} className="text-[var(--text-muted)]" />
                {activeMode === "claim"
                  ? "~1 – 3 Seconds"
                  : sourceDomain === 1
                  ? "~8 – 15 Seconds"
                  : "1 – 10 Mins"}
              </span>
            </div>

            {/* 2. Destination Mint Fee (Live Gas Details) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                whiteSpace: "nowrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                  <span className="hidden sm:inline">Destination Mint Fee</span>
                  <span className="sm:hidden">Destination Fee</span>
                </span>
                {/* 10s live circular countdown ring (only when amount entered & manual claim active) */}
                {activeMode === "deposit" && parsedAmount > 0 && isManualClaim && (
                  <div
                    title={`Live destination gas updates every 10s (${gasCountdown}s remaining)`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      opacity: isCheckingDestGas ? 0.6 : 1,
                      transition: "opacity 0.2s ease",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" style={{ transform: "rotate(-90deg)" }}>
                      <circle
                        cx="7"
                        cy="7"
                        r="5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        style={{ opacity: 0.15 }}
                      />
                      <circle
                        cx="7"
                        cy="7"
                        r="5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeDasharray={31.4159}
                        strokeDashoffset={31.4159 * (1 - gasCountdown / 10)}
                        style={{
                          color: "var(--accent, #3b82f6)",
                          transition: "stroke-dashoffset 0.9s linear",
                        }}
                      />
                    </svg>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {gasCountdown}s
                    </span>
                  </div>
                )}
              </div>
              <span
                style={{
                  color: isManualClaim ? "var(--text-primary)" : "var(--text-primary, #000000)",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
                className="text-[12px] sm:text-[12.5px]"
              >
                {isManualClaim ? (
                  estDestGasFormatted
                ) : (
                  <>
                    <span className="hidden sm:inline">Sponsored By ArcFun</span>
                    <span className="sm:hidden">Sponsored</span>
                  </>
                )}
              </span>
            </div>

            {/* 3. See Fee Details Toggle & Accordion Slide */}
            {activeMode === "deposit" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setShowFeeDetails(!showFeeDetails)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    padding: "3px 0",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontSize: 11.5,
                    fontWeight: 500,
                    transition: "color 0.15s ease",
                  }}
                  className="hover:text-[var(--text-primary)]"
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    See Fee Details
                  </span>
                  <motion.div
                    animate={{ rotate: showFeeDetails ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <ChevronDown size={13} />
                  </motion.div>
                </button>

                <AnimatePresence initial={false}>
                  {showFeeDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      style={{
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        gap: 7,
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "var(--surface, rgba(255, 255, 255, 0.04))",
                        border: "1px solid var(--border)",
                        fontSize: 11.5,
                      }}
                    >
                      {/* ArcFun Platform Fee */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, whiteSpace: "nowrap" }}>
                        <span style={{ color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                          ArcFun Platform Fee ({isManualClaim ? "0.5%" : "1%"})
                        </span>
                        <span style={{ color: "var(--text-primary)", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>
                          {parsedAmount > 0 ? `${platformFee.toFixed(4)} USDC` : "0.0000 USDC"}
                        </span>
                      </div>

                      {/* Gateway Protocol Fee */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, whiteSpace: "nowrap" }}>
                        <span style={{ color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                          Gateway Protocol Fee
                        </span>
                        <span style={{ color: "var(--text-primary)", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>
                          {parsedAmount > 0 ? `${circleProtocolFee.toFixed(4)} USDC` : "0.0000 USDC"}
                        </span>
                      </div>

                      {/* Your Wallet Gas Balance (shown in fee details if manual claim) */}
                      {isManualClaim && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, whiteSpace: "nowrap" }}>
                          <span style={{ color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                            Your Gas Balance ({destConfig ? (destConfig.shortName || destConfig.name) : "Destination"})
                          </span>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 5, whiteSpace: "nowrap", flexShrink: 0 }}>
                            <span
                              style={{
                                color: isUserDestGasSufficient ? "var(--text-primary)" : "#ef4444",
                                fontWeight: 600,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {userDestGasFormatted}
                            </span>
                            {!isUserDestGasSufficient && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>
                                (Low Gas)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* 4. You'll Receive (Prominent & Clean Big Font) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                paddingTop: 8,
                marginTop: 2,
                borderTop: "1px solid var(--border)",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ color: "var(--text-primary)", fontWeight: 600, whiteSpace: "nowrap" }} className="text-[12.5px] sm:text-[13px]">
                <span className="hidden sm:inline">
                  {destConfig ? `You'll receive on ${destConfig.shortName || destConfig.name}` : "You'll receive"}
                </span>
                <span className="sm:hidden">
                  {destConfig ? `Receive on ${destConfig.domainId === 1 ? "Avax" : (destConfig.shortName || destConfig.name)}` : "You'll receive"}
                </span>
              </span>
              <span
                style={{
                  color: "var(--text-primary)",
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.01em",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
                className="text-[15px] sm:text-[16px]"
              >
                {parsedAmount > 0 && receiveAmount > 0
                  ? `${receiveAmount.toFixed(4)} USDC`
                  : "0.0000 USDC"}
              </span>
            </div>

            {/* Manual Claim Toggle (Active in Bridge / Deposit mode) */}
            {activeMode === "deposit" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  paddingTop: 8,
                  marginTop: 2,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>
                    Manual Claim (Self-Mint)
                  </span>
                  <span style={{ color: "var(--text-muted)" }} className="text-[10.5px] sm:text-[11px] whitespace-nowrap truncate max-w-[210px] sm:max-w-none">
                    {!isSponsoredAvailable
                      ? (isManualClaim ? "0.5% fee discount (pay own gas)" : "Relayer gas low · Required")
                      : isSponsoredDeficit
                      ? (isManualClaim ? "0.5% fee discount (pay own gas)" : "Gas exceeds 1% fee · Required")
                      : isManualClaim
                      ? "0.5% fee discount (pay own gas)"
                      : "Auto-sponsored gas (1% fee)"}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isTransferLocked}
                  onClick={() => {
                    if (isTransferLocked) return;
                    setIsManualClaim(!isManualClaim);
                  }}
                  title={
                    isTransferLocked
                      ? "Manual claim setting is locked while transfer is executing"
                      : "Toggle Manual Claim (Self-Mint)"
                  }
                  style={{
                    width: 38,
                    height: 22,
                    borderRadius: 999,
                    border: "none",
                    backgroundColor: isManualClaim ? "#10b981" : "#A6ACB5",
                    transition: "background-color 0.2s ease",
                    padding: 2,
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                    position: "relative",
                    cursor: isTransferLocked ? "not-allowed" : "pointer",
                    opacity: isTransferLocked ? 0.6 : 1,
                  }}
                  className={!isManualClaim ? "dark:!bg-zinc-600" : ""}
                >
                  <motion.div
                    animate={{ x: isManualClaim ? 16 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#ffffff",
                      boxShadow: "0 1.5px 3.5px rgba(0, 0, 0, 0.18), 0 0.5px 1.5px rgba(0, 0, 0, 0.1)",
                    }}
                  />
                </button>
              </div>
            )}
          </div>

          {/* Main Action Button using SlideButton */}
          {!isConnected ? (
            <button
              type="button"
              onClick={() => openConnectModal?.()}
              style={{
                width: "100%",
                padding: "15px",
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              className="gateway-action-btn active:scale-[0.99]"
            >
              <span>Connect Wallet</span>
            </button>
          ) : isDepositPreFlight && activeMode === "deposit" && sourceConfig && currentChainId !== sourceConfig.chainId ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await handleSwitchNetwork(sourceConfig);
                } catch (e) {
                  console.error("Switch chain error:", e);
                }
              }}
              style={{
                width: "100%",
                padding: "15px",
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              className="gateway-action-btn active:scale-[0.99]"
            >
              <RefreshCw size={15} />
              <span style={{ whiteSpace: "nowrap" }}>Switch to {sourceConfig.shortName || sourceConfig.name}</span>
            </button>
          ) : isTransferLocked && isManualClaim && execution.step === 5 && destConfig && currentChainId !== destConfig.chainId ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await handleSwitchNetwork(destConfig);
                } catch (e) {
                  console.error("Switch chain error:", e);
                }
              }}
              style={{
                width: "100%",
                padding: "15px",
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              className="gateway-action-btn active:scale-[0.99]"
            >
              <RefreshCw size={15} />
              <span style={{ whiteSpace: "nowrap" }}>Switch to {destConfig.shortName || destConfig.name} to Mint</span>
            </button>
          ) : (
            <div style={{ width: "100%" }}>
              {/* Clean, centered notice row directly above Slide Button */}
              {activeMode === "deposit" && !isManualClaim && parsedAmount > 0 && (isSponsoredDeficit || !isSponsoredAvailable) && (
                <div
                  onClick={() => setIsManualClaim(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "2px 4px",
                    width: "100%",
                    marginBottom: 8,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    fontSize: 11.5,
                  }}
                  className="group active:opacity-80"
                  title="Click to enable Manual Claim"
                >
                  <span
                    style={{
                      color: "#ef4444",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    className="text-red-500 dark:text-red-400"
                  >
                    {isSponsoredDeficit ? "Gas exceeds 1% fee" : "Relayer gas low"}
                  </span>

                  <span style={{ color: "var(--text-muted)", opacity: 0.5, flexShrink: 0 }}>·</span>

                  <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                    <span
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                      className="group-hover:underline underline-offset-2"
                    >
                      Enable Manual Claim
                    </span>
                    <ArrowRight size={11} className="text-[var(--text-primary)] transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              )}

              {/* Reminder when Manual Claim is ON but Auto-Sponsorship is available & profitable */}
              {activeMode === "deposit" && isManualClaim && parsedAmount > 0 && !isSponsoredDeficit && isSponsoredAvailable && (
                <div
                  onClick={() => setIsManualClaim(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "2px 4px",
                    width: "100%",
                    marginBottom: 8,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    fontSize: 11.5,
                  }}
                  className="group active:opacity-80"
                  title="Click to turn off Manual Claim for auto-sponsored gas"
                >
                  <span
                    style={{
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Turn off manual claim
                  </span>

                  <span style={{ color: "var(--text-muted)", opacity: 0.5, flexShrink: 0 }}>·</span>

                  <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                    <span
                      style={{
                        color: "#0284c7",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                      className="group-hover:underline underline-offset-2 dark:text-[#38bdf8]"
                    >
                      for smooth process
                    </span>
                    <ArrowRight size={11} className="text-[#0284c7] dark:text-[#38bdf8] transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              )}

              <SlideButton
                disabled={
                  resumingTransfer
                    ? false
                    : (sourceDomain === undefined ||
                       destDomain === undefined ||
                       parsedAmount <= 0 ||
                       isSameChainRoute ||
                       isBelowMinFee ||
                       isSourceBalanceBelowMinFee ||
                       (!isSponsoredAvailable && !isManualClaim) ||
                       (isSponsoredDeficit && !isManualClaim) ||
                       (isManualClaim && !isUserDestGasSufficient) ||
                       (activeMode === "claim"
                         ? (totalUnifiedBalance < parsedAmount || totalUnifiedBalance <= 0 || parsedAmount > (unifiedSourceBalance + 0.00001))
                         : isInsufficientSourceBalance))
                }
                loading={
                  execution.isOpen &&
                  execution.step5Status !== "success" &&
                  (
                    execution.step1Status === "in_progress" ||
                    (execution.step2Status === "in_progress" && totalUnifiedBalance < parsedAmount && unifiedSourceBalance < parsedAmount) ||
                    execution.step3Status === "in_progress" ||
                    execution.step4Status === "in_progress" ||
                    execution.step5Status === "in_progress"
                  )
                }
                text={
                  resumingTransfer
                    ? execution.step === 2 && execution.step2Status === "in_progress"
                      ? (totalUnifiedBalance >= parsedAmount || unifiedSourceBalance >= parsedAmount)
                        ? "Deposit Confirmed · Slide to Sign & Mint"
                        : "Deposit Confirmed · Indexing (Wait 1 - 20 mins)..."
                      : execution.step === 5
                      ? isManualClaim
                        ? "Slide to Self-Mint"
                        : "Slide to Mint"
                      : "Slide to Sign & Mint"
                    : sourceDomain === undefined && destDomain === undefined
                    ? "Select Chains"
                    : sourceDomain === undefined
                    ? "Select Source Chain"
                    : destDomain === undefined
                    ? "Select Destination Chain"
                    : isSameChainRoute
                    ? "Select different destination chain"
                    : parsedAmount <= 0
                    ? isSourceBalanceBelowMinFee
                      ? `Balance too low · Min ${minRequiredFee} USDC on ${sourceConfig?.shortName || sourceConfig?.name}`
                      : "Enter an amount"
                    : isSourceBalanceBelowMinFee
                    ? `Balance too low · Min ${minRequiredFee} USDC on ${sourceConfig?.shortName || sourceConfig?.name}`
                    : isBelowMinFee
                    ? (sourceDomain === 0 ? "Amount too low to cover Ethereum L1 Fee (Min 1.15 USDC)" : "Entered amount too low to cover fees")
                    : !isSponsoredAvailable && !isManualClaim
                    ? "Please Enable Manual Claim"
                    : isSponsoredDeficit && !isManualClaim
                    ? "Please Enable Manual Claim"
                    : isManualClaim && !isUserDestGasSufficient
                    ? isSponsoredAvailable && !isSponsoredDeficit
                      ? "Low Gas · Switch to Sponsored"
                      : `Insufficient Gas on ${destConfig?.shortName || destConfig?.name || "Destination"}`
                    : activeMode === "claim"
                    ? totalUnifiedBalance <= 0
                      ? "No Gateway Balance"
                      : totalUnifiedBalance < parsedAmount
                      ? "Insufficient Gateway Balance"
                      : parsedAmount > (unifiedSourceBalance + 0.00001)
                      ? `Insufficient on ${sourceConfig?.shortName || sourceConfig?.name || "Source"}`
                      : `Slide to Mint ${parseFloat((receiveAmount || parsedAmount).toFixed(4))} USDC on ${destConfig?.shortName || destConfig?.name || "Destination"}`
                    : execution.isOpen && execution.step === 2 && (totalUnifiedBalance >= parsedAmount || unifiedSourceBalance >= parsedAmount)
                    ? "Slide to Sign & Mint"
                    : isInsufficientSourceBalance
                    ? isArcGasReserveShortage
                      ? "Leave min 0.05 USDC for Gas"
                      : "Insufficient USDC"
                    : isManualClaim
                    ? "Slide to Self-Mint"
                    : "Slide to Transfer"
                }
                loadingText={
                  execution.step === 2 && execution.step2Status === "in_progress"
                    ? "Indexing Deposit (Wait 1 - 20 mins)..."
                    : execution.step === 3 && execution.step3Status === "in_progress"
                    ? "Waiting for Signature..."
                    : execution.step === 4 && execution.step4Status === "in_progress"
                    ? "Verifying Attestation..."
                    : execution.step === 5 && execution.step5Status === "in_progress"
                    ? isManualClaim
                      ? "Confirm Mint in Wallet..."
                      : `Minting on ${destConfig?.shortName || destConfig?.name || "Destination"}...`
                    : activeMode === "claim"
                    ? "Claiming USDC..."
                    : "Executing Transfer..."
                }
                onComplete={() => {
                  if (activeMode === "claim") {
                    handleTransferAndMint();
                  } else if (resumingTransfer && execution.isOpen && execution.step >= 2) {
                    handleTransferAndMint();
                  } else {
                    handleDepositFlow();
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* ─── Circle Gateway & ArcFun Protocol Info Modal ─── */}
        {isRouteInfoOpen && (
          <div
            className="lf-modal-backdrop"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
            onClick={() => setIsRouteInfoOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="lf-card transform sm:translate-x-[38px]"
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 24,
                padding: "20px 20px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                boxShadow: "var(--shadow-card)",
              }}
            >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Info size={16} className="text-[var(--text-primary)]" />
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                      Direct Circle Gateway Route
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsRouteInfoOpen(false)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: 4,
                    }}
                    className="hover:text-[var(--text-primary)]"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* 100% Non-Custodial / Zero Access Notice */}
                <div
                  style={{
                    padding: "11px 13px",
                    borderRadius: 14,
                    background: "var(--surface-soft)",
                    border: "1px solid var(--border)",
                    fontSize: 11.5,
                    lineHeight: 1.5,
                    color: "var(--text-secondary)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 12 }}>
                    100% Non-Custodial · Zero ArcFun Access
                  </div>
                  <div>
                    You are depositing <strong>directly into Circle&apos;s official Gateway smart contracts</strong>. Your funds are <strong>never deposited into ArcFun</strong>.
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    ArcFun has <strong>0 access and 0 custody</strong> over your assets. Only your private wallet and Circle&apos;s decentralized validators can authorize minting via EIP-712 cryptographic signatures.
                  </div>
                </div>

                {/* 3-Step Simple Flow */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                    background: "var(--surface-soft)",
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    padding: "12px 14px",
                  }}
                >
                  {/* Step 1 */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginTop: 1 }}>1.</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                        Direct Deposit to Circle
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, lineHeight: 1.4 }}>
                        USDC goes straight into Circle&apos;s verified GatewayWallet contract on the source chain.
                      </div>
                    </div>
                  </div>

                  <div style={{ height: 1, background: "var(--border)", opacity: 0.6 }} />

                  {/* Step 2 */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginTop: 1 }}>2.</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                        Circle Validator Attestation
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, lineHeight: 1.4 }}>
                        Circle nodes index the deposit after block finality (~1-10 mins) with 0% slippage.
                      </div>
                    </div>
                  </div>

                  <div style={{ height: 1, background: "var(--border)", opacity: 0.6 }} />

                  {/* Step 3 */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginTop: 1 }}>3.</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                        Self-Custody Mint on Arc
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, lineHeight: 1.4 }}>
                        Canonical USDC is minted directly into your wallet — safe, decentralized, and zero third-party risk.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <button
                  type="button"
                  onClick={() => setIsRouteInfoOpen(false)}
                  style={{
                    width: "100%",
                    padding: "11px",
                    borderRadius: 999,
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  className="gateway-action-btn active:scale-[0.99]"
                >
                  Got It
                </button>
              </div>
          </div>
        )}

        {/* ─── Seamless On-Chain Progress Tracker ─── */}
        {execution.isOpen && (
          <div
            ref={progressCardRef}
            className="lf-card"
            style={{
              width: "100%",
              padding: "18px 20px",
              background: "var(--surface-glass)",
              border: "1px solid var(--border)",
              borderRadius: 22,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: "0 8px 30px rgba(0, 0, 0, 0.04)",
              scrollMarginBottom: 80,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, whiteSpace: "nowrap", flexWrap: "nowrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                  <span className="hidden sm:inline">Gateway Transfer Status</span>
                  <span className="sm:hidden">Transfer Status</span>
                </span>
                {(() => {
                  const isCompleted = execution.step5Status === "success";
                  const isReadyToMint =
                    !isCompleted &&
                    execution.step === 5 &&
                    execution.step5Status !== "in_progress" &&
                    execution.step5Status !== "error" &&
                    execution.step1Status === "success" &&
                    execution.step2Status === "success" &&
                    execution.step3Status === "success" &&
                    execution.step4Status === "success";

                  const isActualError =
                    execution.step1Status === "error" ||
                    execution.step2Status === "error" ||
                    execution.step3Status === "error" ||
                    execution.step4Status === "error" ||
                    execution.step5Status === "error" ||
                    (Boolean(execution.errorMessage) && !isReadyToMint && !isCompleted && execution.step5Status !== "in_progress");

                  if (isCompleted) {
                    return (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 650,
                          color: "#10b981",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                        className="dark:text-emerald-400"
                      >
                        <Check size={11} strokeWidth={2.8} />
                        <span>Completed</span>
                      </span>
                    );
                  }

                  if (isReadyToMint) {
                    return (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          fontSize: 11,
                          fontWeight: 650,
                          color: "#3b82f6",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                        className="dark:text-blue-400"
                      >
                        <span>Ready to Mint</span>
                      </span>
                    );
                  }

                  if (isActualError) {
                    const isCancelled = execution.errorMessage?.toLowerCase().includes("cancel");
                    return (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 650,
                          color: isCancelled ? "var(--text-muted)" : "#ef4444",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                        className={isCancelled ? "" : "dark:text-rose-400"}
                      >
                        {isCancelled ? (
                          <>
                            <X size={11} strokeWidth={2.5} />
                            <span>Cancelled</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={11} strokeWidth={2.5} />
                            <span>Failed</span>
                          </>
                        )}
                      </span>
                    );
                  }

                  return (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      <Loader2 size={10} className="animate-spin text-[var(--text-primary)]" />
                      <span>In Progress</span>
                    </span>
                  );
                })()}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {execution.step5Status === "success" || execution.step1Status === "error" || execution.step5Status === "error" || (execution.errorMessage && !execution.sourceTxHash) ? (
                  <button
                    type="button"
                    onClick={resetExecution}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 9999,
                      padding: "3px 9px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    className="hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
                  >
                    Clear
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDismissResumption}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 9999,
                      padding: "3px 9px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      whiteSpace: "nowrap",
                    }}
                    className="hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
                    title="Start another transfer while this one completes in the background"
                  >
                    <Plus size={11} strokeWidth={2.5} />
                    <span>New Transfer</span>
                  </button>
                )}
              </div>
            </div>

            {/* Stepper */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Step 1: Deposit */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, whiteSpace: "nowrap" }}>
                {execution.step1Status === "success" ? (
                  <CheckCircle2 size={16} color="#10b981" />
                ) : execution.step1Status === "in_progress" ? (
                  <Loader2 size={16} className="animate-spin text-[var(--text-primary)]" />
                ) : (
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--border)" }} />
                )}
                <span style={{ color: execution.step1Status === "success" ? "var(--text-primary)" : "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                  1. Deposit to Gateway Wallet
                </span>
              </div>

              {/* Step 2: Indexing */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12.5, whiteSpace: "nowrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {execution.step2Status === "success" ? (
                    <CheckCircle2 size={16} color="#10b981" />
                  ) : execution.step2Status === "in_progress" ? (
                    <Loader2 size={16} className="animate-spin text-[var(--text-primary)]" />
                  ) : (
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--border)" }} />
                  )}
                  <span style={{ color: execution.step2Status === "success" ? "var(--text-primary)" : "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span>2. Circle Gateway Indexing</span>
                    <span style={{ fontSize: 10.5, fontWeight: 500, color: "var(--text-muted)" }} className="opacity-80">
                      (Wait 1 - 20 mins)
                    </span>
                  </span>
                </div>
                {execution.step === 2 && execution.step2Status === "in_progress" && (totalUnifiedBalance >= parsedAmount || unifiedSourceBalance >= parsedAmount) && (
                  <button
                    onClick={() => {
                      setExecution((prev) => ({
                        ...prev,
                        step: 3,
                        step1Status: "success",
                        step2Status: "success",
                        step3Status: "in_progress",
                      }));
                      handleTransferAndMint();
                    }}
                    style={{
                      background: "var(--text-primary)",
                      color: "var(--surface)",
                      border: "none",
                      borderRadius: 9999,
                      padding: "4px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      whiteSpace: "nowrap",
                    }}
                    className="hover:opacity-90 active:scale-95"
                  >
                    <span>Proceed to Sign</span>
                    <ArrowRight size={11} />
                  </button>
                )}
              </div>

              {/* Step 3: EIP-712 Sign */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12.5, whiteSpace: "nowrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {execution.step3Status === "success" ? (
                    <CheckCircle2 size={16} color="#10b981" />
                  ) : execution.step3Status === "in_progress" ? (
                    <Loader2 size={16} className="animate-spin text-[var(--text-primary)]" />
                  ) : execution.step3Status === "error" ? (
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
                    </div>
                  ) : (
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--border)" }} />
                  )}
                  <span style={{ color: execution.step3Status === "success" ? "var(--text-primary)" : "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                    <span className="hidden sm:inline">3. EIP-712 BurnIntent Signing (Gasless)</span>
                    <span className="sm:hidden">3. EIP-712 Signing (Gasless)</span>
                  </span>
                </div>
                {(execution.step3Status === "in_progress" || execution.step3Status === "error" || (execution.step === 3 && execution.step3Status !== "success")) && (
                  <button
                    type="button"
                    onClick={() => handleTransferAndMint()}
                    style={{
                      background: "var(--surface-soft, rgba(0, 0, 0, 0.05))",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                      borderRadius: 9999,
                      padding: "3.5px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap",
                    }}
                    className="hover:bg-[var(--border)] active:scale-95"
                  >
                    {execution.step3Status === "in_progress" ? (
                      <>
                        <Loader2 size={11} className="animate-spin text-[var(--text-primary)]" />
                        <span>Sign</span>
                      </>
                    ) : execution.step3Status === "error" ? (
                      <>
                        <RefreshCw size={11} />
                        <span>Sign</span>
                      </>
                    ) : (
                      <span>Sign</span>
                    )}
                  </button>
                )}
              </div>

              {/* Step 4: Attestation */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, whiteSpace: "nowrap" }}>
                {execution.step4Status === "success" ? (
                  <CheckCircle2 size={16} color="#10b981" />
                ) : execution.step4Status === "in_progress" ? (
                  <Loader2 size={16} className="animate-spin text-[var(--text-primary)]" />
                ) : (
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--border)" }} />
                )}
                <span style={{ color: execution.step4Status === "success" ? "var(--text-primary)" : "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                  <span className="hidden sm:inline">4. Circle Attestation Verification</span>
                  <span className="sm:hidden">4. Attestation Verification</span>
                </span>
              </div>

              {/* Step 5: Destination Mint */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12.5, whiteSpace: "nowrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {execution.step5Status === "success" ? (
                    <CheckCircle2 size={16} color="#10b981" />
                  ) : execution.step5Status === "in_progress" ? (
                    <Loader2 size={16} className="animate-spin text-[var(--text-primary)]" />
                  ) : execution.step5Status === "error" ? (
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
                    </div>
                  ) : (
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--border)" }} />
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                    <span style={{ color: execution.step5Status === "success" ? "var(--text-primary)" : "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                      5. Destination Mint
                    </span>
                    {destConfig && (
                      <img
                        src={destConfig.icon}
                        alt={destConfig.name}
                        style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }}
                        onError={(e) => {
                          e.currentTarget.src = "/globe.svg";
                        }}
                      />
                    )}
                    <span style={{ color: "var(--text-muted)", fontSize: 11.5, whiteSpace: "nowrap" }}>
                      {isManualClaim ? "(Self-Mint)" : "(Gas Sponsored)"}
                    </span>
                  </div>
                </div>

                {/* Direct Mint Button next to Step 5 whenever Step 5 is reached or pending mint is ready */}
                {execution.step === 5 && execution.step5Status !== "success" && (cachedAttestation || resumingTransfer?.attestationPayload) && (() => {
                  const targetDomain = resumingTransfer?.destDomain ?? destDomain;
                  const effectiveModalDest = targetDomain !== null && targetDomain !== undefined ? getGatewayNetworkByDomain(targetDomain) : destConfig;
                  if (!effectiveModalDest) return null;
                  const isWrongDestNetwork = isManualClaim && currentChainId !== effectiveModalDest.chainId;

                  if (isWrongDestNetwork) {
                    return (
                      <button
                        type="button"
                        onClick={() => handleSwitchNetwork(effectiveModalDest)}
                        style={{
                          background: "var(--surface-soft, rgba(0, 0, 0, 0.05))",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border)",
                          borderRadius: 9999,
                          padding: "3.5px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          whiteSpace: "nowrap",
                          transition: "all 0.15s ease",
                        }}
                        className="hover:bg-[var(--border)] active:scale-95"
                      >
                        <ArrowUpDown size={11} />
                        <span>Switch to {effectiveModalDest.shortName || effectiveModalDest.name}</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (isManualClaim) {
                          handleManualMint();
                        } else if (resumingTransfer) {
                          handleExecutePendingMint(resumingTransfer);
                        } else if (cachedAttestation) {
                          const itemToMint: PendingGatewayMint = {
                            id: execution.transferId || cachedAttestation.transferId || `mint_${Date.now()}`,
                            sourceDomain: sourceDomain !== null ? sourceDomain : 26,
                            destDomain: destDomain !== null ? destDomain : 6,
                            amount: amountInput || "0",
                            receiveAmount: amountInput || "0",
                            status: "ready_to_mint",
                            isManualClaim: false,
                            platformFeePercent: 0.01,
                            attestationPayload: cachedAttestation.attestationPayload,
                            operatorSignature: cachedAttestation.operatorSignature,
                            createdAt: Date.now(),
                          };
                          handleExecutePendingMint(itemToMint);
                        } else {
                          handleManualMint();
                        }
                      }}
                      style={{
                        background: "var(--surface-soft, rgba(0, 0, 0, 0.05))",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border)",
                        borderRadius: 9999,
                        padding: "3.5px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        whiteSpace: "nowrap",
                        transition: "all 0.15s ease",
                      }}
                      className="hover:bg-[var(--border)] active:scale-95"
                    >
                      {execution.step5Status === "in_progress" ? (
                        <>
                          <Loader2 size={11} className="animate-spin text-[var(--text-primary)]" />
                          <span>Minting...</span>
                        </>
                      ) : execution.step5Status === "error" ? (
                        <>
                          <RefreshCw size={11} />
                          <span>Mint</span>
                        </>
                      ) : (
                        <span>Mint</span>
                      )}
                    </button>
                  );
                })()}
              </div>
            </div>



            {/* Informational Guidance (Deposit confirmed / Ready to Mint / Indexing) */}
            {execution.infoMessage && !execution.errorMessage && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  fontSize: 11.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Info size={14} style={{ color: "#3b82f6", flexShrink: 0 }} />
                  <span>{execution.infoMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setExecution((prev) => ({ ...prev, infoMessage: undefined }))}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "2px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    flexShrink: 0,
                  }}
                  className="hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 active:scale-90"
                  title="Dismiss notice"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Actual Error Banner */}
            {execution.errorMessage && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  fontSize: 11.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
                  <span>{execution.errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setExecution((prev) => ({ ...prev, errorMessage: undefined }))}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "2px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    flexShrink: 0,
                  }}
                  className="hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 active:scale-90"
                  title="Dismiss error"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mobile safe area spacing below cards so bottom floating navigation bar never collides */}
        <div style={{ height: 85, width: "100%" }} className="sm:hidden pointer-events-none" />
      </div>
    </div>
  );
}
