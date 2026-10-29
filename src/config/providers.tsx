"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, fallback, useSwitchChain, useAccount } from "wagmi";
import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { ThemeProvider } from "next-themes";
import { useTheme } from "next-themes";
import { isAdmin } from "@/lib/admin";
import { ArcWalletAuthProvider } from "@/components/arc-wallet-auth-provider";
import { PrivyProvider } from "@privy-io/react-auth";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import "@solana/wallet-adapter-react-ui/styles.css";

import { StellarProvider } from "@/lib/stellar-provider";
import { SuiProviderWrapper } from "@/lib/sui-provider";

import { arcTestnet } from "./arc-chain";
import { sepolia, arbitrumSepolia, baseSepolia, lineaSepolia, optimismSepolia, avalancheFuji, base, arbitrum } from "viem/chains";
import { sonicTestnet, monadTestnet, unichainSepolia, inkSepolia, injectiveTestnet, hyperEVMTestnet, robinhoodChain, arcMainnet, giwaSepolia, polygonAmoy, xLayerTestnet } from "./extra-chains";
import { EnvironmentProvider, useEnvironment } from "@/contexts/EnvironmentContext";
import { rateLimitedFetch, applyGlobalArcFetchPatch } from "@/lib/rpc-queue";

// Apply global rate limiter to prevent AppKit/Viem from bypassing the queue
applyGlobalArcFetchPatch();

// Global BigInt polyfill to prevent serialization crashes in third-party SDKs (e.g. Circle AppKit telemetry)
if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

const testnetChains = [
  arcTestnet, sepolia, arbitrumSepolia, baseSepolia, lineaSepolia,
  sonicTestnet, monadTestnet, unichainSepolia, inkSepolia, optimismSepolia, injectiveTestnet, avalancheFuji, hyperEVMTestnet, giwaSepolia, polygonAmoy, xLayerTestnet
] as const;

const mainnetChains = [
  arcMainnet, robinhoodChain, base, arbitrum,
  // Ensure Gateway testnet chains are always configured in Wagmi regardless of active env mode
  arcTestnet, avalancheFuji, baseSepolia, arbitrumSepolia, optimismSepolia
] as const;

const blockscoutKey = process.env.NEXT_PUBLIC_BLOCKSCOUT_API_KEY || process.env.NEXT_PUBLIC_ARC_API_KEY || "";

const sharedTransports = {
  [arcMainnet.id]: fallback([
    http("https://arc-mainnet.infura.io/v3/b6bf7d3508c941499b10025c0776eaf8")
  ]),
  [arcTestnet.id]: fallback([
    http(process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com", {
      retryCount: 2,
      retryDelay: 500,
      timeout: 5000,
      batch: true,
    }),
    http("https://5042002.rpc.thirdweb.com", {
      retryCount: 2,
      retryDelay: 500,
      timeout: 5000,
      batch: true,
    }),
  ]),
  [sepolia.id]: fallback([
    http(process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"),
    http("https://ethereum-sepolia-rpc.publicnode.com"),
    http("https://rpc.sepolia.org"),
    http(`https://eth-sepolia.blockscout.com/api/eth-rpc?apikey=${blockscoutKey}`)
  ]),
  [arbitrumSepolia.id]: fallback([
    http(process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC_URL || "https://sepolia.arbitrum.io/rpc"),
    http("https://sepolia-rollup.arbitrum.io/rpc"),
    http("https://arbitrum-sepolia-rpc.publicnode.com"),
  ]),
  [baseSepolia.id]: fallback([
    http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"),
    http("https://sepolia.base.org"),
    http("https://base-sepolia-rpc.publicnode.com"),
  ]),
  [base.id]: fallback([
    http(process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || "https://mainnet.base.org"),
    http("https://mainnet.base.org"),
    http("https://base-rpc.publicnode.com")
  ]),
  [arbitrum.id]: fallback([
    http(process.env.NEXT_PUBLIC_ARB_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc"),
    http("https://arb1.arbitrum.io/rpc"),
    http("https://arbitrum-one.publicnode.com")
  ]),
  [lineaSepolia.id]: fallback([
    http(process.env.NEXT_PUBLIC_LINEA_SEPOLIA_RPC_URL || "https://rpc.sepolia.linea.build"),
    http("https://rpc.sepolia.linea.build")
  ]),
  [sonicTestnet.id]: fallback([
    http(process.env.NEXT_PUBLIC_SONIC_TESTNET_RPC_URL || "https://rpc.blaze.soniclabs.com"),
    http("https://rpc.testnet.soniclabs.com")
  ]),
  [monadTestnet.id]: fallback([
    http(process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz"),
    http("https://testnet-rpc.monad.xyz")
  ]),
  [unichainSepolia.id]: fallback([
    http(process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org"),
    http("https://unichain-sepolia-rpc.publicnode.com"),
    http("https://sepolia.unichain.org"),
  ]),
  [inkSepolia.id]: fallback([
    http(process.env.NEXT_PUBLIC_INK_SEPOLIA_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com"),
    http("https://rpc-gel-sepolia.inkonchain.com"),
  ]),
  [optimismSepolia.id]: fallback([
    http(process.env.NEXT_PUBLIC_OP_SEPOLIA_RPC_URL || "https://sepolia.optimism.io"),
    http("https://sepolia.optimism.io"),
    http("https://optimism-sepolia-rpc.publicnode.com"),
  ]),
  [injectiveTestnet.id]: fallback([
    http(process.env.NEXT_PUBLIC_INJECTIVE_TESTNET_RPC_URL || "https://k8s.testnet.json-rpc.injective.network/"),
    http("https://injectiveevm-testnet-rpc.polkachu.com")
  ]),
  [avalancheFuji.id]: fallback([
    http(process.env.NEXT_PUBLIC_AVALANCHE_FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc"),
    http("https://api.avax-test.network/ext/bc/C/rpc"),
  ]),
  [hyperEVMTestnet.id]: fallback([
    http(process.env.NEXT_PUBLIC_HYPEREVM_TESTNET_RPC_URL || "https://rpc.hyperliquid-testnet.xyz/evm")
  ]),
  [robinhoodChain.id]: fallback([
    http(process.env.NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL || "https://rpc.mainnet.chain.robinhood.com"),
    http(`https://robinhoodchain.blockscout.com/api/eth-rpc?apikey=${blockscoutKey}`)
  ]),
  [giwaSepolia.id]: fallback([
    http(process.env.NEXT_PUBLIC_GIWA_SEPOLIA_RPC_URL || "https://sepolia-rpc.giwa.io"),
    http(`https://sepolia-explorer.giwa.io/api/eth-rpc?apikey=${blockscoutKey}`)
  ]),
  [polygonAmoy.id]: fallback([
    http(process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology"),
    http("https://polygon-amoy-bor-rpc.publicnode.com"),
    http("https://polygon-amoy.drpc.org"),
    http("https://rpc-amoy.polygon.technology/")
  ]),
  [xLayerTestnet.id]: http(process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech"),
};

const appUrl = process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://www.thearcfun.xyz";

// Helper to encode Base Builder Code to ERC-8021 compliant hex dataSuffix
function toBaseBuilderSuffix(code: string): `0x${string}` | undefined {
  if (!code) return undefined;
  const cleaned = code.trim();
  if (cleaned.length === 0) return undefined;
  const codeHex = Array.from(cleaned)
    .map(c => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  const lengthHex = cleaned.length.toString(16).padStart(2, "0");
  const schemaHex = "00"; // Schema 0: ASCII codes separated by comma
  const markerHex = "80218021802180218021802180218021"; // ERC-8021 repeating marker
  return `0x${codeHex}${lengthHex}${schemaHex}${markerHex}`;
}

const baseBuilderCode = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE || "";
const baseDataSuffix = toBaseBuilderSuffix(baseBuilderCode);

const testnetConfig = getDefaultConfig({
  appName: "ArcFun",
  appDescription: "Production cross-chain wallet, bridge, swap and payment platform powered by Circle CCTP.",
  appUrl: appUrl,
  appIcon: "https://www.thearcfun.xyz/rocket-logo.png",
  projectId: "8dcd5c6557c030b08167bcb87a323761",
  chains: testnetChains as any,
  transports: sharedTransports,
  pollingInterval: 12000, // Arc Testnet allows 1 req/sec — poll every 12s to stay safe
});
if (baseDataSuffix) {
  (testnetConfig as any).dataSuffix = baseDataSuffix;
}

const mainnetConfig = getDefaultConfig({
  appName: "ArcFun",
  appDescription: "Production cross-chain wallet, bridge, swap and payment platform powered by Circle CCTP.",
  appUrl: appUrl,
  appIcon: "https://www.thearcfun.xyz/rocket-logo.png",
  projectId: "8dcd5c6557c030b08167bcb87a323761",
  chains: mainnetChains as any,
  transports: sharedTransports,
  pollingInterval: 6000,
});
if (baseDataSuffix) {
  (mainnetConfig as any).dataSuffix = baseDataSuffix;
}

// Inject chain icon overrides that RainbowKit picks up at runtime
// These must be done after config creation as RainbowKit reads iconUrl from the chain object
[testnetConfig, mainnetConfig].forEach(cfg => {
  (cfg.chains as any[]).forEach((chain: any) => {
    if (chain.id === 14601) chain.iconUrl = "/icons/sonic.png";
    if (chain.id === 11155420) chain.iconUrl = "/icons/optimism.svg";
    if (chain.id === 1439) chain.iconUrl = "/icons/injective.png";
    if (chain.id === 43113) chain.iconUrl = "/icons/avalanche.png";
    if (chain.id === 998) chain.iconUrl = "/icons/hyperevm.png";
    if (chain.id === 4663) chain.iconUrl = "/icons/robinhood.png";
    if (chain.id === 5042) chain.iconUrl = "/arc-logo.png";
    if (chain.id === 8453) chain.iconUrl = "/icons/base.svg";
    if (chain.id === 1952) chain.iconUrl = "/icons/xlayer.png";
  });
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Do NOT refetch just because the user switched browser tabs.
      // This is the single biggest cause of burst requests site-wide.
      refetchOnWindowFocus: false,
      // Data is considered fresh for 30s — avoids redundant background refetches
      // when multiple components request the same query within that window.
      staleTime: 30_000,
      // Keep unused cached data for 5 minutes before GC
      gcTime: 5 * 60_000,
      // Only retry once on failure — the default 3 retries triple every failed RPC call
      retry: 1,
      // Do not refetch on network reconnect unless explicitly needed
      refetchOnReconnect: false,
    },
  },
});


function RainbowKitWrapper({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    <RainbowKitProvider
      theme={darkTheme({
        accentColor: '#b30000',
        accentColorForeground: 'white',
        borderRadius: 'large',
        overlayBlur: 'small',
      })}
    >
      {children}
    </RainbowKitProvider>
  );
}
function NetworkSwitcher() {
  const { mode } = useEnvironment();
  const { switchChainAsync } = useSwitchChain();

  React.useEffect(() => {
    const fn = async () => {
      try {
        if (mode === "mainnet") {
          // Default to Arc Mainnet
          await switchChainAsync({ chainId: 5042 });
        } else {
          await switchChainAsync({ chainId: 5042002 });
        }
      } catch (e) {
        console.warn("Wallet rejected or failed to switch chain:", e);
      }
    };
    fn();
  }, [mode, switchChainAsync]);

  return null;
}

// Console warnings and postMessage hacks removed to avoid interfering with native browser behavior

function InnerWagmiProvider({ children, mounted }: { children: React.ReactNode, mounted: boolean }) {
  const { mode } = useEnvironment();
  const config = mode === "mainnet" ? mainnetConfig : testnetConfig;

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {mounted && (
          <RainbowKitWrapper>
            <NetworkSwitcher />
            <StellarProvider>
              <SuiProviderWrapper>
                <ArcWalletAuthProvider>
                  <PrivyProvider
                    appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cmsncpho400b70cjod2f6r2dr"}
                    config={{
                      loginMethods: ['twitter'],
                      appearance: { theme: 'dark', accentColor: '#b30000' }
                    }}
                  >
                    {children}
                  </PrivyProvider>
                </ArcWalletAuthProvider>
              </SuiProviderWrapper>
            </StellarProvider>
          </RainbowKitWrapper>
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function PrivyErrorSilencer() {
  React.useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args: any[]) => {
      const msg = typeof args[0] === 'string' ? args[0] : (args[0]?.message || String(args[0] || ''));
      // Suppress Privy iframe cross-origin postMessage noise
      if (msg.includes("auth.privy.io") && (msg.includes("postMessage") || msg.includes("origin") || msg.includes("null"))) return;
      if (msg.includes("Cross-Origin-Opener-Policy")) return;
      // Suppress known wagmi v2 Hydrate/reconnect dev warning — cosmetic only, no production impact
      if (msg.includes("Cannot update a component") && msg.includes("Hydrate")) return;
      if (msg.includes("Cannot update a component") && msg.includes("SwapBridgeManager")) return;
      originalError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      const msg = typeof args[0] === 'string' ? args[0] : (args[0]?.message || String(args[0] || ''));
      if (msg.includes("auth.privy.io") && (msg.includes("postMessage") || msg.includes("origin") || msg.includes("null"))) return;
      if (msg.includes("Cross-Origin-Opener-Policy")) return;
      originalWarn.apply(console, args);
    };

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const wallets = React.useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <PrivyErrorSilencer />
      <EnvironmentProvider>
        <ConnectionProvider endpoint={endpoint}>
          <WalletProvider wallets={wallets} autoConnect={false}>
            <WalletModalProvider>
              <InnerWagmiProvider mounted={mounted}>
                {children}
              </InnerWagmiProvider>
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </EnvironmentProvider>
    </ThemeProvider>
  );
}
