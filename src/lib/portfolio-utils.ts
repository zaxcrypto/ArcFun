import { supabaseAdmin } from "@/lib/supabase-admin";
import { createPublicClient, http, formatUnits } from "viem";
import { resolveNetworkRegistry, ERC20_APPROVE_ABI } from "@/config/swap-contract";
import { withEvmFailover } from "@/lib/evm-rpc";

/**
 * Event-Driven Portfolio Snapshot Utility
 * 
 * Called by backend mutation endpoints (Send, Swap, Bridge) immediately 
 * after a successful balance-changing event to record the new absolute USD value.
 */
export async function recordPortfolioSnapshot(userId: string, walletAddress: string, network: string = "Arc Testnet", deltaUsd?: number) {
    try {
        // OWNERSHIP VALIDATION: Ensure the userId actually owns this wallet to prevent orphaned/bad snapshots
        const { data: ownerCheck } = await supabaseAdmin
            .from('arc_wallets')
            .select('user_id')
            .eq('wallet_address', walletAddress.toLowerCase())
            .maybeSingle();

        if (!ownerCheck || ownerCheck.user_id !== userId) {
            console.error(`[Portfolio] Rejected snapshot: User ${userId} does not own wallet ${walletAddress}`);
            return;
        }

        const { data: lastSnapshot } = await supabaseAdmin
            .from('portfolio_snapshots')
            .select('total_usd, id, created_at')
            .eq('user_id', userId)
            .eq('wallet_address', walletAddress.toLowerCase())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const executeSnapshot = async (newTotal: number, lastSnap: any) => {
            // Deduplication: If the balance didn't change (e.g. 0 delta), skip entirely
            if (lastSnap && lastSnap.total_usd !== undefined && Math.abs(newTotal - Number(lastSnap.total_usd)) < 0.01) {
                return;
            }

            const { error: insertErr } = await supabaseAdmin.from('portfolio_snapshots').insert({
                user_id: userId,
                wallet_address: walletAddress.toLowerCase(),
                total_usd: newTotal
            });
            if (insertErr) throw insertErr;
        };

        if (typeof deltaUsd === 'number' && lastSnapshot && lastSnapshot.total_usd !== undefined) {
            const newTotal = Math.max(0, Number(lastSnapshot.total_usd) + deltaUsd);
            await executeSnapshot(newTotal, lastSnapshot);
            return; // Successfully skipped expensive RPC read!
        }

        const reg = resolveNetworkRegistry(network);

        if (!reg || !reg.rpc) return;

        let total = 0;
        
        await withEvmFailover(network, reg.rpc, async (rpcUrl) => {
            const client = createPublicClient({ transport: http(rpcUrl) });
            
            // Native Balance
            const nativeBal = await client.getBalance({ address: walletAddress as `0x${string}` });
            const isArcTestnet = network === "Arc Testnet" || network === "ARC-TESTNET";
            const nativeDecimals = 18;
            const nativeNum = Number(formatUnits(nativeBal, nativeDecimals));
            if (!isArcTestnet) {
               const nativePrice = network.includes("Monad") ? 50 : network.includes("Sonic") ? 0.5 : 3000;
               total += nativeNum * nativePrice;
            }

            // USDC Balance
            if (reg.USDC && reg.USDC !== "0x0") {
               const usdcBal = await client.readContract({
                  address: reg.USDC as `0x${string}`,
                  abi: ERC20_APPROVE_ABI,
                  functionName: "balanceOf",
                  args: [walletAddress as `0x${string}`]
               });
               total += Number(formatUnits(usdcBal as bigint, 6));
            }

            // EURC Balance
            if (reg.EURC && reg.EURC !== "0x0") {
               const eurcBal = await client.readContract({
                  address: reg.EURC as `0x${string}`,
                  abi: ERC20_APPROVE_ABI,
                  functionName: "balanceOf",
                  args: [walletAddress as `0x${string}`]
               });
               total += Number(formatUnits(eurcBal as bigint, 6)) * 1.08;
            }
        }, "Backend Snapshot RPC");

        await executeSnapshot(total, lastSnapshot);
        
    } catch (e: any) {
        console.error("Failed to record event-driven portfolio snapshot", e);
        // Push to Dead Letter Queue instead of crashing
        try {
            await supabaseAdmin.from('snapshot_failures').insert({
                user_id: userId,
                wallet_address: walletAddress.toLowerCase(),
                network,
                delta_usd: deltaUsd || null,
                error_message: e.message || String(e),
                created_at: new Date().toISOString()
            });
        } catch (dlqErr) {
            console.error("Failed to write to dead-letter queue", dlqErr);
        }
    }
}
