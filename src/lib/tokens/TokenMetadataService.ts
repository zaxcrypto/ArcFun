import { PublicClient, parseAbi } from 'viem';

export interface TokenMetadata {
  address: string;
  chainId: number;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  priceUsd?: number;
  marketCap?: number;
  liquidity?: number;
  verified?: boolean;
  updatedAt: number;
  balance?: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY_PREFIX = 'arcfun_token_meta_';
const MAX_CONCURRENT_REQUESTS = 5; // Concurrency limit

const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
]);

class RequestQueue {
  private queue: (() => Promise<void>)[] = [];
  private inFlight = 0;
  
  constructor(private concurrency: number) {}
  
  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try { 
          const result = await task(); 
          resolve(result);
        } catch (e) { 
          reject(e); 
        }
      });
      this.processNext();
    });
  }
  
  private async processNext() {
    if (this.inFlight >= this.concurrency || this.queue.length === 0) return;
    this.inFlight++;
    const task = this.queue.shift();
    if (task) {
      await task().catch(() => {}); // Errors handled inside task wrapper
    }
    this.inFlight--;
    this.processNext();
  }
}

class TokenMetadataService {
  private memoryCache: Map<string, TokenMetadata> = new Map();
  private inFlightRequests: Map<string, Promise<TokenMetadata>> = new Map();
  private dexScreenerQueue = new RequestQueue(MAX_CONCURRENT_REQUESTS);
  private rpcQueue = new RequestQueue(MAX_CONCURRENT_REQUESTS); // Separate queue for RPC
  private dyorQueue = new RequestQueue(MAX_CONCURRENT_REQUESTS);

  constructor() {
    this.loadFromLocalStorage();
  }

  private getCacheKey(chainId: number, address: string) {
    return `${CACHE_KEY_PREFIX}${chainId}_${address.toLowerCase()}`;
  }

  private loadFromLocalStorage() {
    if (typeof window === 'undefined') return;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_KEY_PREFIX)) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const data: TokenMetadata = JSON.parse(raw);
            if (Date.now() - data.updatedAt < CACHE_TTL_MS) {
              this.memoryCache.set(key, data);
            } else {
              localStorage.removeItem(key);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load token metadata from localStorage", e);
    }
  }

  private saveToLocalStorage(key: string, data: TokenMetadata) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save token metadata to localStorage", e);
    }
  }

  /**
   * Fetches token metadata using a cache-first approach.
   * - Checks memory/local cache.
   * - Checks in-flight request deduplication map.
   * - Enqueues RPC multicall for strictly on-chain data (Priority 1).
   * - Enqueues DexScreener for market/logo data (Priority 2).
   */
  public async getTokenMetadata(
    address: string,
    chainId: number,
    publicClient: PublicClient
  ): Promise<TokenMetadata> {
    const checksumAddress = address.toLowerCase();
    
    // Hardcode native token bypass to prevent multicall failures on 0xeeee
    if (checksumAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || checksumAddress === '0x0000000000000000000000000000000000000000') {
      return {
        address: checksumAddress,
        chainId,
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
        priceUsd: 3500.00,
        logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        updatedAt: Date.now()
      };
    }

    const cacheKey = this.getCacheKey(chainId, checksumAddress);

    // 1. Check Cache
    const cached = this.memoryCache.get(cacheKey);
    if (cached && (Date.now() - cached.updatedAt < CACHE_TTL_MS)) {
      return cached;
    }

    // 2. Check Deduplication Map
    if (this.inFlightRequests.has(cacheKey)) {
      return this.inFlightRequests.get(cacheKey)!;
    }

    // 3. Initiate Fetch Promise
    const fetchPromise = this.executeFetch(checksumAddress, chainId, publicClient).then(meta => {
      this.memoryCache.set(cacheKey, meta);
      this.saveToLocalStorage(cacheKey, meta);
      this.inFlightRequests.delete(cacheKey);
      return meta;
    }).catch(error => {
      this.inFlightRequests.delete(cacheKey);
      throw error;
    });

    this.inFlightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  private async executeFetch(
    address: string,
    chainId: number,
    publicClient: PublicClient
  ): Promise<TokenMetadata> {
    // Phase 1: On-chain source of truth via RPC Multicall
    const baseMeta = await this.rpcQueue.enqueue(async () => {
      return this.fetchOnChainData(address, publicClient);
    });

    // Phase 2: DexScreener market enrichment (Logo, Price)
    let marketMeta: Partial<TokenMetadata> = {};
    try {
      marketMeta = await this.dexScreenerQueue.enqueue(async () => {
        return this.fetchDexScreenerData(address, chainId);
      });
    } catch (error) {
      console.warn(`[TokenMetadataService] DexScreener failed for ${address}, continuing with on-chain data`, error);
    }

    // Phase 2.5: DYOR Launchpad API (for meme coin logos & prices)
    let dyorMeta: Partial<TokenMetadata> = {};
    try {
      dyorMeta = await this.dyorQueue.enqueue(async () => {
        return this.fetchDyorData(address, chainId);
      });
    } catch (error) {
      console.warn(`[TokenMetadataService] DYOR API failed for ${address}`, error);
    }

    // Phase 3: Construct final metadata
    // Fallback prices for testnet and meme coins if DexScreener doesn't have them
    const fallbackPrices: Record<string, number> = {
      'WETH': 3500.00,
      'USDe': 1.00,
      'USDG': 1.00,
      'USDC': 1.00,
      'EURC': 1.10,
      'cirBTC': 65000.00,
      'HOODIE': 0.50,
      'suit': 12.75,
      'REPE': 0.30,
      'cashcat': 0.15
    };
    const fallbackPrice = fallbackPrices[baseMeta.symbol] || 0.10; // 0.10 for unknown meme coins

    return {
      address: address.toLowerCase(),
      chainId,
      name: baseMeta.name,
      symbol: baseMeta.symbol,
      decimals: baseMeta.decimals,
      logoURI: dyorMeta.logoURI || marketMeta.logoURI || '/icons/unknown-token.svg', // Priority 3: Fallback
      priceUsd: dyorMeta.priceUsd !== undefined ? dyorMeta.priceUsd : (marketMeta.priceUsd !== undefined ? marketMeta.priceUsd : fallbackPrice),
      marketCap: marketMeta.marketCap,
      liquidity: marketMeta.liquidity,
      verified: marketMeta.verified,
      updatedAt: Date.now()
    };
  }

  private async fetchOnChainData(address: string, publicClient: PublicClient) {
    // Retry logic for RPC
    let retries = 3;
    let delay = 1000;

    while (retries > 0) {
      try {
        const [nameRes, symbolRes, decimalsRes] = await Promise.allSettled([
          publicClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: 'name' }),
          publicClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
          publicClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' })
        ]);

        if (decimalsRes.status === 'rejected') {
          throw new Error('Not an ERC20 token or decimals missing');
        }

        return {
          name: nameRes.status === 'fulfilled' ? nameRes.value : 'Unknown',
          symbol: symbolRes.status === 'fulfilled' ? symbolRes.value : 'UNKNOWN',
          decimals: decimalsRes.value
        };
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2; // Exponential backoff
      }
    }
    throw new Error('RPC Failed permanently');
  }

  private async fetchDexScreenerData(address: string, chainId: number): Promise<Partial<TokenMetadata>> {
    const chainSlugMap: Record<number, string> = {
      4663: 'robinhood',
      1: 'ethereum',
      42161: 'arbitrum',
      10: 'optimism',
      8453: 'base',
      137: 'polygon',
      // Add more as needed
    };
    const networkSlug = chainSlugMap[chainId];
    if (!networkSlug) return {}; // Skip dexScreener if we don't know the slug

    // Use official V1 API: /tokens/v1/{chainId}/{tokenAddress}
    const url = `https://api.dexscreener.com/tokens/v1/${networkSlug}/${address}`;
    
    // Fast fail for non-success to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`DexScreener API error: ${res.status}`);
    }

    // V1 API returns an array directly, not { pairs: [...] }
    const pairs = await res.json();
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return {}; // Not indexed
    }

    // DexScreener sorts pairs by liquidity usually, take the first valid one
    const bestPair = pairs[0];
    
    return {
      logoURI: bestPair.info?.imageUrl,
      priceUsd: parseFloat(bestPair.priceUsd || '0'),
      marketCap: parseFloat(bestPair.marketCap || '0'),
      liquidity: parseFloat(bestPair.liquidity?.usd || '0'),
      verified: true // If it has a DexScreener profile, we consider it minimally verified
    };
  }

  private async fetchDyorData(address: string, chainId: number): Promise<Partial<TokenMetadata>> {
    const chainSlug = chainId === 4663 ? '' : chainId === 5042 ? 'arc/' : chainId === 988 ? 'stable/' : chainId === 196 ? 'xlayer/' : '';
    if (chainSlug === '' && chainId !== 4663) return {};
    
    try {
      const url = `https://dyorv3.org/api/${chainSlug}v1/tokens/${address.toLowerCase()}`;
      const res = await fetch(url);
      if (!res.ok) return {};
      const data = await res.json();
      if (!data.image) return {};
      
      let priceUsd: number | undefined = undefined;
      if (chainId === 5042 && data.marketCapEth) {
        priceUsd = Number(data.marketCapEth) / 1_000_000_000;
      }
      
      return {
        logoURI: data.image,
        priceUsd
      };
    } catch (e) {
      return {};
    }
  }
}

export const tokenMetadataService = new TokenMetadataService();
