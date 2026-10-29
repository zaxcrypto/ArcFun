"use client";

import React, { useState, useEffect } from "react";
import { Shield, ChevronRight, ChevronsRight, Fingerprint, Lock, AlertTriangle, Key, Activity, Wallet, Loader2, CheckCircle2, X, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { motion } from "framer-motion";

import { useAccount, useSignMessage } from "wagmi";
import { ArcWalletDashboard } from "./arc-wallet-dashboard";
import { TermsOfServiceModal } from "@/components/terms-of-service-modal";
import { PrivacyPolicyModal } from "@/components/privacy-policy-modal";

export const LEGAL_VERSION = {
  terms: "v1.0",
  privacy: "v1.0"
};

const TypewriterText = ({ text, delay = 0, onComplete }: { text: string; delay?: number, onComplete?: () => void }) => {
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    let interval: NodeJS.Timeout;

    timeout = setTimeout(() => {
      setIsTyping(true);
      let currentIndex = 0;
      interval = setInterval(() => {
        if (currentIndex <= text.length) {
          setDisplayText(text.slice(0, currentIndex));
          currentIndex++;
        } else {
          clearInterval(interval);
          setIsTyping(false);
          if (onComplete) onComplete();
        }
      }, 30); // Typing speed
    }, delay);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [text, delay, onComplete]);

  return (
    <span className="font-mono relative whitespace-nowrap">
      {displayText}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
        className={`inline-block w-1.5 h-3 bg-red-500 ml-1 translate-y-[2px] ${!isTyping && displayText.length === text.length ? 'hidden' : ''}`}
      />
    </span>
  );
};

export type HealthStatus =
  | "INITIALIZING"
  | "UNAUTHENTICATED"
  | "REQUIRES_ONBOARDING_STEP_1"
  | "REQUIRES_PROVISIONING"
  | "REQUIRES_SECURITY_SETUP"
  | "REQUIRES_PASSWORD_SETUP"
  | "OK"
  | "LOCKED"
  | "SUSPENDED"
  | "SERVICE_DEGRADED"
  | "MAINTENANCE"
  | "ERROR";

function WalletAuthGraphic({ isScanning }: { isScanning?: boolean }) {
  return (
    <div className="relative w-36 h-36 flex items-center justify-center text-black dark:text-white my-3 select-none">
      <svg
        viewBox="0 0 160 160"
        fill="none"
        stroke="currentColor"
        className="w-full h-full text-black dark:text-white"
      >
        {/* Corner Brackets */}
        <path d="M 24 54 V 24 H 54" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 106 24 H 136 V 54" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 24 106 V 136 H 54" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 106 136 H 136 V 106" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Cryptographic Security Shield */}
        <path
          d="M 80 36 L 116 50 V 80 C 116 102 100 120 80 126 C 60 120 44 102 44 80 V 50 Z"
          strokeWidth="3"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Inner Security Keyhole / Vault Lock */}
        <path
          d="M 68 70 C 68 63 73 58 80 58 C 87 58 92 63 92 70 C 92 74 89 78 85 80 L 88 96 H 72 L 75 80 C 71 78 68 74 68 70 Z"
          strokeWidth="2.5"
          strokeLinejoin="round"
          fill="currentColor"
          fillOpacity="0.08"
        />
        <circle cx="80" cy="70" r="3.5" fill="currentColor" stroke="none" />
      </svg>

      {/* Subtle scanner laser beam when active */}
      {isScanning && (
        <motion.div
          initial={{ top: "18%", opacity: 0 }}
          animate={{ top: "82%", opacity: [0, 1, 1, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
          className="absolute left-6 right-6 h-[2px] bg-black dark:bg-white shadow-[0_0_8px_rgba(0,0,0,0.4)] dark:shadow-[0_0_10px_rgba(255,255,255,0.8)] z-20 pointer-events-none"
        />
      )}
    </div>
  );
}

export function ArcNativeWallet({
  isFloating,
  isOpen = true,
  onWalletAddressChange,
  onHealthChange
}: {
  isFloating?: boolean;
  isOpen?: boolean;
  onWalletAddressChange?: (addr: string | null) => void;
  onHealthChange?: (health: HealthStatus) => void;
}) {
  const [health, setHealth] = useState<HealthStatus>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("arc_wallet_cached_health");
      if (cached && (cached === "OK" || cached === "UNAUTHENTICATED")) {
        return cached as HealthStatus;
      }
    }
    return "INITIALIZING";
  });

  useEffect(() => {
    if (onHealthChange) {
      onHealthChange(health);
    }
    if (typeof window !== "undefined" && (health === "OK" || health === "UNAUTHENTICATED")) {
      try {
        localStorage.setItem("arc_wallet_cached_health", health);
      } catch {}
    }
  }, [health, onHealthChange]);

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [degradedDetails, setDegradedDetails] = useState<any>(null);
  const [securityStatus, setSecurityStatus] = useState<"FULLY_SECURED" | "SECURITY_SETUP_REQUIRED" | null>(null);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const checkHealth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setHealth("UNAUTHENTICATED");
        return;
      }

      const res = await fetch('/api/wallet/health', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response from health endpoint:", res.status, text.substring(0, 200));
        setHealth("ERROR");
        setDegradedDetails(`HTTP ${res.status} Error. Response: ${text.substring(0, 40)}...`);
        return;
      }

      const data = await res.json();

      if (data.status) {
        if (data.status === "ERROR") {
          setHealth("ERROR");
          setDegradedDetails(data.error || "Unknown server error");
          return;
        }
        setHealth(data.status as HealthStatus);
        if (data.wallet) {
          setWalletAddress(data.wallet);
          if (onWalletAddressChange) onWalletAddressChange(data.wallet);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('arc-wallet-connected', { detail: { address: data.wallet } }));
            if (data.solanaWallet) {
              localStorage.setItem('arc_circle_solana_address', data.solanaWallet);
              window.dispatchEvent(new CustomEvent('arc-solana-wallet-connected', { detail: { address: data.solanaWallet } }));
            } else {
              // Lazily provision missing Solana Circle DCW wallet for existing users
              fetch('/api/wallet/provision', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ blockchain: 'SOL-DEVNET' })
              }).then(r => r.json()).then(res => {
                if (res.wallet?.wallet_address) {
                  localStorage.setItem('arc_circle_solana_address', res.wallet.wallet_address);
                  window.dispatchEvent(new CustomEvent('arc-solana-wallet-connected', { detail: { address: res.wallet.wallet_address } }));
                }
              }).catch(e => console.warn("Background Solana Circle DCW provisioning note:", e.message));
            }
          }
        }
        if (data.details) setDegradedDetails(data.details);
        if (data.securityStatus) setSecurityStatus(data.securityStatus);
        if (data.hasPasskey !== undefined) setHasPasskey(data.hasPasskey);
        if (data.hasPassword !== undefined) setHasPassword(data.hasPassword);
      } else {
        setHealth("ERROR");
        setDegradedDetails(data.error || "Invalid response format");
      }
    } catch (e: any) {
      console.error("Health check failed:", e);
      setHealth("ERROR");
      setDegradedDetails(e.message || "Network request failed");
    }
  };

  useEffect(() => {
    const enforceIdentity = async () => {
      if (!address) {
        await supabase.auth.signOut();
        setHealth("UNAUTHENTICATED");
        setWalletAddress(null);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user?.email !== `${address.toLowerCase()}@arcfun.xyz`) {
        await supabase.auth.signOut();
        setHealth("UNAUTHENTICATED");
        setWalletAddress(null);
        return;
      }

      checkHealth();
    };

    enforceIdentity();
  }, [address]);

  const handleSiweAuth = async () => {
    if (!address) {
      alert("Please connect your wallet first via the top right button.");
      return;
    }
    setIsAuthenticating(true);
    try {
      // 1. Get Challenge Nonce
      const challengeRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.toLowerCase() })
      });
      const challengeData = await challengeRes.json();
      if (!challengeData.nonce) throw new Error("Failed to get challenge nonce");

      // 2. Format SIWE Message
      const { SiweMessage } = await import('siwe');
      const message = new SiweMessage({
        domain: window.location.host,
        address: address,
        statement: 'Sign in to Arc Wallet',
        uri: window.location.origin,
        version: '1',
        chainId: 1, // Assume mainnet/base for SIWE formatting
        nonce: challengeData.nonce
      });
      const preparedMessage = message.prepareMessage();

      // 3. Sign Message
      const signature = await signMessageAsync({ message: preparedMessage });

      // 4. Verify Signature
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature, message: preparedMessage })
      });

      const data = await res.json();
      if (data.success && data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        setHealth("INITIALIZING");
        await checkHealth();
      } else {
        throw new Error(data.error || "Authentication failed");
      }
    } catch (error: any) {
      console.error("SIWE Error:", error);
      alert(error.message || "Failed to sign message.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -- RENDERERS --

  if (health === "INITIALIZING") {
    return (
      <div className="flex h-full min-h-[500px] items-center justify-center flex-col px-6 py-10 text-center animate-in fade-in duration-500 max-w-[380px] mx-auto">
        <div className="flex flex-col items-center gap-1.5 mb-5">
          <h1 className="text-[32px] font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
            Syncing Wallet
          </h1>
          <p className="text-[13px] font-medium text-[var(--text-muted)] tracking-wide">
            Establishing secure connection...
          </p>
        </div>

        <div className="my-2">
          <WalletAuthGraphic isScanning={true} />
        </div>

        <div className="w-full mt-6 flex items-center justify-center">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]" />
            <span>Loading Arc Environment...</span>
          </div>
        </div>
      </div>
    );
  }

  if (health === "UNAUTHENTICATED") {
    // STATE 1: UNAUTHENTICATED (Monochrome Wallet Verification)
    return (
      <div className="flex h-full min-h-[500px] items-center justify-center flex-col px-6 py-10 text-center animate-in fade-in duration-500 max-w-[380px] mx-auto">
        {/* Top Titles */}
        <div className="flex flex-col items-center gap-2 mb-4">
          <h1 className="text-[28px] font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
            Authentication Required
          </h1>
          <p className="text-[13px] font-medium text-[var(--text-muted)] tracking-normal max-w-[280px] leading-relaxed">
            Connect and verify your Browser Wallet to access Arc Wallet.
          </p>
        </div>

        {/* Center Cryptographic Security Vector Graphic */}
        <div className="my-2">
          <WalletAuthGraphic isScanning={isAuthenticating} />
        </div>

        {/* Primary Action Button */}
        <div className="w-full mt-6 flex flex-col items-center">
          <button
            onClick={handleSiweAuth}
            disabled={isAuthenticating}
            className="w-full max-w-[280px] h-[50px] bg-[#27272a] text-white hover:bg-[#3f3f46] border border-[#3f3f46] dark:bg-[#27272a] dark:text-white dark:hover:bg-[#3f3f46] dark:border-white/20 font-bold text-[14.5px] tracking-wide rounded-full transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isAuthenticating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Wallet...</span>
              </>
            ) : (
              <span>Verify Browser Wallet</span>
            )}
          </button>

          {/* Need help link */}
          <button
            type="button"
            onClick={() => window.open('/docs#support', '_blank')}
            className="mt-5 text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            Need help connecting?
          </button>
        </div>
      </div>
    );
  }

  if (health === "LOCKED") {
    return (
      <div className="flex h-full min-h-[500px] items-center justify-center flex-col gap-4 p-6">
        <Lock className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-3xl font-semibold text-red-500">Wallet Locked</h1>
        <p className="text-[var(--text-muted)] text-center max-w-md">
          Your Arc Wallet has been locked to protect your assets. All APIs and transfers are currently frozen.
        </p>
        <button className="mt-4 px-6 py-2 bg-[var(--surface-hover)] hover:bg-[var(--border)] rounded-full transition-colors font-medium border border-[var(--border)]">
          Initiate Recovery
        </button>
      </div>
    );
  }

  if (health === "MAINTENANCE") {
    return (
      <div className="flex h-full min-h-[500px] items-center justify-center flex-col p-6 text-center animate-in fade-in duration-500">
        <div className="relative group mb-6">
          <div className="relative w-24 h-24 rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/5 flex items-center justify-center overflow-hidden">
            <motion.div 
              initial={{ top: "-20%" }}
              animate={{ top: "120%" }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              className="absolute left-0 right-0 h-[2px] bg-[#3b82f6] shadow-[0_0_8px_#3b82f6] z-10"
            />
            <Lock className="w-10 h-10 text-[#3b82f6] relative z-20" strokeWidth={1.5} />
          </div>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] mb-2">Production Maintenance</h2>
        <p className="text-[14px] text-[var(--text-muted)] mb-2 max-w-[280px] mx-auto leading-relaxed">
          Only Admins can access wallet provisioning for now. 
        </p>
        <p className="text-[14px] font-semibold text-[#3b82f6] mt-1">Stay tuned!</p>
      </div>
    );
  }

  if (health === "SUSPENDED") {
    return (
      <div className="flex h-full min-h-[500px] items-center justify-center flex-col gap-4 p-6">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
        <h1 className="text-3xl font-semibold text-yellow-500">Account Suspended</h1>
        <p className="text-[var(--text-muted)] text-center max-w-md">
          Your account has been suspended by the compliance team. Please contact support.
        </p>
      </div>
    );
  }

  if (health === "ERROR") {
    return (
      <div className="flex h-full min-h-[500px] items-center justify-center flex-col gap-4 p-6">
        <Activity className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-2xl font-semibold">Service Error</h1>
        <p className="text-[var(--text-muted)] text-center max-w-sm">
          {typeof degradedDetails === 'string' ? degradedDetails : "Unable to reach Arc Wallet core services."}
        </p>
        <button onClick={checkHealth} className="mt-4 px-6 py-2 bg-[#5351FF] text-white hover:bg-[#5351FF]/80 rounded-full transition-colors">
          Retry
        </button>
      </div>
    );
  }

  if (health === "REQUIRES_ONBOARDING_STEP_1" || health === "REQUIRES_PROVISIONING" || health === "REQUIRES_SECURITY_SETUP" || health === "REQUIRES_PASSWORD_SETUP") {
    return <ArcWalletOnboarding initialState={health} onComplete={checkHealth} />;
  }

  // OK or SERVICE_DEGRADED
  const isReadOnly = health === "SERVICE_DEGRADED";

  return <ArcWalletDashboard 
            walletAddress={walletAddress || ""} 
            isReadOnly={isReadOnly} 
            degradedDetails={degradedDetails} 
            isFloating={isFloating}
            isOpen={isOpen}
            securityStatus={securityStatus}
            onStartSecuritySetup={() => {
              if (!hasPasskey) {
                setHealth("REQUIRES_SECURITY_SETUP");
              } else if (!hasPassword) {
                setHealth("REQUIRES_PASSWORD_SETUP");
              }
            }}
          />;
}

// --- ONBOARDING COMPONENT ---

function SlideToCreateButton({ onComplete, loading, disabled = false, text = "SLIDE TO CREATE", loadingText = "CREATING..." }: { onComplete: () => void, loading: boolean, disabled?: boolean, text?: string, loadingText?: string }) {
  const [success, setSuccess] = useState(false);

  const handleDragEnd = (event: any, info: any) => {
    if (disabled) return;
    // If the user drags the knob far enough to the right
    if (info.offset.x > 180) {
      setSuccess(true);
      onComplete();
    }
  };

  return (
    <div className={`relative w-full max-w-[280px] mx-auto h-[54px] rounded-full p-[2px] shadow-lg group transition-all duration-300 ${disabled ? 'opacity-50 pointer-events-none cursor-not-allowed bg-[var(--surface-hover)]' : 'bg-gradient-to-r from-[#ff2a2a] to-[#8a0000]'}`}>
      {/* Inner dark track */}
      <div className="w-full h-full bg-[#0a0a0a] rounded-full flex items-center justify-center">
        <span className={`text-[13px] font-bold tracking-widest transition-colors duration-300 ml-8 ${loading || success ? 'text-[#ff2a2a]' : disabled ? 'text-[var(--text-muted)]' : 'text-white'}`}>
          {loading || success ? loadingText : text}
        </span>
      </div>

      {/* Draggable knob or Loading indicator (placed over the track) */}
      {!loading && !success ? (
        <motion.div
          drag={!disabled ? "x" : false}
          dragConstraints={{ left: 0, right: 226 }} // 280 - 54 = 226
          dragElastic={0.05}
          dragSnapToOrigin={true}
          onDragEnd={handleDragEnd}
          whileHover={!disabled ? { scale: 1.02 } : {}}
          className={`absolute left-0 top-0 w-[54px] h-[54px] bg-white rounded-full flex items-center justify-center shadow-lg z-20 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
        >
          <ChevronsRight className={`w-7 h-7 ml-0.5 ${disabled ? 'text-gray-400' : 'text-[#0a0a0a]'}`} strokeWidth={2.5} />
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute right-0 top-0 w-[54px] h-[54px] bg-white rounded-full flex items-center justify-center z-20 shadow-lg"
        >
           <Loader2 className="w-6 h-6 text-[#ff2a2a] animate-spin" />
        </motion.div>
      )}
    </div>
  );
}

function ArcWalletOnboarding({ initialState, onComplete }: { initialState: HealthStatus, onComplete: () => void }) {
  const [step, setStep] = useState<number>(() => {
    if (initialState === "REQUIRES_ONBOARDING_STEP_1") return 1;
    if (initialState === "REQUIRES_PROVISIONING") return 3;
    if (initialState === "REQUIRES_SECURITY_SETUP") return 4;
    if (initialState === "REQUIRES_PASSWORD_SETUP") return 5;
    return 1;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [supportsPasskeys, setSupportsPasskeys] = useState<boolean>(true);
  
  const [consentChecked, setConsentChecked] = useState(true);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  useEffect(() => {
    async function checkSupport() {
      if (typeof window === 'undefined') return;
      if (!browserSupportsWebAuthn()) {
        setSupportsPasskeys(false);
        return;
      }
      
      if (
        typeof window.PublicKeyCredential !== 'undefined' && 
        typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
      ) {
        try {
          const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setSupportsPasskeys(available);
        } catch (e) {
          setSupportsPasskeys(false);
        }
      } else {
        setSupportsPasskeys(false);
      }
    }
    checkSupport();
  }, []);

  const handleSetPassword = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
      if (password !== confirmPassword) throw new Error("Passwords do not match");
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication missing.");

      const res = await fetch('/api/wallet/security', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ new_password: password })
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      onComplete();
    } catch (e: any) {
      let msg = e.message;
      const genericErrors = ["Internal Server Error", "Service Error", "Unknown Error", "Unexpected token"];
      if (genericErrors.some(g => msg.includes(g))) msg = "The network is busy. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication session missing. Please verify browser wallet again.");

      const res = await fetch('/api/arc-account/create', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await res.json();

      if (data.success) {
        // Legal version tracking - only save once
        if (session.user && !session.user.user_metadata?.terms_version) {
          await supabase.auth.updateUser({
            data: {
              terms_version: LEGAL_VERSION.terms,
              privacy_version: LEGAL_VERSION.privacy,
              accepted_at: new Date().toISOString()
            }
          });
        }
        setStep(3); // Move to provision
      } else {
        throw new Error(data.error || "Failed to create Arc Account");
      }
    } catch (e: any) {
      let msg = e.message;
      const genericErrors = ["Internal Server Error", "Service Error", "Unknown Error", "Unexpected token"];
      if (genericErrors.some(g => msg.includes(g))) msg = "The network is busy. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleProvision = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication session missing.");

      // 1. Provision EVM (ARC-TESTNET) Circle DCW wallet
      const res = await fetch('/api/wallet/provision', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ blockchain: 'ARC-TESTNET' })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to provision Arc EVM Circle Wallet");
      }

      // 2. Provision Solana (SOL-DEVNET) Circle DCW wallet
      try {
        const resSol = await fetch('/api/wallet/provision', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ blockchain: 'SOL-DEVNET' })
        });
        const dataSol = await resSol.json();
        if (dataSol.wallet?.wallet_address && typeof window !== 'undefined') {
          localStorage.setItem('arc_circle_solana_address', dataSol.wallet.wallet_address);
          window.dispatchEvent(new CustomEvent('arc-solana-wallet-connected', { detail: { address: dataSol.wallet.wallet_address } }));
        }
      } catch (solErr: any) {
        console.warn("Solana Circle Wallet provisioning warning:", solErr.message);
      }

      setStep(4); // Move to security
    } catch (e: any) {
      let msg = e.message;
      const genericErrors = ["Internal Server Error", "Service Error", "Unknown Error", "Unexpected token"];
      if (genericErrors.some(g => msg.includes(g))) msg = "The network is busy. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSecurity = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supportsPasskeys) {
        throw new Error("Your browser or device does not support Passkeys.");
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication session missing.");

      // 1. Get registration options
      const optRes = await fetch('/api/auth/passkey/generate-registration-options', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const optData = await optRes.json();

      if (!optData.success) {
        throw new Error(optData.error || "Failed to generate passkey options");
      }

      // 2. Browser ceremony
      let attResp;
      try {
        attResp = await startRegistration(optData.options);
      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
          // The user cancelled the prompt, OR the device lacks a compatible authenticator (isUVPAA=false).
          // We gracefully exit without throwing a red UI error.
          console.warn("Passkey setup cancelled or blocked by device policy.");
          return;
        }
        throw new Error("Passkey ceremony failed: " + err.message);
      }

      // 3. Verify on server
      const verRes = await fetch('/api/auth/passkey/verify-registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ registrationResponse: attResp })
      });
      const verData = await verRes.json();

      if (!verData.success) {
        throw new Error(verData.error || "Failed to verify passkey");
      }

      setStep(5); 

    } catch (e: any) {
      console.error(e);
      let msg = e.message;
      const genericErrors = ["Internal Server Error", "Service Error", "Unknown Error", "Unexpected token"];
      if (genericErrors.some(g => msg.includes(g))) msg = "The network is busy. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSkipSecurity = async () => {
    setLoading(true);
    try {
      await supabase.auth.updateUser({
        data: { passkey_skipped: true }
      });
      // Skip BOTH security setups completely per Option B policy.
      // Health check backend will enforce read-only wallet mode.
      onComplete();
    } catch (e) {
      console.error(e);
      onComplete(); 
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordOnlyFallback = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication missing");

      const res = await fetch('/api/wallet/security/fallback', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to configure device fallback");
      }
      
      setStep(5);
    } catch (e: any) {
      let msg = e.message;
      const genericErrors = ["Internal Server Error", "Service Error", "Unknown Error", "Unexpected token"];
      if (genericErrors.some(g => msg.includes(g))) msg = "The network is busy. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-[500px] items-center justify-center flex-col p-6 w-full max-w-md mx-auto relative overflow-hidden">

        {/* Step 1: Welcome to Arc Wallet */}
        {step === 1 && (
          <div className="flex flex-col items-center w-full h-full flex-1 relative z-10 py-2">
            {/* Top Content (Centered) */}
            <div className="flex flex-col items-center w-full mt-auto">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="w-16 h-16 bg-gradient-to-tr from-[#4a0000] to-[#b30000] rounded-[20px] flex items-center justify-center mb-4 shadow-lg relative z-10 border border-white/10 overflow-hidden"
              >
                <Wallet className="w-8 h-8 text-white relative z-10" />
                {/* Subtle Scanner Line */}
              <motion.div
                animate={{ y: ["-100%", "250%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute left-0 top-0 w-full h-[50%] bg-gradient-to-b from-transparent via-white/10 to-white/40 z-20 pointer-events-none border-b border-white/70 shadow-[0_4px_15px_rgba(255,255,255,0.5)]"
              />
            </motion.div>

            <motion.h1
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-[20px] font-bold tracking-tight mb-5 text-[var(--text-primary)] text-center relative z-10 font-sans"
            >
              Create Your ArcFun Wallet
            </motion.h1>

            <div className="flex flex-col w-full gap-2 mb-6 px-4 relative z-10">
              {["Built for ArcFun Terminal", "Simple & Clean UI", "Passkey Protected", "Secure Asset Storage"].map((text, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + (i * 0.8), duration: 0.3 }}
                  key={i} 
                  className="flex items-center gap-3 bg-[var(--surface)]/60 border border-[var(--border-soft)] rounded-xl py-2.5 px-3 shadow-sm backdrop-blur-md"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5 + (i * 0.8), type: "spring", stiffness: 300 }}
                  >
                    <CheckCircle2 className="w-[18px] h-[18px] text-green-500" />
                  </motion.div>
                  <div className="text-[var(--text-primary)] text-[13px] font-medium h-5 flex items-center font-mono tracking-tight">
                    <TypewriterText text={text} delay={500 + (i * 800)} />
                  </div>
                </motion.div>
              ))}
            </div>

              {error && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-sm relative z-10">
                  {error}
                </motion.div>
              )}
            </div>

            {/* Bottom Slider (Pushed down) */}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 3.5 }}
              className="w-full relative z-10 mt-auto pt-6 pb-2 flex flex-col items-center"
            >
              <div className="flex flex-row items-center justify-center gap-1.5 w-full max-w-[280px] mb-2">
                <button
                  type="button"
                  onClick={() => setConsentChecked(!consentChecked)}
                  className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-[3px] border transition-colors ${consentChecked ? 'bg-[#ff2a2a] border-[#ff2a2a] text-white' : 'border-[var(--border)] bg-[var(--surface)]'}`}
                >
                  {consentChecked && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                </button>
                <p className="text-[10px] whitespace-nowrap tracking-tight text-[var(--text-secondary)] leading-none mt-[1px]">
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setIsTermsOpen(true)}
                    className="text-[#ff2a2a] hover:underline font-medium inline-block bg-transparent border-none p-0 cursor-pointer text-[10px]"
                  >
                    Terms of Service
                  </button>
                  {' '}and{' '}
                  <button
                    type="button"
                    onClick={() => setIsPrivacyOpen(true)}
                    className="text-[#ff2a2a] hover:underline font-medium inline-block bg-transparent border-none p-0 cursor-pointer text-[10px]"
                  >
                    Privacy Policy
                  </button>
                  .
                </p>
              </div>

              <p className="text-[9.5px] text-center text-[var(--text-muted)] max-w-[290px] mb-3 leading-tight opacity-75">
                ArcFun Wallets are powered by Circle Developer-Controlled Wallets. ArcFun does not hold custody of user funds. By creating a wallet, you accept all terms and third-party infrastructure risks.
              </p>

              <SlideToCreateButton onComplete={handleCreateAccount} loading={loading} disabled={!consentChecked} />
            </motion.div>
            
            <TermsOfServiceModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
            <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
          </div>
        )}

        {/* Step 3: Provision Circle Wallet */}
        {step === 3 && (
          <div className="flex-1 flex flex-col justify-between items-center w-full h-full relative z-10 animate-in fade-in zoom-in-95 duration-500 py-2">
            {/* Ambient Background */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[250px] h-[250px] bg-[var(--accent-red)]/5 blur-[80px] rounded-full pointer-events-none" />

            {/* Top Content (Header & Icon) */}
            <div className="flex flex-col items-center w-full">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="w-16 h-16 bg-gradient-to-tr from-[#4a0000] to-[#b30000] rounded-[20px] flex items-center justify-center mb-3 shadow-lg relative z-10 border border-white/10 overflow-hidden"
              >
                <Key className="w-8 h-8 text-white relative z-10" />
                {/* Subtle Scanner Line */}
                <motion.div
                  animate={{ y: ["-100%", "250%"] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute left-0 top-0 w-full h-[50%] bg-gradient-to-b from-transparent via-white/10 to-white/40 z-20 pointer-events-none border-b border-white/70 shadow-[0_4px_15px_rgba(255,255,255,0.5)]"
                />
              </motion.div>

              <motion.h2
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-[20px] font-bold tracking-tight mb-2 text-[var(--text-primary)] text-center relative z-10 font-sans"
              >
                Initializing Infrastructure
              </motion.h2>
            </div>

            {/* Middle Content (Checklist - Centered horizontally & vertically) */}
            <div className="w-full max-w-[310px] mx-auto flex flex-col relative z-10 my-auto py-2">
              {/* Vertical connecting line */}
              <div className="absolute left-[11px] top-[14px] bottom-[16px] w-px bg-gradient-to-b from-[var(--border)] via-[var(--border-soft)] to-transparent z-0" />
              
              {[
                { text: "Account Handshake Verified", state: "done" },
                { text: "Provisioning Sub-Wallet Allocation", state: loading ? "active" : "pending" },
                { text: "Registering Identity Credentials", state: "pending" },
                { text: "Finalizing Health Verification", state: "pending" }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + (i * 0.8), duration: 0.3 }}
                  className="flex items-center gap-3 relative py-2"
                >
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5 + (i * 0.8), type: "spring", stiffness: 300 }}
                    className="flex-shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center bg-[var(--bg)] z-10 relative"
                  >
                    {item.state === 'done' ? (
                      <div className="w-full h-full rounded-full bg-green-500/10 border border-green-500 flex items-center justify-center shadow-[0_0_8px_rgba(34,197,94,0.2)]">
                        <Check className="w-3 h-3 text-green-500" />
                      </div>
                    ) : item.state === 'active' ? (
                      <div className="w-full h-full rounded-full border border-[var(--accent-red)] flex items-center justify-center shadow-[0_0_8px_rgba(179,0,0,0.3)] bg-[var(--accent-red)]/10">
                        <Loader2 className="w-3 h-3 text-[var(--accent-red)] animate-spin" />
                      </div>
                    ) : (
                      <div className="w-full h-full rounded-full border border-[var(--border)] flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--border)]" />
                      </div>
                    )}
                  </motion.div>
                  
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className={`text-[12.5px] font-medium tracking-tight whitespace-nowrap overflow-hidden text-ellipsis transition-colors duration-500 font-mono ${
                      item.state === 'done' ? 'text-[var(--text-primary)]' :
                      item.state === 'active' ? 'text-[var(--text-primary)]' :
                      'text-[var(--text-muted)] opacity-60'
                    }`}>
                      <TypewriterText text={item.text} delay={500 + (i * 800)} />
                    </span>
                    {item.state === 'active' && (
                      <motion.span 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.8 }}
                        transition={{ delay: (500 + (i * 800)) / 1000 + 1.2 }}
                        className="text-[10px] font-mono text-[var(--accent-red)] mt-0.5 animate-pulse"
                      >
                        {'>'} executing_command...
                      </motion.span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full mb-3 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-sm relative z-10 text-center">
                {error}
              </motion.div>
            )}

            {/* Bottom Slider or Loading */}
            <div className="w-full mt-auto pt-2 pb-1 flex flex-col items-center relative z-10">
              {!loading && !error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 3.8 }}
                  className="w-full flex justify-center"
                >
                  <SlideToCreateButton text="SLIDE TO CONTINUE" loadingText="PROVISIONING..." onComplete={handleProvision} loading={loading} />
                </motion.div>
              )}

              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-full py-4 text-center text-[12px] font-mono text-[var(--text-muted)] tracking-tight"
                >
                  Connecting to Circle Infrastructure...
                </motion.div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Secure Your Account */}
        {step === 4 && (
          <div className="flex-1 flex flex-col justify-between items-center w-full animate-in slide-in-from-bottom-8 duration-500 py-6 relative z-10">
             {/* TOP (Title) */}
             <div className="w-full flex justify-center mb-2">
               <h2 className="text-[22px] font-bold tracking-tight text-[var(--text-primary)] font-sans text-center">Secure Your ArcFun Wallet</h2>
             </div>

             {/* CENTER (Fingerprint) */}
             <div className="flex-1 flex flex-col items-center justify-center w-full relative min-h-[200px]">
               {/* Ambient Background */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-[#00D494]/5 blur-[70px] rounded-full pointer-events-none" />

               <div className="relative group flex flex-col items-center">
                  <button 
                     onClick={supportsPasskeys ? handleSecurity : undefined}
                     disabled={loading || !supportsPasskeys}
                     className={`relative w-28 h-28 rounded-full border border-[#00D494]/30 bg-[#00D494]/5 flex items-center justify-center overflow-hidden transition-all duration-300 ${supportsPasskeys && !loading ? 'hover:scale-105 hover:bg-[#00D494]/10 cursor-pointer shadow-[0_0_25px_rgba(0,212,148,0.25)]' : 'cursor-default'}`}
                  >
                     <motion.div 
                        initial={{ top: "-20%" }}
                        animate={{ top: "120%" }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        className="absolute left-0 right-0 h-[2px] bg-[#00D494] shadow-[0_0_8px_#00D494] z-10"
                     />
                     {loading && supportsPasskeys ? (
                       <Loader2 className="w-12 h-12 text-[#00D494] relative z-20 animate-spin" />
                     ) : (
                       <Fingerprint className="w-12 h-12 text-[#00D494] relative z-20 transition-transform group-hover:scale-110" strokeWidth={1.5} />
                     )}
                  </button>
                  
                  {supportsPasskeys && !loading && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                      className="mt-5 text-[#00D494] text-[12px] font-medium tracking-wide flex items-center gap-1.5 opacity-80 whitespace-nowrap"
                    >
                      <span className="animate-pulse">Tap to enable Passkey</span>
                    </motion.div>
                  )}
                  {loading && supportsPasskeys && (
                    <div className="mt-5 text-[#00D494] text-[12px] font-medium tracking-wide opacity-80 whitespace-nowrap">
                      Registering...
                    </div>
                  )}
               </div>
               
               {error && (
                 <div className="w-full max-w-[280px] mx-auto mt-12 relative z-10">
                   <p className="text-[13px] text-center text-red-400 font-medium bg-red-500/10 p-3 rounded-xl border border-red-500/20 shadow-lg">
                     {error}
                   </p>
                 </div>
               )}

               {!supportsPasskeys && (
                 <div className="flex flex-col items-center gap-4 mt-12 w-full px-4 relative z-10">
                   <div className="text-center bg-[var(--surface-hover)] p-4 rounded-xl border border-[var(--border)] shadow-sm">
                     <p className="text-[13px] text-[var(--text-primary)] font-medium mb-2">
                       Passkeys may not be available on this browser.
                     </p>
                     <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                       You can continue securely using your wallet password.<br/>
                       You can always add a passkey later from another supported device.
                     </p>
                   </div>
                   <button
                     onClick={handlePasswordOnlyFallback}
                     disabled={loading}
                     className="w-full h-[44px] bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-default)] rounded-full flex items-center justify-center transition-all duration-300 shadow-sm font-semibold text-[13px] tracking-wide"
                   >
                     {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Create Password Instead</span>}
                   </button>
                   <button
                     onClick={handleSecurity}
                     disabled={loading}
                     className="w-full h-[44px] bg-transparent border border-[var(--border-soft)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] rounded-full flex items-center justify-center transition-all duration-300 font-medium text-[13px] tracking-wide"
                   >
                     {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Try Passkey Anyway</span>}
                   </button>
                 </div>
               )}
             </div>

             {/* BOTTOM (Skip) */}
             <div className="w-full flex flex-col items-center mt-auto pt-8">
               <button
                 onClick={handleSkipSecurity}
                 disabled={loading}
                 className="text-[14px] text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium transition-colors"
               >
                 Skip for now
               </button>
             </div>
          </div>
        )}

        {/* Step 5: Password Fallback */}
        {step === 5 && (
          <div className="flex flex-col animate-in fade-in zoom-in-95 duration-500 pb-2 w-full items-center">
            {/* Ambient background glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[250px] h-[250px] bg-[#5351FF]/10 blur-[80px] rounded-full pointer-events-none" />

            <div className="mb-4 flex flex-col items-center text-center pt-1 relative z-10">
               <div className="relative mb-3">
                  <motion.div 
                     initial={{ scale: 0.8, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ duration: 0.5, type: "spring" }}
                     className="relative w-16 h-16 rounded-[16px] border border-[#5351FF]/30 bg-gradient-to-tr from-[#5351FF]/5 to-[#5351FF]/20 flex items-center justify-center overflow-hidden shadow-[0_0_20px_rgba(83,81,255,0.15)] backdrop-blur-sm"
                  >
                     <motion.div 
                        animate={{ y: ["-100%", "200%"] }}
                        transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                        className="absolute inset-0 bg-gradient-to-b from-transparent via-[#5351FF]/20 to-transparent w-full h-[50%] pointer-events-none"
                     />
                     <Lock className="w-7 h-7 text-[#5351FF] relative z-20" strokeWidth={2} />
                  </motion.div>
               </div>
              <h2 className="text-[20px] font-bold tracking-tight text-[var(--text-primary)] font-sans">Secure Password</h2>
              <p className="text-[var(--text-muted)] mt-1.5 text-[12px] leading-relaxed max-w-[280px]">Set a fallback password to recover your account if you lose your passkey.</p>
            </div>

            <div className="flex flex-col gap-3 mb-5 w-full max-w-[320px] relative z-10">
              <div className="relative group">
                <input 
                  type="password"
                  placeholder="Enter Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--surface)]/50 backdrop-blur-md border border-[var(--border)] rounded-xl px-3 py-2.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[#5351FF] focus:bg-[var(--surface)] transition-all shadow-sm placeholder:text-[var(--text-muted)]/70 relative z-10"
                />
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#5351FF]/0 via-[#5351FF]/0 to-[#5351FF]/0 group-focus-within:from-[#5351FF]/10 group-focus-within:via-[#5351FF]/5 group-focus-within:to-transparent pointer-events-none transition-all duration-500 z-0" />
              </div>

              <div className="px-3 py-2 flex flex-col gap-1.5 bg-[var(--surface)]/30 rounded-xl border border-[var(--border-soft)] shadow-inner">
                {[
                  { label: "Minimum 8 characters", valid: password.length >= 8 },
                  { label: "One uppercase letter", valid: /[A-Z]/.test(password) },
                  { label: "One lowercase letter", valid: /[a-z]/.test(password) },
                  { label: "One number", valid: /[0-9]/.test(password) },
                  { label: "One special character", valid: /[^A-Za-z0-9]/.test(password) }
                ].map((req, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-[11px] transition-all duration-300">
                    <motion.div 
                      initial={false}
                      animate={{ scale: req.valid ? [1, 1.2, 1] : 1 }}
                      transition={{ duration: 0.3 }}
                      className={`flex-shrink-0 flex items-center justify-center w-[16px] h-[16px] rounded-full border transition-colors duration-300 ${req.valid ? 'bg-green-500/10 border-green-500/50 text-green-500 shadow-[0_0_5px_rgba(34,197,94,0.2)]' : 'border-[var(--text-muted)]/30 text-[var(--text-muted)]/50 bg-[var(--surface)]'}`}
                    >
                      {req.valid ? <Check className="w-2.5 h-2.5" strokeWidth={3} /> : <div className="w-1 h-1 rounded-full bg-[var(--text-muted)]/50" />}
                    </motion.div>
                    <span className={`transition-colors duration-300 font-medium tracking-tight ${req.valid ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{req.label}</span>
                  </div>
                ))}
              </div>

              <div className="relative group">
                <input 
                  type="password"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full bg-[var(--surface)]/50 backdrop-blur-md border rounded-xl px-3 py-2.5 text-[14px] text-[var(--text-primary)] outline-none transition-all shadow-sm placeholder:text-[var(--text-muted)]/70 relative z-10 ${
                    confirmPassword.length > 0 
                      ? (password === confirmPassword ? 'border-green-500/50 focus:border-green-500 bg-green-500/5 focus:bg-green-500/5' : 'border-red-500/50 focus:border-red-500 bg-red-500/5 focus:bg-red-500/5') 
                      : 'border-[var(--border)] focus:border-[#5351FF] focus:bg-[var(--surface)]'
                  }`}
                />
                {confirmPassword.length > 0 && password === confirmPassword && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-4 top-1/2 -translate-y-1/2 z-20">
                    <Check className="w-4 h-4 text-green-500 drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]" strokeWidth={2.5} />
                  </motion.div>
                )}
              </div>
              
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-red-500 text-[12px] px-2 font-medium">Passwords do not match</motion.div>
              )}
              {error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-500 text-[12px] px-2 font-medium bg-red-500/10 p-2 rounded-lg border border-red-500/20">{error}</motion.div>}
            </div>

            <div className="flex justify-center w-full max-w-[320px] relative z-10">
              <button
                onClick={handleSetPassword}
                disabled={
                  loading || 
                  password.length < 8 || 
                  !/[A-Z]/.test(password) || 
                  !/[a-z]/.test(password) || 
                  !/[0-9]/.test(password) || 
                  !/[^A-Za-z0-9]/.test(password) || 
                  password !== confirmPassword
                }
                className="w-full h-[44px] bg-[var(--text-primary)] text-[var(--bg)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 relative z-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-[0_4px_14px_rgba(255,255,255,0.15)] font-semibold text-[14px] tracking-tight mt-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Complete Setup</span>}
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
