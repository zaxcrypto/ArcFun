import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { provisionWallet, circleClient, getEffectiveWalletSetId, SUPPORTED_BLOCKCHAINS, SupportedBlockchain } from '@/lib/circle/wallet-service';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    // Setup Supabase Client (Service Role for bypass RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Verify User Identity via Supabase Auth
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid session' }, { status: 401 });
    }

    // Rate limit: 5 provision attempts per minute
    const rateLimitError = await checkRateLimit(req, user.id, { maxRequests: 5, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    // --- CHECK WALLET PROVISIONING CONTROLS ---
    const { data: modeData } = await supabaseAdmin.from('system_settings').select('value').eq('key', 'wallet_provision_mode').maybeSingle();
    const provisionMode = modeData?.value || "OPEN";

    if (provisionMode === "DISABLED") {
      return NextResponse.json({ error: 'Wallet provisioning is currently disabled by Admin' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { blockchain = 'ARC-TESTNET' } = body;

    // Validate supported network strictly — fail closed on unknown chains
    if (!SUPPORTED_BLOCKCHAINS.includes(blockchain as SupportedBlockchain)) {
      return NextResponse.json({ 
        error: `Unsupported blockchain: ${blockchain}. Officially supported Circle DCW networks: ${SUPPORTED_BLOCKCHAINS.join(', ')}` 
      }, { status: 400 });
    }

    try {
      const activeWalletSetId = await getEffectiveWalletSetId();

      // 2. Strict Duplicate Prevention & Recovery: Check existing mapping by user_id
      const { data: existingWallet, error: fetchErr } = await supabaseAdmin
        .from('arc_wallets')
        .select('*')
        .eq('user_id', user.id)
        .eq('blockchain', blockchain)
        .maybeSingle();

      if (fetchErr) {
        console.error('Fetch existing wallet error:', fetchErr);
        throw new Error('Database lookup failed');
      }

      if (existingWallet) {
        // If the existing wallet belongs to the current active wallet set, return it
        if (!existingWallet.circle_wallet_set_id || existingWallet.circle_wallet_set_id === activeWalletSetId) {
          return NextResponse.json({ success: true, wallet: existingWallet, message: 'Returned existing wallet' });
        }
        console.warn(`[Provision] User ${user.id} has legacy wallet with outdated set (${existingWallet.circle_wallet_set_id}). Upgrading to active set (${activeWalletSetId})...`);
      }

      // 2.1 Multi-tier Recovery: Check if wallet was registered under linked external address or users table
      const { data: userRow } = await supabaseAdmin.from('users').select('address').eq('id', user.id).maybeSingle();
      const userExternalAddress = userRow?.address || (user.email?.includes('@') ? user.email.split('@')[0] : null);

      if (userExternalAddress && userExternalAddress.startsWith('0x') && (blockchain === 'ARC-TESTNET' || blockchain === 'ARC')) {
        let legacyWallet = null;
        try {
          const { data: lw } = await supabaseAdmin
            .from('arc_wallets')
            .select('*')
            .or(`linked_external_address.ilike.${userExternalAddress},wallet_address.ilike.${userExternalAddress}`)
            .eq('blockchain', blockchain)
            .maybeSingle();
          legacyWallet = lw;
        } catch {
          // If linked_external_address column doesn't exist, fallback to wallet_address query
          const { data: lw } = await supabaseAdmin
            .from('arc_wallets')
            .select('*')
            .ilike('wallet_address', userExternalAddress)
            .eq('blockchain', blockchain)
            .maybeSingle();
          legacyWallet = lw;
        }

        if (legacyWallet && (!legacyWallet.circle_wallet_set_id || legacyWallet.circle_wallet_set_id === activeWalletSetId)) {
          // Re-associate user_id with the existing wallet record to restore ownership
          await supabaseAdmin.from('arc_wallets').update({ user_id: user.id }).eq('id', legacyWallet.id);
          legacyWallet.user_id = user.id;
          return NextResponse.json({ success: true, wallet: legacyWallet, message: 'Recovered existing wallet from legacy record' });
        }
      }

      // 3. Provision Wallet via Circle SDK
      const walletSetId = activeWalletSetId;

      // Use predictable identifier to prevent duplicate wallets even across database wipes
      const provisioningAnchor = userExternalAddress || user.id;
      const circleWallet = await provisionWallet(walletSetId, provisioningAnchor, blockchain);

      // Validate returned wallet before persisting
      if (!circleWallet || !circleWallet.id || !circleWallet.address) {
        throw new Error('Circle returned invalid wallet structure without id or address');
      }

      // 4. Store Mapping in Database
      const baseWalletMap: any = {
        user_id: user.id,
        circle_wallet_set_id: circleWallet.walletSetId || walletSetId,
        circle_wallet_id: circleWallet.id,
        blockchain: blockchain,
        wallet_address: circleWallet.address,
        ref_id: circleWallet.refId,
        status: circleWallet.state || 'provisioned',
        created_at: Date.now()
      };

      let storedWallet = null;
      const withExtMap = userExternalAddress ? { ...baseWalletMap, linked_external_address: userExternalAddress } : baseWalletMap;
      const { data: inserted1, error: insertErr1 } = await supabaseAdmin
        .from('arc_wallets')
        .insert(withExtMap)
        .select()
        .maybeSingle();

      if (insertErr1) {
        // Check for concurrent conflict or existing record update (code 23505)
        if (insertErr1.code === '23505') {
          const { data: updatedConflict, error: updateErr } = await supabaseAdmin
            .from('arc_wallets')
            .update(withExtMap)
            .eq('user_id', user.id)
            .eq('blockchain', blockchain)
            .select()
            .maybeSingle();
          if (updatedConflict && !updateErr) {
            return NextResponse.json({ success: true, wallet: updatedConflict, message: 'Updated existing wallet with active Circle DCW' });
          }

          const { data: conflictWallet } = await supabaseAdmin
            .from('arc_wallets')
            .select('*')
            .eq('user_id', user.id)
            .eq('blockchain', blockchain)
            .maybeSingle();
          if (conflictWallet) {
            return NextResponse.json({ success: true, wallet: conflictWallet, message: 'Returned existing wallet on concurrent race' });
          }
        }

        const { data: inserted2, error: insertErr2 } = await supabaseAdmin
          .from('arc_wallets')
          .insert(baseWalletMap)
          .select()
          .single();
        if (insertErr2 || !inserted2) {
          if (insertErr2?.code === '23505') {
            const { data: updatedConflict2 } = await supabaseAdmin
              .from('arc_wallets')
              .update(baseWalletMap)
              .eq('user_id', user.id)
              .eq('blockchain', blockchain)
              .select()
              .maybeSingle();
            if (updatedConflict2) {
              return NextResponse.json({ success: true, wallet: updatedConflict2, message: 'Updated existing wallet with active Circle DCW' });
            }

            const { data: conflictWallet } = await supabaseAdmin
              .from('arc_wallets')
              .select('*')
              .eq('user_id', user.id)
              .eq('blockchain', blockchain)
              .maybeSingle();
            if (conflictWallet) {
              return NextResponse.json({ success: true, wallet: conflictWallet, message: 'Returned existing wallet on concurrent race' });
            }
          }
          console.error('Supabase Insert Error:', insertErr2 || insertErr1);
          throw new Error('Failed to store wallet mapping');
        }
        storedWallet = inserted2;
      } else {
        storedWallet = inserted1;
      }

      // 5. Strict Verification: Balance Endpoint Responds
      try {
        await circleClient.getWalletTokenBalance({ id: circleWallet.id });
      } catch (e: any) {
        console.warn("Circle Balance verification warning:", e.message);
      }

      // Kick off background initialization to fund gas and whitelist ONLY for EVM Arc chains
      if (blockchain === 'ARC-TESTNET' || blockchain === 'ARC') {
        initializeNewWallet(circleWallet.address).catch(e => console.error("Background EVM initialization error:", e));
      }

      return NextResponse.json({ success: true, wallet: storedWallet });
    } finally {
      // Idempotency handled
    }
  } catch (error: any) {
    console.error('Wallet Provisioning failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to provision wallet' }, { status: 500 });
  }
}

// Background task to fund gas and whitelist the new wallet on Arc Testnet
async function initializeNewWallet(walletAddress: string) {
  try {
    const { createWalletClient, http, publicActions, parseAbiItem, parseEther } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    
    const pk = (process.env.DEPLOYER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY) as `0x${string}`;
    if (!pk) return;
    
    const account = privateKeyToAccount(pk);
    const ArcTestnet = {
      id: 5042002,
      name: "Arc Testnet",
      network: "arc_testnet",
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com"] } }
    };
    
    const client = createWalletClient({ account, chain: ArcTestnet as any, transport: http() }).extend(publicActions);
    
    // Send 0.1 ARC for gas
    try {
      const tx = await client.sendTransaction({
        chain: ArcTestnet as any,
        to: walletAddress as `0x${string}`,
        value: parseEther("0.1")
      });
      console.log(`Funded gas for ${walletAddress}: ${tx}`);
    } catch (e: any) { console.warn("Gas funding note:", e.message); }
    
    // Whitelist the wallet on ArcFunSwap
    try {
      const ARCFUN_SWAP_ADDRESS = "0xb81f957A499Db2F2680E5CaD74eb8839Bc3421C5" as `0x${string}`;
      const hash = await client.writeContract({
        chain: ArcTestnet as any,
        address: ARCFUN_SWAP_ADDRESS,
        abi: [parseAbiItem('function setWhitelist(address user, bool status)')],
        functionName: "setWhitelist",
        args: [walletAddress as `0x${string}`, true]
      });
      console.log(`Whitelisted ${walletAddress}: ${hash}`);
    } catch (e: any) { console.warn("Whitelist note:", e.message); }
    
  } catch (err: any) {
    console.warn("Wallet initialization note:", err.message);
  }
}
