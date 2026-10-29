/* eslint-disable */
"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  useAccount,
  useWriteContract,
  useWalletClient,
  useSignMessage,
} from "wagmi";
import { parseEther, formatEther } from "viem";

import {
  Lock,
  Shield,
  CheckCircle,
  Download,
  Code,
  Key,
  Users,
  Trash,
  Plus,
  Copy,
  Zap,
  AlertCircle,
  Search,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  usePublicClient,
} from "wagmi";


import { AdminDashboard } from "./admin-dashboard";
import { RelayerGasManagement } from "./relayer-gas-admin";


// ─── Main Admin Panel ─────────────────────────────────────────────────────────
export function AdminPanel() {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingAdminCheck, setLoadingAdminCheck] = useState(true);

  const [tab, setTab] = useState<
    | "bridge"
    | "relayer_gas"
    | "users"
  >("bridge");

  useEffect(() => {
    if (!address) {
      setIsAdmin(false);
      setLoadingAdminCheck(false);
      return;
    }
    setLoadingAdminCheck(true);
    supabase
      .from("dapps_admins")
      .select("wallet_address")
      .eq("wallet_address", address.toLowerCase())
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to check admin status:", error);
          setIsAdmin(false);
        } else if (data) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
        setLoadingAdminCheck(false);
      });
  }, [address]);


  // --- SUPABASE TOGGLES STATE ---
  const [supaToggles, setSupaToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.from("platform_settings").select("*").then(({ data, error }) => {
      if (error && error.code !== "PGRST116") {
        console.warn(`[Supabase Fallback] Component: vault-admin (toggles) | Error: ${error.message}`);
      } else if (data) {
        const parsed: Record<string, boolean> = {};
        data.forEach(row => parsed[row.key] = !!row.bool_value);
        setSupaToggles(parsed);
      }
    });
  }, []);

  const updateSupaToggle = async (key: string, val: boolean) => {
    if (!address) throw new Error("No wallet connected");
    const timestamp = Date.now();
    const signature = await signMessageAsync({
      message: `ArcFun Admin Action: update_platform_setting on ${key} at ${timestamp}`
    });
    const res = await fetch("/api/admin/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_wallet: address,
        action: "update_platform_setting",
        target_id: key,
        signature,
        payload: { setting_key: key, bool_value: val },
        timestamp
      })
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || "Failed to update setting");
    }
    setSupaToggles(prev => ({ ...prev, [key]: val }));
  };

  // Access code toggle state
  const accessCodeEnabled = supaToggles["chatAccessEnabled"] ?? false;

  const [isToggling, setIsToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  // Chat Pay Protection toggle state
  const chatPayProtectionEnabled = supaToggles["chatPayProtectionEnabled"] ?? false;
  const [isTogglingProtection, setIsTogglingProtection] = useState(false);
  const [toggleProtectionError, setToggleProtectionError] = useState<string | null>(null);

  // Token Deploy Protection toggle state
  const tokenDeployProtectionEnabled = supaToggles["tokenDeployProtectionEnabled"] ?? false;
  const [isTogglingDeployProtection, setIsTogglingDeployProtection] = useState(false);
  const [toggleDeployProtectionError, setToggleDeployProtectionError] = useState<string | null>(null);




  const [supaUsers, setSupaUsers] = useState<any[] | null>(null);
  const [accessUsers, setAccessUsers] = useState<any[]>([]);
  const [accessCodes, setAccessCodes] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("users").select("*").then(({ data }) => {
      if (data) {
        setSupaUsers(data.map(u => ({ ...u, lastSeen: u.last_seen, createdAt: u.created_at })));
      }
    });
    supabase.from("chat_access_users").select("*").then(({ data }) => {
      if (data) setAccessUsers(data.map(u => ({ ...u, codeUsed: u.code_used, grantedAt: u.created_at })));
    });
    supabase.from("chat_access_codes").select("*").then(({ data }) => {
      if (data) setAccessCodes(data.map(c => ({ ...c, maxUses: c.max_uses, createdBy: c.created_by, createdAt: c.created_at })));
    });
  }, []);

  const now = Date.now();
  const allUsers = supaUsers || [];
  const dailyUsers = allUsers.filter(
    (u: any) => u.lastSeen && now - u.lastSeen < 86400_000,
  ).length;
  const totalUsers = allUsers.length;

  const [supaCodes, setSupaCodes] = useState<any[] | null>(null);
  useEffect(() => {
    supabase.from("chat_access_codes").select("*").then(({ data }) => {
      if (data) setSupaCodes(data.map((d: any) => ({ code: d.code, createdBy: d.created_by, createdAt: d.created_at })));
    });
  }, []);
  const [supaAccessUsers, setSupaAccessUsers] = useState<any[] | null>(null);
  useEffect(() => {
    supabase.from("chat_access_users").select("*").then(({ data }) => {
      if (data) setSupaAccessUsers(data.map((d: any) => ({ userAddress: d.address, grantedBy: d.granted_by, createdAt: d.created_at })));
    });
  }, []);

  const [newCodeName, setNewCodeName] = useState("");
  const [newCodeUses, setNewCodeUses] = useState("");
  const [newGrantAddress, setNewGrantAddress] = useState("");
  const [confirmDeleteCodeId, setConfirmDeleteCodeId] = useState<string | null>(null);
  const [confirmRevokeAddr, setConfirmRevokeAddr] = useState<string | null>(
    null,
  );
  const [selectedCodeFilter, setSelectedCodeFilter] = useState<string | null>(
    null,
  );
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [searchedAddress, setSearchedAddress] = useState<string | null>(null);

  const [searchedUser, setSearchedUser] = useState<any>(null);
  useEffect(() => {
    if (searchedAddress) {
      supabase.from("users").select("*").eq("address", searchedAddress.toLowerCase()).single().then(({ data }) => {
        setSearchedUser(data);
      });
    } else {
      setSearchedUser(null);
    }
  }, [searchedAddress]);
  const searchedChatAccess = accessUsers.find(
    (u: any) => u.address === searchedAddress?.toLowerCase(),
  );

  const copyAddr = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 1500);
  };


  if (loadingAdminCheck) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "400px", gap: 12 }}>
        <RefreshCw size={24} className="animate-spin" style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "var(--font-geist), sans-serif" }}>Verifying administrator credentials...</span>
      </div>
    );
  }

  if (!address || !isAdmin) {
    return (
      <div style={{ 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center", 
        justifyContent: "center", 
        minHeight: "480px", 
        padding: 24,
        fontFamily: "var(--font-geist), system-ui, -apple-system, sans-serif" 
      }}>
        <div style={{ 
          background: "var(--surface, rgba(255,255,255,0.65))", 
          border: "1px solid rgba(239, 68, 68, 0.2)", 
          boxShadow: "0 12px 40px -8px rgba(239, 68, 68, 0.08)", 
          borderRadius: 20, 
          padding: 40, 
          maxWidth: 480, 
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          backdropFilter: "blur(16px)"
        }}>
          <div style={{ 
            background: "rgba(239, 68, 68, 0.08)", 
            border: "1px solid rgba(239, 68, 68, 0.2)", 
            borderRadius: "50%", 
            width: 64, 
            height: 64, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            color: "#ef4444"
          }}>
            <Lock size={32} />
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>
              Administrator Access Required
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
              {!address 
                ? "Please connect your web3 wallet to authorize administrator privileges." 
                : `The connected wallet address (${address.slice(0, 6)}...${address.slice(-4)}) is not registered in the platform's administrator whitelist.`}
            </p>
          </div>

          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0, fontStyle: "italic" }}>
            To manage settings, switch to an authorized wallet in your browser wallet extension.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "linear-gradient(135deg,#b30000,#ef4444)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Shield style={{ width: 18, height: 18, color: "#fff" }} />
          </div>
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Admin Panel
            </h2>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
              Smart contract & platform management
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "1px solid var(--border)",
          overflowX: "auto",
        }}
      >
        {(
          [
            { id: "bridge", label: "Bridge" },
            { id: "relayer_gas", label: "Backend Gas" },
            { id: "users", label: "Search User" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "var(--accent)" : "var(--text-muted)",
              background: "none",
              border: "none",
              borderBottom:
                tab === t.id
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
              cursor: "pointer",
              marginBottom: -1,
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Search Bar */}
          <div className="lf-card arc-premium-coating" style={{ padding: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <Search
                style={{ width: 16, height: 16, color: "var(--accent-red)" }}
              />
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--text-primary)",
                }}
              >
                Search User
              </h3>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  setSearchedAddress(userSearch.trim().toLowerCase())
                }
                placeholder="Enter wallet address (0xÃ¢â‚¬Â¦)"
                className="lf-input"
                style={{
                  flex: 1,
                  padding: "11px 16px",
                  fontSize: 13,
                  fontFamily: "monospace",
                }}
              />
              <button
                onClick={() =>
                  setSearchedAddress(userSearch.trim().toLowerCase())
                }
                className="lf-btn-primary"
                style={{
                  padding: "0 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 700,
                }}
              >
                <Search style={{ width: 14, height: 14 }} /> Search
              </button>
            </div>
          </div>

          {/* Results */}
          {searchedAddress && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Profile Card */}
              <div
                className="lf-card arc-premium-coating"
                style={{ padding: 20 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #b30000, #ef4444)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {searchedUser?.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                        }}
                      >
                        {searchedUser?.name ?? "Unknown User"}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 2,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            fontFamily: "monospace",
                          }}
                        >
                          {searchedAddress.slice(0, 12)}Ã¢â‚¬Â¦
                          {searchedAddress.slice(-8)}
                        </span>
                        <button
                          onClick={() => copyAddr(searchedAddress)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 2,
                            color:
                              copiedAddr === searchedAddress
                                ? "#22c55e"
                                : "var(--text-muted)",
                            display: "flex",
                          }}
                        >
                          {copiedAddr === searchedAddress ? (
                            <CheckCircle style={{ width: 12, height: 12 }} />
                          ) : (
                            <Copy style={{ width: 12, height: 12 }} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    {searchedChatAccess && (
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 99,
                          fontSize: 10,
                          fontWeight: 700,
                          background: "rgba(34,197,94,0.1)",
                          color: "#22c55e",
                          border: "1px solid rgba(34,197,94,0.2)",
                        }}
                      >
                        Ã¢Å“â€œ Chat Access
                      </span>
                    )}
                    {searchedUser?.isOnline && (
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 99,
                          fontSize: 10,
                          fontWeight: 700,
                          background: "rgba(59,130,246,0.1)",
                          color: "#3b82f6",
                          border: "1px solid rgba(59,130,246,0.2)",
                        }}
                      >
                        Ã¢â€”Â Online
                      </span>
                    )}
                  </div>
                </div>

                {/* Profile Details */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  {[
                    {
                      label: "Twitter",
                      value: searchedUser?.twitterId
                        ? `@${searchedUser.twitterId}`
                        : "Ã¢â‚¬â€",
                    },
                    {
                      label: "Telegram",
                      value: searchedUser?.telegramId
                        ? `@${searchedUser.telegramId}`
                        : "Ã¢â‚¬â€",
                    },
                    {
                      label: "Last Seen",
                      value: searchedUser?.lastSeen
                        ? new Date(searchedUser.lastSeen).toLocaleString()
                        : "Ã¢â‚¬â€",
                    },
                    {
                      label: "Chat Unlock",
                      value: searchedChatAccess
                        ? searchedChatAccess.codeUsed
                          ? `Code: ${searchedChatAccess.codeUsed}`
                          : "Admin Granted"
                        : "No Access",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        padding: "10px 14px",
                        background: "var(--bg)",
                        borderRadius: 8,
                        border: "1px solid var(--border-soft)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.07em",
                          marginBottom: 4,
                        }}
                      >
                        {item.label}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>



              {!searchedUser && (
                <div
                  className="lf-card"
                  style={{
                    padding: 32,
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 13,
                  }}
                >
                  No platform data found for this address.
                </div>
              )}
            </div>
          )}

          {!searchedAddress && (
            <div
              style={{
                textAlign: "center",
                padding: 40,
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              Enter a wallet address above to view their full profile, vault
              history, and chat access details.
            </div>
          )}
        </div>
      )}
      {/* --- Bridge Tab --- */}
      {tab === "bridge" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <AdminDashboard />
        </div>
      )}

      {/* --- Relayer Gas Tab --- */}
      {tab === "relayer_gas" && (
        <RelayerGasManagement />
      )}

    </div>
  );
}

