import { circleClient } from './wallet-service';

export { circleClient };

export async function executeTransfer(
  walletId: string,
  tokenId: string,
  destinationAddress: string,
  amount: string,
  idempotencyKey: string,
  feeLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'
) {
  try {
    const response = await circleClient.createTransaction({
      walletId,
      tokenId,
      destinationAddress,
      amount: [amount],
      fee: {
        type: 'level',
        config: {
          feeLevel
        }
      },
      refId: idempotencyKey, // Crucial for deterministic webhook recovery
      idempotencyKey,
    });

    if (!response.data || !response.data.id) {
      throw new Error('Circle API did not return a transaction ID.');
    }

    return response.data;
  } catch (error: any) {
    console.error('Circle Transfer Error:', error.response?.data || error.message);
    throw error;
  }
}

export async function getTransactionStatus(circleTxId: string) {
  try {
    const response = await circleClient.getTransaction({ id: circleTxId });
    return response.data?.transaction || null;
  } catch (error: any) {
    console.warn(`[payment-service] Failed to fetch transaction status for ${circleTxId}:`, error.response?.data || error.message);
    return null;
  }
}

// Sandbox Token IDs (Hardcoded fallbacks for Testnet when Circle balance is 0 and unindexed)
const SANDBOX_TOKEN_IDS: Record<string, string> = {
  'USDC_ARC-TESTNET': 'ef87c8c3-85de-598a-af50-c5135eecfa74', // ERC20 USDC
  'USDC_ETH-SEPOLIA': '5797fbd6-3795-519d-84ca-ec4c5f80c3b1',
  'EURC_ETH-SEPOLIA': '0898d9ba-6477-5058-aba4-644917546416', // Typical sandbox EURC token ID
  'SOL_SOL-DEVNET': 'ecf919b4-517f-5fde-b82b-393d1092e5fc',
  'SOL-DEVNET_SOL-DEVNET': 'ecf919b4-517f-5fde-b82b-393d1092e5fc',
};

export async function getTokenIdBySymbol(walletId: string, symbol: string, blockchain?: string): Promise<string> {
  const cleanSymbol = symbol.trim().toUpperCase().replace(/^\$/, '');
  (process.env.NODE_ENV === "development" ? console.log : () => {})(`[payment-service] Looking up token ID for symbol: "${cleanSymbol}" in wallet: ${walletId} (blockchain: ${blockchain})`);

  try {
    const balanceResponse = await circleClient.getWalletTokenBalance({ id: walletId });
    const tokens = balanceResponse.data?.tokenBalances || [];
    
    // 1. Direct match on symbol
    let targetToken = tokens.find(t => t.token?.symbol?.toUpperCase() === cleanSymbol);
    
    // 2. Intelligent loose/native/blockchain-aware matching
    if (!targetToken) {
      targetToken = tokens.find(t => {
        const tokenSym = t.token?.symbol?.toUpperCase() || '';
        const isNative = t.token?.isNative === true;
        const _tokenChain = t.token?.blockchain?.toUpperCase() || '';

        // Native SOL match (Circle symbols it as 'SOL-DEVNET' or isNative: true)
        if ((cleanSymbol === 'SOL' || cleanSymbol === 'SOLANA') && (isNative || tokenSym === 'SOL' || tokenSym === 'SOL-DEVNET' || tokenSym.startsWith('SOL-'))) {
          return true;
        }

        // Native ETH match
        if ((cleanSymbol === 'ETH' || cleanSymbol === 'ETHEREUM') && (isNative || tokenSym.startsWith('ETH'))) {
          return true;
        }

        // Prefix match (e.g. USDC-DEVNET or SOL-DEVNET)
        if (tokenSym.startsWith(`${cleanSymbol}-`) || tokenSym === `${cleanSymbol}-DEVNET` || tokenSym === `${cleanSymbol}-TESTNET`) {
          return true;
        }

        // Token name match
        if (t.token?.name?.toUpperCase() === cleanSymbol || (cleanSymbol === 'SOL' && t.token?.name?.toLowerCase().includes('solana'))) {
          return true;
        }

        return false;
      });
    }

    if (targetToken && targetToken.token?.id) {
      (process.env.NODE_ENV === "development" ? console.log : () => {})(`[payment-service] Found token ID via Circle Balance: ${targetToken.token.id} (${targetToken.token.symbol})`);
      return targetToken.token.id;
    }
  } catch (err: any) {
    console.warn(`[payment-service] Failed to fetch wallet token balance from Circle:`, err.message);
  }

  // Fallback to Sandbox Registry if Circle hasn't indexed the 0-balance token yet
  const chainKey = blockchain ? blockchain.toUpperCase() : '';
  const fallbackId = 
    SANDBOX_TOKEN_IDS[`${cleanSymbol}_${chainKey}`] ||
    (chainKey.includes('SOL') ? SANDBOX_TOKEN_IDS[`${cleanSymbol}_SOL-DEVNET`] : undefined) ||
    SANDBOX_TOKEN_IDS[`${cleanSymbol}_ARC-TESTNET`] ||
    SANDBOX_TOKEN_IDS[`${cleanSymbol}_ETH-SEPOLIA`];

  if (fallbackId) {
     (process.env.NODE_ENV === "development" ? console.log : () => {})(`[payment-service] Using Sandbox Fallback Token ID: ${fallbackId}`);
     return fallbackId;
  }

  console.error(`[payment-service] Token ${cleanSymbol} completely missing from Circle and Fallback Registry for chain ${blockchain}.`);
  throw new Error(`Token ${cleanSymbol} not found in wallet balances or insufficient balance.`);
}
