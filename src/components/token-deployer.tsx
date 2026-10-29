"use client";

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from "wagmi";
import { parseUnits, decodeEventLog } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { ERC20_FACTORY_ABI, FACTORY_ADDRESSES } from "@/config/contracts";
import { supabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

export function TokenDeployer() {
  const { isConnected, chainId, address } = useAccount();
  const { switchChain } = useSwitchChain();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [supply, setSupply] = useState("");
  const [copied, setCopied] = useState(false);
  const [deployLimitError, setDeployLimitError] = useState<string | null>(null);
  const [deployProtectionEnabled, setDeployProtectionEnabled] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<5042002 | 91342>(5042002);

  useEffect(() => {
    if (chainId === 5042002 || chainId === 91342) {
      setSelectedNetwork(chainId);
    }
  }, [chainId]);

  const factoryAddress = FACTORY_ADDRESSES[selectedNetwork];
  const isCorrectChain = chainId === selectedNetwork;
  const isSwitchRequired = isConnected && !isCorrectChain;

  const getExplorerBaseUrl = () => {
    return selectedNetwork === 91342
      ? "https://sepolia-explorer.giwa.io"
      : "https://testnet.arcscan.app";
  };
  const getNetworkName = () => {
    return selectedNetwork === 91342 ? "GIWA Sepolia" : "Arc Testnet";
  };

  useEffect(() => {
    supabase.from("platform_settings").select("bool_value").eq("key", "tokenDeployProtectionEnabled").maybeSingle().then(({ data }) => {
      if (data) setDeployProtectionEnabled(!!data.bool_value);
    });
  }, []);

  const { writeContract, reset, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } =
    useWaitForTransactionReceipt({ hash });

  const handleReset = () => {
    setName("");
    setSymbol("");
    setSupply("");
    setCopied(false);
    setDeployLimitError(null);
    reset();
  };

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSwitchRequired) {
      switchChain?.({ chainId: selectedNetwork });
      return;
    }
    setDeployLimitError(null);
    if (!name || !symbol || !supply) return;
    
    const addressStr = address?.toLowerCase();
    const isUserAdmin = addressStr ? isAdmin(addressStr) : false;

    if (deployProtectionEnabled && !isUserAdmin && addressStr) {
      const today = new Date().toDateString();
      const storageKey = `arc_deployments_${addressStr}`;
      let deployments: number[] = [];
      try {
        deployments = JSON.parse(localStorage.getItem(storageKey) || "[]");
      } catch (err) {}

      deployments = deployments.filter(time => new Date(time).toDateString() === today);

      if (deployments.length >= 3) {
        setDeployLimitError("Maximum 3 token deployments per day. Protection is active.");
        return;
      }

      deployments.push(Date.now());
      localStorage.setItem(storageKey, JSON.stringify(deployments));
    }

    // Note: When Firebase/Supabase API is provided by user, we will upload `logoFile` here 
    // and save the returned URL to the database linked with the contract address.

    writeContract({
      address: factoryAddress as `0x${string}`,
      abi: ERC20_FACTORY_ABI,
      functionName: "deployToken",
      args: [name, symbol, parseUnits(supply, 18)],
    });
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getDeployedAddress = () => {
    if (!receipt?.logs?.length) return null;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: ERC20_FACTORY_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === "TokenDeployed" && decoded.args)
          return (decoded.args as any).tokenAddress || null;
      } catch {}
    }
    const nonFactory = receipt.logs.find(l => l.address.toLowerCase() !== factoryAddress.toLowerCase());
    return nonFactory?.address ?? null;
  };

  const deployedAddress = getDeployedAddress();

  useEffect(() => {
    if (isConfirmed && deployedAddress && address) {
      try {
        const localKey = `arc_tokens_${chainId}_${address.toLowerCase()}`;
        const saved = localStorage.getItem(localKey);
        const current = saved ? JSON.parse(saved) : [];
        if (!current.some((t: any) => t.address.toLowerCase() === deployedAddress.toLowerCase())) {
          const newToken = {
            address: deployedAddress,
            name,
            symbol,
            totalSupply: supply,
            chainId,
          };
          localStorage.setItem(localKey, JSON.stringify([newToken, ...current]));
        }
      } catch (err) {
        console.error("Failed to save local token:", err);
      }
    }
  }, [isConfirmed, deployedAddress, address, name, symbol, supply]);

  return (
    <div className="lf-card arc-premium-coating animate-fade-up" style={{ padding: 28 }}>
      <AnimatePresence mode="wait">
        {!isConfirmed ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >


            <form onSubmit={handleDeploy} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ textAlign: "center", marginBottom: 6 }}>
                <label className="lf-label" style={{ marginBottom: 8, display: "block" }}>Target Network</label>
                <div style={{ display: "flex", gap: 6, background: "var(--bg)", padding: 3, borderRadius: 9999, border: "1px solid var(--border)", maxWidth: 280, margin: "0 auto" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedNetwork(5042002)}
                    style={{
                      flex: 1,
                      padding: "6px 12px",
                      borderRadius: 9999,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: selectedNetwork === 5042002 ? "var(--surface)" : "transparent",
                      color: selectedNetwork === 5042002 ? "var(--text-primary)" : "var(--text-muted)",
                      boxShadow: selectedNetwork === 5042002 ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      transition: "all 0.2s"
                    }}
                  >
                    <img src="/arc-logo.png" style={{ width: 14, height: 14, borderRadius: "50%", marginRight: 6, flexShrink: 0 }} alt="Arc" />
                    Arc Testnet
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedNetwork(91342)}
                    style={{
                      flex: 1,
                      padding: "6px 12px",
                      borderRadius: 9999,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: selectedNetwork === 91342 ? "var(--surface)" : "transparent",
                      color: selectedNetwork === 91342 ? "var(--text-primary)" : "var(--text-muted)",
                      boxShadow: selectedNetwork === 91342 ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      transition: "all 0.2s"
                    }}
                  >
                    <img src="/giwa-testnet.svg" style={{ width: 14, height: 14, borderRadius: "50%", marginRight: 6, flexShrink: 0 }} alt="GIWA" />
                    GIWA Sepolia
                  </button>
                </div>
              </div>
              <div>
                <label className="lf-label" htmlFor="name">Token Name</label>
                <input
                  id="name"
                  className="lf-input"
                  type="text"
                  placeholder="Arc Token"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>

              <div className="launcher-grid-row">

                <div>
                  <label className="lf-label" htmlFor="symbol">Ticker Symbol</label>
                  <input
                    id="symbol"
                    className="lf-input"
                    style={{ textTransform: "uppercase", fontFamily: "monospace" }}
                    type="text"
                    placeholder="ARC"
                    value={symbol}
                    onChange={e => setSymbol(e.target.value.toUpperCase())}
                    required
                  />
                </div>
                <div>
                  <label className="lf-label" htmlFor="supply">Total Supply</label>
                  <input
                    id="supply"
                    className="lf-input"
                    type="number"
                    min="1"
                    placeholder="1,000,000"
                    value={supply}
                    onChange={e => setSupply(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Token preview pill */}
              {(name || symbol) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                  }}
                >
                  <div
                    className="token-avatar"
                    style={{ width: 34, height: 34, borderRadius: 8, background: "#eff6ff", color: "#2563eb", fontSize: 12 }}
                  >
                    {(symbol || name).substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {name || "Token Name"}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                      {symbol || "SYM"} · {supply ? Number(supply).toLocaleString() : "—"} supply
                    </p>
                  </div>
                </div>
              )}

              {writeError && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "10px 12px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 10,
                    color: "#dc2626",
                    fontSize: 12,
                  }}
                >
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                  <span>{(writeError as any)?.shortMessage || writeError.message || "Transaction rejected."}</span>
                </div>
              )}

              {deployLimitError && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "10px 12px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 10,
                    color: "#dc2626",
                    fontSize: 12,
                  }}
                >
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                  <span>{deployLimitError}</span>
                </div>
              )}

              <button
                type={isSwitchRequired ? "button" : "submit"}
                onClick={() => {
                  if (isSwitchRequired) {
                    switchChain?.({ chainId: selectedNetwork });
                  }
                }}
                className="cyber-button"
                disabled={
                  !isConnected
                    ? true
                    : isSwitchRequired
                      ? false
                      : isPending || isConfirming || !name || !symbol || !supply
                }
                style={{ width: "fit-content", minWidth: 260, padding: "12px 30px", marginTop: 8, fontSize: 14, alignSelf: "center" }}
              >
                <span>
                {isPending || isConfirming ? (
                  <>
                    <Loader2 style={{ width: 15, height: 15, animation: "spin 0.8s linear infinite", display: "inline-block", verticalAlign: "middle", marginRight: 6 }} />
                    {isConfirming ? "Confirming on-chain..." : "Waiting for wallet..."}
                  </>
                ) : !isConnected ? (
                  "Connect wallet to deploy"
                ) : isSwitchRequired ? (
                  `Switch to ${getNetworkName()}`
                ) : (
                  `Deploy Token On ${getNetworkName()}`
                )}
                </span>
              </button>

              {!isConnected && (
                <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
                  Connect your wallet using the button in the top-right corner.
                </p>
              )}
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, type: "spring", bounce: 0.3 }}
            style={{ textAlign: "center", padding: "8px 0" }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <CheckCircle2 style={{ width: 22, height: 22, color: "#16a34a" }} />
            </div>

            <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 6 }}>
              Token deployed
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>
              <strong style={{ color: "var(--text-primary)" }}>{name}</strong> ({symbol}) is now live on {getNetworkName()}.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
              {deployedAddress && (
                <InfoRow
                  label="Contract Address"
                  value={deployedAddress}
                  onCopy={() => copy(deployedAddress)}
                  copied={copied}
                />
              )}
              {hash && (
                <div>
                  <p className="lf-label">Transaction</p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                    }}
                  >
                    <code style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {hash}
                    </code>
                    <a
                      href={`${getExplorerBaseUrl()}/tx/${hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--text-muted)", flexShrink: 0, display: "flex" }}
                    >
                      <ExternalLink style={{ width: 14, height: 14 }} />
                    </a>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleReset}
              style={{
                marginTop: 24,
                width: "100%",
                padding: "10px",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Deploy another token
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoRow({ label, value, onCopy, copied }: { label: string; value: string; onCopy: () => void; copied: boolean }) {
  return (
    <div>
      <p className="lf-label">{label}</p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
        }}
      >
        <code style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value}
        </code>
        <button onClick={onCopy} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "var(--text-muted)", padding: 2, flexShrink: 0 }}>
          {copied
            ? <CheckCircle2 style={{ width: 14, height: 14, color: "#16a34a" }} />
            : <Copy style={{ width: 14, height: 14 }} />
          }
        </button>
      </div>
    </div>
  );
}
