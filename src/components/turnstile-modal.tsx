import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Turnstile } from "@marsidev/react-turnstile";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, Loader2 } from "lucide-react";

interface TurnstileModalProps {
  isOpen: boolean;
  onSuccess: (sessionToken?: string) => void;
  onClose: () => void;
}

export function TurnstileModal({ isOpen, onSuccess, onClose }: TurnstileModalProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (token: string) => {
    setIsVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/verify-turnstile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.sessionToken);
      } else {
        setError("Verification failed. Please try again.");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    console.error("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not defined");
    // If not defined, we might want to just skip or show error.
    // For now, if misconfigured, show error in console and let it fail.
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 999999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16
        }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)"
            }}
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 400,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              overflow: "hidden",
              zIndex: 1
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 24px 16px",
              borderBottom: "1px solid var(--border-soft)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ShieldCheck style={{ width: 20, height: 20, color: "#3b82f6" }} />
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
                  Security Verification
                </h2>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: 4,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
                className="hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <p style={{
                margin: "0 0 24px 0",
                fontSize: 14,
                color: "var(--text-muted)",
                textAlign: "center",
                lineHeight: 1.5
              }}>
                Complete a quick verification before connecting your wallet.
              </p>

              <div style={{
                minHeight: 65,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                position: "relative"
              }}>
                {isVerifying ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: "#3b82f6" }} />
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Verifying...</span>
                  </div>
                ) : (
                  <div style={{ width: "fit-content", margin: "0 auto" }}>
                    {siteKey ? (
                      <Turnstile
                        siteKey={siteKey}
                        onSuccess={handleVerify}
                        onError={() => setError("Widget failed to load")}
                        options={{
                          theme: "auto",
                          size: "normal"
                        }}
                      />
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>Turnstile not configured</span>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div style={{
                  marginTop: 16,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#ef4444",
                  fontSize: 13,
                  textAlign: "center"
                }}>
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: "12px 24px",
              background: "var(--surface-soft)",
              borderTop: "1px solid var(--border-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6
            }}>
              <span style={{ fontSize: 14 }}>☁</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>Protected by Cloudflare</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
