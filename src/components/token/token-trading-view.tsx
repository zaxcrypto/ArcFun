"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useChainId, useSwitchChain, useWriteContract } from "wagmi";
import { parseUnits, formatUnits, createPublicClient, http, isAddress, decodeEventLog } from "viem";
import { sepolia } from "viem/chains";
import {
  ARCFUN_CURVE_FACTORY_ABI,
  ARCFUN_BONDING_CURVE_ABI,
  ERC20_ABI,
  ARCFUN_CURVE_FACTORY_ADDRESSES,
  SEPOLIA_WETH_ADDRESS,
  WETH_ABI,
} from "@/config/contracts";
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  AlertCircle,
  TrendingUp,
  ArrowUpDown,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Info,
} from "lucide-react";
import { MemeTokenChart } from "@/components/token/meme-token-chart";
import { SlideButton } from "@/components/slide-button";
import { useTheme } from "next-themes";

interface TokenTradingViewProps {
  tokenAddress: string;
  sidebarCollapsed?: boolean;
}

interface TokenMetadata {
  id?: string;
  name: string;
  symbol: string;
  description?: string;
  logoUrl?: string;
  twitterUrl?: string;
  telegramUrl?: string;
  websiteUrl?: string;
  creatorWallet?: string;
  pairedStock?: {
    id: string;
    symbol: string;
    name: string;
    contractAddress: string;
    caip10?: string;
  };
}

interface OnChainCurveState {
  curveAddress: string;
  isRegistered: boolean;
  state: number; // 0 = ACTIVE, 1 = GRADUATED
  spotPrice: bigint; // scaled by 1e18
  curveProgressBps: bigint; // 0 to 10,000
  realQuoteReserve: bigint;
  realTokenSold: bigint;
  remainingSaleTokens: bigint;
  dexTokens: bigint;
  quoteTokenAddress: string;
  quoteTokenSymbol: string;
  quoteTokenDecimals: number;
}

const SEPOLIA_CHAIN_ID = 11155111;
const FACTORY_ADDRESS = ARCFUN_CURVE_FACTORY_ADDRESSES[11155111] || "0x31F11b7456b2e15F91642B75dAdC0e69c5AAFAFa";
const DEFAULT_NVDA_ADDRESS = "0x4B47153A241b9d22ae37c2aAEe7A6519fF2Dbfc6";
const GRADUATION_TARGET_NVDA = 41.6;

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function TokenTradingView({ tokenAddress, sidebarCollapsed = false }: TokenTradingViewProps) {
  const router = useRouter();
  const { address: userAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  const isWrongNetwork = isConnected && chainId !== SEPOLIA_CHAIN_ID;

interface TradeActivity {
  id: string;
  type: "buy" | "sell";
  wallet: string;
  quoteAmount: bigint;
  tokenAmount: bigint;
  spotPrice: bigint;
  timestamp: number;
  txHash: string;
}

  // ── State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Metadata & On-chain State
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [curveState, setCurveState] = useState<OnChainCurveState | null>(null);

  // Activity Feed State
  const [activities, setActivities] = useState<TradeActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activityTab, setActivityTab] = useState<"activity" | "holders" | "details">("activity");
  const [activityFilter, setActivityFilter] = useState<"all" | "mine">("all");

  // User Balances & Allowances
  const [userQuoteBalance, setUserQuoteBalance] = useState<bigint>(0n);
  const [userMemeBalance, setUserMemeBalance] = useState<bigint>(0n);
  const [quoteAllowance, setQuoteAllowance] = useState<bigint>(0n);
  const [memeAllowance, setMemeAllowance] = useState<bigint>(0n);

  // Trade Widget State
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
  const [orderMode, setOrderMode] = useState<"market" | "limit">("market");
  const [inputAmount, setInputAmount] = useState<string>("");
  const [slippageBps, setSlippageBps] = useState<number>(100); // 1.00% default
  const [showSlippageModal, setShowSlippageModal] = useState(false);

  // Quote Simulation State
  const [simulatedOutput, setSimulatedOutput] = useState<bigint>(0n);
  const [simulatedPostSpotPrice, setSimulatedPostSpotPrice] = useState<bigint>(0n);
  const [simulatingQuote, setSimulatingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Transaction State
  const [isApproving, setIsApproving] = useState(false);
  const [isTrading, setIsTrading] = useState(false);
  const [txSuccessHash, setTxSuccessHash] = useState<string | null>(null);
  const [tradeActionError, setTradeActionError] = useState<string | null>(null);

  const publicClient = useMemo(() => {
    return createPublicClient({
      chain: sepolia,
      transport: http(process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"),
    });
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── 1. Fetch On-Chain State & Metadata ────────────────────────────────────
  const loadTokenState = useCallback(async (isSilent = false) => {
    if (!isAddress(tokenAddress)) {
      setError("Invalid Ethereum token contract address.");
      setLoading(false);
      return;
    }

    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      // A. Query Curve Factory for dedicated curve address
      const curveAddr = await publicClient.readContract({
        address: FACTORY_ADDRESS as `0x${string}`,
        abi: ARCFUN_CURVE_FACTORY_ABI,
        functionName: "getCurve",
        args: [tokenAddress as `0x${string}`],
      }) as string;

      if (!curveAddr || curveAddr === "0x0000000000000000000000000000000000000000") {
        setError("This token is not registered on ArcFun Curve Factory.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // B. Fetch On-Chain Token Details
      const [tokenName, tokenSymbol] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "name",
        }) as Promise<string>,
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "symbol",
        }) as Promise<string>,
      ]);

      // C. Fetch On-Chain Curve State & Dynamic Quote Asset
      const [
        spotPrice,
        curveProgressBps,
        realReserves,
        stateNum,
        realQuote,
        realSold,
        onChainQuoteTokenAddr,
      ] = await Promise.all([
        (publicClient.readContract({
          address: curveAddr as `0x${string}`,
          abi: ARCFUN_BONDING_CURVE_ABI,
          functionName: "getCurrentPrice",
        }) as unknown) as Promise<bigint>,
        (publicClient.readContract({
          address: curveAddr as `0x${string}`,
          abi: ARCFUN_BONDING_CURVE_ABI,
          functionName: "getCurveProgress",
        }) as unknown) as Promise<bigint>,
        (publicClient.readContract({
          address: curveAddr as `0x${string}`,
          abi: ARCFUN_BONDING_CURVE_ABI,
          functionName: "getRealReserves",
        }) as unknown) as Promise<readonly [bigint, bigint, bigint]>,
        (publicClient.readContract({
          address: curveAddr as `0x${string}`,
          abi: ARCFUN_BONDING_CURVE_ABI,
          functionName: "state",
        }) as unknown) as Promise<number>,
        (publicClient.readContract({
          address: curveAddr as `0x${string}`,
          abi: ARCFUN_BONDING_CURVE_ABI,
          functionName: "realQuoteReserve",
        }) as unknown) as Promise<bigint>,
        (publicClient.readContract({
          address: curveAddr as `0x${string}`,
          abi: ARCFUN_BONDING_CURVE_ABI,
          functionName: "realTokenSold",
        }) as unknown) as Promise<bigint>,
        (publicClient.readContract({
          address: curveAddr as `0x${string}`,
          abi: ARCFUN_BONDING_CURVE_ABI,
          functionName: "quoteToken",
        }).catch(() => DEFAULT_NVDA_ADDRESS) as unknown) as Promise<string>,
      ]);

      const resolvedQuoteAddress = (onChainQuoteTokenAddr && isAddress(onChainQuoteTokenAddr))
        ? onChainQuoteTokenAddr
        : DEFAULT_NVDA_ADDRESS;

      let resolvedQuoteSymbol = "NVDA";
      let resolvedQuoteDecimals = 18;
      try {
        const [qSym, qDec] = await Promise.all([
          publicClient.readContract({
            address: resolvedQuoteAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "symbol",
          }).catch(() => "NVDA") as Promise<string>,
          publicClient.readContract({
            address: resolvedQuoteAddress as `0x${string}`,
            abi: [{ inputs: [], name: "decimals", outputs: [{ type: "uint8" }], stateMutability: "view", type: "function" }],
            functionName: "decimals",
          }).catch(() => 18) as Promise<number>,
        ]);
        const isWethToken = resolvedQuoteAddress.toLowerCase() === SEPOLIA_WETH_ADDRESS.toLowerCase() || (qSym || "").toUpperCase() === "WETH";
        resolvedQuoteSymbol = isWethToken ? "ETH" : (qSym || "NVDA");
        resolvedQuoteDecimals = Number(qDec) || 18;
      } catch {
        resolvedQuoteSymbol = "ETH";
        resolvedQuoteDecimals = 18;
      }

      const onChainData: OnChainCurveState = {
        curveAddress: curveAddr,
        isRegistered: true,
        state: Number(stateNum),
        spotPrice,
        curveProgressBps,
        realQuoteReserve: realQuote || realReserves[0],
        realTokenSold: realSold || realReserves[1],
        remainingSaleTokens: realReserves[2],
        dexTokens: parseUnits("200000000", 18),
        quoteTokenAddress: resolvedQuoteAddress,
        quoteTokenSymbol: resolvedQuoteSymbol,
        quoteTokenDecimals: resolvedQuoteDecimals,
      };

      setCurveState(onChainData);

      // D. Fetch Metadata from Local API
      try {
        const metaRes = await fetch(`/api/tokens?tokenAddress=${tokenAddress}`);
        if (metaRes.ok) {
          const metaJson = await metaRes.json();
          if (metaJson.token) {
            setMetadata({
              name: metaJson.token.name || tokenName,
              symbol: metaJson.token.symbol || tokenSymbol,
              description: metaJson.token.description,
              logoUrl: metaJson.token.logo_url || metaJson.token.logoUrl,
              twitterUrl: metaJson.token.twitter_url || metaJson.token.twitterUrl,
              telegramUrl: metaJson.token.telegram_url || metaJson.token.telegramUrl,
              websiteUrl: metaJson.token.website_url || metaJson.token.websiteUrl,
              creatorWallet: metaJson.token.creator_wallet || metaJson.token.creatorWallet,
              pairedStock: metaJson.token.pairedStock,
            });
          } else {
            setMetadata({ name: tokenName, symbol: tokenSymbol });
          }
        } else {
          setMetadata({ name: tokenName, symbol: tokenSymbol });
        }
      } catch {
        setMetadata({ name: tokenName, symbol: tokenSymbol });
      }

    } catch (err: any) {
      console.error("Error loading curve state:", err);
      setError(err?.message || "Failed to load on-chain curve state.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [publicClient, tokenAddress]);

  // ── 2. Fetch User Balances & Allowances ────────────────────────────────────
  const loadUserAccountState = useCallback(async () => {
    if (!userAddress || !curveState) return;

    try {
      const isWethToken = curveState.quoteTokenAddress.toLowerCase() === SEPOLIA_WETH_ADDRESS.toLowerCase() || curveState.quoteTokenSymbol.toUpperCase() === "WETH" || curveState.quoteTokenSymbol.toUpperCase() === "ETH";

      const [quoteBal, nativeBal, memeBal, qAllow, mAllow] = await Promise.all([
        publicClient.readContract({
          address: curveState.quoteTokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [userAddress],
        }).catch(() => 0n) as Promise<bigint>,
        isWethToken
          ? publicClient.getBalance({ address: userAddress }).catch(() => 0n)
          : Promise.resolve(0n),
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [userAddress],
        }).catch(() => 0n) as Promise<bigint>,
        publicClient.readContract({
          address: curveState.quoteTokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [userAddress, curveState.curveAddress as `0x${string}`],
        }).catch(() => 0n) as Promise<bigint>,
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [userAddress, curveState.curveAddress as `0x${string}`],
        }).catch(() => 0n) as Promise<bigint>,
      ]);

      const effectiveQuoteBal = isWethToken ? (quoteBal + nativeBal) : quoteBal;
      setUserQuoteBalance(effectiveQuoteBal);
      setUserMemeBalance(memeBal);
      setQuoteAllowance(qAllow);
      setMemeAllowance(mAllow);
    } catch (err) {
      console.error("Error reading user token balances:", err);
    }
  }, [curveState, publicClient, tokenAddress, userAddress]);

  useEffect(() => {
    loadTokenState();
  }, [loadTokenState]);

  useEffect(() => {
    if (curveState && userAddress) {
      loadUserAccountState();
    }
  }, [curveState, userAddress, loadUserAccountState]);

  // ── 3. Fetch Live On-Chain Trade Activities ──────────────────────────────
  const fetchActivities = useCallback(async () => {
    if (!curveState?.curveAddress) return;
    try {
      setLoadingActivities(true);
      const currentBlock = await publicClient.getBlockNumber();
      const CHUNK_SIZE = 15000n; // Optimal 15k block chunk for public RPC providers
      const MAX_CHUNKS = 10n;     // Covers ~150,000 blocks (~22 days)

      let logs: any[] = [];
      let toBlock = currentBlock;

      for (let i = 0n; i < MAX_CHUNKS; i++) {
        const fromBlock = toBlock > CHUNK_SIZE ? toBlock - CHUNK_SIZE : 0n;
        try {
          const chunkLogs = await publicClient.getLogs({
            address: curveState.curveAddress as `0x${string}`,
            fromBlock,
            toBlock,
          });
          logs = [...logs, ...chunkLogs];
          if (fromBlock === 0n) break;
          toBlock = fromBlock - 1n;
        } catch (err) {
          console.warn(`[getLogs] Chunk ${i} query failed from ${fromBlock} to ${toBlock}:`, err);
          break;
        }
      }

      // Deduplicate logs by txHash + logIndex
      const logMap = new Map<string, any>();
      for (const log of logs) {
        logMap.set(`${log.transactionHash}-${log.logIndex}`, log);
      }

      const parsed: TradeActivity[] = [];
      for (const log of Array.from(logMap.values())) {
        try {
          const decoded = decodeEventLog({
            abi: ARCFUN_BONDING_CURVE_ABI,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "Buy") {
            const args = decoded.args as any;
            parsed.push({
              id: `${log.transactionHash}-${log.logIndex}`,
              type: "buy",
              wallet: args.recipient || args.sender,
              quoteAmount: args.quoteIn,
              tokenAmount: args.tokensOut,
              spotPrice: args.spotPrice,
              timestamp: Number(args.timestamp) * 1000 || Date.now(),
              txHash: log.transactionHash,
            });
          } else if (decoded.eventName === "Sell") {
            const args = decoded.args as any;
            parsed.push({
              id: `${log.transactionHash}-${log.logIndex}`,
              type: "sell",
              wallet: args.recipient || args.sender,
              quoteAmount: args.quoteOut,
              tokenAmount: args.tokensIn,
              spotPrice: args.spotPrice,
              timestamp: Number(args.timestamp) * 1000 || Date.now(),
              txHash: log.transactionHash,
            });
          }
        } catch (decodeErr) {
          // ignore non-matching logs
        }
      }

      console.log(`[TradeActivity] Fetched ${logs.length} logs, parsed ${parsed.length} trade activities.`);
      parsed.sort((a, b) => b.timestamp - a.timestamp);
      setActivities(parsed);
    } catch (err) {
      console.error("Error fetching activity logs:", err);
    } finally {
      setLoadingActivities(false);
    }
  }, [curveState?.curveAddress, publicClient]);

  useEffect(() => {
    if (curveState?.curveAddress) {
      fetchActivities();
    }
  }, [curveState?.curveAddress, fetchActivities]);

  // ── 4. Calculate Dynamic Token Holders ──────────────────────────────────────
  const holdersList = useMemo(() => {
    const balances = new Map<string, bigint>();
    let totalSold = 0n;

    // Process trades chronologically (oldest to newest)
    const sortedChronological = [...activities].reverse();
    for (const trade of sortedChronological) {
      const w = trade.wallet.toLowerCase();
      const current = balances.get(w) || 0n;
      if (trade.type === "buy") {
        balances.set(w, current + trade.tokenAmount);
        totalSold += trade.tokenAmount;
      } else if (trade.type === "sell") {
        const updated = current > trade.tokenAmount ? current - trade.tokenAmount : 0n;
        balances.set(w, updated);
        if (totalSold > trade.tokenAmount) totalSold -= trade.tokenAmount;
        else totalSold = 0n;
      }
    }

    const totalSupply = parseUnits("1000000000", 18); // 1 Billion tokens
    const curvePoolBalance = totalSupply > totalSold ? totalSupply - totalSold : 0n;

    const list: { wallet: string; balance: bigint; percentage: number; isBondingCurve?: boolean }[] = [
      {
        wallet: curveState?.curveAddress || "Bonding Curve Pool",
        balance: curvePoolBalance,
        percentage: Number((curvePoolBalance * 10000n) / totalSupply) / 100,
        isBondingCurve: true,
      },
    ];

    for (const [w, bal] of balances.entries()) {
      if (bal > 0n) {
        const pct = Number((bal * 10000n) / totalSupply) / 100;
        list.push({
          wallet: w,
          balance: bal,
          percentage: pct,
        });
      }
    }

    list.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
    return list;
  }, [activities, curveState?.curveAddress]);

  // ── 3. Real-Time Quote Simulation (Debounced) ─────────────────────────────
  useEffect(() => {
    if (!curveState || !inputAmount || isNaN(Number(inputAmount)) || Number(inputAmount) <= 0) {
      setSimulatedOutput(0n);
      setSimulatedPostSpotPrice(0n);
      setQuoteError(null);
      setSimulatingQuote(false);
      return;
    }

    let isCancelled = false;
    setSimulatingQuote(true);
    setQuoteError(null);

    const timer = setTimeout(async () => {
      try {
        const parsedInput = parseUnits(inputAmount, 18);
        if (tradeTab === "buy") {
          const res = (await publicClient.readContract({
            address: curveState.curveAddress as `0x${string}`,
            abi: ARCFUN_BONDING_CURVE_ABI,
            functionName: "getBuyQuote",
            args: [parsedInput],
          })) as unknown as readonly [bigint, bigint, bigint, bigint];
          const tokenOut = res[0];
          const postPrice = res[3];

          if (!isCancelled) {
            setSimulatedOutput(tokenOut);
            setSimulatedPostSpotPrice(postPrice);
            setQuoteError(null);
          }
        } else {
          const res = (await publicClient.readContract({
            address: curveState.curveAddress as `0x${string}`,
            abi: ARCFUN_BONDING_CURVE_ABI,
            functionName: "getSellQuote",
            args: [parsedInput],
          })) as unknown as readonly [bigint, bigint, bigint, bigint];
          const quoteOut = res[0];
          const postPrice = res[3];

          if (!isCancelled) {
            setSimulatedOutput(quoteOut);
            setSimulatedPostSpotPrice(postPrice);
            setQuoteError(null);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error("Quote simulation error:", err);
          setSimulatedOutput(0n);
          setSimulatedPostSpotPrice(0n);
          setQuoteError(err?.shortMessage || "Trade amount exceeds available curve liquidity.");
        }
      } finally {
        if (!isCancelled) setSimulatingQuote(false);
      }
    }, 200);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [curveState, inputAmount, publicClient, tradeTab]);

  // ── 4. Trade Execution (Approve & Swap) ────────────────────────────────────
  const parsedInputBigInt = useMemo(() => {
    if (!inputAmount || isNaN(Number(inputAmount)) || Number(inputAmount) <= 0) return 0n;
    try {
      return parseUnits(inputAmount, 18);
    } catch {
      return 0n;
    }
  }, [inputAmount]);

  const isApproved = useMemo(() => {
    if (parsedInputBigInt === 0n) return true;
    if (tradeTab === "buy") {
      const isWethToken = curveState?.quoteTokenAddress.toLowerCase() === SEPOLIA_WETH_ADDRESS.toLowerCase() || curveState?.quoteTokenSymbol.toUpperCase() === "WETH" || curveState?.quoteTokenSymbol.toUpperCase() === "ETH";
      if (isWethToken) return true; // Auto-wrap & auto-approve handled seamlessly on slide!
      return quoteAllowance >= parsedInputBigInt;
    } else {
      return memeAllowance >= parsedInputBigInt;
    }
  }, [tradeTab, parsedInputBigInt, quoteAllowance, memeAllowance, curveState]);

  const hasInsufficientBalance = useMemo(() => {
    if (parsedInputBigInt === 0n) return false;
    if (tradeTab === "buy") {
      return userQuoteBalance < parsedInputBigInt;
    } else {
      return userMemeBalance < parsedInputBigInt;
    }
  }, [tradeTab, parsedInputBigInt, userQuoteBalance, userMemeBalance]);

  const minReceivedBigInt = useMemo(() => {
    if (simulatedOutput === 0n) return 0n;
    const factor = 10000n - BigInt(slippageBps);
    return (simulatedOutput * factor) / 10000n;
  }, [simulatedOutput, slippageBps]);

  const handleApprove = async () => {
    if (!curveState || !userAddress) return;
    try {
      setIsApproving(true);
      setTradeActionError(null);
      const targetToken = tradeTab === "buy" ? curveState.quoteTokenAddress : tokenAddress;

      const hash = await writeContractAsync({
        address: targetToken as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [curveState.curveAddress as `0x${string}`, parseUnits("1000000000", 18)],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await loadUserAccountState();
    } catch (err: any) {
      console.error("Approval failed:", err);
      setTradeActionError(err?.shortMessage || err?.message || "Token approval rejected or failed.");
    } finally {
      setIsApproving(false);
    }
  };

  const handleTrade = async () => {
    if (!curveState || !userAddress || parsedInputBigInt === 0n || simulatedOutput === 0n) return;
    try {
      setIsTrading(true);
      setTradeActionError(null);
      setTxSuccessHash(null);

      const isWethToken = curveState.quoteTokenAddress.toLowerCase() === SEPOLIA_WETH_ADDRESS.toLowerCase() || curveState.quoteTokenSymbol.toUpperCase() === "WETH" || curveState.quoteTokenSymbol.toUpperCase() === "ETH";

      if (tradeTab === "buy" && isWethToken) {
        // Read actual ERC20 WETH balance
        const actualWethBal = (await publicClient.readContract({
          address: curveState.quoteTokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [userAddress],
        }).catch(() => 0n)) as bigint;

        if (actualWethBal < parsedInputBigInt) {
          const neededWrap = parsedInputBigInt - actualWethBal;
          console.log(`Auto-wrapping ${formatUnits(neededWrap, 18)} Native ETH -> WETH...`);
          const wrapHash = await writeContractAsync({
            address: SEPOLIA_WETH_ADDRESS as `0x${string}`,
            abi: WETH_ABI,
            functionName: "deposit",
            value: neededWrap,
          });
          await publicClient.waitForTransactionReceipt({ hash: wrapHash });
          console.log("Auto-wrap confirmed!");
        }

        // Check allowance after wrap
        const currentAllowance = (await publicClient.readContract({
          address: curveState.quoteTokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [userAddress, curveState.curveAddress as `0x${string}`],
        }).catch(() => 0n)) as bigint;

        if (currentAllowance < parsedInputBigInt) {
          console.log("Approving WETH for curve contract...");
          const appHash = await writeContractAsync({
            address: curveState.quoteTokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [curveState.curveAddress as `0x${string}`, parseUnits("1000000000", 18)],
          });
          await publicClient.waitForTransactionReceipt({ hash: appHash });
          console.log("Approval confirmed!");
        }
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 minutes

      let hash: `0x${string}`;

      if (tradeTab === "buy") {
        hash = await writeContractAsync({
          address: curveState.curveAddress as `0x${string}`,
          abi: ARCFUN_BONDING_CURVE_ABI,
          functionName: "buy",
          args: [parsedInputBigInt, minReceivedBigInt, userAddress as `0x${string}`, deadline],
        });
      } else {
        hash = await writeContractAsync({
          address: curveState.curveAddress as `0x${string}`,
          abi: ARCFUN_BONDING_CURVE_ABI,
          functionName: "sell",
          args: [parsedInputBigInt, minReceivedBigInt, userAddress as `0x${string}`, deadline],
        });
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log("Trade confirmed in block:", receipt.blockNumber);
      setTxSuccessHash(hash);
      setInputAmount("");
      await loadTokenState(true);
      await loadUserAccountState();
      await fetchActivities();
    } catch (err: any) {
      console.error("Trade execution failed:", err);
      setTradeActionError(err?.shortMessage || err?.message || "Trade execution failed. Check slippage or balance.");
    } finally {
      setIsTrading(false);
    }
  };

  // Quick percent slider / buttons
  const handleQuickPercent = (pct: number) => {
    let rawBalance = tradeTab === "buy" ? userQuoteBalance : userMemeBalance;
    if (rawBalance === 0n) {
      setInputAmount("");
      return;
    }

    // On Sell, cap at realTokenSold so input never exceeds circulating supply on-chain
    if (tradeTab === "sell" && curveState?.realTokenSold && rawBalance > curveState.realTokenSold) {
      rawBalance = curveState.realTokenSold;
    }

    const portion = (rawBalance * BigInt(pct)) / 100n;
    const formatted = formatUnits(portion, 18);
    
    // Safely truncate to 4 decimal places without rounding up to avoid exceeding balance/circulating supply
    const parts = formatted.split(".");
    let truncated = parts[0];
    if (parts.length > 1) {
      const dec = parts[1].slice(0, 4);
      if (dec && Number(dec) > 0) {
        truncated += "." + dec;
      }
    }
    setInputAmount(truncated);
  };

  // ── Loading & Error States ────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ width: "100%", minHeight: "65vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <Loader2 size={32} className="animate-spin text-blue-500" />
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Loading token trading data...</span>
      </div>
    );
  }

  if (error || !curveState) {
    return (
      <div style={{ width: "100%", display: "flex", justifyContent: "center", padding: "60px 16px" }}>
        <div style={{ maxWidth: 540, width: "100%", padding: "32px 24px", textAlign: "center", borderRadius: 24, border: "1px solid var(--border-soft)", background: "var(--surface)" }}>
          <AlertCircle size={36} color="#ef4444" style={{ margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Token Not Found</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>{error || "Could not load bonding curve state."}</p>
          <Link
            href="/bridge"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 99,
              background: "var(--text-primary)",
              color: "var(--bg-default)",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} /> Back to Bridge
          </Link>
        </div>
      </div>
    );
  }

  const tokenName = metadata?.name || "Meme Token";
  const tokenSymbol = metadata?.symbol || "MEME";
  const progressPercent = Math.min(100, (Number(curveState.curveProgressBps) / 100));
  const realQuoteFormatted = parseFloat(formatUnits(curveState.realQuoteReserve, 18)).toFixed(3);
  const remainingTokensFormatted = (Number(formatUnits(curveState.remainingSaleTokens, 18)) / 1_000_000).toFixed(1);
  const spotPriceFormatted = formatUnits(curveState.spotPrice, 18);
  const isGraduated = curveState.state === 1 || progressPercent >= 100;

  const fromBalFormatted = tradeTab === "buy" ? formatUnits(userQuoteBalance, 18) : formatUnits(userMemeBalance, 18);
  const toBalFormatted = tradeTab === "buy" ? formatUnits(userMemeBalance, 18) : formatUnits(userQuoteBalance, 18);

  return (
    <div
      className="swap-main-content pt-4 md:pt-[10vh] lg:pt-[14vh]"
      style={{
        flex: 1,
        width: "100%",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        position: "relative",
        transition: "padding-left 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        paddingLeft: sidebarCollapsed ? "clamp(24px, 5.5vw, 96px)" : "0px",
      }}
    >
      {/* ── Sub-navigation / Back Button (Top Left) ── */}
      <div
        className="subnav-pill-bar"
        style={{
          width: "100%",
          maxWidth: 424,
          display: "flex",
          justifyContent: "flex-start",
          marginBottom: 20,
          zIndex: 20,
        }}
      >
          <button
          onClick={() => {
            router.push("/bridge");
          }}
          className="subnav-pill-item hover:text-[var(--text-primary)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 99,
            background: "var(--surface)",
            border: "1px solid var(--border-soft)",
            color: "var(--text-muted)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--text-primary)";
            e.currentTarget.style.color = "var(--text-primary)";
            e.currentTarget.style.transform = "translateX(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-soft)";
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.transform = "translateX(0)";
          }}
        >
          <ArrowLeft size={15} />
          <span>Back to Bridge</span>
        </button>
      </div>

      {/* ── DUAL PANEL CONTAINER (Exact Match to Bridge / Swap Dual-Panel) ── */}
      <div className="w-full max-w-[1440px] flex flex-col min-[1150px]:flex-row items-start justify-start gap-8 min-[1150px]:gap-12">

        {/* ── LEFT: GRADUATION PROGRESS & TRADING SWAP CARD ── */}
        <div className="swap-card-wrapper w-full min-[1150px]:w-[424px] max-w-[424px] flex-shrink-0 flex flex-col gap-4">

          {/* ── GRADUATION PROGRESS CARD (Top) ── */}
          <div
            className="swap-main-card p-4 sm:p-5 rounded-[24px] flex flex-col gap-3"
            style={{
              width: "100%",
              background: isDark ? "#0c1017" : "var(--surface, #ffffff)",
              border: isDark ? "1px solid #1d273a" : "1px solid var(--border, #e2e8f0)",
              borderRadius: "24px",
              boxShadow: isDark ? "0 20px 25px -5px rgba(0, 0, 0, 0.5)" : "0 4px 20px rgba(0, 0, 0, 0.05)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Graduation Progress
              </span>
              <span className="text-xs font-black text-[var(--text-primary)]">
                {isGraduated ? "100% (Graduated)" : `${progressPercent.toFixed(2)}%`}
              </span>
            </div>

            {/* Progress Track */}
            <div
              style={{
                width: "100%",
                height: 7,
                borderRadius: 99,
                background: "var(--surface-soft, rgba(255,255,255,0.08))",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  borderRadius: 99,
                  background: isGraduated ? "#10b981" : "#38bdf8",
                  boxShadow: isGraduated ? "none" : "0 0 12px #38bdf8",
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium">
              <span>Reserve: {realQuoteFormatted} / {GRADUATION_TARGET_NVDA} {curveState.quoteTokenSymbol}</span>
              <span>Remaining: {remainingTokensFormatted}M {tokenSymbol}</span>
            </div>
          </div>

          {/* Main Swap Card (Bottom) */}
          <div
            className="swap-main-card relative flex flex-col p-4 sm:p-5 rounded-[24px]"
            style={{
              width: "100%",
              background: isDark ? "#0c1017" : "var(--surface, #ffffff)",
              border: isDark ? "1px solid #1d273a" : "1px solid var(--border, #e2e8f0)",
              borderRadius: "24px",
              boxShadow: isDark ? "0 20px 25px -5px rgba(0, 0, 0, 0.5)" : "0 4px 20px rgba(0, 0, 0, 0.05)",
            }}
          >
            {/* Card Header: Buy / Sell Tabs & Slippage Gear */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-[13px] font-semibold text-[var(--text-muted)]">
                Swap
              </span>

              <div className="flex items-center gap-2">
                {/* Buy / Sell Pill Toggle */}
                <div
                  style={{
                    background: isDark ? "#141b29" : "var(--surface-soft, #f1f5f9)",
                    border: isDark ? "1px solid #202c42" : "1px solid var(--border-soft, #e2e8f0)",
                  }}
                  className="flex items-center p-1 rounded-full"
                >
                  <button
                    onClick={() => { setTradeTab("buy"); setInputAmount(""); }}
                    style={{
                      background: tradeTab === "buy" ? (isDark ? "#ffffff" : "#0f172a") : "transparent",
                      color: tradeTab === "buy" ? (isDark ? "#000000" : "#ffffff") : (isDark ? "#94a3b8" : "#64748b"),
                      boxShadow: tradeTab === "buy" && !isDark ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                    }}
                    className="px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => { setTradeTab("sell"); setInputAmount(""); }}
                    style={{
                      background: tradeTab === "sell" ? (isDark ? "#ffffff" : "#0f172a") : "transparent",
                      color: tradeTab === "sell" ? (isDark ? "#000000" : "#ffffff") : (isDark ? "#94a3b8" : "#64748b"),
                      boxShadow: tradeTab === "sell" && !isDark ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                    }}
                    className="px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
                  >
                    Sell
                  </button>
                </div>

                {/* Slippage Settings Gear Button */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setShowSlippageModal(!showSlippageModal)}
                    title="Slippage settings"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "var(--surface-soft, rgba(255,255,255,0.06))",
                      border: "1px solid var(--border-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      transition: "color 0.15s ease",
                    }}
                    className="hover:text-[var(--text-primary)]"
                  >
                    <SlidersHorizontal size={13} />
                  </button>

                  {showSlippageModal && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        right: 0,
                        width: 190,
                        padding: 12,
                        borderRadius: 16,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                        zIndex: 60,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>Slippage Tolerance</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-primary)" }}>{(slippageBps / 100).toFixed(1)}%</span>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[50, 100, 200, 300].map((bps) => (
                          <button
                            key={bps}
                            onClick={() => { setSlippageBps(bps); setShowSlippageModal(false); }}
                            style={{
                              flex: 1,
                              padding: "5px 0",
                              borderRadius: 8,
                              border: "1px solid var(--border-soft)",
                              background: slippageBps === bps ? "var(--text-primary)" : "transparent",
                              color: slippageBps === bps ? "var(--bg-default)" : "var(--text-primary)",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {(bps / 100).toFixed(1)}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── FROM / PAY INPUT BOX ── */}
            <div className="swap-input-box" style={{ padding: 14, borderRadius: 20, marginBottom: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
                  {tradeTab === "buy" ? "You Pay" : "You Sell"}
                </span>
                <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>
                    Balance: {parseFloat(fromBalFormatted).toFixed(4)}
                  </span>
                  <button
                    onClick={() => handleQuickPercent(100)}
                    style={{ background: "transparent", border: "none", padding: 0, fontSize: 11, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer" }}
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={inputAmount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    setInputAmount(val);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: 32,
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    outline: "none",
                    width: "60%",
                    fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                    fontVariantNumeric: "tabular-nums",
                  }}
                />

                {/* Asset Pill */}
                <div
                  className="token-selector-box"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 99,
                    padding: "6px 14px",
                    fontWeight: 700,
                    fontSize: 14,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    background: "var(--surface)",
                    border: "1px solid var(--border-soft)",
                  }}
                >
                  {tradeTab === "buy" ? (
                    <>
                      {((curveState?.quoteTokenSymbol || "ETH").toUpperCase() === "ETH" || (curveState?.quoteTokenSymbol || "").toUpperCase() === "WETH") ? (
                        <img src="/icons/ethereum.svg" alt="ETH" style={{ width: 20, height: 20, objectFit: "contain" }} />
                      ) : (
                        <img src="/images/nvda.png" alt="NVDA" style={{ width: 20, height: 20, objectFit: "contain" }} />
                      )}
                      <span>{curveState?.quoteTokenSymbol || "ETH"}</span>
                    </>
                  ) : (
                    <>
                      {metadata?.logoUrl ? (
                        <img src={metadata.logoUrl} alt={tokenSymbol} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--text-primary)", color: "var(--bg-default)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900 }}>
                          {tokenSymbol.slice(0, 2)}
                        </div>
                      )}
                      <span>{tokenSymbol}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Direction Flip Button */}
            <div style={{ display: "flex", justifyContent: "center", margin: "-10px 0", zIndex: 10 }}>
              <button
                onClick={() => {
                  setTradeTab(tradeTab === "buy" ? "sell" : "buy");
                  setInputAmount("");
                }}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "var(--surface)",
                  border: "1px solid var(--border-soft)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                }}
                className="hover:scale-110 transition-transform"
              >
                <ArrowUpDown size={14} />
              </button>
            </div>

            {/* ── TO / RECEIVE INPUT BOX ── */}
            <div className="swap-input-box" style={{ padding: 14, borderRadius: 20, marginTop: 4, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
                  {tradeTab === "buy" ? "You Receive (Est.)" : "You Receive"}
                </span>
                <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>
                    Balance: {parseFloat(toBalFormatted).toFixed(2)}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: (simulatedOutput > 0n && formatUnits(simulatedOutput, 18).length > 10) ? 22 : 28,
                    fontWeight: 800,
                    color: simulatedOutput > 0n ? "var(--text-primary)" : "var(--text-muted)",
                    fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                    flex: 1,
                  }}
                  title={simulatedOutput > 0n ? formatUnits(simulatedOutput, 18) : "0.0"}
                >
                  {simulatingQuote ? (
                    <Loader2 size={24} className="animate-spin text-blue-500" />
                  ) : simulatedOutput > 0n ? (
                    parseFloat(formatUnits(simulatedOutput, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })
                  ) : (
                    "0.0"
                  )}
                </div>

                {/* Asset Pill */}
                <div
                  className="token-selector-box"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 99,
                    padding: "6px 14px",
                    fontWeight: 700,
                    fontSize: 14,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    background: "var(--surface)",
                    border: "1px solid var(--border-soft)",
                  }}
                >
                  {tradeTab === "buy" ? (
                    <>
                      {metadata?.logoUrl ? (
                        <img src={metadata.logoUrl} alt={tokenSymbol} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--text-primary)", color: "var(--bg-default)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900 }}>
                          {tokenSymbol.slice(0, 2)}
                        </div>
                      )}
                      <span>{tokenSymbol}</span>
                    </>
                  ) : (
                    <>
                      {((curveState?.quoteTokenSymbol || "ETH").toUpperCase() === "ETH" || (curveState?.quoteTokenSymbol || "").toUpperCase() === "WETH") ? (
                        <img src="/icons/ethereum.svg" alt="ETH" style={{ width: 20, height: 20, objectFit: "contain" }} />
                      ) : (
                        <img src="/images/nvda.png" alt="NVDA" style={{ width: 20, height: 20, objectFit: "contain" }} />
                      )}
                      <span>{curveState?.quoteTokenSymbol || "ETH"}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Percentage Quick Slider Bar */}
            {(() => {
              const sliderPercent = Number(fromBalFormatted) > 0 ? Math.min(100, Math.max(0, Math.round((Number(inputAmount) / Number(fromBalFormatted)) * 100))) : 0;
              return (
                <div style={{ margin: "4px 6px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    className="bridge-slider"
                    value={sliderPercent}
                    onChange={(e) => {
                      const percent = Number(e.target.value);
                      handleQuickPercent(percent);
                    }}
                    style={{
                      flex: 1,
                      cursor: "pointer",
                      accentColor: "#38bdf8",
                      height: 5,
                      borderRadius: 99,
                      outline: "none",
                      background: `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${sliderPercent}%, var(--slider-track, rgba(255, 255, 255, 0.12)) ${sliderPercent}%, var(--slider-track, rgba(255, 255, 255, 0.12)) 100%)`,
                      ['--slider-pct' as any]: `${sliderPercent}%`,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-primary)",
                      fontWeight: 700,
                      minWidth: "36px",
                      textAlign: "right",
                      fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                    }}
                  >
                    {sliderPercent}%
                  </span>
                </div>
              );
            })()}

            {/* Action Execution Button */}
            {!isConnected ? (
              <div style={{ textAlign: "center", padding: "14px", borderRadius: 9999, background: "var(--surface-soft, rgba(255,255,255,0.06))", color: "var(--text-muted)", fontSize: 14, fontWeight: 700 }}>
                Connect Wallet to Trade
              </div>
            ) : isWrongNetwork ? (
              <button
                onClick={() => switchChain?.({ chainId: SEPOLIA_CHAIN_ID })}
                disabled={isSwitching}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 9999,
                  background: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isSwitching ? "Switching Network..." : "Switch to Sepolia"}
              </button>
            ) : isGraduated ? (
              <div style={{ textAlign: "center", padding: "14px", borderRadius: 9999, background: "var(--surface-soft)", color: "var(--text-muted)", fontSize: 14, fontWeight: 700 }}>
                Bonding Curve Graduated
              </div>
            ) : !isApproved ? (
              <button
                onClick={handleApprove}
                disabled={isApproving || parsedInputBigInt === 0n}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 9999,
                  background: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: isApproving || parsedInputBigInt === 0n ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: "none",
                  transition: "all 0.15s ease",
                  opacity: (isApproving || parsedInputBigInt === 0n) ? 0.5 : 1,
                }}
                className="hover:opacity-90 active:scale-[0.99]"
              >
                {isApproving ? <Loader2 size={16} className="animate-spin" /> : null}
                <span>{isApproving ? "Approving Token..." : `Approve ${tradeTab === "buy" ? curveState.quoteTokenSymbol : tokenSymbol}`}</span>
              </button>
            ) : (
              <SlideButton
                onComplete={handleTrade}
                loading={isTrading}
                disabled={isTrading || parsedInputBigInt === 0n || simulatedOutput === 0n || hasInsufficientBalance}
                text={hasInsufficientBalance ? "Insufficient Balance" : tradeTab === "buy" ? `Slide to Buy ${tokenSymbol}` : `Slide to Sell ${tokenSymbol}`}
                loadingText="Executing Trade..."
              />
            )}

            {/* Error Message (Clean minimal text, centered) */}
            {(quoteError || tradeActionError) && (
              <div className="mt-2.5 px-1 flex items-center justify-center gap-1.5 text-xs font-bold text-center" style={{ color: isDark ? "#f87171" : "#dc2626" }}>
                <AlertCircle size={13} className="shrink-0" />
                <span>{quoteError || tradeActionError}</span>
              </div>
            )}

            {/* Tx Success Notification (Clean minimal text, centered) */}
            {txSuccessHash && (
              <div className="mt-2.5 px-1 flex items-center justify-center gap-3 text-xs font-bold text-center" style={{ color: isDark ? "#38bdf8" : "#0284c7" }}>
                <span>Transaction confirmed!</span>
                <a
                  href={`https://sepolia.etherscan.io/tx/${txSuccessHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold flex items-center gap-1 hover:underline"
                  style={{ color: isDark ? "#38bdf8" : "#0284c7" }}
                >
                  View <ExternalLink size={11} />
                </a>
              </div>
            )}

          </div>

        </div>

        {/* ── RIGHT: LIVE MEME TOKEN MARKET PRICE CHART (Exact Bridge Dual-Panel Style) ── */}
        <div className="w-full flex-1 min-w-0 flex flex-col pt-1">
          <MemeTokenChart
            tokenAddress={tokenAddress}
            tokenSymbol={tokenSymbol}
            tokenName={tokenName}
            logoUrl={metadata?.logoUrl}
            spotPrice={curveState.spotPrice}
            quoteTokenSymbol={curveState.quoteTokenSymbol}
            quoteTokenPriceUsd={130.0}
            realTokenSold={curveState.realTokenSold}
            realQuoteReserve={curveState.realQuoteReserve}
            curveProgressBps={curveState.curveProgressBps}
            isGraduated={isGraduated}
            height={465}
            activities={activities}
            loadingActivities={loadingActivities}
          />
        </div>

      </div>

      {/* ── LIVE TRADE ACTIVITY & RECORDS TABLE (Exact OpenSea OLED Dark Style) ── */}
      <div
        className="w-full mt-6 p-4 sm:p-6 rounded-[24px]"
        style={{
          background: isDark ? "#08080a" : "#ffffff",
          border: isDark ? "1px solid #18181b" : "1px solid var(--border, #e2e8f0)",
          boxShadow: isDark ? "0 20px 30px -5px rgba(0, 0, 0, 0.85)" : "0 4px 20px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Header Tabs & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-6">
            {(["activity", "holders", "details"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActivityTab(tab)}
                className={`text-sm font-bold capitalize transition-colors relative pb-1 ${
                  activityTab === tab
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {tab}
                {activityTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchActivities}
              disabled={loadingActivities}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
              title="Refresh Activity"
            >
              <RefreshCw size={14} className={loadingActivities ? "animate-spin" : ""} />
            </button>

            {/* Filter pills: All vs Your Trades */}
            <div
              style={{
                background: isDark ? "#121215" : "var(--surface-soft, #f1f5f9)",
                border: isDark ? "1px solid #27272a" : "1px solid var(--border-soft, #e2e8f0)",
              }}
              className="flex items-center p-1 rounded-full"
            >
              <button
                onClick={() => setActivityFilter("all")}
                style={{
                  background: activityFilter === "all" ? (isDark ? "#ffffff" : "#0f172a") : "transparent",
                  color: activityFilter === "all" ? (isDark ? "#000000" : "#ffffff") : (isDark ? "#94a3b8" : "#64748b"),
                }}
                className="px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
              >
                All Trades ({activities.length})
              </button>
              {userAddress && (
                <button
                  onClick={() => setActivityFilter("mine")}
                  style={{
                    background: activityFilter === "mine" ? (isDark ? "#ffffff" : "#0f172a") : "transparent",
                    color: activityFilter === "mine" ? (isDark ? "#000000" : "#ffffff") : (isDark ? "#94a3b8" : "#64748b"),
                  }}
                  className="px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
                >
                  Your Trades
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activityTab === "activity" && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-zinc-400 font-bold border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider">
                  <th className="pb-3 pl-2">Wallet</th>
                  <th className="pb-3">Event</th>
                  <th className="pb-3 text-right">Total ({curveState?.quoteTokenSymbol})</th>
                  <th className="pb-3 text-right">Amount ({tokenSymbol})</th>
                  <th className="pb-3 text-right">Price ({curveState?.quoteTokenSymbol})</th>
                  <th className="pb-3 pr-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="font-medium">
                {loadingActivities ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 size={16} className="animate-spin text-blue-500" />
                        <span>Loading on-chain trade activity...</span>
                      </div>
                    </td>
                  </tr>
                ) : activities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                      No on-chain trade records found yet. Be the first to buy!
                    </td>
                  </tr>
                ) : (
                  (activityFilter === "mine"
                    ? activities.filter((a) => a.wallet.toLowerCase() === userAddress?.toLowerCase())
                    : activities
                  ).map((act) => {
                    const isBuy = act.type === "buy";
                    const buyColor = isDark ? "#059669" : "#15803d";
                    const sellColor = isDark ? "#dc2626" : "#b91c1c";
                    const formattedQuote = parseFloat(formatUnits(act.quoteAmount, curveState?.quoteTokenDecimals || 18)).toFixed(4);
                    const rawTokenNum = Number(formatUnits(act.tokenAmount, 18));
                    const formattedToken = rawTokenNum >= 1000000 
                      ? `${(rawTokenNum / 1000000).toFixed(2)}M`
                      : rawTokenNum >= 1000 
                      ? `${(rawTokenNum / 1000).toFixed(2)}K`
                      : rawTokenNum.toFixed(2);
                    const formattedPrice = parseFloat(formatUnits(act.spotPrice, 18)).toFixed(8);
                    const isUserTx = userAddress && act.wallet.toLowerCase() === userAddress.toLowerCase();

                    return (
                      <tr
                        key={act.id}
                        className="transition-colors"
                      >
                        <td className="py-3 pl-2 flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{
                              background: `hsl(${parseInt(act.wallet.slice(2, 8), 16) % 360}, 60%, 50%)`,
                              color: "#fff",
                            }}
                          >
                            {act.wallet.slice(2, 4).toUpperCase()}
                          </div>
                          <span className="font-mono font-bold" style={{ color: isDark ? "#f4f4f5" : "#0f172a" }}>
                            {act.wallet.slice(0, 6)}...{act.wallet.slice(-4)}
                          </span>
                          {isUserTx && (
                            <span className="text-[10px] text-blue-500 font-extrabold tracking-wide">
                              YOU
                            </span>
                          )}
                        </td>

                        <td className="py-3">
                          <span className="font-bold text-xs flex items-center gap-1.5" style={{ color: isBuy ? buyColor : sellColor }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: isBuy ? buyColor : sellColor }} />
                            {isBuy ? "Buy" : "Sell"}
                          </span>
                        </td>

                        <td className="py-3 text-right font-mono font-bold" style={{ color: isBuy ? buyColor : sellColor }}>
                          {isBuy ? `▲ +${formattedQuote}` : `▼ -${formattedQuote}`} <span className="text-[11px] font-normal" style={{ color: isDark ? "#71717a" : "#64748b" }}>{curveState?.quoteTokenSymbol}</span>
                        </td>

                        <td className="py-3 text-right font-mono font-bold" style={{ color: isBuy ? buyColor : sellColor }}>
                          {isBuy ? `+${formattedToken}` : `-${formattedToken}`} <span className="text-[11px] font-normal" style={{ color: isDark ? "#71717a" : "#64748b" }}>{tokenSymbol}</span>
                        </td>

                        <td className="py-3 text-right font-mono font-medium" style={{ color: isDark ? "#a1a1aa" : "#334155" }}>
                          {formattedPrice} {curveState?.quoteTokenSymbol}
                        </td>

                        <td className="py-3 pr-2 text-right">
                          <a
                            href={`https://sepolia.etherscan.io/tx/${act.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:text-blue-500 transition-colors font-medium"
                            style={{ color: isDark ? "#a1a1aa" : "#334155" }}
                          >
                            <span>{formatTimeAgo(act.timestamp)}</span>
                            <ExternalLink size={10} />
                          </a>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activityTab === "holders" && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--text-muted)] font-semibold border-b border-[var(--border-soft,#1d273a)] text-[11px] uppercase tracking-wider">
                  <th className="pb-3 pl-2">Rank / Holder</th>
                  <th className="pb-3 text-right">Amount ({tokenSymbol})</th>
                  <th className="pb-3 pr-2 text-right">Percentage</th>
                </tr>
              </thead>
              <tbody className="font-medium">
                {holdersList.map((h, idx) => {
                  const isUser = userAddress && h.wallet.toLowerCase() === userAddress.toLowerCase();
                  const formattedBal = parseFloat(formatUnits(h.balance, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });

                  return (
                    <tr key={h.wallet} className="transition-colors">
                      <td className="py-3 pl-2 flex items-center gap-2">
                        <span className="text-[var(--text-muted)] font-mono text-[11px] w-5">#{idx + 1}</span>
                        {h.isBondingCurve ? (
                          <a
                            href={`https://sepolia.etherscan.io/address/${curveState?.curveAddress}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-bold text-[var(--text-primary)] hover:text-blue-500 transition-colors text-xs"
                          >
                            <span>Bonding Curve Contract Pool</span>
                            <ExternalLink size={12} className="shrink-0 text-[var(--text-muted)]" />
                          </a>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                              style={{
                                background: `hsl(${parseInt(h.wallet.slice(2, 8), 16) % 360}, 60%, 50%)`,
                                color: "#fff",
                              }}
                            >
                              {h.wallet.slice(2, 4).toUpperCase()}
                            </div>
                            <span className="font-mono font-bold" style={{ color: isDark ? "#f4f4f5" : "#0f172a" }}>
                              {h.wallet.slice(0, 6)}...{h.wallet.slice(-4)}
                            </span>
                            {isUser && (
                              <span className="text-[10px] text-blue-500 font-extrabold tracking-wide">
                                YOU
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3 text-right font-bold text-[var(--text-primary)]">
                        {formattedBal}
                      </td>

                      <td className="py-3 pr-2 text-right font-bold text-blue-400">
                        {h.percentage.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activityTab === "details" && (
          <div className="py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="p-3 rounded-xl bg-[var(--surface-soft,rgba(255,255,255,0.03))] border border-[var(--border-soft)]">
              <span className="text-[var(--text-muted)] block mb-1">Contract Address</span>
              <span className="font-mono font-bold text-[var(--text-primary)] break-all">{tokenAddress}</span>
            </div>
            <div className="p-3 rounded-xl bg-[var(--surface-soft,rgba(255,255,255,0.03))] border border-[var(--border-soft)]">
              <span className="text-[var(--text-muted)] block mb-1">Bonding Curve Pool</span>
              <span className="font-mono font-bold text-[var(--text-primary)] break-all">{curveState?.curveAddress}</span>
            </div>
            <div className="p-3 rounded-xl bg-[var(--surface-soft,rgba(255,255,255,0.03))] border border-[var(--border-soft)]">
              <span className="text-[var(--text-muted)] block mb-1">Quote Asset</span>
              <span className="font-bold text-[var(--text-primary)]">{curveState?.quoteTokenSymbol} ({curveState?.quoteTokenAddress})</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
