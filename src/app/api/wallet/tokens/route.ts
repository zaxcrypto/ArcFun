import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, isAddress, erc20Abi } from 'viem';
import { CROSS_CHAIN_REGISTRY } from '@/config/swap-contract';
import { checkRateLimit } from '@/lib/rate-limit';

interface CustomToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  network: string;
  addedAt: number;
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tokens: CustomToken[] = user.user_metadata?.custom_tokens || [];
    return NextResponse.json({ success: true, tokens });
  } catch (error: any) {
    console.error("Failed to get custom tokens:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch custom tokens" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitError = await checkRateLimit(req, user.id, { maxRequests: 20, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    const body = await req.json();
    const { tokenAddress, network = 'Arc Testnet', symbol: userSymbol, name: userName, decimals: userDecimals } = body;

    if (!tokenAddress || typeof tokenAddress !== 'string') {
      return NextResponse.json({ error: "Token address is required" }, { status: 400 });
    }

    const isSolana = network.toLowerCase().includes('solana');
    let normalizedAddr = tokenAddress.trim();

    if (isSolana) {
      try {
        const { PublicKey } = await import('@solana/web3.js');
        new PublicKey(normalizedAddr);
      } catch (err) {
        return NextResponse.json({ error: "Invalid Solana mint address (expected Base58 public key)" }, { status: 400 });
      }
    } else {
      if (!isAddress(normalizedAddr)) {
        return NextResponse.json({ error: "Invalid contract address (expected 0x... EVM address)" }, { status: 400 });
      }
      normalizedAddr = normalizedAddr.toLowerCase();
    }

    const chainConfig = CROSS_CHAIN_REGISTRY[network] || CROSS_CHAIN_REGISTRY['Arc Testnet'];
    if (!chainConfig || !chainConfig.rpc) {
      return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
    }

    let symbol = (userSymbol && typeof userSymbol === 'string') ? userSymbol.trim().toUpperCase() : "";
    let name = (userName && typeof userName === 'string') ? userName.trim() : "";
    let decimals = userDecimals !== undefined && !isNaN(Number(userDecimals)) ? Number(userDecimals) : -1;

    if (isSolana) {
      // Query Solana Devnet mint info if decimals not provided
      if (decimals < 0) {
        try {
          const { Connection, PublicKey } = await import('@solana/web3.js');
          const conn = new Connection(chainConfig.rpc || "https://api.devnet.solana.com");
          const supplyInfo = await conn.getTokenSupply(new PublicKey(normalizedAddr));
          if (supplyInfo?.value?.decimals !== undefined) {
            decimals = supplyInfo.value.decimals;
          }
        } catch (e) {
          decimals = 6;
        }
      }
      if (!symbol) symbol = normalizedAddr.slice(0, 4).toUpperCase();
      if (!name) name = `Solana Token (${symbol})`;
      if (decimals < 0) decimals = 6;
    } else {
      // Query onchain EVM metadata if not provided
      if (!symbol || !name || decimals < 0) {
        try {
          const client = createPublicClient({
            transport: http(chainConfig.rpc, { timeout: 10000 })
          });

          const [sym, nm, dec] = await Promise.all([
            !symbol ? client.readContract({
              address: normalizedAddr as `0x${string}`,
              abi: erc20Abi,
              functionName: 'symbol',
            }).catch(() => "TOKEN") : Promise.resolve(symbol),
            !name ? client.readContract({
              address: normalizedAddr as `0x${string}`,
              abi: erc20Abi,
              functionName: 'name',
            }).catch(() => "Custom Token") : Promise.resolve(name),
            decimals < 0 ? client.readContract({
              address: normalizedAddr as `0x${string}`,
              abi: erc20Abi,
              functionName: 'decimals',
            }).catch(() => 18) : Promise.resolve(decimals),
          ]);

          if (!symbol) symbol = String(sym);
          if (!name) name = String(nm);
          if (decimals < 0) decimals = Number(dec);
        } catch (onchainErr: any) {
          if (!symbol) symbol = "TOKEN";
          if (!name) name = "Custom Token";
          if (decimals < 0) decimals = 18;
        }
      }
    }

    const existingTokens: CustomToken[] = user.user_metadata?.custom_tokens || [];

    // Check if already imported
    const alreadyExists = existingTokens.some(
      t => (t.address.toLowerCase() === normalizedAddr.toLowerCase()) && t.network.toLowerCase() === network.toLowerCase()
    );

    if (alreadyExists) {
      return NextResponse.json({ error: "Token already imported on " + network }, { status: 400 });
    }

    const newToken: CustomToken = {
      address: normalizedAddr,
      symbol,
      name,
      decimals,
      network,
      addedAt: Date.now()
    };

    const updatedTokens = [...existingTokens, newToken];

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        custom_tokens: updatedTokens
      }
    });

    if (updateErr) {
      throw updateErr;
    }

    return NextResponse.json({ success: true, token: newToken });
  } catch (error: any) {
    console.error("Failed to import custom token:", error);
    return NextResponse.json({ error: error.message || "Failed to import token" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tokenAddress = searchParams.get('address');
    const network = searchParams.get('network') || 'Arc Testnet';

    if (!tokenAddress) {
      return NextResponse.json({ error: "Missing token address" }, { status: 400 });
    }

    const existingTokens: CustomToken[] = user.user_metadata?.custom_tokens || [];
    const filteredTokens = existingTokens.filter(
      t => !(t.address.toLowerCase() === tokenAddress.toLowerCase() && t.network.toLowerCase() === network.toLowerCase())
    );

    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        custom_tokens: filteredTokens
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete custom token:", error);
    return NextResponse.json({ error: error.message || "Failed to delete custom token" }, { status: 500 });
  }
}
