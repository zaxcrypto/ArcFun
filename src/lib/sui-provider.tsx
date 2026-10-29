"use client";

import React from "react";
import { createNetworkConfig, SuiClientProvider, WalletProvider as SuiWalletProvider, useCurrentAccount, useWallets, useConnectWallet, useDisconnectWallet } from "@mysten/dapp-kit";
import "@mysten/dapp-kit/dist/index.css";

const suiPrimaryRpc = process.env.NEXT_PUBLIC_SUI_RPC_URL || process.env.SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";

const { networkConfig } = createNetworkConfig({
  testnet: { url: suiPrimaryRpc, network: "testnet" as any },
  testnetFallback: { url: "https://fullnode.testnet.sui.io:443", network: "testnet" as any },
  mainnet: { url: "https://fullnode.mainnet.sui.io:443", network: "mainnet" as any },
});

export function SuiProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SuiClientProvider networks={networkConfig as any} defaultNetwork="testnet">
      <SuiWalletProvider autoConnect={true}>
        {children}
      </SuiWalletProvider>
    </SuiClientProvider>
  );
}

export function useSuiWallet() {
  const currentAccount = useCurrentAccount();
  const wallets = useWallets();
  const { mutate: connectWallet, isPending: isConnecting } = useConnectWallet();
  const { mutate: disconnectWallet } = useDisconnectWallet();

  const isConnected = !!currentAccount;
  const address = currentAccount?.address || null;

  return {
    isConnected,
    address,
    currentAccount,
    wallets,
    connectWallet,
    disconnectWallet,
    isConnecting,
  };
}
