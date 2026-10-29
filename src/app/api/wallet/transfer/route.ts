import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { circleClient } from '@/lib/circle/wallet-service';
import { executeTransfer, getTokenIdBySymbol } from '@/lib/circle/payment-service';
import { isAddress, createPublicClient, http, formatUnits } from 'viem';
import { calculateSpendableBalance, getNetworkReserve } from '@/config/network-reserve';
import { resolveNetworkRegistry, ERC20_APPROVE_ABI } from '@/config/swap-contract';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateAndLockTransaction, finalizeTransactionLock } from '@/lib/security/policy-engine';
import { getLiveAssetPriceUsd } from '@/lib/gateway/price-oracle';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Authenticate user
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid session' }, { status: 401 });
    }

    // Rate limit: 10 transfers per minute per user
    const rateLimitError = await checkRateLimit(req, user.id, { maxRequests: 10, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    const body = await req.json();
    const { blockchain, symbol, destinationAddress, amount, passkeyProof, intentId } = body;

    if (!blockchain || !symbol || !destinationAddress || !amount || !intentId) {
      return NextResponse.json({ error: 'Missing required parameters (intentId is required)' }, { status: 400 });
    }

    const requestedAmount = parseFloat(amount);
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      return NextResponse.json({ error: 'Amount must be a valid positive number' }, { status: 400 });
    }

    // 2. Address Validation
    let resolvedAddress = destinationAddress.trim();
    const isSolanaChain = blockchain === 'SOL-DEVNET' || blockchain === 'SOL';

    if (isSolanaChain) {
      try {
        const { PublicKey } = await import('@solana/web3.js');
        const pubkey = new PublicKey(resolvedAddress);
        if (!PublicKey.isOnCurve(pubkey.toBytes())) {
          return NextResponse.json({ error: 'Invalid Solana destination address' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid Solana destination address format' }, { status: 400 });
      }

      if (resolvedAddress === '11111111111111111111111111111111') {
        return NextResponse.json({ error: 'Cannot send to the Solana system program' }, { status: 400 });
      }
    } else {
      if (resolvedAddress.toLowerCase().endsWith('.eth')) {
        return NextResponse.json({ error: 'ENS resolution is not yet supported' }, { status: 400 });
      }

      if (!isAddress(resolvedAddress)) {
        return NextResponse.json({ error: 'Invalid destination address format' }, { status: 400 });
      }

      if (resolvedAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
        return NextResponse.json({ error: 'Cannot send to the zero address' }, { status: 400 });
      }
    }

    // 3. Fetch Arc Wallet for this user and blockchain
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from('arc_wallets')
      .select('circle_wallet_id, wallet_address')
      .eq('user_id', user.id)
      .eq('blockchain', blockchain)
      .maybeSingle();

    if (walletErr || !wallet) {
      return NextResponse.json({ error: 'No Arc Wallet found for this blockchain' }, { status: 404 });
    }

    if (resolvedAddress.toLowerCase() === wallet.wallet_address.toLowerCase()) {
      return NextResponse.json({ error: 'Cannot send to your own wallet address' }, { status: 400 });
    }

    // 3.5 Spendable Balance Backend Validation
    let onChainBalance = 0;
    try {
      const reg = resolveNetworkRegistry(blockchain);
      
      const cleanSym = symbol.trim().toUpperCase().replace(/^\$/, '');

      if (isSolanaChain) {
        const balanceResponse = await circleClient.getWalletTokenBalance({
          id: wallet.circle_wallet_id
        });
        const tokenBalance = balanceResponse.data?.tokenBalances?.find(
          (tb: any) => {
            const sym = tb.token?.symbol?.toUpperCase() || '';
            const isNative = tb.token?.isNative === true;
            return sym === cleanSym || 
                   sym === `${cleanSym}-DEVNET` || 
                   ((cleanSym === 'SOL' || cleanSym === 'SOLANA') && (isNative || sym === 'SOL-DEVNET' || sym.startsWith('SOL-')));
          }
        );
        if (tokenBalance && tokenBalance.amount) {
          onChainBalance = parseFloat(tokenBalance.amount);
        }
      } else if (reg && reg.rpc) {
        const tokenAddress = cleanSym === 'USDC' ? reg.USDC : (cleanSym === 'EURC' ? reg.EURC : null);
        if (tokenAddress && tokenAddress !== '0x0') {
          const publicClient = createPublicClient({ transport: http(reg.rpc) });
          const bal = await publicClient.readContract({
            address: (tokenAddress as string).toLowerCase() as `0x${string}`,
            abi: ERC20_APPROVE_ABI,
            functionName: 'balanceOf',
            args: [wallet.wallet_address.toLowerCase() as `0x${string}`]
          });
          onChainBalance = Number(formatUnits(bal as bigint, 6));
        }
      } else {
        const balanceResponse = await circleClient.getWalletTokenBalance({
          id: wallet.circle_wallet_id
        });
        const tokenBalance = balanceResponse.data?.tokenBalances?.find(
          (tb: any) => {
            const sym = tb.token?.symbol?.toUpperCase() || '';
            return sym === cleanSym || sym === `${cleanSym}-TESTNET` || sym === `${cleanSym}-DEVNET`;
          }
        );
        if (tokenBalance && tokenBalance.amount) {
          onChainBalance = parseFloat(tokenBalance.amount);
        }
      }
    } catch (e: any) {
      console.warn('Failed to fetch balance for spendable validation:', e.message);
    }

    const cleanSymbol = symbol.trim().toUpperCase().replace(/^\$/, '');
    const isGasToken = isSolanaChain ? (cleanSymbol === 'SOL' || cleanSymbol === 'SOLANA') : cleanSymbol === 'USDC';
    const spendable = calculateSpendableBalance(onChainBalance, blockchain, isGasToken);
    if (requestedAmount > spendable && onChainBalance > 0) {
      const reserve = getNetworkReserve(blockchain);
      return NextResponse.json({ 
        error: `Insufficient spendable balance. Keep at least ${reserve} ${symbol} reserved for network fees.` 
      }, { status: 400 });
    }

    // 3.5. Convert asset amount to live USD equivalent via Chainlink / Multi-Tier Oracle
    const { priceUsd, source: priceSource } = await getLiveAssetPriceUsd(symbol);
    const requestedAmountUsd = requestedAmount * priceUsd;

    console.log(JSON.stringify({
      level: 'INFO',
      event: 'LIVE_ORACLE_VALUATION',
      symbol,
      requestedAmount,
      priceUsd,
      priceSource,
      requestedAmountUsd
    }));

    // 4. Shared Security Policy Engine Validation & Ledger Lock
    let policyResult;
    try {
      policyResult = await validateAndLockTransaction({
        supabaseAdmin,
        user,
        intentId,
        requestedAmountUsd,
        tokenAmount: requestedAmount,
        type: 'TRANSFER',
        tokenSymbol: symbol,
        fromWallet: wallet.wallet_address,
        toWallet: resolvedAddress,
        authDetails: {
          password: body.password,
          passkeyProof: passkeyProof
        }
      });

      if (policyResult.status === 'PASSKEY_REQUIRED') {
        return NextResponse.json({ 
          status: 'PASSKEY_REQUIRED', 
          threshold: policyResult.threshold,
          reason: policyResult.reason,
          has_password: policyResult.has_password
        }, { status: 200 });
      }

    } catch (err: any) {
      if (err.code === 'SECURITY_SETUP_REQUIRED') {
        return NextResponse.json({ status: 'SECURITY_SETUP_REQUIRED', error: err.message }, { status: 403 });
      }
      return NextResponse.json({ error: err.message || 'Transaction rejected by security policy' }, { status: err.status || 500 });
    }

    if (!policyResult.ledgerId) {
      return NextResponse.json({ error: 'Failed to acquire ledger lock' }, { status: 500 });
    }

    let circleTxId = null;

    // 5. Retrieve Token ID required by Circle SDK
    let tokenId: string;
    try {
      tokenId = await getTokenIdBySymbol(wallet.circle_wallet_id, symbol, blockchain);
    } catch (e: any) {
      console.error(`[Transfer] Token lookup failed for symbol ${symbol} on ${blockchain}:`, e.message);
      await finalizeTransactionLock(supabaseAdmin, policyResult.ledgerId as string, null, 'FAILED', 'Token lookup failed');
      return NextResponse.json({ error: 'Token lookup failed' }, { status: 400 });
    }

    // 6. Execute Transfer via Circle SDK
    try {
      const txResult = await executeTransfer(
        wallet.circle_wallet_id,
        tokenId,
        resolvedAddress,
        amount,
        intentId
      );
      circleTxId = txResult.id;
    } catch (e: any) {
      const errorMsg = e.response?.data?.message || e.message || 'Transfer execution failed';
      console.error('[Transfer] Circle execution failed:', errorMsg);
      await finalizeTransactionLock(supabaseAdmin, policyResult.ledgerId as string, null, 'FAILED', errorMsg);
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    // 7. Finalize ledger lock to PENDING
    await finalizeTransactionLock(supabaseAdmin, policyResult.ledgerId as string, circleTxId, 'PENDING');

    return NextResponse.json({ success: true, transactionId: circleTxId });

  } catch (error: any) {
    console.error('Payment transfer route failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
