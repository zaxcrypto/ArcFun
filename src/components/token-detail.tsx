"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useAccount, useWalletClient, useChainId, useSwitchChain } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Copy, CheckCircle2, ExternalLink,
  Send, Trash2, Plus, Play, Loader2, AlertCircle, X, RefreshCw, Users
} from "lucide-react";

import { ERC20_ABI, MULTISENDER_ABI, MULTISENDER_ADDRESS } from "@/config/contracts";

interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  totalSupply: string;
  logoUrl?: string;
  chainId?: number;
}

interface HolderInfo {
  address: string;
  balance: string;
  percentage: string;
}

interface TokenDetailProps {
  token: TokenInfo;
  onBack: () => void;
}

interface RecipientInput {
  address: string;
  amount: string;
}

export function TokenDetail({ token, onBack }: TokenDetailProps) {
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const targetChainId = token.chainId || chainId || 5042002;
  const isWrongNetwork = chainId !== targetChainId;
  const isGiwa = targetChainId === 91342;
  const explorerUrl = isGiwa ? "https://sepolia-explorer.giwa.io" : "https://testnet.arcscan.app";

  const [copied, setCopied] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(token.logoUrl || null);
  const [realTotalSupply, setRealTotalSupply] = useState<string>(token.totalSupply);
  const [realDecimals, setRealDecimals] = useState<number>(18);

  const fetchRealSupply = async () => {
    if (!publicClient) return;
    try {
      const [supply, decs] = await Promise.all([
        publicClient.readContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "totalSupply",
        }),
        publicClient.readContract({
          address: token.address as `0x${string}`,
          abi: [{ "inputs": [], "name": "decimals", "outputs": [{ "type": "uint8" }], "stateMutability": "view", "type": "function" }],
          functionName: "decimals",
        }).catch(() => 18),
      ]);
      setRealDecimals(Number(decs));
      setRealTotalSupply(formatUnits(supply as bigint, Number(decs)));
    } catch (e) {
      console.error("Failed to fetch real total supply:", e);
    }
  };

  useEffect(() => {
    if (token.totalSupply === "0") {
      fetchRealSupply();
    }
  }, [token.address, token.totalSupply, publicClient]);

  useEffect(() => {
    // Logo lookup from localStorage cache
    try {
      const cached = localStorage.getItem(`arc_logo_${token.address.toLowerCase()}`);
      if (cached && !logoUrl) setLogoUrl(cached);
    } catch { }
  }, [token.address]);

  const [holders, setHolders] = useState<HolderInfo[]>([]);
  const [isHoldersLoading, setIsHoldersLoading] = useState(false);
  const [holdersError, setHoldersError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  const [sendTab, setSendTab] = useState<"single" | "batch">("single");

  // Single Send
  const [singleAddress, setSingleAddress] = useState("");
  const [singleAmount, setSingleAmount] = useState("");
  const [isSendingSingle, setIsSendingSingle] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleSuccess, setSingleSuccess] = useState<string | null>(null);
  const [singleSuccessHash, setSingleSuccessHash] = useState<string | null>(null);
  const [batchSuccessHash, setBatchSuccessHash] = useState<string | null>(null);

  // Balance
  const [userBalance, setUserBalance] = useState<string>("0");
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);

  // Batch Send
  const [recipients, setRecipients] = useState<RecipientInput[]>([{ address: "", amount: "" }]);
  const [customCountInput, setCustomCountInput] = useState("");
  const [sameAmountInput, setSameAmountInput] = useState("");

  const userBalanceNum = Number(userBalance) || 0;
  const singleAmountNum = Number(singleAmount) || 0;
  const isSingleOverBalance = singleAmountNum > 0 && singleAmountNum > userBalanceNum;

  const batchTotalAmount = recipients.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const isBatchOverBalance = batchTotalAmount > 0 && batchTotalAmount > userBalanceNum;

  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    status: "idle" | "signing" | "mining" | "complete" | "error";
    message: string;
  }>({
    current: 0,
    total: 0,
    status: "idle",
    message: "",
  });

  const fetchUserBalance = async () => {
    if (!publicClient || !userAddress) return;
    setIsFetchingBalance(true);
    try {
      const decs = await publicClient.readContract({
        address: token.address as `0x${string}`,
        abi: [{ "inputs": [], "name": "decimals", "outputs": [{ "type": "uint8" }], "stateMutability": "view", "type": "function" }],
        functionName: "decimals",
      }).catch(() => 18);
      const raw = await publicClient.readContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [userAddress],
      });
      setUserBalance(formatUnits(raw as bigint, Number(decs)));
    } catch (e) {
      console.error("Failed to fetch user balance:", e);
    } finally {
      setIsFetchingBalance(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const fetchHolders = async (forceRefresh = false) => {
    if (!publicClient) return;

    const cacheKey = `holder_cache_${token.address.toLowerCase()}`;

    // Cooldown logic
    if (forceRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          if (age < 60000) { // 60 seconds cooldown
            setHoldersError(`Rate limit: Please wait ${Math.ceil((60000 - age) / 1000)}s.`);
            return;
          }
        }
      } catch { }
    }

    // Persistent cache logic
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < 300000) { // 5 min TTL
            setHolders(parsed.data);
            setVisibleCount(10);
            return;
          }
        }
      } catch { }
    }

    setIsHoldersLoading(true);
    setHoldersError(null);
    try {
      // Dynamic explorer API fetch
      const res = await fetch(`${explorerUrl}/api/v2/tokens/${token.address}/holders`);
      if (!res.ok) throw new Error("API failed");
      const data = await res.json();

      const parsedHolders: HolderInfo[] = (data.items || []).map((item: any) => {
        const balance = formatUnits(BigInt(item.value || "0"), realDecimals);
        const supplyNum = Number(realTotalSupply) || 1;
        const percentage = ((Number(balance) / supplyNum) * 100).toFixed(2);
        return {
          address: item.address?.hash || "",
          balance,
          percentage: `${percentage}%`,
        };
      }).filter((h: HolderInfo) => Number(h.balance) > 0);

      localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        data: parsedHolders
      }));

      setHolders(parsedHolders);
      setVisibleCount(10);
    } catch (e: any) {
      console.error("Error fetching holders from API:", e);
      setHoldersError("Could not fetch holders list.");
    } finally {
      setIsHoldersLoading(false);
    }
  };

  useEffect(() => {
    fetchUserBalance();
  }, [token.address, publicClient, userAddress, realTotalSupply]);

  const handleSingleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletClient || !publicClient || !singleAddress || !singleAmount) return;

    setIsSendingSingle(true);
    setSingleError(null);
    setSingleSuccess(null);
    setSingleSuccessHash(null);

    try {
      const parsedAmount = parseUnits(singleAmount, realDecimals);
      const hash = await walletClient.writeContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [singleAddress as `0x${string}`, parsedAmount],
      });

      setSingleSuccess("Submitting transfer...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        setSingleSuccess(`Sent ${singleAmount} ${token.symbol} successfully.`);
        setSingleSuccessHash(hash);

        setHolders(prev => {
          const newHolders = [...prev];
          const existingIndex = newHolders.findIndex(h => h.address.toLowerCase() === singleAddress.toLowerCase());
          if (existingIndex >= 0) {
            const newBalanceNum = Number(newHolders[existingIndex].balance) + Number(singleAmount);
            const percentage = ((newBalanceNum / (Number(realTotalSupply) || 1)) * 100).toFixed(2);
            newHolders[existingIndex] = { ...newHolders[existingIndex], balance: newBalanceNum.toString(), percentage: `${percentage}%` };
          } else {
            const percentage = ((Number(singleAmount) / (Number(realTotalSupply) || 1)) * 100).toFixed(2);
            newHolders.push({
              address: singleAddress,
              balance: singleAmount,
              percentage: `${percentage}%`
            });
          }
          return newHolders.sort((a, b) => Number(b.balance) - Number(a.balance));
        });

        setSingleAddress("");
        setSingleAmount("");
        await Promise.all([fetchHolders(true), fetchUserBalance()]);
      } else if (receipt.status === "reverted") {
        setSingleSuccess(null);
        setSingleError("Transaction reverted on-chain.");
      }
    } catch (e: any) {
      setSingleError(e.shortMessage || e.message || "Transfer failed.");
    } finally {
      setIsSendingSingle(false);
    }
  };

  const executeBatchSend = async () => {
    if (!walletClient || !publicClient || !userAddress || recipients.length === 0) return;
    const validRecipients = recipients.filter(r => r.address && r.amount);

    if (validRecipients.length < 2) {
      setBatchProgress(p => ({
        ...p,
        status: "error",
        message: "At least 2 recipients are required for batch send.",
      }));
      return;
    }

    if (validRecipients.length > 50) {
      setBatchProgress(p => ({
        ...p,
        status: "error",
        message: "Maximum 50 recipients allowed per batch.",
      }));
      return;
    }

    const uniqueAddresses = new Set(validRecipients.map(r => r.address.toLowerCase()));
    if (uniqueAddresses.size !== validRecipients.length) {
      setBatchProgress(p => ({
        ...p,
        status: "error",
        message: "Duplicate recipient addresses are not allowed.",
      }));
      return;
    }

    const hasZeroAmount = validRecipients.some(r => Number(r.amount) <= 0);
    if (hasZeroAmount) {
      setBatchProgress(p => ({
        ...p,
        status: "error",
        message: "Recipient amounts must be greater than zero.",
      }));
      return;
    }

    const totalAmountBig = validRecipients.reduce((sum, r) => sum + parseUnits(r.amount, realDecimals), BigInt(0));
    const userBalanceBig = parseUnits(userBalance, realDecimals);
    if (totalAmountBig > userBalanceBig) {
      setBatchProgress(p => ({
        ...p,
        status: "error",
        message: "Total transfer amount exceeds your token balance.",
      }));
      return;
    }

    try {
      setBatchProgress({
        current: 1,
        total: 2,
        status: "signing",
        message: "Checking allowance...",
      });
      setBatchSuccessHash(null);

      const currentAllowance = await publicClient.readContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [userAddress, MULTISENDER_ADDRESS as `0x${string}`],
      }) as bigint;

      if (currentAllowance < totalAmountBig) {
        setBatchProgress({
          current: 1,
          total: 2,
          status: "signing",
          message: `Approve helper to spend ${formatUnits(totalAmountBig, realDecimals)} ${token.symbol}...`,
        });

        const approveHash = await walletClient.writeContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [MULTISENDER_ADDRESS as `0x${string}`, totalAmountBig],
        });

        setBatchProgress({
          current: 1,
          total: 2,
          status: "mining",
          message: "Mining approval transaction...",
        });
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
        if (approveReceipt.status === "reverted") {
          throw new Error("Approval transaction reverted.");
        }
      }

      setBatchProgress({
        current: 2,
        total: 2,
        status: "signing",
        message: `Sign batch transfer of ${validRecipients.length} recipients...`,
      });

      const recipientsArray = validRecipients.map(r => r.address as `0x${string}`);
      const amountsArray = validRecipients.map(r => parseUnits(r.amount, realDecimals));

      const multisendHash = await walletClient.writeContract({
        address: MULTISENDER_ADDRESS as `0x${string}`,
        abi: MULTISENDER_ABI,
        functionName: "multisend",
        args: [token.address as `0x${string}`, recipientsArray, amountsArray],
      });

      setBatchProgress({
        current: 2,
        total: 2,
        status: "mining",
        message: "Mining batch transfer...",
      });
      const multisendReceipt = await publicClient.waitForTransactionReceipt({ hash: multisendHash });

      if (multisendReceipt.status === "success") {
        setBatchProgress(p => ({
          ...p,
          status: "complete",
          message: `Batch send successfully completed for ${validRecipients.length} recipients!`,
        }));
        setBatchSuccessHash(multisendHash);

        setHolders(prev => {
          let newHolders = [...prev];
          for (const r of validRecipients) {
            const existingIndex = newHolders.findIndex(h => h.address.toLowerCase() === r.address.toLowerCase());
            if (existingIndex >= 0) {
              const newBalanceNum = Number(newHolders[existingIndex].balance) + Number(r.amount);
              const percentage = ((newBalanceNum / (Number(realTotalSupply) || 1)) * 100).toFixed(2);
              newHolders[existingIndex] = { ...newHolders[existingIndex], balance: newBalanceNum.toString(), percentage: `${percentage}%` };
            } else {
              const percentage = ((Number(r.amount) / (Number(realTotalSupply) || 1)) * 100).toFixed(2);
              newHolders.push({
                address: r.address,
                balance: r.amount,
                percentage: `${percentage}%`
              });
            }
          }
          return newHolders.sort((a, b) => Number(b.balance) - Number(a.balance));
        });

        setRecipients([{ address: "", amount: "" }]);
        setSameAmountInput("");
        await Promise.all([fetchHolders(true), fetchUserBalance()]);
      } else if (multisendReceipt.status === "reverted") {
        setBatchProgress(p => ({
          ...p,
          status: "error",
          message: "Batch transfer transaction reverted on-chain.",
        }));
      }
    } catch (e: any) {
      setBatchProgress(p => ({
        ...p,
        status: "error",
        message: e.shortMessage || e.message || "Batch sender aborted.",
      }));
    }
  };

  const addRecipientRow = () => setRecipients([...recipients, { address: "", amount: sameAmountInput }]);
  const removeRecipientRow = (index: number) => {
    if (recipients.length === 1) return;
    setRecipients(recipients.filter((_, i) => i !== index));
  };
  const handleRecipientChange = (index: number, field: keyof RecipientInput, value: string) => {
    const updated = [...recipients];
    updated[index][field] = value;
    setRecipients(updated);
  };
  const applySameAmount = (amount: string) => {
    setSameAmountInput(amount);
    setRecipients(recipients.map(r => ({ ...r, amount })));
  };
  const generateMultipleRows = () => {
    const count = parseInt(customCountInput);
    if (isNaN(count) || count <= 0) return;
    setRecipients(Array.from({ length: count }, () => ({ address: "", amount: sameAmountInput })));
    setCustomCountInput("");
  };

  if (isWrongNetwork) {
    return (
      <div style={{ width: "100%", maxWidth: 1000, display: "flex", flexDirection: "column", gap: 20, paddingBottom: 40 }} className="animate-fade-up">
        <div>
          <button onClick={onBack} className="lf-btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <ArrowLeft style={{ width: 14, height: 14 }} />
            Back to list
          </button>
        </div>
        <div className="lf-card arc-premium-coating" style={{ padding: 48, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <AlertCircle style={{ width: 48, height: 48, color: "var(--danger)" }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Wrong Network</h2>
          <p style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 320 }}>
            Token tools for this token are only available on {targetChainId === 91342 ? "GIWA Sepolia" : "Arc Testnet"}. Please switch your wallet network to continue.
          </p>
          <button className="lf-btn-primary" onClick={() => switchChain({ chainId: targetChainId })} style={{ padding: "10px 24px", marginTop: 8 }}>
            Switch to {targetChainId === 91342 ? "GIWA Sepolia" : "Arc Testnet"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 1000, display: "flex", flexDirection: "column", gap: 20, paddingBottom: 40 }} className="animate-fade-up">
      {/* Back link */}
      <div>
        <button
          onClick={onBack}
          className="lf-btn-ghost"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Back to list
        </button>
      </div>

      {/* Main Container */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* TOP SECTION: Token Meta & Holders */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Token Meta Card */}
          <div className="lf-card arc-premium-coating" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              {token.symbol.toUpperCase() === "CIRBTC" ? (
                <img src="/cirbtc.png" alt="cirBTC" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
              ) : token.symbol.toUpperCase() === "USDC" ? (
                <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png" alt="USDC" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
              ) : token.symbol.toUpperCase() === "EURC" ? (
                <img src="https://logo.svgcdn.com/token-branded/eurc.png" alt="EURC" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
              ) : logoUrl ? (
                <img src={logoUrl} alt={token.symbol} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <img src="/rocket-logo.png" alt={token.symbol} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
              )}
              <div>
                <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                  {token.name}
                </h1>
                <p style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace", marginTop: 2 }}>
                  ${token.symbol.toUpperCase()} · Decimals: {realDecimals}
                </p>
              </div>
            </div>

            <div className="lf-divider" style={{ margin: "14px 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--text-secondary)" }}>Total Supply</span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {Number(realTotalSupply).toLocaleString(undefined, { maximumFractionDigits: realDecimals <= 8 ? 6 : 2 })}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                <span className="lf-label" style={{ margin: 0 }}>Contract Address</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <code style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, background: "var(--bg)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>
                    {token.address}
                  </code>
                  <button
                    className="lf-btn-ghost"
                    style={{ padding: 6 }}
                    onClick={() => copyToClipboard(token.address, "meta-addr")}
                  >
                    {copied === "meta-addr"
                      ? <CheckCircle2 style={{ width: 13, height: 13, color: "var(--success)" }} />
                      : <Copy style={{ width: 13, height: 13 }} />
                    }
                  </button>
                  <a
                    href={`${explorerUrl}/token/${token.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lf-btn-ghost"
                    style={{ padding: 6 }}
                  >
                    <ExternalLink style={{ width: 13, height: 13 }} />
                  </a>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                const el = document.getElementById("transfer-section");
                if (el) el.scrollIntoView({ behavior: "smooth" });
                setTimeout(() => {
                  const input = document.getElementById("rec-addr");
                  if (input) (input as HTMLInputElement).focus();
                }, 500);
              }}
              className="lf-btn-primary"
              style={{ width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <Send style={{ width: 14, height: 14 }} />
              Send ${token.symbol.toUpperCase()} to others
            </button>
          </div>

          {/* Holders List Card */}
          <div className="lf-card arc-premium-coating" style={{ padding: 20, display: "flex", flexDirection: "column", minHeight: 320, maxHeight: 420 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Token Holders</h3>
              {visibleCount > 0 && (
                <button
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--accent)", display: "flex", alignItems: "center", gap: 4 }}
                  onClick={() => fetchHolders(true)}
                  disabled={isHoldersLoading}
                >
                  <RefreshCw style={{ width: 12, height: 12, animation: isHoldersLoading ? "spin 0.8s linear infinite" : "none" }} />
                  Refresh
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {isHoldersLoading && visibleCount === 0 ? (
                <div style={{ margin: "auto", textAlign: "center" }}>
                  <Loader2 style={{ width: 18, height: 18, animation: "spin 0.8s linear infinite", color: "var(--accent)" }} />
                </div>
              ) : holdersError && visibleCount === 0 ? (
                <div style={{ margin: "auto", textAlign: "center", fontSize: 12, color: "var(--danger)" }}>
                  {holdersError}
                </div>
              ) : visibleCount === 0 ? (
                <div style={{ margin: "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <button
                    className="lf-btn-primary"
                    onClick={() => fetchHolders(false)}
                    disabled={isHoldersLoading}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    <RefreshCw style={{ width: 18, height: 18, animation: isHoldersLoading ? "spin 1s linear infinite" : "none" }} />
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                    Tap to fetch holders
                  </span>
                </div>
              ) : holders.length === 0 ? (
                <p style={{ margin: "auto", fontSize: 12, color: "var(--text-muted)" }}>No holders found.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {holdersError && (
                    <div style={{ padding: "6px 10px", background: "#fef2f2", color: "#dc2626", fontSize: 11, borderRadius: 6, marginBottom: 8, textAlign: "center" }}>
                      {holdersError}
                    </div>
                  )}
                  {holders.slice(0, visibleCount).map((holder, idx) => {
                    const isYou = holder.address.toLowerCase() === userAddress?.toLowerCase();
                    const displayName = `${holder.address.substring(0, 6)}...${holder.address.substring(38)}`;

                    return (
                      <div
                        key={holder.address}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderRadius: 8,
                        }}
                        className="hover:bg-slate-50 dark:hover:bg-slate-900/50"
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", width: 14, fontFamily: "monospace" }}>
                            {idx + 1}
                          </span>
                          <div
                            style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)", color: "var(--accent)", fontSize: 9, fontWeight: 700, flexShrink: 0 }}
                          >
                            {holder.address.substring(2, 4).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                            {displayName}
                            {isYou && (
                              <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 600, background: "var(--accent-soft)", color: "var(--accent)", padding: "2px 5px", borderRadius: 4, fontFamily: "sans-serif" }}>
                                You
                              </span>
                            )}
                          </span>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                            {Number(holder.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </p>
                          <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{holder.percentage}</p>
                        </div>
                      </div>
                    );
                  })}
                  {visibleCount < holders.length && visibleCount < 50 && (
                    <button
                      className="lf-btn-ghost"
                      onClick={() => setVisibleCount(v => Math.min(v + 10, 50, holders.length))}
                      style={{ marginTop: 8, padding: "8px", fontSize: 12 }}
                    >
                      Fetch Next 10
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: Send & Batch Send Tabbed Panel */}
        <div id="transfer-section" className="lf-card arc-premium-coating" style={{ padding: 20, display: "flex", flexDirection: "column", minHeight: 300 }}>

          {/* Tabs */}
          <div className="lf-tabs" style={{ width: "100%", marginBottom: 20 }}>
            <button
              className={`lf-tab${sendTab === "single" ? " active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setSendTab("single")}
            >
              Single Transfer
            </button>
            <button
              className={`lf-tab${sendTab === "batch" ? " active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setSendTab("batch")}
            >
              Batch Transfer
            </button>
          </div>

          <AnimatePresence mode="wait">
            {sendTab === "single" ? (
              <motion.div
                key="single"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ display: "flex", flexDirection: "column", flex: 1 }}
              >
                <form onSubmit={handleSingleSend} style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
                  <div>
                    <label className="lf-label" htmlFor="rec-addr">Recipient Address</label>
                    <input
                      id="rec-addr"
                      className="lf-input"
                      style={{ fontFamily: "monospace" }}
                      type="text"
                      placeholder="0x..."
                      value={singleAddress}
                      onChange={e => setSingleAddress(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <label className="lf-label" htmlFor="rec-amount" style={{ margin: 0 }}>Amount</label>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Balance: {isFetchingBalance ? "..." : `${Number(userBalance).toLocaleString()} ${token.symbol}`}
                      </span>
                    </div>
                    <input
                      id="rec-amount"
                      className="lf-input"
                      type="number"
                      step="any"
                      placeholder="0.0"
                      value={singleAmount}
                      onChange={e => setSingleAmount(e.target.value)}
                      required
                    />
                  </div>

                  {isSingleOverBalance && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: 12 }}>
                      <AlertCircle style={{ width: 14, height: 14 }} /> Amount exceeds wallet balance.
                    </div>
                  )}

                  {singleError && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: 12 }}>
                      <AlertCircle style={{ width: 14, height: 14 }} /> {singleError}
                    </div>
                  )}

                  {singleSuccess && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, color: "#16a34a", fontSize: 13 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle2 style={{ width: 16, height: 16 }} /> {singleSuccess}
                      </div>
                      {singleSuccessHash && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.5)", padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(22, 163, 74, 0.2)" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                            {singleSuccessHash.slice(0, 8)}...{singleSuccessHash.slice(-6)}
                          </span>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(singleSuccessHash, "txHash")}
                              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "#16a34a", fontSize: 11, fontWeight: 600 }}
                            >
                              {copied === "txHash" ? <CheckCircle2 style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                              {copied === "txHash" ? "COPIED" : "COPY"}
                            </button>
                            <a
                              href={`${explorerUrl}/tx/${singleSuccessHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: "flex", alignItems: "center", gap: 4, color: "#16a34a", textDecoration: "none", fontSize: 11, fontWeight: 600 }}
                            >
                              <ExternalLink style={{ width: 12, height: 12 }} /> VIEW
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="lf-btn-primary"
                    disabled={isSendingSingle || isSingleOverBalance || !singleAddress || !singleAmount}
                    style={{ width: "100%", padding: "12px", marginTop: "auto" }}
                  >
                    {isSendingSingle ? (
                      <><Loader2 style={{ width: 14, height: 14, animation: "spin 0.8s linear infinite" }} /> Executing...</>
                    ) : `Send ${token.symbol}`}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="batch"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ display: "flex", flexDirection: "column", flex: 1 }}
              >
                {batchProgress.status !== "idle" && batchProgress.status !== "complete" && batchProgress.status !== "error" ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", padding: 40 }}>
                    <Loader2 style={{ width: 24, height: 24, animation: "spin 0.8s linear infinite", color: "var(--accent)", marginBottom: 12 }} />
                    <p style={{ fontSize: 14, fontWeight: 650, color: "var(--text-primary)" }}>Processing batch</p>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, maxWidth: 280 }}>{batchProgress.message}</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <div style={{ padding: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
                      Send to multiple addresses simultaneously in a single transaction to optimize gas costs.
                    </div>

                    {/* Step 1 & 3 Grouping (Top Toolbar) */}
                    <div className="flex flex-col md:flex-row gap-4 md:gap-5" style={{ marginBottom: 24, background: "var(--bg)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)" }}>
                      <div style={{ flex: 1 }}>
                        <label className="lf-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, whiteSpace: "nowrap" }}>
                          Generate Recipients
                        </label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            type="number"
                            className="lf-input"
                            style={{ height: 40, flex: 1, minWidth: 0, padding: "0 10px" }}
                            placeholder="Rows (e.g. 5)"
                            value={customCountInput}
                            onChange={e => setCustomCountInput(e.target.value)}
                          />
                          <button
                            type="button"
                            className="lf-btn-ghost"
                            style={{ height: 40, padding: "0 12px", fontWeight: 600, flexShrink: 0 }}
                            onClick={generateMultipleRows}
                          >
                            Generate
                          </button>
                        </div>
                      </div>

                      <div style={{ flex: 1 }}>
                        <label className="lf-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, whiteSpace: "nowrap" }}>
                          Apply Amounts <span style={{ opacity: 0.5, fontSize: 10, fontWeight: 500, marginLeft: 2, textTransform: "none" }}>(Optional)</span>
                        </label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            type="number"
                            className="lf-input"
                            style={{ height: 40, flex: 1, minWidth: 0, padding: "0 10px" }}
                            placeholder="Amount"
                            value={sameAmountInput}
                            onChange={e => setSameAmountInput(e.target.value)}
                          />
                          <button
                            type="button"
                            className="lf-btn-ghost"
                            style={{ height: 40, padding: "0 12px", fontWeight: 600, flexShrink: 0 }}
                            onClick={() => applySameAmount(sameAmountInput)}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Step 2: Enter Addresses */}
                    <div style={{ marginBottom: 24 }}>
                      <label className="lf-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, paddingLeft: 4, whiteSpace: "nowrap" }}>
                        Enter Addresses
                      </label>

                      <div style={{ flex: 1, maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4, marginBottom: 16 }}>
                        {recipients.map((r, idx) => (
                          <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", width: "100%" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", width: 22, textAlign: "center", fontFamily: "monospace", flexShrink: 0 }}>
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              className="lf-input"
                              style={{ fontFamily: "monospace", height: 40, flex: 1, minWidth: 0, padding: "0 8px", fontSize: 13 }}
                              placeholder="0x..."
                              value={r.address}
                              onChange={e => handleRecipientChange(idx, "address", e.target.value)}
                            />
                            <input
                              type="number"
                              className="lf-input"
                              style={{ height: 40, width: "32%", minWidth: 60, maxWidth: 140, padding: "0 8px", fontSize: 13 }}
                              placeholder="Amount"
                              value={r.amount}
                              onChange={e => handleRecipientChange(idx, "amount", e.target.value)}
                            />
                            <button
                              type="button"
                              className="lf-btn-ghost flex-shrink-0"
                              style={{ height: 38, width: 38, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--danger)" }}
                              onClick={() => removeRecipientRow(idx)}
                            >
                              <Trash2 style={{ width: 16, height: 16 }} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        className="lf-btn-ghost"
                        style={{ width: "100%", borderStyle: "dashed", height: 44, fontWeight: 600 }}
                        onClick={addRecipientRow}
                      >
                        <Plus style={{ width: 16, height: 16 }} /> Add recipient manually
                      </button>
                    </div>

                    {isBatchOverBalance && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: 12, marginBottom: 12 }}>
                        <AlertCircle style={{ width: 14, height: 14 }} /> Total amount exceeds balance.
                      </div>
                    )}

                    {batchProgress.status === "complete" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, color: "#16a34a", fontSize: 13, marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <CheckCircle2 style={{ width: 16, height: 16 }} /> {batchProgress.message}
                        </div>
                        {batchSuccessHash && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.5)", padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(22, 163, 74, 0.2)" }}>
                            <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                              {batchSuccessHash.slice(0, 8)}...{batchSuccessHash.slice(-6)}
                            </span>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(batchSuccessHash, "batchTxHash")}
                                style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "#16a34a", fontSize: 11, fontWeight: 600 }}
                              >
                                {copied === "batchTxHash" ? <CheckCircle2 style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                                {copied === "batchTxHash" ? "COPIED" : "COPY"}
                              </button>
                              <a
                                href={`${explorerUrl}/tx/${batchSuccessHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: "flex", alignItems: "center", gap: 4, color: "#16a34a", textDecoration: "none", fontSize: 11, fontWeight: 600 }}
                              >
                                <ExternalLink style={{ width: 12, height: 12 }} /> VIEW
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {batchProgress.status === "error" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: 12, marginBottom: 12 }}>
                        <AlertCircle style={{ width: 14, height: 14 }} /> {batchProgress.message}
                      </div>
                    )}

                    {/* Step 4: Execute */}
                    <button
                      type="button"
                      className="lf-btn-primary"
                      disabled={isBatchOverBalance}
                      style={{ width: "100%", padding: "14px", marginTop: "auto", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                      onClick={executeBatchSend}
                    >
                      <Play style={{ width: 16, height: 16 }} />
                      Execute Batch Send
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
