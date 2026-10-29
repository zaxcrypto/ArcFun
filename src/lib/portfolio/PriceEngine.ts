interface PriceData {
  priceUsd: number;
}

class PriceEngine {
  private cache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private inflight: Map<string, Promise<PriceData>> = new Map();
  private symbolCache: Map<string, { price: number; timestamp: number }> = new Map();
  private symbolInflight: Map<string, Promise<number>> = new Map();
  private TTL = 60 * 1000; // 60 seconds cache TTL for live market rates

  /**
   * Resolves standard asset ticker symbol from chain and token address.
   */
  resolveSymbol(network: string, address: string, symbol?: string): string {
    const cleanSymbol = (symbol || '').trim().toUpperCase();
    const isNative = address === 'native' || address === '0x0' || address.startsWith('0x0000000000');
    if (cleanSymbol && cleanSymbol !== 'NATIVE') return cleanSymbol;
    if (!isNative) return '';
    if (network.includes("Arc")) return "USDC";
    if (network.toLowerCase().includes("solana")) return "SOL";
    if (network.toLowerCase().includes("avalanche") || network.includes("Fuji")) return "AVAX";
    if (network.toLowerCase().includes("bitcoin")) return "BTC";
    if (network.toLowerCase().includes("sui")) return "SUI";
    return "ETH";
  }

  /**
   * Batch pre-fetches prices for common multi-chain assets in a single HTTP request.
   * This completely prevents 10+ EVM chains from hammering /api/wallet/prices individually.
   */
  async prefetchCommonPrices(): Promise<void> {
    const symbols = ['ETH', 'SOL', 'AVAX', 'BTC', 'SUI', 'ARC'];
    const now = Date.now();
    const allFresh = symbols.every(sym => {
      const cached = this.symbolCache.get(sym);
      return cached && (now - cached.timestamp < this.TTL);
    });
    if (allFresh) return;

    try {
      const res = await fetch(`/api/wallet/prices?symbols=${symbols.join(',')}`, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data?.prices) {
          for (const sym of symbols) {
            const returnedPrice = data.prices[sym];
            const price = typeof returnedPrice === 'number' && returnedPrice > 0
              ? returnedPrice
              : (sym === 'ARC' ? 0.10 : (this.symbolCache.get(sym)?.price ?? 1.0));
            this.symbolCache.set(sym, { price, timestamp: now });
          }
        }
      }
    } catch {
      // Non-blocking background prefetch
    }
  }

  async getPrice(network: string, address: string, symbol?: string): Promise<number> {
     const isNative = address === 'native' || address === '0x0' || address.startsWith('0x0000000000');
     const targetSymbol = this.resolveSymbol(network, address, symbol);

     // 1. Stablecoins and pegged assets
     if (targetSymbol === 'USDC' || targetSymbol === 'USDT' || targetSymbol === 'DAI') return 1.0;
     if (targetSymbol === 'EURC') return 1.08;

     // 2. Cross-chain shared symbol cache (ETH, SOL, AVAX, BTC, SUI)
     if (targetSymbol) {
        const cachedSymbol = this.symbolCache.get(targetSymbol);
        if (cachedSymbol && Date.now() - cachedSymbol.timestamp < this.TTL) {
           return cachedSymbol.price;
        }

        // Shared in-flight promise across all chains querying this symbol
        if (this.symbolInflight.has(targetSymbol)) {
           return this.symbolInflight.get(targetSymbol)!;
        }

        const promise = (async () => {
           try {
              const res = await fetch(`/api/wallet/prices?symbols=${targetSymbol}`, {
                 headers: { 'Accept': 'application/json' },
                 cache: 'no-store'
              });
              if (res.ok) {
                 const data = await res.json();
                 if (data?.success && data?.prices && typeof data.prices[targetSymbol] === 'number' && data.prices[targetSymbol] > 0) {
                    const price = data.prices[targetSymbol];
                    this.symbolCache.set(targetSymbol, { price, timestamp: Date.now() });
                    return price;
                 }
              }
           } catch {}

           // Fallback through secondary providers
           const fallbackData = await this.fetchPrice(network, address, targetSymbol);
           if (fallbackData.priceUsd > 0) {
              this.symbolCache.set(targetSymbol, { price: fallbackData.priceUsd, timestamp: Date.now() });
           }
           return fallbackData.priceUsd;
        })().finally(() => {
           this.symbolInflight.delete(targetSymbol);
        });

        this.symbolInflight.set(targetSymbol, promise);
        return promise;
     }

     // 3. Contract address-based custom token cache (e.g. DexScreener)
     const key = `${network}:${isNative ? 'native' : address.toLowerCase()}`;
     const cached = this.cache.get(key);
     if (cached && Date.now() - cached.timestamp < this.TTL) {
        return cached.data.priceUsd;
     }

     if (this.inflight.has(key)) {
        const data = await this.inflight.get(key)!;
        return data.priceUsd;
     }

     const promise = this.fetchPrice(network, address, symbol).finally(() => {
        this.inflight.delete(key);
     });

     this.inflight.set(key, promise);
     const result = await promise;
     return result.priceUsd;
  }

  private async fetchPrice(network: string, address: string, symbol?: string): Promise<PriceData> {
     const isNative = address === 'native' || address === '0x0' || address.startsWith('0x0000000000');
     
     // 1. Stablecoins are pegged
     if (symbol === 'USDC' || symbol === 'USDT' || symbol === 'DAI') return { priceUsd: 1.0 };
     if (symbol === 'EURC') return { priceUsd: 1.08 };
     
     // Arc Testnet native gas is USDC
     if (network.includes("Arc") && isNative) {
        return { priceUsd: 1.0 };
     }

     // 2. Resolve target asset symbol for live oracle lookup
     let targetSymbol = this.resolveSymbol(network, address, symbol);

     // 3. Live Price Fetch via Chainlink / Wallet Oracle API
     if (targetSymbol && targetSymbol !== 'USDC') {
        try {
           const res = await fetch(`/api/wallet/prices?symbols=${targetSymbol}`, {
              headers: { 'Accept': 'application/json' },
              cache: 'no-store'
           });
           if (res.ok) {
              const data = await res.json();
              if (data?.success && data?.prices && typeof data.prices[targetSymbol] === 'number' && data.prices[targetSymbol] > 0) {
                 const price = data.prices[targetSymbol];
                 const result = { priceUsd: price };
                 this.setCache(network, address, targetSymbol, result);
                 return result;
              }
           }
        } catch {
           // Fallback to client-side direct public market oracles
        }

        // Tier 2: Binance real-time ticker fallback
        try {
           const binanceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${targetSymbol}USDT`);
           if (binanceRes.ok) {
              const data = await binanceRes.json();
              const price = parseFloat(data.price);
              if (!isNaN(price) && price > 0) {
                 const result = { priceUsd: price };
                 this.setCache(network, address, targetSymbol, result);
                 return result;
              }
           }
        } catch {}

        // Tier 3: CoinGecko fallback
        try {
           const geckoId = targetSymbol === 'SOL' ? 'solana' : targetSymbol === 'ETH' ? 'ethereum' : targetSymbol === 'BTC' ? 'bitcoin' : targetSymbol === 'AVAX' ? 'avalanche-2' : null;
           if (geckoId) {
              const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`);
              if (cgRes.ok) {
                 const cgData = await cgRes.json();
                 const price = cgData?.[geckoId]?.usd;
                 if (typeof price === 'number' && price > 0) {
                    const result = { priceUsd: price };
                    this.setCache(network, address, targetSymbol, result);
                    return result;
                 }
              }
           }
        } catch {}
     }

     // 4. Custom ERC20 / SPL tokens with contract address: DexScreener
     if (!isNative) {
        try {
           const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
           if (res.ok) {
              const data = await res.json();
              if (data && data.pairs && data.pairs.length > 0) {
                 const price = parseFloat(data.pairs[0].priceUsd);
                 if (!isNaN(price) && price > 0) {
                    const result = { priceUsd: price };
                    this.setCache(network, address, targetSymbol, result);
                    return result;
                 }
              }
           }
        } catch {}
     }

     // 5. Final fallback (realistic base prices - only if completely offline)
     let fallback = 0;
     if (targetSymbol === 'SOL' || network.toLowerCase().includes("solana")) fallback = 104.0;
     else if (targetSymbol === 'ETH' || network.includes("Ethereum") || network.includes("Base") || network.includes("Arbitrum") || network.includes("Sepolia")) fallback = 2450.0;
     else if (targetSymbol === 'BTC') fallback = 65000.0;
     else if (targetSymbol === 'AVAX') fallback = 24.5;
     else if (targetSymbol === 'MONAD') fallback = 50.0;
     else if (targetSymbol === 'S') fallback = 0.5;
     
     const finalData = { priceUsd: fallback };
     this.setCache(network, address, targetSymbol, finalData);
     return finalData;
  }

  private setCache(network: string, address: string, symbol: string | undefined, data: PriceData) {
     const isNative = address === 'native' || address === '0x0' || address.startsWith('0x0000000000');
     const key = `${network}:${isNative ? (symbol || 'native') : address.toLowerCase()}`;
     this.cache.set(key, { data, timestamp: Date.now() });
  }
}

export const globalPriceEngine = new PriceEngine();
