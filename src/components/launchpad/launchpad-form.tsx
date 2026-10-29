"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useChainId, useSwitchChain, useWriteContract } from "wagmi";
import { parseUnits, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { ERC20_FACTORY_ABI, FACTORY_ADDRESSES, ERC20_ABI } from "@/config/contracts";
import {
  Rocket,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  ArrowRight,
  Copy,
  Check,
  Building2,
  Sparkles,
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

const SEPOLIA_CHAIN_ID = 11155111;

export function LaunchpadForm() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  // Form State
  const [tokenName, setTokenName] = useState("Test NVDA Meme");
  const [tokenSymbol, setTokenSymbol] = useState("TNVDAM");
  const [description, setDescription] = useState("First ArcFun Meme Token paired with Dinari NVDA dShare on Ethereum Sepolia.");
  const [initialSupply, setInitialSupply] = useState("1000000000"); // 1 Billion

  // Dinari Stocks State
  const [stocks, setStocks] = useState<DinariStock[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<string>("");
  const [loadingStocks, setLoadingStocks] = useState(true);

  // Deployment State
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedResult, setDeployedResult] = useState<{
    name: string;
    symbol: string;
    address: string;
    deployer: string;
    network: string;
    chainId: number;
    txHash: string;
    initialSupply: string;
    pairedStock?: {
      id: string;
      symbol: string;
      name: string;
      contractAddress: string;
      caip10: string;
    };
    onChainVerified?: {
      name: string;
      symbol: string;
      decimals: number;
      totalSupply: string;
      deployerBalance: string;
      isMatch: boolean;
    };
  } | null>(null);

  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // Fetch Dinari Catalogue
  useEffect(() => {
    async function loadCatalogue() {
      try {
        setLoadingStocks(true);
        const res = await fetch("/api/dinari/stocks");
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.data)) {
            // Filter stocks that have Ethereum Sepolia token
            const sepoliaStocks = data.data.filter((s: DinariStock) =>
              Object.keys(s.caip10Tokens || {}).some(
                (k) => k.startsWith("eip155:11155111") || k.toLowerCase().includes("11155111")
              )
            );
            setStocks(sepoliaStocks);
            // Default to NVDA if available
            const nvda = sepoliaStocks.find((s: DinariStock) => s.symbol.toUpperCase() === "NVDA");
            if (nvda) {
              setSelectedStockId(nvda.id);
            } else if (sepoliaStocks.length > 0) {
              setSelectedStockId(sepoliaStocks[0].id);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load Dinari stocks:", e);
      } finally {
        setLoadingStocks(false);
      }
    }
    loadCatalogue();
  }, []);

  const selectedStock = stocks.find((s) => s.id === selectedStockId);
  const selectedStockCaip10 = selectedStock
    ? Object.entries(selectedStock.caip10Tokens).find(([k]) => k.includes("11155111"))
    : null;
  const selectedStockAddress = selectedStockCaip10 ? selectedStockCaip10[1] : "";

  const isWrongNetwork = chainId !== SEPOLIA_CHAIN_ID;
  const factoryAddress = FACTORY_ADDRESSES[SEPOLIA_CHAIN_ID] as `0x${string}`;

  const { writeContractAsync } = useWriteContract();

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
    if (!tokenName.trim() || !tokenSymbol.trim() || !initialSupply) {
      setDeployError("Please fill out all required fields.");
      return;
    }

    try {
      setIsDeploying(true);
      setDeployError(null);

      const parsedSupply = parseUnits(initialSupply.toString(), 18);

      console.log("Calling deployToken on Sepolia factory:", factoryAddress);
      const hash = await writeContractAsync({
        address: factoryAddress,
        abi: ERC20_FACTORY_ABI,
        functionName: "deployToken",
        args: [tokenName.trim(), tokenSymbol.trim(), parsedSupply],
      });

      console.log("Deployment transaction sent:", hash);

      // Create Sepolia public client to read receipt and verify on-chain
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log("Transaction confirmed in block:", receipt.blockNumber);

      // Parse logs to find TokenDeployed event
      let deployedTokenAddr = "";
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === factoryAddress.toLowerCase() && log.topics[1]) {
          // In standard indexed address event topic: address is in bytes32 topic
          deployedTokenAddr = `0x${log.topics[1].slice(26)}`;
          break;
        }
      }

      if (!deployedTokenAddr && receipt.logs[0]) {
        deployedTokenAddr = receipt.logs[0].address;
      }

      // On-chain validation
      let onChainData = undefined;
      if (deployedTokenAddr) {
        try {
          const [nameRead, symbolRead, decimalsRead, totalSupplyRead, balanceRead] = await Promise.all([
            publicClient.readContract({
              address: deployedTokenAddr as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "name",
            }),
            publicClient.readContract({
              address: deployedTokenAddr as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "symbol",
            }),
            publicClient.readContract({
              address: deployedTokenAddr as `0x${string}`,
              abi: [
                {
                  inputs: [],
                  name: "decimals",
                  outputs: [{ type: "uint8" }],
                  stateMutability: "view",
                  type: "function",
                },
              ] as const,
              functionName: "decimals",
            }),
            publicClient.readContract({
              address: deployedTokenAddr as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "totalSupply",
            }),
            publicClient.readContract({
              address: deployedTokenAddr as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address],
            }),
          ]);

          onChainData = {
            name: nameRead as string,
            symbol: symbolRead as string,
            decimals: Number(decimalsRead),
            totalSupply: (Number(totalSupplyRead) / 1e18).toLocaleString(),
            deployerBalance: (Number(balanceRead) / 1e18).toLocaleString(),
            isMatch: totalSupplyRead.toString() === balanceRead.toString(),
          };
        } catch (readErr) {
          console.error("Failed to read onchain data:", readErr);
        }
      }

      setDeployedResult({
        name: tokenName.trim(),
        symbol: tokenSymbol.trim(),
        address: deployedTokenAddr || "Pending Address Confirmation",
        deployer: address,
        network: "Ethereum Sepolia Testnet",
        chainId: SEPOLIA_CHAIN_ID,
        txHash: hash,
        initialSupply: Number(initialSupply).toLocaleString(),
        pairedStock: selectedStock
          ? {
              id: selectedStock.id,
              symbol: selectedStock.symbol,
              name: selectedStock.name,
              contractAddress: selectedStockAddress,
              caip10: selectedStockCaip10 ? selectedStockCaip10[0] : "",
            }
          : undefined,
        onChainVerified: onChainData,
      });
    } catch (err: any) {
      console.error("Deployment failed:", err);
      setDeployError(err?.shortMessage || err?.message || "Deployment failed. Please check your wallet.");
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 720,
        width: "100%",
        margin: "0 auto",
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(179, 0, 0, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: "24px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg, #b30000 0%, #ff4d4d 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 20px rgba(179, 0, 0, 0.3)",
            }}
          >
            <Rocket size={26} style={{ color: "#ffffff", transform: "rotate(-45deg)" }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                ArcFun Meme Token Launcher
              </h1>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 99,
                  background: "rgba(179, 0, 0, 0.15)",
                  color: "#ff4d4d",
                  border: "1px solid rgba(179, 0, 0, 0.3)",
                  letterSpacing: "0.02em",
                }}
              >
                Stage 1
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Deploy standard ERC-20 meme tokens on Ethereum Sepolia with paired Dinari stock metadata.
            </p>
          </div>
        </div>

        {/* Network Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 10,
            background: isWrongNetwork ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
            border: `1px solid ${isWrongNetwork ? "rgba(239, 68, 68, 0.25)" : "rgba(34, 197, 94, 0.25)"}`,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: isWrongNetwork ? "#ef4444" : "#22c55e",
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isWrongNetwork ? "#ef4444" : "#22c55e",
            }}
          >
            Ethereum Sepolia (11155111)
          </span>
        </div>
      </div>

      {/* Network Guard Alert */}
      {isConnected && isWrongNetwork && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 14,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AlertCircle size={20} style={{ color: "#ef4444", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#ef4444" }}>
                Incorrect Network Detected
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Deployment is strictly permitted on Ethereum Sepolia Testnet (Chain ID 11155111).
              </div>
            </div>
          </div>
          <button
            onClick={() => switchChain({ chainId: SEPOLIA_CHAIN_ID })}
            disabled={isSwitching}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: "#ef4444",
              color: "#ffffff",
              border: "none",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            {isSwitching ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            Switch to Sepolia
          </button>
        </div>
      )}

      {/* Deployment Result Card */}
      {deployedResult && (
        <div
          style={{
            background: "linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            borderRadius: 20,
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(34, 197, 94, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={20} style={{ color: "#22c55e" }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                Token Deployed Successfully!
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                Verified on Ethereum Sepolia Testnet
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              padding: "16px",
              background: "rgba(0, 0, 0, 0.2)",
              borderRadius: 12,
              border: "1px solid var(--border)",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Token Name
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {deployedResult.name}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Token Symbol
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {deployedResult.symbol}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Initial Supply
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {deployedResult.initialSupply} tokens (18 Decimals)
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Network & Chain ID
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>
                Ethereum Sepolia ({deployedResult.chainId})
              </div>
            </div>
          </div>

          {/* Addresses & Transaction */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 8,
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                  Token Contract Address
                </span>
                <span style={{ fontSize: 13, fontFamily: "monospace", color: "var(--text-primary)" }}>
                  {deployedResult.address}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => copyToClipboard(deployedResult.address, "addr")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    padding: 4,
                  }}
                  title="Copy Address"
                >
                  {copied === "addr" ? <Check size={15} style={{ color: "#22c55e" }} /> : <Copy size={15} />}
                </button>
                <a
                  href={`https://sepolia.etherscan.io/address/${deployedResult.address}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--text-muted)", display: "flex", alignItems: "center" }}
                  title="View on Etherscan"
                >
                  <ExternalLink size={15} />
                </a>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 8,
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                  Deployer / Creator Wallet
                </span>
                <span style={{ fontSize: 13, fontFamily: "monospace", color: "var(--text-primary)" }}>
                  {deployedResult.deployer}
                </span>
              </div>
              <button
                onClick={() => copyToClipboard(deployedResult.deployer, "deployer")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: 4,
                }}
                title="Copy Address"
              >
                {copied === "deployer" ? <Check size={15} style={{ color: "#22c55e" }} /> : <Copy size={15} />}
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 8,
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                  Deployment Transaction Hash
                </span>
                <span style={{ fontSize: 13, fontFamily: "monospace", color: "var(--text-primary)" }}>
                  {deployedResult.txHash}
                </span>
              </div>
              <a
                href={`https://sepolia.etherscan.io/tx/${deployedResult.txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--text-muted)", display: "flex", alignItems: "center" }}
                title="View Tx on Etherscan"
              >
                <ExternalLink size={15} />
              </a>
            </div>
          </div>

          {/* Paired Dinari Stock Metadata */}
          {deployedResult.pairedStock && (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 10,
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px dashed var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Building2 size={14} style={{ color: "#ff4d4d" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                  Future Paired Quote Stock (Dinari dShare)
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {deployedResult.pairedStock.name} ({deployedResult.pairedStock.symbol})
              </div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)" }}>
                Contract: {deployedResult.pairedStock.contractAddress}
              </div>
            </div>
          )}

          {/* On-Chain Verification Confirmation */}
          {deployedResult.onChainVerified && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                background: "rgba(34, 197, 94, 0.12)",
                borderRadius: 8,
                fontSize: 12,
                color: "#22c55e",
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={15} />
              <span>
                On-Chain Verified: Total Supply ({deployedResult.onChainVerified.totalSupply}) == Creator Balance ({deployedResult.onChainVerified.deployerBalance}), Decimals: {deployedResult.onChainVerified.decimals}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Deployment Form Card */}
      <form
        onSubmit={handleDeploy}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
          Token Details
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Token Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Token Name *
            </label>
            <input
              type="text"
              required
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="e.g. Test NVDA Meme"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          {/* Token Ticker / Symbol */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Token Ticker / Symbol *
            </label>
            <input
              type="text"
              required
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. TNVDAM"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Initial Supply */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Initial Supply (Fixed ERC-20 Tokens) *
          </label>
          <input
            type="number"
            required
            min="1"
            value={initialSupply}
            onChange={(e) => setInitialSupply(e.target.value)}
            placeholder="1000000000"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
              color: "var(--text-primary)",
              fontSize: 14,
              outline: "none",
            }}
          />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            100% of the initial supply is minted directly to your creator wallet with 18 decimals.
          </span>
        </div>

        {/* Description */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Description
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your meme token community and narrative..."
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
              color: "var(--text-primary)",
              fontSize: 14,
              outline: "none",
              resize: "vertical",
            }}
          />
        </div>

        {/* Dinari Paired Stock Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Paired Stock Asset (Dinari Sandbox Catalogue)
            </label>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Future paired quote asset
            </span>
          </div>

          {loadingStocks ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px", color: "var(--text-muted)", fontSize: 13 }}>
              <Loader2 size={14} className="animate-spin" />
              Loading Dinari stocks...
            </div>
          ) : (
            <select
              value={selectedStockId}
              onChange={(e) => setSelectedStockId(e.target.value)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface-soft, rgba(255, 255, 255, 0.03))",
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
                cursor: "pointer",
              }}
            >
              {stocks.map((stock) => (
                <option key={stock.id} value={stock.id} style={{ background: "#1a1a1a", color: "#fff" }}>
                  {stock.symbol} — {stock.name}
                </option>
              ))}
            </select>
          )}

          {selectedStock && selectedStockAddress && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
              <span>Sepolia dShare:</span>
              <code style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>
                {selectedStockAddress}
              </code>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {deployError && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#ef4444",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertCircle size={16} />
            <span>{deployError}</span>
          </div>
        )}

        {/* Submit Deploy Button */}
        <button
          type="submit"
          disabled={isDeploying || isWrongNetwork || !isConnected}
          style={{
            padding: "14px 24px",
            borderRadius: 12,
            background: isWrongNetwork || !isConnected
              ? "var(--surface-soft, rgba(255, 255, 255, 0.06))"
              : "linear-gradient(135deg, #b30000 0%, #ff4d4d 100%)",
            color: isWrongNetwork || !isConnected ? "var(--text-muted)" : "#ffffff",
            border: "none",
            fontWeight: 700,
            fontSize: 15,
            cursor: isWrongNetwork || !isConnected ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            boxShadow: isWrongNetwork || !isConnected ? "none" : "0 8px 20px rgba(179, 0, 0, 0.3)",
            transition: "all 0.2s ease",
          }}
        >
          {isDeploying ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Deploying to Sepolia...</span>
            </>
          ) : !isConnected ? (
            <span>Connect Wallet to Deploy</span>
          ) : isWrongNetwork ? (
            <span>Switch to Ethereum Sepolia to Deploy</span>
          ) : (
            <>
              <Sparkles size={18} />
              <span>Deploy Meme Token on Sepolia</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
