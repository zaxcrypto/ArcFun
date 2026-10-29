"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useStellar } from "@/lib/stellar-provider";
import { Loader2, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { TransactionBuilder, Networks, Asset, Operation } from "@stellar/stellar-sdk";
import { stellarRpcManager } from "@/lib/stellar/stellar-rpc";
import { stellarTransactionManager } from "@/lib/stellar/stellar-transaction";

interface StellarTrustlineProps {
  assetCode: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function StellarTrustlineModal({ assetCode, isOpen, onClose, onSuccess }: StellarTrustlineProps) {
  const { address, signTransaction, refreshBalances } = useStellar();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  if (!isOpen) return null;

  const handleCreateTrustline = async () => {
    if (!address) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const issuer = assetCode === "USDC" 
        ? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
        : "GCOZOOOTXF2L3LXYUVSVUNU3F5SBC6ZNDB2ZID5H5VFW2UNFDE77H2AL";
        
      const asset = new Asset(assetCode, issuer);
      const { server } = await stellarRpcManager.getHorizonServer();
      const account = await server.loadAccount(address);
      
      const tx = new TransactionBuilder(account, {
        fee: "1000",
        networkPassphrase: Networks.TESTNET
      })
      .addOperation(Operation.changeTrust({ asset }))
      .setTimeout(30)
      .build();

      const signedXdr = await signTransaction(tx.toXDR());
      if (!signedXdr) throw new Error("Transaction rejected by wallet");

      const response = await fetch("https://horizon-testnet.stellar.org/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `tx=${encodeURIComponent(signedXdr)}`
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Transaction failed");
      }

      await refreshBalances();
      onSuccess();
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to create trustline");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/65 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Trustline Required</h3>
                <p className="text-sm text-zinc-400">Stellar Network Requirement</p>
              </div>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-zinc-800/50 rounded-xl p-4 mb-6">
            <p className="text-sm text-zinc-300 leading-relaxed">
              Unlike other networks, Stellar requires you to explicitly opt-in to receive tokens. This prevents spam and protects your wallet.
            </p>
            <p className="text-sm text-zinc-300 leading-relaxed mt-2">
              You need to establish a trustline for <strong>{assetCode}</strong> before you can bridge to this account.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 break-words">
              {error}
            </div>
          )}

          <button
            onClick={handleCreateTrustline}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white hover:bg-zinc-100 text-black rounded-xl font-bold transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Establishing Trustline...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Create {assetCode} Trustline
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
