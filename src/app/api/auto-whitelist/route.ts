import { NextResponse } from "next/server";
import { createWalletClient, http, publicActions, parseAbiItem, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getArcStatsForBackend } from "@/lib/arc-api-backend";
import { calculateArcScore } from "@/lib/arc-score";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";

const ArcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  network: "arc_testnet",
  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [(process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com")] },
    public: { http: [(process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com")] } } };

const ARCFUN_SWAP_ADDRESS = "0xb81f957A499Db2F2680E5CaD74eb8839Bc3421C5" as `0x${string}`;
const WHITELISTED_ROLE = '0x8429d542926e6695b59ac6fbdcd9b37e8b1aeb0b7e9fc11e4f440d9b5b2bf1d1'; // keccak256("WHITELISTED_ROLE")


import { verifySessionToken, getSessionTokenFromRequest } from "@/lib/verify-session";

export async function POST(req: Request) {
  try {
    const sessionToken = getSessionTokenFromRequest(req);
    if (!(await verifySessionToken(sessionToken))) {
      return NextResponse.json({ error: "Security verification required. Please reconnect your wallet." }, { status: 403 });
    }
    const { address, signature } = await req.json();
    if (!address || !signature) return NextResponse.json({ error: "No address or signature provided" }, { status: 400 });

    // Strict rate limiting: Max 5 requests per IP, 2 per wallet per minute
    const rateLimitError = await checkRateLimit(req, address, { maxRequests: 5, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    try {
      try {
        const isValid = await verifyMessage({
          address,
          message: `Authorize my wallet ${address} for ArcFun Swap.`,
          signature
        });
        if (!isValid) throw new Error("Invalid signature");
      } catch (e) {
        throw new Error("Signature verification failed");
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      let isManuallyApproved = false;

      if (supabaseUrl && supabaseServiceKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
        const { data } = await supabaseAdmin
          .from("access_requests")
          .select("request_status")
          .ilike("wallet_address", address)
          .maybeSingle();
        if (data && data.request_status === "approved") {
          isManuallyApproved = true;
        }
      }

      if (!isManuallyApproved) {
        const stats = await getArcStatsForBackend(address);
        const score = calculateArcScore(stats, 0);
        if (score.total < 50) {
          throw new Error("Score too low");
        }
      }

      const pk = (process.env.DEPLOYER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY) as `0x${string}`;
      if (!pk) throw new Error("No admin key configured");

      const account = privateKeyToAccount(pk);
      const client = createWalletClient({
        account,
        chain: ArcTestnet,
        transport: http() }).extend(publicActions);

      const isWhite = await client.readContract({
        address: ARCFUN_SWAP_ADDRESS,
        abi: [parseAbiItem('function isWhitelisted(address account) view returns (bool)')],
        functionName: "isWhitelisted",
        args: [address as `0x${string}`] });

      if (isWhite) {
        return NextResponse.json({ success: true, message: "Already whitelisted" });
      }

      // robust nonce handling for concurrent requests
      let maxRetries = 10;
      let lastError = null;

      while (maxRetries > 0) {
        try {
          const nonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' });
          const hash = await client.writeContract({
            address: ARCFUN_SWAP_ADDRESS,
            abi: [parseAbiItem('function setWhitelist(address user, bool status)')],
            functionName: "setWhitelist",
            args: [address as `0x${string}`, true],
            nonce });

          // wait briefly to ensure transaction propagates
          await new Promise(r => setTimeout(r, 1000));

          return NextResponse.json({ success: true, hash });
        } catch (e: any) {
          lastError = e;
          const msg = e.message?.toLowerCase() || "";
          if (msg.includes("nonce") || msg.includes("replacement") || msg.includes("already known")) {
            maxRetries--;
            await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
          } else {
            throw e;
          }
        }
      }

      throw lastError;
    } finally {
      // Rate limiting via checkRateLimit handles concurrent abuse prevention
    }
  } catch (error: any) {
    console.error("Auto-Whitelist Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: error.message?.includes("Score") ? 403 : (error.message?.includes("Signature") ? 401 : 500) });
  }
}
