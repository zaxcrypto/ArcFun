/**
 * lib/ens.ts
 *
 * Singleton Ethereum mainnet client + in-memory ENS cache.
 *
 * Rules:
 *  - One shared client instance for the lifetime of the app.
 *  - One lookup per unique address — results cached in a Map forever (session-scoped).
 *  - No polling, no subscriptions, no backend calls.
 *  - Zero impact on CCTP / transaction infrastructure.
 */

import { createPublicClient, http, fallback } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";

// ── Singleton client ──────────────────────────────────────────────────────────
// Uses three well-maintained public Ethereum mainnet RPCs with automatic fallback.
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http("https://cloudflare-eth.com"),
    http("https://eth.drpc.org"),
    http("https://ethereum-rpc.publicnode.com"),
  ]),
});

// ── In-memory cache & Deduplication ─────────────────────────────────────────────
// Stores resolved ENS names for the lifetime of the browser session.
// `null` means "looked up, no ENS found". `undefined` means "not yet looked up".

interface CacheEntry {
  value: string | null;
  timestamp: number;
}

class ENSCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 60 * 60 * 1000; // 1 hour TTL
  private readonly MAX_SIZE = 1000; // Bounded cache size

  get(key: string): string | null | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: string | null) {
    if (this.cache.size >= this.MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }
}

const ensNameCache = new ENSCache();
const ensAddressCache = new ENSCache();

const inFlightNames = new Map<string, Promise<string | null>>();
const inFlightAddresses = new Map<string, Promise<string | null>>();

const TIMEOUT_MS = 8000; // 8s timeout to prevent UI hanging forever
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
  ]);
}

/**
 * Resolves the ENS name for a given Ethereum address.
 * Returns the cached value immediately if already resolved.
 * Returns `null` if the address has no ENS name or the lookup fails.
 */
export async function resolveEnsName(address: string): Promise<string | null> {
  const key = address.trim().toLowerCase();

  const cached = ensNameCache.get(key);
  if (cached !== undefined) return cached;

  if (inFlightNames.has(key)) {
    return inFlightNames.get(key)!; // Reuse existing in-flight request
  }

  const fetchPromise = (async () => {
    try {
      if (typeof window !== 'undefined' && !window.navigator.onLine) return null;
      const name = await withTimeout(mainnetClient.getEnsName({ address: key as `0x${string}` }), TIMEOUT_MS);
      ensNameCache.set(key, name ?? null);
      if (name) ensAddressCache.set(name.toLowerCase(), key);
      return name ?? null;
    } catch {
      ensNameCache.set(key, null);
      return null;
    } finally {
      inFlightNames.delete(key);
    }
  })();

  inFlightNames.set(key, fetchPromise);
  return fetchPromise;
}

/**
 * Resolves an Ethereum address from a given ENS name (e.g. vitalik.eth).
 * Returns the cached value immediately if already resolved.
 * Returns `null` if the ENS name cannot be resolved.
 */
export async function resolveEnsAddress(name: string): Promise<string | null> {
  const key = name.trim().toLowerCase();

  const cached = ensAddressCache.get(key);
  if (cached !== undefined) return cached;

  if (inFlightAddresses.has(key)) {
    return inFlightAddresses.get(key)!; // Reuse existing in-flight request
  }

  const fetchPromise = (async () => {
    try {
      if (typeof window !== 'undefined' && !window.navigator.onLine) return null;
      const normalizedName = normalize(key);
      const address = await withTimeout(mainnetClient.getEnsAddress({ name: normalizedName }), TIMEOUT_MS);
      ensAddressCache.set(key, address ?? null);
      if (address) {
        ensNameCache.set(address.toLowerCase(), key);
      }
      return address ?? null;
    } catch {
      ensAddressCache.set(key, null);
      return null;
    } finally {
      inFlightAddresses.delete(key);
    }
  })();

  inFlightAddresses.set(key, fetchPromise);
  return fetchPromise;
}

const ensAvatarCache = new ENSCache();
const inFlightAvatars = new Map<string, Promise<string | null>>();

function normalizeAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("ipfs://")) {
    return url.replace("ipfs://", "https://ipfs.io/ipfs/");
  }
  if (url.startsWith("bafy") || url.startsWith("Qm")) {
    return `https://ipfs.io/ipfs/${url}`;
  }
  return url;
}

/**
 * Resolves the ENS avatar for a given ENS name (e.g. vitalik.eth) or Ethereum address.
 * Returns the cached avatar URL immediately if already resolved.
 * Supports HTTP/HTTPS, IPFS URLs, and universal ENS avatar metadata resolvers (euc.li / metadata.ens.domains).
 */
export async function resolveEnsAvatar(nameOrAddress: string): Promise<string | null> {
  const key = nameOrAddress.trim().toLowerCase();

  const cached = ensAvatarCache.get(key);
  if (cached !== undefined) return cached;

  if (inFlightAvatars.has(key)) {
    return inFlightAvatars.get(key)!;
  }

  const fetchPromise = (async () => {
    try {
      if (typeof window !== 'undefined' && !window.navigator.onLine) return null;
      let nameToLookup = key;
      if (key.startsWith("0x")) {
        const resolvedName = await resolveEnsName(key);
        if (!resolvedName) {
          ensAvatarCache.set(key, null);
          return null;
        }
        nameToLookup = resolvedName;
      }

      let avatar: string | null = null;

      try {
        const normalizedName = normalize(nameToLookup);
        const rawAvatar = await withTimeout(mainnetClient.getEnsAvatar({ name: normalizedName }), TIMEOUT_MS);
        avatar = normalizeAvatarUrl(rawAvatar);
      } catch {
        // Fallback handled below
      }

      // If viem RPC getEnsAvatar did not return an avatar or timed out, use universal ENS avatar resolver
      if (!avatar && (nameToLookup.includes(".") || nameToLookup.endsWith(".eth"))) {
        avatar = `https://euc.li/${nameToLookup}`;
      }

      ensAvatarCache.set(key, avatar ?? null);
      if (nameToLookup !== key) {
        ensAvatarCache.set(nameToLookup.toLowerCase(), avatar ?? null);
      }
      return avatar ?? null;
    } catch {
      ensAvatarCache.set(key, null);
      return null;
    } finally {
      inFlightAvatars.delete(key);
    }
  })();

  inFlightAvatars.set(key, fetchPromise);
  return fetchPromise;
}
