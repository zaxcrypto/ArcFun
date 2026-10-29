"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAccount, useChainId, useSwitchChain, useWriteContract } from "wagmi";
import { parseUnits, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { ARCFUN_CURVE_FACTORY_ABI, FACTORY_ADDRESSES } from "@/config/contracts";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  ArrowRight,
  Copy,
  Check,
  Building2,
  X,
  Coins,
  Plus,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  UploadCloud,
  ImageIcon,
  Trash2,
  Lock,
} from "lucide-react";

interface DinariStock {
  id: string;
  symbol: string;
  name: string;
  displayName: string;
  caip10Tokens: Record<string, string>;
  isTradable: boolean;
  isFractionable: boolean;
}

export interface LaunchedToken {
  id: string;
  name: string;
  symbol: string;
  description: string;
  address: string;
  deployer: string;
  network: string;
  chainId: number;
  txHash: string;
  initialSupply: string;
  timestamp: number;
  logoUrl?: string;
  twitterUrl?: string;
  telegramUrl?: string;
  websiteUrl?: string;
  curveAddress?: string;
  pairedStock?: {
    id: string;
    symbol: string;
    name: string;
    contractAddress: string;
    caip10: string;
  };
}

const SEPOLIA_CHAIN_ID = 11155111;
const FIXED_SUPPLY = "1,000,000,000";
const FIXED_SUPPLY_RAW = "1000000000";
const TOKENS_PER_PAGE = 30; // 6 tokens per row x 5 rows

const FILTER_TAGS = [
  "All",
  "Graduated",
  "Market Cap",
  "New Tokens",
  "Linked X",
];

const DEFAULT_NVDA_STOCK: DinariStock = {
  id: "NVDA",
  symbol: "NVDA",
  name: "NVIDIA Corp.",
  displayName: "NVIDIA Corp. dShare",
  caip10Tokens: {
    "eip155:11155111": "0x9aA2F937efCE268B6CC09633a1dC69Bdc1DE14D7",
  },
  isTradable: true,
  isFractionable: true,
};

function getStockIcon(symbol: string) {
  const s = (symbol || "NVDA").toUpperCase();
  if (s === "NVDA") {
    return (
      <img
        src="/images/nvda.png"
        alt="NVIDIA"
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          objectFit: "contain",
          flexShrink: 0,
        }}
      />
    );
  }
  if (s === "TSLA") {
    return (
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#e82127", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800 }}>
        T
      </div>
    );
  }
  if (s === "AAPL") {
    return (
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#000000", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>
        
      </div>
    );
  }
  if (s === "GOOGL" || s === "GOOG") {
    return (
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#4285F4", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800 }}>
        G
      </div>
    );
  }
  if (s === "SPCX" || s === "SPACE") {
    return (
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#000000", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 900 }}>
        ✕
      </div>
    );
  }
  if (s === "GME") {
    return (
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#e51b24", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 900 }}>
        GS
      </div>
    );
  }
  return (
    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#76b900", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", fontSize: 10, fontWeight: 800 }}>
      {s.slice(0, 2)}
    </div>
  );
}

function formatTimeAgo(timestamp: number) {
  const diffSec = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function LaunchpadView() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  // Slide Drawer State
  const [isMounted, setIsMounted] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stockDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Form State
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [xProfile, setXProfile] = useState("");
  const [telegramUrl, setTelegramUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Image Upload State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Dinari Stocks State (Default to Verified Sepolia NVDA dShare)
  const [stocks, setStocks] = useState<DinariStock[]>([DEFAULT_NVDA_STOCK]);
  const [selectedStockId, setSelectedStockId] = useState<string>("NVDA");
  const [isStockDropdownOpen, setIsStockDropdownOpen] = useState(false);
  const [loadingStocks, setLoadingStocks] = useState(false);

  // Tokens List State & Pagination
  const [launchedTokens, setLaunchedTokens] = useState<LaunchedToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  // Deployment State
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedSuccessToken, setDeployedSuccessToken] = useState<LaunchedToken | null>(null);

  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string, e?: React.MouseEvent | React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // Fetch Tokens from Supabase
  const loadTokensFromDb = async () => {
    try {
      setLoadingTokens(true);
      const res = await fetch("/api/launchpad/tokens");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.tokens)) {
          const parsedList: LaunchedToken[] = json.tokens.map((row: any) => {
            let extra: any = {};
            try {
              extra = row.about_project ? JSON.parse(row.about_project) : {};
            } catch {
              extra = {};
            }

            const rawName = row.name || "";
            const nameParts = rawName.split(" - ");
            const symbol = nameParts.length > 1 ? nameParts[0] : (extra.symbol || "MEME");
            const cleanName = nameParts.length > 1 ? nameParts.slice(1).join(" - ") : rawName;

            return {
              id: row.id,
              name: cleanName || extra.name || "Meme Token",
              symbol: symbol || "MEME",
              description: row.description || "",
              address: row.contract_address || "",
              deployer: row.owner_wallet || "",
              network: "Ethereum Sepolia",
              chainId: SEPOLIA_CHAIN_ID,
              txHash: extra.txHash || "",
              initialSupply: extra.supply || FIXED_SUPPLY,
              timestamp: new Date(row.created_at).getTime() || Date.now(),
              logoUrl: row.logo_url || undefined,
              twitterUrl: row.twitter_url || extra.twitterUrl || undefined,
              telegramUrl: row.telegram_url || extra.telegramUrl || undefined,
              websiteUrl: row.website_url || extra.websiteUrl || undefined,
              curveAddress: extra.curveAddress || undefined,
              pairedStock: extra.pairedStock || undefined,
            };
          });
          setLaunchedTokens(parsedList);
        }
      }
    } catch (e) {
      console.error("Failed to fetch tokens from database:", e);
    } finally {
      setLoadingTokens(false);
    }
  };

  useEffect(() => {
    loadTokensFromDb();
  }, []);

  // Fetch Dinari Catalogue
  useEffect(() => {
    async function loadCatalogue() {
      try {
        setLoadingStocks(true);
        const res = await fetch("/api/dinari/stocks");
        if (res.ok) {
          const data = await res.json();
          if (data.success && (Array.isArray(data.stocks) || Array.isArray(data.data))) {
            const list: DinariStock[] = data.stocks || data.data;
            const sepoliaStocks = list.filter((s: DinariStock) =>
              Object.keys(s.caip10Tokens || {}).some(
                (k) => k.startsWith("eip155:11155111") || k.toLowerCase().includes("11155111")
              )
            );
            if (sepoliaStocks.length > 0) {
              setStocks(sepoliaStocks);
              const nvda = sepoliaStocks.find((s: DinariStock) => s.symbol.toUpperCase() === "NVDA");
              if (nvda) {
                setSelectedStockId(nvda.id);
              } else {
                setSelectedStockId(sepoliaStocks[0].id);
              }
            } else {
              setStocks([DEFAULT_NVDA_STOCK]);
              setSelectedStockId("NVDA");
            }
          }
        }
      } catch (e) {
        console.error("Failed to load Dinari stocks:", e);
        setStocks([DEFAULT_NVDA_STOCK]);
        setSelectedStockId("NVDA");
      } finally {
        setLoadingStocks(false);
      }
    }
    loadCatalogue();
  }, []);

  const selectedStock = stocks.find((s) => s.id === selectedStockId || s.symbol.toUpperCase() === selectedStockId.toUpperCase()) || DEFAULT_NVDA_STOCK;
  const selectedStockCaip10 = selectedStock
    ? Object.entries(selectedStock.caip10Tokens).find(([k]) => k.includes("11155111"))
    : null;
  const selectedStockAddress = selectedStockCaip10 ? selectedStockCaip10[1] : "";

  const isWrongNetwork = chainId !== SEPOLIA_CHAIN_ID;
  const factoryAddress = FACTORY_ADDRESSES[SEPOLIA_CHAIN_ID] as `0x${string}`;

  const { writeContractAsync } = useWriteContract();

  const handleOpenDeployDrawer = () => {
    setDeployError(null);
    setDeployedSuccessToken(null);
    setTokenName("");
    setTokenSymbol("");
    setDescription("");
    setXProfile("");
    setImageFile(null);
    setImagePreview(null);
    setIsDrawerOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setDeployError("Image size must be less than 5MB");
        return;
      }
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !address) {
      setDeployError("Please connect your wallet first.");
      return;
    }
    if (isWrongNetwork) {
      setDeployError("Please switch your wallet network to Ethereum Sepolia Testnet.");
      return;
    }
    if (!tokenName.trim() || !tokenSymbol.trim()) {
      setDeployError("Please fill out token name and symbol.");
      return;
    }

    try {
      setIsDeploying(true);
      setDeployError(null);

      // 1. Upload image to Supabase Storage if present
      let uploadedLogoUrl: string | undefined = undefined;
      if (imageFile) {
        setIsUploadingImage(true);
        const form = new FormData();
        form.append("file", imageFile);
        const uploadRes = await fetch("/api/launchpad/upload-image", {
          method: "POST",
          body: form,
        });
        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json();
          if (uploadJson.success && uploadJson.url) {
            uploadedLogoUrl = uploadJson.url;
          }
        }
        setIsUploadingImage(false);
      }

      // 2. Deploy on-chain via ArcFunCurveFactory on Ethereum Sepolia
      console.log("Calling createLaunch on Sepolia factory:", factoryAddress);
      const hash = await writeContractAsync({
        address: factoryAddress,
        abi: ARCFUN_CURVE_FACTORY_ABI,
        functionName: "createLaunch",
        args: [tokenName.trim(), tokenSymbol.trim().toUpperCase(), selectedStockAddress as `0x${string}`],
      });

      console.log("Launch deployment transaction sent:", hash);

      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log("Transaction confirmed in block:", receipt.blockNumber);

      let deployedTokenAddr = "";
      let deployedCurveAddr = "";
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === factoryAddress.toLowerCase() && log.topics[1]) {
          deployedTokenAddr = `0x${log.topics[1].slice(26)}`;
          if (log.topics[2]) {
            deployedCurveAddr = `0x${log.topics[2].slice(26)}`;
          }
          break;
        }
      }

      if (!deployedTokenAddr && receipt.logs[0]) {
        deployedTokenAddr = receipt.logs[0].address;
      }

      const pairedStockMeta = selectedStock
        ? {
            id: selectedStock.id,
            symbol: selectedStock.symbol,
            name: selectedStock.name,
            contractAddress: selectedStockAddress,
            caip10: selectedStockCaip10 ? selectedStockCaip10[0] : "",
          }
        : undefined;

      const metadataPayload = JSON.stringify({
        name: tokenName.trim(),
        symbol: tokenSymbol.trim().toUpperCase(),
        supply: FIXED_SUPPLY,
        curveAddress: deployedCurveAddr,
        txHash: hash,
        twitterUrl: xProfile.trim() || undefined,
        telegramUrl: telegramUrl.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        pairedStock: pairedStockMeta,
      });

      // 3. Save to Supabase Database
      const saveRes = await fetch("/api/launchpad/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tokenName.trim(),
          symbol: tokenSymbol.trim().toUpperCase(),
          description: description.trim() || "Meme token paired with Dinari tokenized stock on bonding curve.",
          contractAddress: deployedTokenAddr || "0xEdC7d3a45904883363cE306850DB066E07094514",
          ownerWallet: address,
          logoUrl: uploadedLogoUrl || null,
          twitterUrl: xProfile.trim() || null,
          telegramUrl: telegramUrl.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
          aboutProject: metadataPayload,
        }),
      });

      const saveJson = await saveRes.json();
      console.log("Saved token to database:", saveJson);

      const newToken: LaunchedToken = {
        id: saveJson.token?.id || `${deployedTokenAddr}-${Date.now()}`,
        name: tokenName.trim(),
        symbol: tokenSymbol.trim().toUpperCase(),
        description: description.trim(),
        address: deployedTokenAddr,
        curveAddress: deployedCurveAddr,
        deployer: address,
        network: "Ethereum Sepolia",
        chainId: SEPOLIA_CHAIN_ID,
        txHash: hash,
        initialSupply: FIXED_SUPPLY,
        timestamp: Date.now(),
        logoUrl: uploadedLogoUrl,
        twitterUrl: xProfile.trim() || undefined,
        telegramUrl: telegramUrl.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        pairedStock: pairedStockMeta,
      };

      setLaunchedTokens((prev) => [newToken, ...prev]);
      setDeployedSuccessToken(newToken);
    } catch (err: any) {
      console.error("Deployment failed:", err);
      setDeployError(err?.shortMessage || err?.message || "Deployment failed. Please check your wallet.");
    } finally {
      setIsDeploying(false);
      setIsUploadingImage(false);
    }
  };

  // Filter & Sort Logic
  const filteredTokens = launchedTokens
    .filter((token) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        token.name.toLowerCase().includes(q) ||
        token.symbol.toLowerCase().includes(q) ||
        token.address.toLowerCase().includes(q) ||
        (token.pairedStock && token.pairedStock.symbol.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (selectedTag === "All") return true;
      if (selectedTag === "Graduated") return true; // All deployed Sepolia tokens are graduated
      if (selectedTag === "Market Cap") return true;
      if (selectedTag === "New Tokens") return true;
      if (selectedTag === "Linked X") return Boolean(token.twitterUrl && token.twitterUrl.trim() !== "");
      return true;
    })
    .sort((a, b) => {
      if (selectedTag === "New Tokens") return b.timestamp - a.timestamp;
      if (selectedTag === "Market Cap") return b.id.localeCompare(a.id);
      return b.timestamp - a.timestamp;
    });

  const totalPages = Math.max(1, Math.ceil(filteredTokens.length / TOKENS_PER_PAGE));
  const paginatedTokens = filteredTokens.slice(
    (currentPage - 1) * TOKENS_PER_PAGE,
    currentPage * TOKENS_PER_PAGE
  );

  const handleTagChange = (tag: string) => {
    setSelectedTag(tag);
    setCurrentPage(1);
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1280, // Extended width for 6-column grid
        margin: "0 auto",
        paddingTop: 12,
        paddingBottom: 48,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      {/* ── COMPACT MONOCHROME TOOLBAR (Search & Launch) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 10,
          width: "100%",
        }}
      >
        {/* Compact Curved Search Input */}
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 320,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 14,
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search tokens"
            style={{
              width: "100%",
              height: 38,
              padding: "0 40px 0 38px",
              borderRadius: 9999,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
              outline: "none",
              boxShadow: "none",
              transition: "border-color 0.15s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--text-primary)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          />
          {/* '/' Shortcut badge */}
          <div
            style={{
              position: "absolute",
              right: 11,
              width: 20,
              height: 20,
              borderRadius: 5,
              background: "var(--bg-default)",
              border: "1px solid var(--border-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          >
            /
          </div>
        </div>

        {/* Compact Curved Launch Button (Clean Black & White, Zero Shadows) */}
        <button
          onClick={handleOpenDeployDrawer}
          style={{
            height: 38,
            padding: "0 22px",
            borderRadius: 9999,
            background: "var(--text-primary)",
            border: "1px solid var(--text-primary)",
            color: "var(--bg-default)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: "0.01em",
            boxShadow: "none",
            whiteSpace: "nowrap",
            transition: "opacity 0.15s ease, transform 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.85";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          Launch
        </button>
      </div>

      {/* ── SEGMENTED CAPSULE FILTER TABS (Matching Screenshot) ── */}
      <div style={{ display: "flex", alignItems: "center", marginTop: 12 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: 3,
            borderRadius: 9999,
            background: "var(--bg-default)",
            border: "1px solid var(--border-soft)",
            gap: 2,
          }}
        >
          {FILTER_TAGS.map((tag) => {
            const isSelected = selectedTag === tag;
            return (
              <button
                key={tag}
                onClick={() => handleTagChange(tag)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 9999,
                  border: isSelected ? "1px solid var(--border-soft)" : "1px solid transparent",
                  background: isSelected ? "var(--surface)" : "transparent",
                  color: isSelected ? "var(--text-primary)" : "var(--text-muted)",
                  fontSize: 13,
                  fontWeight: isSelected ? 600 : 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: isSelected ? "0 1px 3px rgba(0, 0, 0, 0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.color = "var(--text-muted)";
                  }
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TOKEN GRID (6 TOKENS PER ROW, MAX 5 ROWS / 30 TOKENS PER PAGE) ── */}
      {loadingTokens ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 0",
            color: "var(--text-muted)",
            gap: 8,
          }}
        >
          <Loader2 size={16} className="animate-spin" />
          <span style={{ fontSize: 13 }}>Loading tokens from database...</span>
        </div>
      ) : paginatedTokens.length === 0 ? (
        <div
          style={{
            borderRadius: 24,
            border: "1px dashed var(--border)",
            background: "rgba(0, 0, 0, 0.02)",
            minHeight: 280,
            padding: "48px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            boxShadow: "none",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "var(--surface)",
              border: "1px solid var(--border-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Coins size={20} style={{ color: "var(--text-muted)" }} />
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-secondary)",
              letterSpacing: "-0.01em",
            }}
          >
            Launch Your First Token
          </span>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
            gap: 12,
            width: "100%",
          }}
        >
          {paginatedTokens.map((token) => (
            <Link
              key={token.id}
              href={`/token/${token.address}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                borderRadius: 20,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                boxShadow: "none",
                transition: "transform 0.15s ease, border-color 0.15s ease",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--text-primary)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {/* Token Image Square Container (Matching Pons Style) */}
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1/1",
                  borderRadius: 14,
                  overflow: "hidden",
                  position: "relative",
                  background: "var(--bg-default)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {token.logoUrl ? (
                  <img
                    src={token.logoUrl}
                    alt={token.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "var(--bg-default)",
                      border: "1px solid var(--border-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-primary)",
                      fontSize: 22,
                      fontWeight: 800,
                    }}
                  >
                    {token.symbol.slice(0, 2)}
                  </div>
                )}

                {/* Floating "Graduated" Badge on Top-Left */}
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      padding: "2px 7px",
                      borderRadius: 9999,
                      background: "rgba(0, 0, 0, 0.65)",
                      backdropFilter: "blur(6px)",
                      color: "#ffffff",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.01em",
                      fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                    }}
                  >
                    Graduated
                  </span>
                  {token.pairedStock && (
                    <span
                      style={{
                        padding: "2px 5px",
                        borderRadius: 6,
                        background: "#2563eb",
                        color: "#ffffff",
                        fontSize: 9.5,
                        fontWeight: 700,
                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        letterSpacing: "0.01em",
                      }}
                    >
                      V2
                    </span>
                  )}
                </div>
              </div>

              {/* Token Meta Information */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                {/* Title & Small Ticker */}
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                      letterSpacing: "-0.03em",
                      lineHeight: 1.2,
                    }}
                    title={token.name}
                  >
                    {token.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-muted)",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                      letterSpacing: "-0.01em",
                      lineHeight: 1.2,
                    }}
                  >
                    ${token.symbol}
                  </div>
                </div>

                {/* Market Cap - Prominent & Clean */}
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        letterSpacing: "-0.03em",
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1,
                      }}
                    >
                      $10.00K
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        fontWeight: 600,
                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        letterSpacing: "0.02em",
                        textTransform: "uppercase",
                      }}
                    >
                      MC
                    </span>
                  </div>

                  {token.pairedStock && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-geist), var(--font-inter), sans-serif",
                        letterSpacing: "-0.01em",
                      }}
                      title={`Paired with ${token.pairedStock.name}`}
                    >
                      {token.pairedStock.symbol}
                    </span>
                  )}
                </div>

                {/* Footer: Truncated CA + Time Ago */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 4,
                    paddingTop: 6,
                    borderTop: "1px solid var(--border-soft)",
                    fontSize: 10.5,
                  }}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      copyToClipboard(token.address, token.id, e);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        copyToClipboard(token.address, token.id, e);
                      }
                    }}
                    style={{
                      fontFamily: "var(--font-mono), monospace",
                      fontSize: 10.5,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      color: "var(--text-muted)",
                      position: "relative",
                      zIndex: 2,
                      userSelect: "none",
                      transition: "color 0.15s ease",
                    }}
                    className="hover:text-[var(--text-primary)]"
                    title="Click to copy CA"
                  >
                    {copied === token.id ? (
                      <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>Copied!</span>
                    ) : (
                      <>
                        <span>{token.address.slice(0, 4)}...{token.address.slice(-3)}</span>
                        <Copy size={9} style={{ opacity: 0.6 }} />
                      </>
                    )}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: 10.5, fontWeight: 500, fontFamily: "var(--font-geist), var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}>
                    {formatTimeAgo(token.timestamp)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── NUMBERED PAGINATION CONTROLS (< 1 2 3 ... N >) ── */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            marginTop: 20,
            paddingTop: 10,
          }}
        >
          {/* Previous Page Arrow */}
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--border-soft)",
              background: "transparent",
              color: currentPage === 1 ? "var(--text-muted)" : "var(--text-primary)",
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: currentPage === 1 ? 0.4 : 1,
              transition: "all 0.15s ease",
            }}
          >
            <ChevronLeft size={16} />
          </button>

          {/* Page Numbers */}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => {
              if (totalPages <= 7) return true;
              return p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1;
            })
            .map((p, idx, arr) => {
              const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
              return (
                <React.Fragment key={p}>
                  {showEllipsisBefore && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", padding: "0 4px" }}>
                      ...
                    </span>
                  )}
                  <button
                    onClick={() => setCurrentPage(p)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 9999,
                      border: "none",
                      background: currentPage === p ? "#09090b" : "transparent",
                      color: currentPage === p ? "#ffffff" : "var(--text-secondary)",
                      fontSize: 12.5,
                      fontWeight: currentPage === p ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {p}
                  </button>
                </React.Fragment>
              );
            })}

          {/* Next Page Arrow */}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--border-soft)",
              background: "transparent",
              color: currentPage === totalPages ? "var(--text-muted)" : "var(--text-primary)",
              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: currentPage === totalPages ? 0.4 : 1,
              transition: "all 0.15s ease",
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ── RIGHT SLIDE-OVER DRAWER (Uniswap Style Clean Token Info Modal/Drawer) ─ */}
      {isMounted && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {isDrawerOpen && (
            <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => !isDeploying && setIsDrawerOpen(false)}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.5)",
                backdropFilter: "blur(4px)",
                zIndex: 99998,
              }}
            />

            {/* Slide-Over Drawer Container */}
            <motion.div
              ref={drawerRef}
              initial={{ x: "calc(100% + 24px)", opacity: 0.7 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "calc(100% + 24px)", opacity: 0.7 }}
              transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.85 }}
              style={{
                position: "fixed",
                top: 72,
                right: 14,
                bottom: 14,
                width: 440,
                maxWidth: "calc(100vw - 28px)",
                zIndex: 99999,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Outside Borderless Collapse Button [>>] */}
              <button
                onClick={() => setIsDrawerOpen(false)}
                disabled={isDeploying}
                style={{
                  position: "absolute",
                  top: 14,
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
                  borderRadius: "24px",
                  border: "1px solid var(--border)",
                  boxShadow: "0 12px 40px -8px rgba(0, 0, 0, 0.14), 0 4px 16px -2px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(255, 255, 255, 0.05)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {/* ── Minimalist Drawer Header (Only Close Button) ── */}
                <div
                  style={{
                    padding: "16px 20px 8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    flexShrink: 0,
                  }}
                >
                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    disabled={isDeploying}
                    style={{
                      background: "var(--bg-default)",
                      border: "1px solid var(--border-soft)",
                      borderRadius: "50%",
                      width: 30,
                      height: 30,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* ── Drawer Body with Scroll (Uniswap Style Layout) ──────────── */}
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "10px 22px 24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >

                  {/* Success Result View */}
                  {deployedSuccessToken ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div
                        style={{
                          background: "var(--surface-glass)",
                          border: "1px solid var(--border)",
                          borderRadius: 16,
                          padding: "20px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          textAlign: "center",
                          gap: 8,
                        }}
                      >
                        <CheckCircle2 size={36} style={{ color: "#10b981" }} />
                        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                          Token Deployed On-Chain!
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          ${deployedSuccessToken.symbol} ({deployedSuccessToken.name}) is now live on Ethereum Sepolia.
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--surface-glass)",
                          borderRadius: 12,
                          padding: "14px 16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          fontSize: 12,
                          border: "1px solid var(--border-soft)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Token Address:</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: "monospace", color: "var(--text-primary)", fontSize: 12 }}>
                              {deployedSuccessToken.address.slice(0, 6)}...{deployedSuccessToken.address.slice(-4)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => copyToClipboard(deployedSuccessToken.address, "modal-token", e)}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}
                            >
                              {copied === "modal-token" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                            </button>
                          </div>
                        </div>

                        {deployedSuccessToken.curveAddress && (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Bonding Curve:</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontFamily: "monospace", color: "var(--text-primary)", fontSize: 12 }}>
                                {deployedSuccessToken.curveAddress.slice(0, 6)}...{deployedSuccessToken.curveAddress.slice(-4)}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => copyToClipboard(deployedSuccessToken.curveAddress!, "modal-curve", e)}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}
                              >
                                {copied === "modal-curve" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Total Supply:</span>
                          <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 12 }}>
                            {deployedSuccessToken.initialSupply}
                          </span>
                        </div>
                        {deployedSuccessToken.pairedStock && (
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Paired Quote Asset:</span>
                            <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 12 }}>
                              {deployedSuccessToken.pairedStock.symbol} (Dinari dShare)
                            </span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => setIsDrawerOpen(false)}
                        style={{
                          padding: "12px",
                          borderRadius: 99,
                          background: "var(--text-primary)",
                          color: "var(--bg-default)",
                          border: "1px solid var(--text-primary)",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontSize: 13.5,
                        }}
                      >
                        Done & View in Launchpad
                      </button>
                    </div>
                  ) : (
                    /* Deployment Form (Uniswap Style) */
                    <form onSubmit={handleDeploy} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {/* Hidden File Input */}
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageSelect}
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        style={{ display: "none" }}
                      />

                      {/* 1. Token Image Upload Area (Borderless Uniswap Style) */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 20,
                          padding: "8px 4px 16px 4px",
                        }}
                      >
                        {imagePreview ? (
                          <div style={{ position: "relative" }}>
                            <img
                              src={imagePreview}
                              alt="Token Preview"
                              style={{
                                width: 72,
                                height: 72,
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "2px solid rgba(225, 29, 72, 0.4)",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setImageFile(null);
                                setImagePreview(null);
                              }}
                              style={{
                                position: "absolute",
                                top: -2,
                                right: -2,
                                width: 22,
                                height: 22,
                                borderRadius: "50%",
                                background: "#ef4444",
                                color: "#ffffff",
                                border: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                              }}
                              title="Remove image"
                            >
                              <X size={13} strokeWidth={2.5} />
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                              width: 72,
                              height: 72,
                              borderRadius: "50%",
                              background: "rgba(255, 255, 255, 0.02)",
                              border: "1.5px dashed var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              color: "var(--text-muted)",
                              transition: "all 0.2s ease",
                            }}
                            className="hover:border-[var(--text-muted)] hover:bg-white/5 hover:scale-[1.02]"
                          >
                            <ImageIcon size={26} />
                          </div>
                        )}

                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                              Token image
                            </span>
                            <span style={{ color: "#f43f5e", fontSize: 13 }}>*</span>
                          </div>
                          <div
                            onClick={() => !imageFile && fileInputRef.current?.click()}
                            style={{
                              fontSize: 12,
                              color: "var(--text-muted)",
                              cursor: imageFile ? "default" : "pointer",
                            }}
                          >
                            256px or larger recommended
                          </div>
                          
                          {imageFile && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                              <span style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                                {imageFile.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#f43f5e",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                Change
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. Token Name & Ticker */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {/* Token Name Field */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>
                              Token Name
                            </label>
                            <span style={{ color: "#f43f5e", fontSize: 12 }}>*</span>
                          </div>
                          <input
                            type="text"
                            required
                            value={tokenName}
                            onChange={(e) => setTokenName(e.target.value)}
                            placeholder="Enter Name"
                            style={{
                              width: "100%",
                              padding: "11px 14px",
                              borderRadius: 14,
                              background: "var(--bg-default)",
                              border: "1px solid var(--border-soft)",
                              color: "var(--text-primary)",
                              fontSize: 13.5,
                              fontWeight: 500,
                              outline: "none",
                              transition: "border-color 0.15s ease",
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = "var(--text-primary)";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = "var(--border-soft)";
                            }}
                          />
                        </div>

                        {/* Ticker Symbol Field */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>
                              Ticker Symbol
                            </label>
                            <span style={{ color: "#f43f5e", fontSize: 12 }}>*</span>
                          </div>
                          <input
                            type="text"
                            required
                            value={tokenSymbol}
                            onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                            placeholder="$TICKER"
                            style={{
                              width: "100%",
                              padding: "11px 14px",
                              borderRadius: 14,
                              background: "var(--bg-default)",
                              border: "1px solid var(--border-soft)",
                              color: "var(--text-primary)",
                              fontSize: 13.5,
                              fontWeight: 600,
                              outline: "none",
                              transition: "border-color 0.15s ease",
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = "var(--text-primary)";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = "var(--border-soft)";
                            }}
                          />
                        </div>
                      </div>

                      {/* 3. Description Field */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>
                            Description
                          </label>
                          <span style={{ color: "#f43f5e", fontSize: 12 }}>*</span>
                        </div>
                        <textarea
                          rows={2}
                          required
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Briefly describe your token..."
                          style={{
                            width: "100%",
                            padding: "11px 14px",
                            borderRadius: 14,
                            background: "var(--bg-default)",
                            border: "1px solid var(--border-soft)",
                            color: "var(--text-primary)",
                            fontSize: 13,
                            resize: "none",
                            outline: "none",
                            transition: "border-color 0.15s ease",
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = "var(--text-primary)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = "var(--border-soft)";
                          }}
                        />
                      </div>

                      {/* 4. Social Links (X, Telegram, Website) */}
                      {/* X Profile */}
                      <div
                        style={{
                          padding: "12px 16px",
                          borderRadius: 24,
                          background: "var(--surface-glass)",
                          border: "1px solid var(--border-soft)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                          X Profile
                        </span>
                        <input
                          type="text"
                          value={xProfile}
                          onChange={(e) => setXProfile(e.target.value)}
                          placeholder="https://x.com/your_handle"
                          style={{
                            maxWidth: 190,
                            width: "100%",
                            padding: "7px 12px",
                            borderRadius: 14,
                            background: "var(--bg-default)",
                            border: "1px solid var(--border-soft)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            outline: "none",
                          }}
                        />
                      </div>

                      {/* Telegram Profile */}
                      <div
                        style={{
                          padding: "12px 16px",
                          borderRadius: 24,
                          background: "var(--surface-glass)",
                          border: "1px solid var(--border-soft)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                          Telegram
                        </span>
                        <input
                          type="text"
                          value={telegramUrl}
                          onChange={(e) => setTelegramUrl(e.target.value)}
                          placeholder="https://t.me/your_channel"
                          style={{
                            maxWidth: 190,
                            width: "100%",
                            padding: "7px 12px",
                            borderRadius: 14,
                            background: "var(--bg-default)",
                            border: "1px solid var(--border-soft)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            outline: "none",
                          }}
                        />
                      </div>

                      {/* Website Link */}
                      <div
                        style={{
                          padding: "12px 16px",
                          borderRadius: 24,
                          background: "var(--surface-glass)",
                          border: "1px solid var(--border-soft)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                          Website
                        </span>
                        <input
                          type="text"
                          value={websiteUrl}
                          onChange={(e) => setWebsiteUrl(e.target.value)}
                          placeholder="https://yourwebsite.com"
                          style={{
                            maxWidth: 190,
                            width: "100%",
                            padding: "7px 12px",
                            borderRadius: 14,
                            background: "var(--bg-default)",
                            border: "1px solid var(--border-soft)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            outline: "none",
                          }}
                        />
                      </div>

                      {/* 5. Fixed Supply Card */}
                      <div
                        style={{
                          padding: "12px 16px",
                          borderRadius: 16,
                          background: "var(--bg-default)",
                          border: "1px solid var(--border-soft)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>
                          Total Supply
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Lock size={13} style={{ color: "var(--text-muted)" }} />
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
                            1,000,000,000
                          </span>
                        </div>
                      </div>

                      {/* 6. Dinari Paired Stock Asset */}
                      <div
                        style={{
                          padding: "14px 16px",
                          borderRadius: 24,
                          background: "var(--surface-glass)",
                          border: "1px solid var(--border-soft)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          position: "relative",
                        }}
                        ref={stockDropdownRef}
                      >
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                            Paired asset
                          </div>
                        </div>

                        {loadingStocks ? (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, padding: "8px 0" }}>
                            <Loader2 size={13} className="animate-spin" />
                            Loading Dinari assets...
                          </div>
                        ) : (
                          <div style={{ position: "relative", width: "100%" }}>
                            {/* Selected Asset Pill Trigger */}
                            <div
                              onClick={() => setIsStockDropdownOpen((prev) => !prev)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 14px",
                                borderRadius: 14,
                                background: "var(--bg-default)",
                                border: "1px solid var(--border-soft)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {getStockIcon(selectedStock ? selectedStock.symbol : "NVDA")}
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
                                  {selectedStock ? selectedStock.symbol : "NVDA"}
                                </span>
                              </div>
                              <ChevronDown
                                size={16}
                                style={{
                                  color: "var(--text-muted)",
                                  transform: isStockDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                                  transition: "transform 0.15s ease",
                                }}
                              />
                            </div>

                            {/* Dropdown Options List */}
                            {isStockDropdownOpen && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "calc(100% + 6px)",
                                  left: 0,
                                  right: 0,
                                  maxHeight: 220,
                                  overflowY: "auto",
                                  background: "var(--surface)",
                                  borderRadius: 16,
                                  border: "1px solid var(--border)",
                                  padding: 6,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                  zIndex: 100,
                                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.12)",
                                }}
                              >
                                {stocks.map((stock) => {
                                  const isCurrent = stock.id === selectedStockId;
                                  return (
                                    <div
                                      key={stock.id}
                                      onClick={() => {
                                        setSelectedStockId(stock.id);
                                        setIsStockDropdownOpen(false);
                                      }}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "8px 12px",
                                        borderRadius: 10,
                                        background: isCurrent ? "var(--bg-default)" : "transparent",
                                        cursor: "pointer",
                                        transition: "background 0.1s ease",
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!isCurrent) {
                                          e.currentTarget.style.background = "var(--bg-default)";
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (!isCurrent) {
                                          e.currentTarget.style.background = "transparent";
                                        }
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        {getStockIcon(stock.symbol)}
                                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                                          {stock.symbol}
                                        </span>
                                      </div>
                                      <span
                                        style={{
                                          fontSize: 12,
                                          color: "var(--text-muted)",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                          maxWidth: 160,
                                          textAlign: "right",
                                        }}
                                      >
                                        {stock.name}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Error Alert */}
                      {deployError && (
                        <div
                          style={{
                            padding: "10px 14px",
                            borderRadius: 14,
                            background: "rgba(239, 68, 68, 0.1)",
                            border: "1px solid rgba(239, 68, 68, 0.25)",
                            color: "#ef4444",
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <AlertCircle size={14} />
                          <span>{deployError}</span>
                        </div>
                      )}

                      {/* Deploy / Switch Button */}
                      <button
                        type={isWrongNetwork ? "button" : "submit"}
                        onClick={(e) => {
                          if (isWrongNetwork) {
                            e.preventDefault();
                            setDeployError(null);
                            switchChain?.({ chainId: SEPOLIA_CHAIN_ID });
                          }
                        }}
                        disabled={isDeploying || isUploadingImage || isSwitching || !isConnected}
                        style={{
                          marginTop: 4,
                          padding: "13px 20px",
                          borderRadius: 99,
                          background: !isConnected
                            ? "var(--bg-default)"
                            : "var(--text-primary)",
                          color: !isConnected ? "var(--text-muted)" : "var(--bg-default)",
                          border: !isConnected
                            ? "1px solid var(--border-soft)"
                            : "1px solid var(--text-primary)",
                          fontWeight: 700,
                          fontSize: 14,
                          cursor: !isConnected || isDeploying || isSwitching ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          boxShadow: "none",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {isDeploying || isUploadingImage || isSwitching ? (
                          <>
                            <Loader2 size={15} className="animate-spin" />
                            <span>
                              {isSwitching
                                ? "Switching Network..."
                                : isUploadingImage
                                ? "Uploading Image..."
                                : "Deploying on Sepolia..."}
                            </span>
                          </>
                        ) : !isConnected ? (
                          <span>Connect Wallet to Deploy</span>
                        ) : isWrongNetwork ? (
                          <>
                            <AlertCircle size={15} />
                            <span>Switch to Sepolia</span>
                          </>
                        ) : (
                          <span>Deploy Token</span>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
    )}
    </div>
  );
}
