/* eslint-disable */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient, useSwitchChain, useSignMessage } from "wagmi";
import { formatUnits, parseUnits, createPublicClient, http } from "viem";
import { Loader2, Activity, CheckCircle, XCircle, AlertTriangle, Play, Pause, RefreshCw, Shield, Users, ToggleLeft, ToggleRight, UserCheck, UserX } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  CHAIN_ID_MAP,
  ERC20_APPROVE_ABI,
  ARCFUN_SWAP_VAULT_ADDRESS,
  ARCFUN_SWAP_VAULT_ABI,
  USDC_ADDRESS,
  EURC_ADDRESS,
} from "@/config/swap-contract";
import { LiveFeedHistoryView } from "./live-bridge-feed";
import { CircleGatewayAdminBalances } from "./circle-gateway-admin-balances";

type Asset = "USDC" | "EURC";

export function AdminDashboard() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();

  const [adminStats, setAdminStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [swapManageAction, setSwapManageAction] = useState<"deposit" | "withdraw">("deposit");
  const [swapSelectedToken, setSwapSelectedToken] = useState<Asset>("USDC");
  const [swapManageAmount, setSwapManageAmount] = useState("");
  const [swapActionStep, setSwapActionStep] = useState<"idle" | "switching" | "approving" | "executing" | "success" | "error">("idle");
  const [swapErrorMsg, setSwapErrorMsg] = useState("");

  // Access Control State
  const [manualWallet, setManualWallet] = useState("");
  const [manualActionStep, setManualActionStep] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [manualMsg, setManualMsg] = useState("");
  const [activeAccessTab, setActiveAccessTab] = useState<"whitelist" | "toggles">("whitelist");
  const [togglingMode, setTogglingMode] = useState<string | null>(null);

  const [accessSettings, setAccessSettings] = useState<any>(null);
  const [allRequests, setAllRequests] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("onchain_access_settings").select("*").then(({ data }) => {
      if (data) {
        const parsed: any = {};
        data.forEach((row: any) => {
          if (row.module === "swap") parsed.swapMode = row.mode;
          if (row.module === "bridge") parsed.bridgeMode = row.mode;
          if (row.module === "bridge_evm_to_sui") parsed.evmToSuiMode = row.mode;
          if (row.module === "bridge_sui_to_evm") parsed.suiToEvmMode = row.mode;
          if (row.module === "bridge_solana_to_sui") parsed.solanaToSuiMode = row.mode;
          if (row.module === "bridge_sui_to_solana") parsed.suiToSolanaMode = row.mode;
        });
        setAccessSettings(parsed);
      }
    });

    supabase.from("access_requests").select("*").order("timestamp", { ascending: false }).then(({ data }) => {
      if (data) setAllRequests(data);
    });
  }, []);

  const handleBridgeRouteToggle = async (
    module: "bridge_evm_to_sui" | "bridge_sui_to_evm" | "bridge_solana_to_sui" | "bridge_sui_to_solana",
    currentMode: string
  ) => {
    if (!address) return;
    const newMode = currentMode === "paused" ? "active" : "paused";
    const stateKey =
      module === "bridge_evm_to_sui" ? "evmToSuiMode" :
      module === "bridge_sui_to_evm" ? "suiToEvmMode" :
      module === "bridge_solana_to_sui" ? "solanaToSuiMode" : "suiToSolanaMode";

    setTogglingMode(`${module}-${newMode}`);
    const prevMode = accessSettings?.[stateKey] || "active";

    // Optimistic UI update
    setAccessSettings((prev: any) => ({
      ...prev,
      [stateKey]: newMode
    }));

    try {
      // Direct Supabase upsert
      const { error } = await supabase.from("onchain_access_settings").upsert({
        module,
        mode: newMode,
        updated_at: Date.now(),
        updated_by: address.toLowerCase()
      }, { onConflict: "module" });

      if (error) {
        console.warn("Direct Supabase update warning:", error);
      }

      // Also dispatch admin action
      try {
        const action = "update_onchain_access_setting";
        const timestamp = Date.now();
        const signature = await signMessageAsync({
          message: `ArcFun Admin Action: ${action} on ${module} at ${timestamp}`
        });

        await fetch("/api/admin/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_wallet: address,
            action,
            target_id: module,
            payload: { module, mode: newMode },
            project_name: "ArcFun Admin Dashboard",
            signature,
            timestamp
          })
        });
      } catch (e) {
        // Non-fatal if direct upsert succeeded
      }
    } catch (e: any) {
      // Rollback on error
      setAccessSettings((prev: any) => ({
        ...prev,
        [stateKey]: prevMode
      }));
      console.error("Failed to update bridge route toggle:", e);
    } finally {
      setTogglingMode(null);
    }
  };

  const handleModeChange = async (module: "swap" | "bridge", mode: string) => {
    if (!address) return;

    setTogglingMode(`${module}-${mode}`);
    // Optimistic UI update
    const previousMode = module === "swap" ? accessSettings?.swapMode : accessSettings?.bridgeMode;
    setAccessSettings((prev: any) => ({
      ...prev,
      [module === "swap" ? "swapMode" : "bridgeMode"]: mode
    }));

    try {
      const action = "update_onchain_access_setting";
      const timestamp = Date.now();
      const signature = await signMessageAsync({
        message: `ArcFun Admin Action: ${action} on ${module} at ${timestamp}`
      });

      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_wallet: address,
          action,
          target_id: module,
          payload: { module, mode },
          project_name: "ArcFun Admin Dashboard",
          signature,
          timestamp
        })
      });

      if (!res.ok) {
        throw new Error("Failed to update securely");
      }
    } catch (e: any) {
      // Rollback on error or cancellation
      setAccessSettings((prev: any) => ({
        ...prev,
        [module === "swap" ? "swapMode" : "bridgeMode"]: previousMode
      }));
      // If it's not a user rejection, log it
      if (!e?.message?.includes("User rejected")) {
        console.error("Failed to update mode:", e);
      }
    } finally {
      setTogglingMode(null);
    }
  };

  const handleRequestAction = async (wallet: string, status: string) => {
    if (!address) return;
    await supabase.from("access_requests").update({ request_status: status }).eq("wallet_address", wallet.toLowerCase());
  };

  const handleManualGrant = async () => {
    if (!address || !manualWallet.trim()) return;
    setManualActionStep("loading");
    try {
      await supabase.from("access_requests").upsert({ wallet_address: manualWallet.trim().toLowerCase(), request_status: "approved", timestamp: Date.now() });
      setManualActionStep("success");
      setManualMsg(`Access granted to ${manualWallet.trim().slice(0, 10)}...`);
    } catch (e: any) {
      setManualActionStep("error");
      setManualMsg(e.message);
    }
  };

  const handleManualRevoke = async () => {
    if (!address || !manualWallet.trim()) return;
    setManualActionStep("loading");
    try {
      await supabase.from("access_requests").upsert({ wallet_address: manualWallet.trim().toLowerCase(), request_status: "revoked", timestamp: Date.now() });
      setManualActionStep("success");
      setManualMsg(`Access revoked from ${manualWallet.trim().slice(0, 10)}...`);
    } catch (e: any) {
      setManualActionStep("error");
      setManualMsg(e.message);
    }
  };

  const ensureNetwork = async (targetChainName: string, setActionStepHook: any) => {
    const targetChainId = CHAIN_ID_MAP[targetChainName as keyof typeof CHAIN_ID_MAP];
    const currentChainId = publicClient?.chain?.id;
    if (currentChainId === targetChainId) return;

    setActionStepHook("switching");
    try {
      await switchChainAsync({ chainId: targetChainId });
      // Give wallet state a moment to sync
      await new Promise(r => setTimeout(r, 1000));
    } catch (e: any) {
      throw new Error(`User rejected network switch or it failed.`);
    }
  };



  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      let swapUSDC = 0n;
      let swapEURC = 0n;
      if (publicClient) {
        try {
          const [u, e] = await Promise.all([
            publicClient.readContract({ address: USDC_ADDRESS, abi: ERC20_APPROVE_ABI, functionName: "balanceOf", args: [ARCFUN_SWAP_VAULT_ADDRESS] }),
            publicClient.readContract({ address: EURC_ADDRESS, abi: ERC20_APPROVE_ABI, functionName: "balanceOf", args: [ARCFUN_SWAP_VAULT_ADDRESS] })
          ]);
          swapUSDC = u as bigint;
          swapEURC = e as bigint;
        } catch(e) {}
      }

      setAdminStats({
        swapUSDC,
        swapEURC
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const handleSwapLiquidityAction = async () => {
    const tokenAddress = swapSelectedToken === "USDC" ? USDC_ADDRESS : EURC_ADDRESS;
    try {
      await ensureNetwork("Arc Testnet", setSwapActionStep);
      setSwapActionStep("executing");
      const amountParsed = parseUnits(swapManageAmount, 6);

      if (swapManageAction === "deposit") {
        setSwapActionStep("approving");
        const approveTx = await writeContractAsync({
          address: tokenAddress,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [ARCFUN_SWAP_VAULT_ADDRESS, amountParsed],
        });
        const approveReceipt = await publicClient!.waitForTransactionReceipt({ hash: approveTx });
        if (approveReceipt.status !== "success") throw new Error("Approval transaction reverted on-chain");
        
        setSwapActionStep("executing");
        const depositTx = await writeContractAsync({
          address: ARCFUN_SWAP_VAULT_ADDRESS,
          abi: ARCFUN_SWAP_VAULT_ABI,
          functionName: "depositLiquidity",
          args: [tokenAddress, amountParsed],
        });
        const depositReceipt = await publicClient!.waitForTransactionReceipt({ hash: depositTx });
        if (depositReceipt.status !== "success") throw new Error("Deposit transaction reverted on-chain");
      } else if (swapManageAction === "withdraw") {
        const withdrawTx = await writeContractAsync({
          address: ARCFUN_SWAP_VAULT_ADDRESS,
          abi: ARCFUN_SWAP_VAULT_ABI,
          functionName: "withdrawLiquidity",
          args: [tokenAddress, amountParsed],
        });
        const withdrawReceipt = await publicClient!.waitForTransactionReceipt({ hash: withdrawTx });
        if (withdrawReceipt.status !== "success") throw new Error("Withdraw transaction reverted on-chain");
      }

      setSwapActionStep("success");
      setSwapManageAmount("");
      fetchData();
    } catch (e: any) {
      console.error(e);
      setSwapActionStep("error");
      setSwapErrorMsg(e.shortMessage || e.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── CIRCLE GATEWAY 4-CHAIN BALANCES (TREASURY) ── */}
      <CircleGatewayAdminBalances />

      {/* ── ACCESS CONTROL PANEL ── */}
      <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={18} style={{ color: "#b30000" }} />
            <span style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>Access Control</span>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          {/* Feature Toggles */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {(["swap", "bridge"] as const).map(module => {
                const currentMode = module === "swap" ? accessSettings?.swapMode : accessSettings?.bridgeMode;
                const modes = ["Open To Everyone", "Score Protected", "Admin Only"];
                return (
                  <div key={module} style={{ background: "var(--bg)", borderRadius: 12, padding: 16, border: "1px solid var(--border-soft)" }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {module} Access Mode
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {modes.map(mode => (
                        <button key={mode} onClick={() => handleModeChange(module, mode)}
                          disabled={togglingMode !== null}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                            borderRadius: 10, border: currentMode === mode ? "1px solid rgba(179,0,0,0.5)" : "1px solid var(--border-soft)",
                            background: currentMode === mode ? "rgba(179,0,0,0.08)" : "transparent",
                            cursor: togglingMode !== null ? "not-allowed" : "pointer", textAlign: "left",
                            opacity: togglingMode !== null && togglingMode !== `${module}-${mode}` ? 0.6 : 1
                          }}>
                          {togglingMode === `${module}-${mode}` ? (
                            <Loader2 size={16} style={{ color: "#b30000", animation: "spin 1s linear infinite" }} />
                          ) : (
                            <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid", borderColor: currentMode === mode ? "#b30000" : "var(--text-muted)", background: currentMode === mode ? "#b30000" : "transparent", flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 13, fontWeight: currentMode === mode ? 700 : 500, color: currentMode === mode ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {mode} {togglingMode === `${module}-${mode}` ? "(Authorizing...)" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
        </div>
      </div>

      {/* ── BRIDGE ROUTE CONTROL PANEL ── */}
      <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={18} style={{ color: "#3b82f6" }} />
            <span style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>Bridge Route Control</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", background: "rgba(59, 130, 246, 0.1)", padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(59, 130, 246, 0.2)" }}>
            Admin Bypass Always Active
          </span>
        </div>

        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: "1.5" }}>
            Control availability of individual bridge routes. When a route is paused, normal users see a clean <strong>&quot;Temporary Unavailable&quot;</strong> status message, while admin wallets bypass and can test normally.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              {
                id: "bridge_evm_to_sui" as const,
                label: "Evm to Sui",
                desc: "Pause bridging from EVM networks (Base Sepolia, Ethereum Sepolia, etc.) to Sui Testnet.",
                stateKey: "evmToSuiMode"
              },
              {
                id: "bridge_sui_to_evm" as const,
                label: "Sui to Evm",
                desc: "Pause bridging from Sui Testnet to destination EVM networks.",
                stateKey: "suiToEvmMode"
              },
              {
                id: "bridge_solana_to_sui" as const,
                label: "Solana to Sui",
                desc: "Pause bridging from Solana Devnet to Sui Testnet.",
                stateKey: "solanaToSuiMode"
              },
              {
                id: "bridge_sui_to_solana" as const,
                label: "Sui to Solana",
                desc: "Pause bridging from Sui Testnet to Solana Devnet.",
                stateKey: "suiToSolanaMode"
              }
            ].map(route => {
              const currentMode = accessSettings?.[route.stateKey] || "active";
              const isPaused = currentMode === "paused";
              const isUpdating = togglingMode?.startsWith(route.id);

              return (
                <div key={route.id} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--bg)",
                  borderRadius: 12,
                  padding: 16,
                  border: isPaused ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid var(--border-soft)",
                  transition: "all 0.2s ease"
                }}>
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                        {route.label}
                      </span>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        background: isPaused ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                        color: isPaused ? "#ef4444" : "#22c55e",
                        border: isPaused ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(34, 197, 94, 0.3)"
                      }}>
                        {isPaused ? "Paused (Temporary Unavailable)" : "Active / Open"}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, marginBottom: 0 }}>
                      {route.desc}
                    </p>
                  </div>

                  <button
                    onClick={() => handleBridgeRouteToggle(route.id, currentMode)}
                    disabled={isUpdating}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 16px",
                      borderRadius: 10,
                      fontWeight: 700,
                      fontSize: 13,
                      border: "none",
                      cursor: isUpdating ? "not-allowed" : "pointer",
                      background: isPaused ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                      color: "#ffffff",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
                      transition: "opacity 0.2s"
                    }}
                  >
                    {isUpdating ? (
                      <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    ) : isPaused ? (
                      <Play size={16} />
                    ) : (
                      <Pause size={16} />
                    )}
                    <span>{isPaused ? "Enable Route" : "Pause Route"}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── LIVE CROSS-CHAIN MONITOR (ADMIN ONLY) ── */}
      <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
            <span style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>Live Cross-Chain Monitor</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", background: "rgba(34, 197, 94, 0.1)", padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(34, 197, 94, 0.2)" }}>
            Admin Live Feed
          </span>
        </div>

        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            Real-time feed monitoring all global cross-chain bridge transactions. Exclusively accessible to administrators.
          </p>

          <LiveFeedHistoryView />
        </div>
      </div>
    </div>
  );
}
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

