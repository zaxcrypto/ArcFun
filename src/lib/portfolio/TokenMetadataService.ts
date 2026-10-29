import { createPublicClient, http, Address, erc20Abi } from 'viem';
import { CROSS_CHAIN_REGISTRY } from '@/config/swap-contract';
import { withEvmFailover } from '@/lib/evm-rpc';

export interface TokenMetadata {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}

class TokenMetadataService {
  private cache: Map<string, { data: TokenMetadata; timestamp: number }> = new Map();
  private inflight: Map<string, Promise<TokenMetadata>> = new Map();
  private TTL = 24 * 60 * 60 * 1000; // 24 hours
  private MAX_CAPACITY = 5000;

  private setCache(key: string, meta: TokenMetadata) {
     if (this.cache.size >= this.MAX_CAPACITY) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
     }
     this.cache.delete(key);
     this.cache.set(key, { data: meta, timestamp: Date.now() });
  }

  setMetadata(network: string, address: string, meta: Partial<TokenMetadata>) {
    const key = `${network}:${address.toLowerCase()}`;
    const fullMeta: TokenMetadata = {
      address,
      name: meta.name || "Unknown Token",
      symbol: meta.symbol || "???",
      decimals: meta.decimals ?? 18,
      logoUrl: meta.logoUrl
    };
    this.setCache(key, fullMeta);
  }

  async getMetadata(network: string, address: string): Promise<TokenMetadata> {
    const key = `${network}:${address.toLowerCase()}`;
    
    const cached = this.cache.get(key);
    if (cached) {
       if (Date.now() - cached.timestamp < this.TTL) {
          this.cache.delete(key);
          this.cache.set(key, cached);
          return cached.data;
       } else {
          this.cache.delete(key);
       }
    }

    if (this.inflight.has(key)) {
      return this.inflight.get(key)!;
    }

    const promise = this.fetchMetadata(network, address).finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  private async fetchMetadata(network: string, address: string): Promise<TokenMetadata> {
    const isSolana = network.toLowerCase().includes("solana");

    if (address === 'native' || address === '0x0' || address === '0x0000000000000000000000000000000000000000') {
      const isArc = network.includes("Arc");
      const isMonad = network.includes("Monad");
      const isSonic = network.includes("Sonic");
      
      const symbol = isSolana ? "SOL" : isArc ? "USDC" : isMonad ? "MONAD" : isSonic ? "S" : "ETH";
      const name = isSolana ? "Solana" : isArc ? "USDC" : isMonad ? "Monad" : isSonic ? "Sonic" : "Ethereum";
      const decimals = isSolana ? 9 : 18;
      const logoUrl = isSolana ? "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png" : isArc ? "/usdc.png" : undefined;
      
      const meta = { address: 'native', symbol, name, decimals, logoUrl };
      this.setCache(`${network}:native`, meta);
      return meta;
    }

    const reg = CROSS_CHAIN_REGISTRY[network];
    
    // Solana Devnet USDC Check
    if (isSolana && (address.toLowerCase() === "4zmmc9srt5ri5x14gagxhahiijgnpaeerypjgjdncdu" || address.toLowerCase() === reg?.USDC?.toLowerCase())) {
      const meta = { address, name: "USDC", symbol: "USDC", decimals: 6, logoUrl: "/usdc.png" };
      this.setCache(`${network}:${address.toLowerCase()}`, meta);
      return meta;
    }

    if (reg && address.toLowerCase() === reg.USDC?.toLowerCase()) {
      const meta = { address, name: "USDC", symbol: "USDC", decimals: 6, logoUrl: "/usdc.png" };
      this.setCache(`${network}:${address.toLowerCase()}`, meta);
      return meta;
    }
    if (reg && address.toLowerCase() === reg.EURC?.toLowerCase()) {
      const meta = { address, name: "EURC", symbol: "EURC", decimals: 6, logoUrl: "https://s2.coinmarketcap.com/static/img/coins/128x128/20641.png" };
      this.setCache(`${network}:${address.toLowerCase()}`, meta);
      return meta;
    }

    let tokenName = "Custom Token";
    let tokenSymbol = "???";
    let tokenDecimals = isSolana ? 6 : 18;

    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
      if (res.ok) {
         const data = await res.json();
         if (data && data.pairs && data.pairs.length > 0) {
            const pair = data.pairs[0];
            const tokenInfo = pair.baseToken.address.toLowerCase() === address.toLowerCase() ? pair.baseToken : pair.quoteToken;
            
            if (tokenInfo && tokenInfo.symbol) {
               tokenSymbol = tokenInfo.symbol;
               tokenName = tokenInfo.name || tokenInfo.symbol;
            }
         }
      }
    } catch {}

    if (isSolana) {
      try {
        const { Connection, PublicKey } = await import('@solana/web3.js');
        const conn = new Connection(reg?.rpc || "https://api.devnet.solana.com");
        const supplyInfo = await conn.getTokenSupply(new PublicKey(address));
        if (supplyInfo?.value?.decimals !== undefined) {
          tokenDecimals = supplyInfo.value.decimals;
        }
      } catch (e) {}

      const solMeta = {
        address,
        name: tokenName,
        symbol: tokenSymbol !== "???" ? tokenSymbol : address.slice(0, 4).toUpperCase(),
        decimals: tokenDecimals,
        logoUrl: undefined
      };
      this.setCache(`${network}:${address.toLowerCase()}`, solMeta);
      return solMeta;
    }

    if (reg && reg.rpc) {
       try {
          return await withEvmFailover(network, reg.rpc, async (rpcUrl) => {
             const client = createPublicClient({ transport: http(rpcUrl) });
             const [name, symbol, decimals] = await Promise.all([
                client.readContract({ address: address as Address, abi: erc20Abi, functionName: "name" }).catch(() => tokenName),
                client.readContract({ address: address as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => tokenSymbol),
                client.readContract({ address: address as Address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
             ]);
             
             const meta = {
                address,
                name: name as string,
                symbol: symbol as string,
                decimals: Number(decimals),
                logoUrl: undefined
             };
             this.setCache(`${network}:${address.toLowerCase()}`, meta);
             return meta;
          });
       } catch (e) {
          console.error("Viem metadata fallback failed", e);
       }
    }

    return { address, name: "Unknown", symbol: "???", decimals: 18 };
  }
}

export const tokenMetadataService = new TokenMetadataService();
