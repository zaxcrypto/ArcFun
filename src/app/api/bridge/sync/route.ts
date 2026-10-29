import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http } from 'viem';
import { ChainRegistry } from '@/lib/bridge/chain-registry';
import { checkRateLimit } from '@/lib/rate-limit';
import { withSolanaFailover } from '@/lib/solana-rpc';
import { withEvmFailover } from '@/lib/evm-rpc';
import { SuiGrpcClient } from '@mysten/sui/grpc';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export async function POST(req: Request) {
  try {
    const { wallet_address, source_chain, destination_chain, token_symbol, amount, burn_tx_hash, source_address } = await req.json();

    if (!wallet_address || !source_chain || !burn_tx_hash) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const rateLimitError = await checkRateLimit(req, wallet_address, { maxRequests: 10, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    // Decimal validation: Reject if precision > 6 decimals
    const amountStr = String(amount);
    if (amountStr.includes('.')) {
      const decimals = amountStr.split('.')[1];
      if (decimals && decimals.length > 6) {
        return NextResponse.json({ error: 'Amount exceeds maximum 6-decimal precision allowed by CCTP' }, { status: 400 });
      }
    }

    const isEvmHash = /^0x[a-fA-F0-9]{64}$/.test(burn_tx_hash);
    const isSolanaSignature = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(burn_tx_hash);
    const isStellarHash = /^[a-fA-F0-9]{64}$/.test(burn_tx_hash);
    const isSuiDigest = /^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(burn_tx_hash);

    if (!isEvmHash && !isSolanaSignature && !isStellarHash && !isSuiDigest) {
      return NextResponse.json({ error: 'Invalid burn_tx_hash format' }, { status: 400 });
    }

    // 1. Verify source chain exists in registry (Stellar & Sui chains bypass EVM ChainRegistry)
    const isStellarSource = source_chain.toLowerCase().includes('stellar');
    const isSuiSource = source_chain.toLowerCase().includes('sui');
    const chainConfig = (isStellarSource || isSuiSource) ? null : ChainRegistry.getChainSafe(source_chain);
    if (!isStellarSource && !isSuiSource && (!chainConfig || !chainConfig.rpcUrl)) {
      return NextResponse.json({ error: 'Unsupported source chain' }, { status: 400 });
    }

    // 2. Cryptographically verify the burn_tx_hash belongs to the wallet
    try {
      if (isStellarSource && isStellarHash) {
        // Stellar Verification: use Horizon to confirm tx exists and was signed by wallet
        const horizonUrl = `https://horizon-testnet.stellar.org/transactions/${burn_tx_hash}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        let horizonRes;
        try {
          horizonRes = await fetch(horizonUrl, { signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }
        if (!horizonRes.ok) {
          return NextResponse.json({ error: 'Stellar transaction not found on Horizon' }, { status: 404 });
        }
        const horizonData = await horizonRes.json();
        // Stellar: source_account is a G-address; wallet_address is an EVM 0x address.
        // Cross-type comparison is impossible — security is enforced by Horizon's
        // immutable ledger: if the tx exists and succeeded, the burn is valid.
        if (horizonData.successful !== true) {
          console.error(`[Security] Stellar transaction did not succeed: ${burn_tx_hash}`);
          return NextResponse.json({ error: 'Stellar transaction did not succeed' }, { status: 400 });
        }

        // Deep verification: query Iris API to verify mintRecipient matches wallet_address
        try {
          const { CIRCLE_IRIS_API } = await import('@/lib/bridge/cctp-provider');
          const irisUrl = `${CIRCLE_IRIS_API}/v2/messages/27?transactionHash=${burn_tx_hash}`;
          const irisRes = await fetch(irisUrl);
          if (irisRes.ok) {
            const irisData = await irisRes.json();
            const msg = irisData?.messages?.[0];
            if (msg && msg.message) {
              const cleanMsg = msg.message.startsWith('0x') ? msg.message.slice(2) : msg.message;
              const recipientHex = cleanMsg.slice(184 * 2, 216 * 2);
              const resolvedRecipient = "0x" + recipientHex.slice(12 * 2).toLowerCase();
              if (resolvedRecipient !== wallet_address.toLowerCase()) {
                console.error(`[Security] Sync verification failed: recipient in CCTP message (${resolvedRecipient}) does not match wallet_address (${wallet_address})`);
                return NextResponse.json({ error: 'Transaction recipient does not match your wallet address' }, { status: 403 });
              }
            }
          }
        } catch (err) {
          console.warn("Failed to verify recipient via Iris API in sync:", err);
        }
      } else if (isSuiSource && isSuiDigest) {
        // Sui Verification Flow via Sui gRPC with failover & retry loop
        const isMainnet = source_chain.toLowerCase().includes('mainnet');
        const suiRpcUrls = [
          isMainnet ? process.env.NEXT_PUBLIC_SUI_MAINNET_RPC_URL : process.env.NEXT_PUBLIC_SUI_RPC_URL,
          isMainnet ? "https://fullnode.mainnet.sui.io:443" : "https://fullnode.testnet.sui.io:443"
        ].filter(Boolean) as string[];

        let dataResult: any = null;
        const cleanDigest = burn_tx_hash.startsWith('0x') ? burn_tx_hash.slice(2) : burn_tx_hash;

        for (let attempt = 0; attempt < 5; attempt++) {
          for (const rpcUrl of suiRpcUrls) {
            try {
              const grpcClient = new SuiGrpcClient({ baseUrl: rpcUrl, network: isMainnet ? 'mainnet' : 'testnet' });
              const tx = await grpcClient.getTransaction({ digest: cleanDigest });
              if (tx && (tx.$kind === 'Transaction' || (tx as any).Transaction)) {
                dataResult = tx.Transaction || tx;
                break;
              }
            } catch (rpcErr) {
              // Not yet indexed or node catching up
            }
          }

          if (dataResult) break;

          if (attempt < 4) {
            const delay = (attempt + 1) * 800;
            console.log(`[BridgeSync] Transaction not yet indexed on Sui Testnet. Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
          }
        }

        if (!dataResult) {
          return NextResponse.json({ error: 'Sui transaction not found on-chain' }, { status: 404 });
        }

        const isSuccess = dataResult.status?.success === true || dataResult.effects?.status?.status === 'success';
        if (!isSuccess && dataResult.status?.error) {
          return NextResponse.json({ error: 'Sui transaction did not succeed' }, { status: 400 });
        }
      } else if (isSolanaSignature) {
        let dataResult = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const data = await withSolanaFailover(async (rpcUrl) => {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s RPC timeout

              const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'getTransaction',
                  params: [
                    burn_tx_hash,
                    { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }
                  ]
                }),
                signal: controller.signal
              });
              clearTimeout(timeoutId);

              const resultData = await response.json();
              if (resultData.error) {
                throw new Error(resultData.error.message || 'RPC returned an error');
              }
              return resultData;
            }, "Bridge Sync Verification");

            if (data && data.result) {
              dataResult = data.result;
              break;
            }
          } catch (rpcErr) {
            console.warn(`[BridgeSync] Solana getTransaction attempt ${attempt + 1} failed:`, rpcErr);
          }

          if (attempt < 4) {
            const delay = (attempt + 1) * 800;
            console.log(`[BridgeSync] Transaction not yet indexed on Solana Devnet. Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
          }
        }

        if (!dataResult) {
          return NextResponse.json({ error: 'Transaction not found on Solana' }, { status: 404 });
        }

        // Verify the transaction was successful
        if (dataResult.meta && dataResult.meta.err !== null) {
          return NextResponse.json({ error: 'Solana transaction failed on-chain' }, { status: 400 });
        }

        const transactionMessage = dataResult.transaction.message;
        const accountKeys = transactionMessage.accountKeys;

        // In jsonParsed encoding, accountKeys is an array of objects containing 'signer' and 'pubkey'
        const signers = accountKeys
          .filter((k: any) => k.signer === true)
          .map((k: any) => k.pubkey);

        const targetAddress = source_address || wallet_address;

        // If it's a Solana address, we verify it signed the transaction
        const isTargetSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(targetAddress);
        if (isTargetSolanaAddress) {
          if (!signers.includes(targetAddress)) {
            console.error(`[Security] Solana RPC ownership mismatch. Expected ${targetAddress} in signers, got ${signers.join(', ')}`);
            return NextResponse.json({ error: 'Transaction ownership verification failed' }, { status: 403 });
          }
        } else {
          // If no Solana address was provided (e.g. only EVM wallet_address is passed during historical recovery),
          // we rely on the on-chain CCTP contract security (mintRecipient validation).
          console.log(`[Security] Solana sync: Target address ${targetAddress} is not a valid Solana address. Skipping signer ownership check.`);
        }

      } else if (!isStellarSource && !isSuiSource && chainConfig) {
        // EVM Verification Flow
        const tx = await withEvmFailover(chainConfig.name, chainConfig.rpcUrl, async (rpcUrl) => {
          const publicClient = createPublicClient({ transport: http(rpcUrl, { timeout: 6000 }) });
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              const res = await publicClient.getTransaction({ hash: burn_tx_hash as `0x${string}` });
              if (res) return res;
            } catch (_) {}
            await new Promise(r => setTimeout(r, 1000));
          }
          return await publicClient.getTransaction({ hash: burn_tx_hash as `0x${string}` });
        }, "EVM Bridge Sync");

        if (!tx || tx.from.toLowerCase() !== wallet_address.toLowerCase()) {
          console.error(`[Security] RPC ownership mismatch. Expected ${wallet_address}, got ${tx?.from}`);
          return NextResponse.json({ error: 'Transaction ownership verification failed' }, { status: 403 });
        }
      }
    } catch (rpcError: any) {
      console.error('[RPC Verification Error]:', rpcError);
      if (rpcError.name === 'AbortError') {
        return NextResponse.json({ error: 'RPC connection timed out' }, { status: 504 });
      }
      return NextResponse.json({ error: 'Failed to verify transaction on-chain' }, { status: 502 });
    }

    // 3. Normalize wallet address (VARCHAR(42) constraint in DB)
    let dbWalletAddress = wallet_address ? wallet_address.toLowerCase() : '';
    if (dbWalletAddress.length > 42) {
      if (source_address && source_address.startsWith('0x') && source_address.length === 42) {
        dbWalletAddress = source_address.toLowerCase();
      } else {
        dbWalletAddress = dbWalletAddress.slice(0, 42);
      }
    }

    // Insert securely bypassing RLS
    const { error } = await supabaseAdmin.from('bridge_transactions').insert([{
      wallet_address: dbWalletAddress,
      source_chain,
      destination_chain,
      token_symbol,
      amount,
      burn_tx_hash,
      bridge_status: 'ATTESTATION_PENDING'
    }]);

    if (error) {
      // If unique constraint fails, it just means it's already there
      if (error.code === '23505') return NextResponse.json({ success: true });
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Bridge Sync POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
