import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { circleClient } from '@/lib/circle/wallet-service';
import { withEvmFailover } from '@/lib/evm-rpc';
import { CROSS_CHAIN_REGISTRY } from '@/config/swap-contract';
import { createPublicClient, http } from 'viem';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ status: "UNAUTHENTICATED", error: "Missing or invalid authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Auth Check
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ status: "UNAUTHENTICATED", error: 'Invalid session' }, { status: 401 });
    }

    // Rate limit: 20 req/min
    const rateLimitError = await checkRateLimit(req, user.id, { maxRequests: 20, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    const { searchParams } = new URL(req.url);
    const blockchain = searchParams.get('blockchain') || 'ARC-TESTNET';

    // 2. Identity Check
    const { data: arcAccount, error: accErr } = await supabaseAdmin
      .from('arc_accounts')
      .select('account_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (accErr) {
      return NextResponse.json({ status: "SERVICE_DEGRADED", error: "Database connectivity issue" }, { status: 500 });
    }

    // --- CHECK PROVISIONING MODE ---
    const { data: modeData } = await supabaseAdmin.from('system_settings').select('value').eq('key', 'wallet_provision_mode').maybeSingle();
    const provisionMode = modeData?.value || "OPEN";
    const isProvisioningAllowed = provisionMode !== "DISABLED";

    if (!arcAccount) {
      if (!isProvisioningAllowed) return NextResponse.json({ status: "MAINTENANCE" });
      return NextResponse.json({ status: "REQUIRES_ONBOARDING_STEP_1" });
    }

    // 3. Status Check
    if (arcAccount.account_status === 'LOCKED') {
      return NextResponse.json({ status: "LOCKED" });
    }
    if (arcAccount.account_status === 'SUSPENDED') {
      return NextResponse.json({ status: "SUSPENDED" });
    }

    // 4. Wallet Check: Look up user's existing wallet first
    const { data: wallet } = await supabaseAdmin
      .from('arc_wallets')
      .select('circle_wallet_id, wallet_address')
      .eq('user_id', user.id)
      .eq('blockchain', blockchain)
      .maybeSingle();

    if (!wallet) {
      if (!isProvisioningAllowed) return NextResponse.json({ status: "MAINTENANCE" });
      return NextResponse.json({ status: "REQUIRES_PROVISIONING" });
    }

    // 4.5 Check Solana DCW wallet
    const { data: solWallet } = await supabaseAdmin
      .from('arc_wallets')
      .select('wallet_address')
      .eq('user_id', user.id)
      .eq('blockchain', 'SOL-DEVNET')
      .maybeSingle();

    // 5. Policy Check
    const { data: policy } = await supabaseAdmin
      .from('user_security_policies')
      .select('user_id, password_hash')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!policy) {
      await supabaseAdmin.from('user_security_policies').upsert({
        user_id: user.id,
        updated_at: Date.now()
      }, { onConflict: 'user_id' });
    }

    // 6. Passkey Check (MFA) & Password
    const hasPasskey = !!(user.app_metadata?.passkeys && user.app_metadata.passkeys.length > 0);
    const passkeySkipped = user.user_metadata?.passkey_skipped === true;
    const passkeyNotSupported = user.app_metadata?.passkey_not_supported === true;
    const hasPassword = typeof policy?.password_hash === 'string' && policy.password_hash.trim().length > 0 && policy.password_hash !== 'null';
    
    if (hasPassword && !hasPasskey && !passkeyNotSupported) {
       if (!passkeySkipped) {
         if (!isProvisioningAllowed) return NextResponse.json({ status: "MAINTENANCE" });
         return NextResponse.json({ status: "REQUIRES_SECURITY_SETUP" });
       }
    }

    if (!passkeySkipped) {
      if (!hasPasskey && !passkeyNotSupported) {
        if (!isProvisioningAllowed) return NextResponse.json({ status: "MAINTENANCE" });
        return NextResponse.json({ status: "REQUIRES_SECURITY_SETUP" });
      }
      if (!hasPassword) {
        if (!isProvisioningAllowed) return NextResponse.json({ status: "MAINTENANCE" });
        return NextResponse.json({ status: "REQUIRES_PASSWORD_SETUP" });
      }
    } else {
      if (!hasPasskey && !passkeyNotSupported) {
        return NextResponse.json({ 
          status: "SERVICE_DEGRADED", 
          details: { reason: "Security setup skipped. Wallet is in read-only mode." },
          wallet: wallet.wallet_address,
          solanaWallet: solWallet?.wallet_address || null,
          securityStatus: "SECURITY_SETUP_REQUIRED",
          hasPasskey,
          hasPassword
        });
      }
    }

    // 7. Circle API & Balance Check (Only if API key is present)
    let circleOk = true;
    if (process.env.CIRCLE_API_KEY) {
      try {
        const balanceResponse = await circleClient.getWalletTokenBalance({
          id: wallet.circle_wallet_id
        });
        if (!balanceResponse || !balanceResponse.data) {
          circleOk = false;
        }
      } catch (e) {
        circleOk = false;
      }
    }

    // 8. RPC Check
    let rpcOk = true;
    const chainName = "Arc Testnet";
    const rpcUrl = CROSS_CHAIN_REGISTRY[chainName]?.rpc || process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com";
    if (rpcUrl) {
      try {
        await withEvmFailover(chainName, rpcUrl, async (url) => {
          const pc = createPublicClient({ transport: http(url) });
          await pc.getBlockNumber();
        }, "Health Check Block Number");
      } catch (e) {
        rpcOk = false;
      }
    }


    const isFullySecured = (hasPasskey || passkeyNotSupported) && hasPassword;
    const securityStatus = isFullySecured ? "FULLY_SECURED" : "SECURITY_SETUP_REQUIRED";

    return NextResponse.json({ 
      status: "OK", 
      wallet: wallet.wallet_address,
      solanaWallet: solWallet?.wallet_address || null,
      securityStatus,
      hasPasskey,
      hasPassword
    });

  } catch (error: any) {
    console.error('Wallet Health Check failed:', error);
    return NextResponse.json({ status: "ERROR", error: 'Internal Server Error' }, { status: 500 });
  }
}
