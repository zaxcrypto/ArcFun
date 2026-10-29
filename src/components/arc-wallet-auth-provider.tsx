"use client";

import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { startAuthentication } from "@simplewebauthn/browser";
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Fingerprint, Lock, Loader2, Eye, EyeOff, X } from 'lucide-react';

type AuthResult = { passkeyProof?: any, password?: string };

interface ArcWalletAuthContextType {
  requestAuthentication: (threshold: number, hasPasswordFallback: boolean, reason?: string) => Promise<AuthResult>;
}

const ArcWalletAuthContext = createContext<ArcWalletAuthContextType | undefined>(undefined);

export const useArcWalletAuth = () => {
  const context = useContext(ArcWalletAuthContext);
  if (!context) throw new Error("useArcWalletAuth must be used within ArcWalletAuthProvider");
  return context;
};

export const ArcWalletAuthProvider = ({ children, scoped = false }: { children: ReactNode, scoped?: boolean }) => {
  const [supportsPasskeys, setSupportsPasskeys] = useState(true);

  React.useEffect(() => {
    async function checkSupport() {
      if (typeof window === 'undefined') return;
      if (!window.PublicKeyCredential) {
        setSupportsPasskeys(false);
        return;
      }
      
      if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
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
  const [isOpen, setIsOpen] = useState(false);
  const [authThreshold, setAuthThreshold] = useState(0);
  const [hasPasswordFallback, setHasPasswordFallback] = useState(false);
  const [authMode, setAuthMode] = useState<"passkey" | "password">("passkey");
  const [authPassword, setAuthPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [authReason, setAuthReason] = useState<string | null>(null);

  const resolvePromiseRef = useRef<((value: AuthResult) => void) | null>(null);
  const rejectPromiseRef = useRef<((reason?: any) => void) | null>(null);

  const requestAuthentication = (threshold: number, hasPassword: boolean, reason?: string): Promise<AuthResult> => {
    setAuthThreshold(threshold);
    setAuthReason(reason || null);
    setHasPasswordFallback(hasPassword);
    setAuthMode(supportsPasskeys ? "passkey" : "password");
    setAuthPassword("");
    setAuthError(null);
    setAuthLoading(false);
    setIsOpen(true);
    
    return new Promise((resolve, reject) => {
      resolvePromiseRef.current = resolve;
      rejectPromiseRef.current = reject;
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    if (rejectPromiseRef.current) {
      rejectPromiseRef.current(new Error("Authentication cancelled by user"));
    }
  };

  const handleWebAuthn = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const optRes = await fetch("/api/auth/passkey/generate-authentication-options", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const optData = await optRes.json();
      if (optData.error) throw new Error(optData.error);

      const asseResp = await startAuthentication(optData.options);
      
      setIsOpen(false);
      if (resolvePromiseRef.current) {
        resolvePromiseRef.current({ passkeyProof: asseResp });
      }
    } catch (e: any) {
      if (!supportsPasskeys) {
         setAuthMode("password");
      } else if (e.name === 'NotAllowedError' || e.message?.includes('timed out or was not allowed')) {
        setAuthError("Authentication cancelled.");
      } else {
        let msg = e.message || "Passkey authentication failed";
        const genericErrors = ["Internal Server Error", "Service Error", "Unknown Error", "Unexpected token"];
        if (genericErrors.some(g => msg.includes(g))) {
           msg = "The network is busy. Please try again.";
        }
        setAuthError(msg);
      }
      setAuthLoading(false);
    }
  };

  const handlePasswordAuth = () => {
    if (!authPassword) return;
    setIsOpen(false);
    if (resolvePromiseRef.current) {
      resolvePromiseRef.current({ password: authPassword });
    }
  };

  return (
    <ArcWalletAuthContext.Provider value={{ requestAuthentication }}>
      {children}
      
      <AnimatePresence>
        {isOpen && (
          <div className={`${scoped ? 'absolute' : 'fixed'} inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-md bg-white/75 dark:bg-black/50 rounded-[24px] overflow-hidden`} onClick={handleClose}>
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 10 }}
               onClick={e => e.stopPropagation()}
               className="w-full max-w-sm bg-white dark:bg-[#0c0d14] border border-slate-200/80 dark:border-[var(--border)] rounded-3xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-2xl relative overflow-hidden"
               style={{ fontFamily: '"Inter", system-ui, -apple-system, sans-serif' }}
             >
                <button onClick={handleClose} className="absolute top-4 right-4 p-2 rounded-full bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                  <X className="w-4 h-4" />
                </button>

                <div className="flex flex-col gap-4">
                   <h3 className="text-[var(--text-primary)] font-bold text-lg text-center mb-1">Authentication Required</h3>
                   <p className="text-[var(--text-secondary)] text-sm text-center mb-4 px-4">
                      {authReason === 'VELOCITY_LIMIT'
                        ? 'For your security, frequent transfers require authentication.'
                        : authThreshold > 0 
                          ? `This transfer exceeds your $${authThreshold} limit.` 
                          : 'This transfer requires authentication.'}
                   </p>
                   
                   {authMode === "passkey" ? (
                      <div className="flex flex-col items-center gap-6 mt-4">
                         <div 
                            className={`relative group cursor-pointer ${authLoading ? 'pointer-events-none' : ''}`} 
                            onClick={handleWebAuthn}
                         >
                            <div className="relative w-24 h-24 rounded-full border-2 border-[#00D494]/30 bg-[#00D494]/5 flex items-center justify-center overflow-hidden transition-transform group-hover:scale-[1.03] active:scale-[0.97]">
                               <motion.div 
                                  initial={{ top: "-20%" }}
                                  animate={{ top: "120%" }}
                                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                                  className="absolute left-0 right-0 h-[2px] bg-[#00D494] shadow-[0_0_12px_#00D494] z-10"
                               />
                               {authLoading ? (
                                  <Loader2 className="w-10 h-10 text-[#00D494] animate-spin relative z-20" />
                               ) : (
                                  <Fingerprint className="w-12 h-12 text-[#00D494] relative z-20 opacity-90 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
                               )}
                            </div>
                         </div>
                         
                         <div className="text-center flex flex-col gap-1">
                            <h4 className="text-[var(--text-primary)] font-bold text-[15px]">Tap to Verify</h4>
                            <p className="text-[var(--text-muted)] text-[12px] font-medium">Use your device's biometric sensor</p>
                         </div>
                      </div>
                   ) : (
                      <div className="flex flex-col gap-3 items-center w-full mt-4">
                         {!supportsPasskeys && (
                           <div className="bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl p-4 mb-1 w-[90%] text-center">
                             <p className="text-[13px] font-medium text-[var(--text-primary)] mb-2">This wallet already has a Passkey configured.</p>
                             <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                               Passkeys aren't currently available on this browser or device.<br/>
                               You can continue securely using your wallet password.
                             </p>
                           </div>
                         )}
                         <div className="relative w-[90%]">
                            <input 
                               type={showAuthPassword ? "text" : "password"}
                               placeholder="Enter your fallback password"
                               value={authPassword}
                               onChange={(e) => setAuthPassword(e.target.value)}
                               className="bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)] pl-4 pr-10 py-3 rounded-xl outline-none focus:border-[var(--accent-blue)] transition-colors text-left font-medium w-full text-sm"
                            />
                            <button 
                               onClick={() => setShowAuthPassword(!showAuthPassword)}
                               className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
                            >
                               {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                         </div>
                         <button
                            onClick={handlePasswordAuth}
                            disabled={authLoading || !authPassword}
                            className="w-[90%] bg-[#5351FF] hover:bg-[#5351FF]/90 text-white border border-[#5351FF]/50 rounded-full flex items-center justify-center transition-all duration-300 shadow-md font-semibold text-[13px] tracking-wide disabled:opacity-50 disabled:bg-[var(--surface-hover)] disabled:text-[var(--text-muted)] disabled:border-[var(--border)]"
                            style={{ height: 42 }}
                         >
                            <span className="flex items-center justify-center gap-2 w-full">
                               {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                               Verify Password
                            </span>
                         </button>
                         {!supportsPasskeys && (
                            <button
                               onClick={() => setAuthMode("passkey")}
                               disabled={authLoading}
                               className="w-[90%] bg-transparent border border-[var(--border-soft)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] rounded-full flex items-center justify-center transition-all duration-300 font-medium text-[13px] tracking-wide mt-1"
                               style={{ height: 42 }}
                            >
                               {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Try Passkey Anyway</span>}
                            </button>
                         )}
                      </div>
                   )}

                   {authError && (
                      <p className="mt-4 text-[var(--accent-red)] text-xs font-medium text-center px-2">
                         {authError}
                      </p>
                   )}

                   <div className="mt-auto pt-6 flex flex-col gap-2 items-center w-[90%] mx-auto pb-2">
                      {hasPasswordFallback && authMode === "passkey" && (
                         <button
                            onClick={() => setAuthMode("password")}
                            className="w-full bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)] font-bold text-[11px] py-2.5 rounded-[10px] transition-colors hover:bg-[var(--border)] uppercase tracking-wider"
                         >
                            Use Password
                         </button>
                      )}
                      {authMode === "password" && supportsPasskeys && (
                         <button
                            onClick={() => setAuthMode("passkey")}
                            className="w-full bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)] font-bold text-[11px] py-2.5 rounded-[10px] transition-colors hover:bg-[var(--border)] uppercase tracking-wider"
                         >
                            Use Passkey
                         </button>
                      )}
                      <button
                         onClick={handleClose}
                         className="text-[var(--text-muted)] hover:text-[var(--text-primary)] font-semibold text-[11px] uppercase tracking-wider py-2 transition-colors mt-2"
                      >
                         Cancel
                      </button>
                   </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ArcWalletAuthContext.Provider>
  );
};
