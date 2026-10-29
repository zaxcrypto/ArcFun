import { create } from 'zustand';
import { globalEventBus } from './EventBus';
import { MulticallEngine } from './MulticallEngine';
import { tokenMetadataService } from './TokenMetadataService';
import { globalPriceEngine } from './PriceEngine';
import { formatUnits } from 'viem';
import { CROSS_CHAIN_REGISTRY } from '@/config/swap-contract';
import { supabase } from '@/lib/supabase';

export interface PortfolioAsset {
  network: string;
  address: string;
  symbol: string;
  name: string;
  balance: string;
  balanceFormatted: string;
  decimals: number;
  priceUsd: number;
  totalUsd: number;
  logoUrl?: string;
  isNative: boolean;
}

interface PortfolioState {
  assets: PortfolioAsset[];
  totalGlobalUsd: number;
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdated: number;
  currentNetwork: string;
  
  // Actions
  fetchPortfolio: (walletAddress: string, forceRefresh?: boolean) => Promise<void>;
  updateAssetBalance: (network: string, address: string, newBalance: string) => void;
  setCurrentNetwork: (network: string) => void;
}

let fetchPromise: Promise<void> | null = null;
let cachedCustomTokens: Array<{ address: string; symbol: string; name: string; decimals: number; network: string }> = [];
let lastCustomTokensFetch = 0;

const PORTFOLIO_CACHE_KEY = 'arc_portfolio_cache';
const PORTFOLIO_CACHE_MAX_AGE = 10 * 60 * 1000; // 10 minutes — stale cache is fine to show instantly

function loadCachedPortfolio(): { assets: PortfolioAsset[]; totalGlobalUsd: number; lastUpdated: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PORTFOLIO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.assets)) return null;
    // Show cache even if stale — will be refreshed in background
    return parsed;
  } catch {
    return null;
  }
}

function saveCachedPortfolio(assets: PortfolioAsset[], totalGlobalUsd: number) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PORTFOLIO_CACHE_KEY, JSON.stringify({ assets, totalGlobalUsd, lastUpdated: Date.now() }));
  } catch {}
}

// Hydrate from cache immediately at module load so first render has data
const _initialCache = loadCachedPortfolio();

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  assets: _initialCache?.assets ?? [],
  totalGlobalUsd: _initialCache?.totalGlobalUsd ?? 0,
  isLoading: false,
  isRefreshing: false,
  lastUpdated: _initialCache?.lastUpdated ?? 0,
  currentNetwork: 'All Networks',

  setCurrentNetwork: (network: string) => set({ currentNetwork: network }),

  fetchPortfolio: async (walletAddress: string, forceRefresh = false) => {
    const state = get();

    // Still-fresh cache: skip network call entirely
    if (!forceRefresh && state.assets.length > 0 && Date.now() - state.lastUpdated < 20000) {
      return;
    }

    if (fetchPromise && !forceRefresh) {
       return fetchPromise;
    }

    // If we have cached assets (from localStorage hydration or a previous fetch), show them
    // immediately and do a silent background refresh — never block UI with a full skeleton.
    const hasCachedData = state.assets.length > 0;
    set({
      isLoading: !hasCachedData,     // Only show skeleton on very first ever open
      isRefreshing: hasCachedData    // Silent spinner when we already have data
    });

    fetchPromise = (async () => {
       try {
         const chains = Object.keys(CROSS_CHAIN_REGISTRY).filter(net => CROSS_CHAIN_REGISTRY[net]?.rpc);
         
         // Fetch user custom tokens with 60-second TTL
         let customTokens: Array<{ address: string; symbol: string; name: string; decimals: number; network: string }> = [];
         const now = Date.now();
         if (!forceRefresh && cachedCustomTokens.length > 0 && now - lastCustomTokensFetch < 60000) {
           customTokens = cachedCustomTokens;
         } else {
           try {
             const { data: { session } } = await supabase.auth.getSession();
             if (session?.access_token) {
               const res = await fetch('/api/wallet/tokens', {
                 headers: { 'Authorization': `Bearer ${session.access_token}` }
               });
               if (res.ok) {
                 const data = await res.json();
                 if (data.success && Array.isArray(data.tokens)) {
                   customTokens = data.tokens;
                   cachedCustomTokens = customTokens;
                   lastCustomTokensFetch = now;
                   if (typeof window !== 'undefined') {
                     localStorage.setItem('arc_custom_tokens', JSON.stringify(customTokens));
                   }
                 }
               }
             }
           } catch (e) {
             // Graceful fallback if offline or unauthenticated
           }
         }

         if (customTokens.length === 0 && typeof window !== 'undefined') {
           try {
             const cached = localStorage.getItem('arc_custom_tokens');
             if (cached) {
               customTokens = JSON.parse(cached);
               cachedCustomTokens = customTokens;
             }
           } catch (e) {}
         }

         const allAssets: PortfolioAsset[] = [];
         let globalUsd = 0;

         // Single batch prefetch for common multi-chain prices (ETH, SOL, AVAX, etc.)
         await globalPriceEngine.prefetchCommonPrices();

         await Promise.all(chains.map(async (network) => {
           const reg = CROSS_CHAIN_REGISTRY[network];
           if (!reg || !reg.rpc) return;

           const isSolana = network.toLowerCase().includes("solana");
           const tokenAddresses: string[] = [];

           tokenAddresses.push('native');
           if (isSolana) {
             const solUsdc = reg.USDC || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
             if (!tokenAddresses.includes(solUsdc)) tokenAddresses.push(solUsdc);
           } else {
             const isArc = network.includes("Arc");
             if (!isArc && reg.USDC && reg.USDC !== '0x0' && !reg.USDC.startsWith('0x00000000000')) tokenAddresses.push(reg.USDC);
             if (reg.EURC && reg.EURC !== '0x0' && !reg.EURC.startsWith('0x00000000000')) tokenAddresses.push(reg.EURC);
           }

           // Include user custom tokens for this network
           const netCustom = customTokens.filter(t => t.network?.toLowerCase() === network.toLowerCase());
           for (const ct of netCustom) {
             if (ct.address && !tokenAddresses.some(a => a.toLowerCase() === ct.address.toLowerCase())) {
               tokenAddresses.push(ct.address);
               tokenMetadataService.setMetadata(network, ct.address, {
                 symbol: ct.symbol,
                 name: ct.name,
                 decimals: ct.decimals
               });
             }
           }

           try {
             let balances = new Map<string, bigint>();

             if (isSolana) {
               let solAddress: string | null = null;
               if (typeof window !== 'undefined') {
                 solAddress = localStorage.getItem('arc_circle_solana_address');
               }

               if (!solAddress) {
                 try {
                   const { data: { session } } = await supabase.auth.getSession();
                   if (session?.access_token) {
                     const res = await fetch('/api/wallet/lookup', {
                       method: 'POST',
                       headers: {
                         'Authorization': `Bearer ${session.access_token}`,
                         'Content-Type': 'application/json'
                       },
                       body: JSON.stringify({ blockchain: 'SOL-DEVNET' })
                     });
                     const data = await res.json();
                     if (data.exists && data.wallet?.wallet_address) {
                       solAddress = data.wallet.wallet_address;
                       if (typeof window !== 'undefined') {
                         localStorage.setItem('arc_circle_solana_address', solAddress as string);
                       }
                     } else {
                       const provRes = await fetch('/api/wallet/provision', {
                         method: 'POST',
                         headers: {
                           'Authorization': `Bearer ${session.access_token}`,
                           'Content-Type': 'application/json'
                         },
                         body: JSON.stringify({ blockchain: 'SOL-DEVNET' })
                       });
                       const provData = await provRes.json();
                       if (provData.wallet?.wallet_address) {
                         solAddress = provData.wallet.wallet_address;
                         if (typeof window !== 'undefined') {
                           localStorage.setItem('arc_circle_solana_address', solAddress as string);
                         }
                       }
                     }
                   }
                 } catch (e) {
                   console.warn('Could not resolve Circle DCW Solana address:', e);
                 }
               }

               if (solAddress) {
                 try {
                   const { Connection, PublicKey } = await import('@solana/web3.js');
                   const conn = new Connection(reg.rpc || "https://api.devnet.solana.com");
                   const pubkey = new PublicKey(solAddress);

                   const lamports = await conn.getBalance(pubkey);
                   balances.set('native', BigInt(lamports));

                   const parsedAccounts = await conn.getParsedTokenAccountsByOwner(pubkey, {
                     programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
                   });

                   parsedAccounts.value.forEach((acc) => {
                     const info = acc.account.data.parsed?.info;
                     if (info && info.mint && info.tokenAmount) {
                       const mintStr = info.mint;
                       balances.set(mintStr.toLowerCase(), BigInt(info.tokenAmount.amount || '0'));
                       if (!tokenAddresses.some(a => a.toLowerCase() === mintStr.toLowerCase())) {
                         tokenAddresses.push(mintStr);
                       }
                     }
                   });
                 } catch (solErr) {
                   console.warn("Could not fetch Solana balances for Circle DCW address", solAddress, solErr);
                 }
               }

               tokenAddresses.forEach((addr) => {
                 if (!balances.has(addr.toLowerCase())) {
                   balances.set(addr.toLowerCase(), 0n);
                 }
               });
             } else {
               balances = await MulticallEngine.getBalances(network, reg.rpc, walletAddress, tokenAddresses);
             }
             
             const assetPromises = tokenAddresses.map(async (address) => {
               const rawBalance = balances.get(address.toLowerCase());
               if (rawBalance === undefined) return null;

               const isNative = address === 'native';
               const metaAddress = isNative ? 'native' : address;

               const meta = await tokenMetadataService.getMetadata(network, metaAddress);
               const price = await globalPriceEngine.getPrice(network, metaAddress, isNative ? undefined : meta.symbol);

               const decimals = meta.decimals || (isSolana ? 6 : 18);
               const formatted = formatUnits(rawBalance, decimals);
               const numBal = Number(formatted);
               const totalUsd = numBal * price;
               
               const isCustom = netCustom.some(ct => ct.address.toLowerCase() === address.toLowerCase());
               if (numBal === 0 && network !== 'Arc Testnet' && network !== 'Solana Devnet' && !isCustom) return null;

               return {
                  network,
                  address: metaAddress,
                  symbol: meta.symbol,
                  name: meta.name,
                  decimals,
                  balance: rawBalance.toString(),
                  balanceFormatted: formatted,
                  priceUsd: price,
                  totalUsd,
                  logoUrl: meta.logoUrl,
                  isNative
               };
             });

             const resolvedAssets = (await Promise.all(assetPromises)).filter(Boolean) as PortfolioAsset[];
             allAssets.push(...resolvedAssets);
             globalUsd += resolvedAssets.reduce((sum, asset) => sum + asset.totalUsd, 0);

           } catch (e) {
             console.error(`Failed to fetch portfolio for ${network}, preserving cache`, e);
             const existingAssets = state.assets.filter(a => a.network === network);
             allAssets.push(...existingAssets);
             globalUsd += existingAssets.reduce((sum, asset) => sum + asset.totalUsd, 0);
           }
         }));

         saveCachedPortfolio(allAssets, globalUsd);
         set({
            assets: allAssets,
            totalGlobalUsd: globalUsd,
            lastUpdated: Date.now(),
            isLoading: false,
            isRefreshing: false
         });

       } catch (e) {
         console.error("Global portfolio fetch failed", e);
         set({ isLoading: false, isRefreshing: false });
       } finally {
         fetchPromise = null;
       }
    })();

    return fetchPromise;
  },

  updateAssetBalance: (network: string, address: string, newBalance: string) => {
    set((state) => {
       const newAssets = state.assets.map(a => {
          if (a.network === network && a.address.toLowerCase() === address.toLowerCase()) {
             const formatted = formatUnits(BigInt(newBalance), a.decimals);
             const numBal = Number(formatted);
             return { ...a, balance: newBalance, balanceFormatted: formatted, totalUsd: numBal * a.priceUsd };
          }
          return a;
       });
       const globalUsd = newAssets.reduce((sum, a) => sum + a.totalUsd, 0);
       return { assets: newAssets, totalGlobalUsd: globalUsd };
    });
  }
}));

import { createPublicClient, http } from 'viem';

globalEventBus.on('transaction:success', async (data: { walletAddress: string, walletType?: 'arcfun' | 'evm', txHash?: string, network?: string }) => {
   if (data.walletType !== 'arcfun') {
      return;
   }
   
   if (data.txHash && data.network) {
      try {
         const rpc = CROSS_CHAIN_REGISTRY[data.network]?.rpc;
         if (rpc) {
            const client = createPublicClient({ transport: http(rpc) });
            await client.waitForTransactionReceipt({ hash: data.txHash as `0x${string}`, timeout: 15000 });
         } else {
            await new Promise(r => setTimeout(r, 4000));
         }
      } catch (e) {
         await new Promise(r => setTimeout(r, 4000));
      }
   } else {
      await new Promise(r => setTimeout(r, 4000));
   }
   usePortfolioStore.getState().fetchPortfolio(data.walletAddress, true);
});
