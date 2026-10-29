import { createPublicClient, http, Address, erc20Abi } from 'viem';
import { withEvmFailover } from '@/lib/evm-rpc';

export class MulticallEngine {
   static async getBalances(network: string, rpcUrl: string, walletAddress: string, tokenAddresses: string[]) {
      return withEvmFailover(network, rpcUrl, async (rpc) => {
         const client = createPublicClient({ transport: http(rpc) });
         
         const contracts = tokenAddresses.filter(t => t !== 'native' && t !== '0x0' && t !== '0x0000000000000000000000000000000000000000').map(address => ({
            address: address as Address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [walletAddress as Address]
         }));

         const results = contracts.length > 0 ? await client.multicall({
            contracts,
            allowFailure: true,
            multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11'
         }) : [];
         
         const balances = new Map<string, bigint>();
         
         let resultIdx = 0;
         for (const addr of tokenAddresses) {
            if (addr === 'native' || addr === '0x0' || addr === '0x0000000000000000000000000000000000000000') {
               const nativeBal = await client.getBalance({ address: walletAddress as Address });
               balances.set('native', nativeBal);
            } else {
               const res = results[resultIdx++];
               if (res && res.status === 'success') {
                  balances.set(addr.toLowerCase(), res.result as bigint);
               } else {
                  balances.set(addr.toLowerCase(), 0n);
               }
            }
         }
         return balances;
      });
   }
}
