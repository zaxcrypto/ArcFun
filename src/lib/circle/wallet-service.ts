import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';

let _circleClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

// Lazily initialize the Circle client using a Proxy to prevent module-level crashes on Vercel Serverless Functions.
export const circleClient = new Proxy({} as ReturnType<typeof initiateDeveloperControlledWalletsClient>, {
  get(target, prop) {
    if (!_circleClient) {
      _circleClient = initiateDeveloperControlledWalletsClient({
        apiKey: process.env.CIRCLE_API_KEY || '',
        entitySecret: process.env.CIRCLE_ENTITY_SECRET || '',
      });
    }
    return (_circleClient as any)[prop];
  }
});

export const SUPPORTED_BLOCKCHAINS = [
  'ARC-TESTNET',
  'SOL-DEVNET',
  'ETH-SEPOLIA',
  'ARC',
  'SOL'
] as const;

export type SupportedBlockchain = typeof SUPPORTED_BLOCKCHAINS[number];

let _cachedWalletSetId: string | null = null;

export async function getEffectiveWalletSetId(): Promise<string> {
  if (_cachedWalletSetId) return _cachedWalletSetId;

  const envSetId = process.env.CIRCLE_WALLET_SET_ID?.trim();

  // Try checking with Circle if the envSetId is valid, or list available sets
  try {
    const listResp = await circleClient.listWalletSets({});
    const sets = listResp.data?.walletSets || [];

    // If envSetId matches one of the sets, use and cache it
    if (envSetId && sets.some(s => s.id === envSetId)) {
      _cachedWalletSetId = envSetId;
      return envSetId;
    }

    // If envSetId was not found in the account, but there are wallet sets
    if (sets.length > 0) {
      console.warn(`[Circle] WalletSet ID "${envSetId}" not found in account. Auto-binding to active wallet set: ${sets[0].id} ("${(sets[0] as any)?.name || 'default'}")`);
      _cachedWalletSetId = sets[0].id;
      return sets[0].id;
    }

    // If no wallet set exists at all in the account, create one automatically
    console.log('[Circle] No wallet sets found. Creating default "ArcFun MultiChain Set"...');
    const newSetResp = await circleClient.createWalletSet({
      name: 'ArcFun MultiChain Set'
    });
    if (newSetResp.data?.walletSet?.id) {
      _cachedWalletSetId = newSetResp.data.walletSet.id;
      return _cachedWalletSetId;
    }
  } catch (err: any) {
    console.warn('[Circle] listWalletSets check encountered error:', err.message);
  }

  // Fallback to envSetId if listWalletSets failed (e.g. temporary network blip)
  if (envSetId) {
    return envSetId;
  }

  throw new Error('Server misconfiguration: CIRCLE_WALLET_SET_ID is not set and no wallet set could be retrieved from Circle.');
}

export async function provisionWallet(walletSetId: string | undefined, userAddress: string, blockchain: string = 'ARC-TESTNET') {
  if (!SUPPORTED_BLOCKCHAINS.includes(blockchain as SupportedBlockchain)) {
    throw new Error(`Unsupported blockchain for Circle DCW provisioning: ${blockchain}`);
  }

  let activeWalletSetId = walletSetId || await getEffectiveWalletSetId();

  // Use a predictable refId based on the user address and blockchain
  const refId = `arc_${userAddress.toLowerCase()}_${blockchain}`;
  const idempotentKey = uuidv5(refId, uuidv5.URL);
  
  let response;
  try {
    response = await circleClient.createWallets({
      accountType: 'EOA',
      blockchains: [blockchain as any],
      count: 1,
      walletSetId: activeWalletSetId,
      idempotencyKey: idempotentKey
    });
  } catch (err: any) {
    const errMsg = err?.response?.data?.message || err?.message || '';
    if (errMsg.includes('Cannot find target wallet set') || errMsg.includes('wallet set')) {
      console.warn(`[Circle] Target wallet set "${activeWalletSetId}" failed. Attempting auto-recovery with fresh wallet set...`);
      _cachedWalletSetId = null;
      activeWalletSetId = await getEffectiveWalletSetId();
      response = await circleClient.createWallets({
        accountType: 'EOA',
        blockchains: [blockchain as any],
        count: 1,
        walletSetId: activeWalletSetId,
        idempotencyKey: idempotentKey
      });
    } else {
      throw err;
    }
  }

  if (!response.data || !response.data.wallets || response.data.wallets.length === 0) {
    throw new Error('Failed to provision wallet from Circle API: empty response');
  }

  const wallet = response.data.wallets[0];

  // Strictly validate Circle response integrity
  if (!wallet.id || !wallet.address) {
    throw new Error('Circle API returned an invalid wallet record with missing id or address');
  }

  if (wallet.walletSetId && wallet.walletSetId !== activeWalletSetId) {
    throw new Error(`Circle walletSetId mismatch: expected ${activeWalletSetId}, got ${wallet.walletSetId}`);
  }

  if (wallet.blockchain && wallet.blockchain !== blockchain) {
    throw new Error(`Circle blockchain mismatch: expected ${blockchain}, got ${wallet.blockchain}`);
  }

  return wallet;
}

export async function getWallet(walletId: string) {
  const response = await circleClient.getWallet({ id: walletId });
  return response.data?.wallet;
}

export function getNetworkReserve(blockchain: string = 'ARC-TESTNET'): number {
  if (blockchain === 'ARC-TESTNET' || blockchain === 'ARC') {
    return 0.05;
  }
  return 0.01;
}

export function formatSpendableBalance(totalAmount: string | number, blockchain: string = 'ARC-TESTNET'): string {
  const total = typeof totalAmount === 'string' ? parseFloat(totalAmount) : totalAmount;
  if (isNaN(total)) return '0';
  const reserve = getNetworkReserve(blockchain);
  const spendable = Math.max(0, total - reserve);
  return spendable > 0 ? spendable.toFixed(6) : '0';
}
