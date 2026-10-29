import { ethers } from 'ethers';
import { getEvmFallbacks } from '@/lib/evm-rpc';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { getSuiCctpConfig } from '@/lib/bridge/sui-cctp-config';

export interface SourceTxStatus {
  exists: boolean;
  status?: 'success' | 'failed' | 'pending';
  blockNumber?: number;
}

export async function verifySourceTxOnChain(
  network: string,
  txHash: string,
  environment: 'mainnet' | 'testnet' = 'testnet'
): Promise<SourceTxStatus> {
  try {
    const isSui = network.toLowerCase().includes('sui');
    if (isSui) {
      const isMainnet = environment === 'mainnet' || network.toLowerCase().includes('mainnet');
      const config = getSuiCctpConfig(isMainnet);
      const cleanDigest = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
      
      const rpcUrls = [
        config.rpcUrl,
        isMainnet ? 'https://fullnode.mainnet.sui.io:443' : 'https://fullnode.testnet.sui.io:443'
      ];

      for (const url of rpcUrls) {
        try {
          const client = new SuiGrpcClient({ baseUrl: url, network: isMainnet ? 'mainnet' : 'testnet' });
          const txBlock = await client.getTransaction({
            digest: cleanDigest,
          });
          if (txBlock) {
            const isSuccess = txBlock.$kind === 'Transaction' || !!(txBlock as any).Transaction;
            return {
              exists: true,
              status: isSuccess ? 'success' : 'failed',
            };
          }
        } catch {
          continue;
        }
      }
      return { exists: false };
    }

    const rpcUrls = getEvmFallbacks(network);
    if (!rpcUrls || rpcUrls.length === 0) {
      return { exists: false };
    }

    for (const rpc of rpcUrls) {
      try {
        const provider = new ethers.JsonRpcProvider(rpc);
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          return {
            exists: true,
            status: receipt.status === 1 ? 'success' : 'failed',
            blockNumber: receipt.blockNumber,
          };
        }
        const tx = await provider.getTransaction(txHash);
        if (tx) {
          return {
            exists: true,
            status: 'pending',
          };
        }
      } catch {
        continue;
      }
    }

    return { exists: false };
  } catch (err) {
    return { exists: false };
  }
}
