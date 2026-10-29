import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// Chain Configuration List for Balance Auditing
const RELAYER_CHAINS = [
  { name: "Arc Testnet", symbol: "USDC", rpc: process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com", priceUsd: 1.0, minReserve: 5.0 },
  { name: "Ethereum Sepolia", symbol: "ETH", rpc: process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com", priceUsd: 2600.0, minReserve: 0.01 },
  { name: "Arbitrum Sepolia", symbol: "ETH", rpc: process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc", priceUsd: 2600.0, minReserve: 0.01 },
  { name: "Base Sepolia", symbol: "ETH", rpc: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", priceUsd: 2600.0, minReserve: 0.01 },
  { name: "Optimism Sepolia", symbol: "ETH", rpc: process.env.NEXT_PUBLIC_OP_SEPOLIA_RPC_URL || "https://sepolia.optimism.io", priceUsd: 2600.0, minReserve: 0.01 },
  { name: "Ink Sepolia", symbol: "ETH", rpc: process.env.NEXT_PUBLIC_INK_SEPOLIA_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com", priceUsd: 2600.0, minReserve: 0.01 },
  { name: "Linea Sepolia", symbol: "ETH", rpc: process.env.NEXT_PUBLIC_LINEA_SEPOLIA_RPC_URL || "https://rpc.sepolia.linea.build", priceUsd: 2600.0, minReserve: 0.01 },
  { name: "Unichain Sepolia", symbol: "ETH", rpc: process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org", priceUsd: 2600.0, minReserve: 0.01 },
  { name: "Avalanche Fuji", symbol: "AVAX", rpc: process.env.NEXT_PUBLIC_AVALANCHE_FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc", priceUsd: 25.0, minReserve: 0.5 },
  { name: "Polygon Amoy Testnet", symbol: "POL", rpc: process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology", priceUsd: 0.50, minReserve: 0.1 },
  { name: "X Layer Testnet", symbol: "OKB", rpc: process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech", priceUsd: 40.0, minReserve: 0.05 },
  { name: "Injective EVM Testnet", symbol: "INJ", rpc: process.env.NEXT_PUBLIC_INJECTIVE_TESTNET_RPC_URL || "https://k8s.testnet.json-rpc.injective.network/", priceUsd: 18.0, minReserve: 0.2 },
  { name: "Sonic Testnet", symbol: "S", rpc: process.env.NEXT_PUBLIC_SONIC_TESTNET_RPC_URL || "https://rpc.testnet.soniclabs.com", priceUsd: 0.50, minReserve: 5.0 },
  { name: "Monad Testnet", symbol: "MON", rpc: process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz", priceUsd: 1.0, minReserve: 5.0 },
  { name: "HyperEVM Testnet", symbol: "HYPE", rpc: process.env.NEXT_PUBLIC_HYPEREVM_TESTNET_RPC_URL || "https://rpc.hyperliquid-testnet.xyz/evm", priceUsd: 1.0, minReserve: 0.5 }
];

async function fetchChainBalance(evmAddress: string, c: typeof RELAYER_CHAINS[0]) {
  try {
    const provider = new ethers.JsonRpcProvider(c.rpc);
    const balWei = await Promise.race([
      provider.getBalance(evmAddress),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("RPC Timeout")), 6000))
    ]);
    const balEth = parseFloat(ethers.formatEther(balWei));
    const usdVal = (balEth * c.priceUsd).toFixed(2);
    
    let status: "HEALTHY" | "LOW" | "CRITICAL" = "HEALTHY";
    if (balEth < c.minReserve * 0.3) {
      status = "CRITICAL";
    } else if (balEth < c.minReserve) {
      status = "LOW";
    }

    return {
      chain: c.name,
      symbol: c.symbol,
      balance: balEth.toFixed(6),
      usdValue: usdVal,
      status,
      lastUpdated: new Date().toISOString()
    };
  } catch (err: any) {
    return {
      chain: c.name,
      symbol: c.symbol,
      balance: "0.000000",
      usdValue: "0.00",
      status: "CRITICAL" as const,
      error: String(err?.message || err),
      lastUpdated: new Date().toISOString()
    };
  }
}

async function fetchStellarBalance() {
  const stellarAddress = process.env.STELLAR_PUBLIC_KEY || "GDNYGPTSGXQSPCMN27M354Y2FOK52KDPLRSLUF54E7DZ7XFQPPGW4E7T";
  try {
    const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${stellarAddress}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const xlmBal = data.balances.find((b: any) => b.asset_type === 'native');
      const balXlm = parseFloat(xlmBal?.balance || '0');
      const usdVal = (balXlm * 0.10).toFixed(2);
      
      let status: "HEALTHY" | "LOW" | "CRITICAL" = "HEALTHY";
      if (balXlm < 50) status = "CRITICAL";
      else if (balXlm < 200) status = "LOW";

      return {
        chain: "Stellar Testnet",
        symbol: "XLM",
        balance: balXlm.toFixed(4),
        usdValue: usdVal,
        status,
        lastUpdated: new Date().toISOString()
      };
    }
  } catch (_) {}
  
  return {
    chain: "Stellar Testnet",
    symbol: "XLM",
    balance: "0.0000",
    usdValue: "0.00",
    status: "CRITICAL" as const,
    lastUpdated: new Date().toISOString()
  };
}

async function fetchSolanaBalance(solAddress: string) {
  try {
    const connection = new Connection(process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com", "confirmed");
    const pubkey = new PublicKey(solAddress);
    const balanceLamports = await Promise.race([
      connection.getBalance(pubkey),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("RPC Timeout")), 6000))
    ]);
    const balanceSol = balanceLamports / 1e9;
    const usdVal = (balanceSol * 140.0).toFixed(2); // Assuming SOL price is ~$140 USD
    
    let status: "HEALTHY" | "LOW" | "CRITICAL" = "HEALTHY";
    if (balanceSol < 0.1) status = "CRITICAL";
    else if (balanceSol < 0.5) status = "LOW";

    return {
      chain: "Solana Devnet",
      symbol: "SOL",
      balance: balanceSol.toFixed(6),
      usdValue: usdVal,
      status,
      lastUpdated: new Date().toISOString()
    };
  } catch (err: any) {
    return {
      chain: "Solana Devnet",
      symbol: "SOL",
      balance: "0.000000",
      usdValue: "0.00",
      status: "CRITICAL" as const,
      error: String(err?.message || err),
      lastUpdated: new Date().toISOString()
    };
  }
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}

async function handleRequest(req: NextRequest) {
  try {
    const evmPrivateKey = process.env.EVM_PRIVATE_KEY;
    if (!evmPrivateKey) {
      return NextResponse.json({ error: "EVM_PRIVATE_KEY not configured on server" }, { status: 500 });
    }

    const evmWallet = new ethers.Wallet(evmPrivateKey);
    const stellarAddress = process.env.STELLAR_PUBLIC_KEY || "GDNYGPTSGXQSPCMN27M354Y2FOK52KDPLRSLUF54E7DZ7XFQPPGW4E7T";
    
    const solPrivateKey = process.env.SOL_CCTP_TEST_KEY;
    let solAddress = "";
    if (solPrivateKey) {
      try {
        let secretKey: Uint8Array;
        const trimmedKey = solPrivateKey.trim();
        if (trimmedKey.startsWith('[') || trimmedKey.includes(',')) {
          secretKey = new Uint8Array(JSON.parse(trimmedKey));
        } else if (/^[1-9A-HJ-NP-Za-km-z]{44,88}$/.test(trimmedKey)) {
          secretKey = bs58.decode(trimmedKey);
        } else {
          const cleanHex = trimmedKey.replace(/^0x/, '');
          secretKey = new Uint8Array(Buffer.from(cleanHex, 'hex'));
        }
        const keypair = Keypair.fromSecretKey(secretKey);
        solAddress = keypair.publicKey.toBase58();
      } catch (err) {
        console.error("Failed to parse Solana key:", err);
      }
    }

    let targetChain: string | null = null;
    try {
      if (req.method === "POST") {
        const body = await req.json();
        targetChain = body.chain || null;
      }
    } catch (_) {}

    // If single target chain specified
    if (targetChain) {
      if (targetChain === "Stellar Testnet") {
        const stellarRes = await fetchStellarBalance();
        return NextResponse.json({ success: true, balance: stellarRes });
      }
      
      if (targetChain === "Solana Devnet") {
        if (!solAddress) {
          return NextResponse.json({ error: "Solana key not configured on server" }, { status: 500 });
        }
        const solanaRes = await fetchSolanaBalance(solAddress);
        return NextResponse.json({ success: true, balance: solanaRes });
      }
      
      const chainDef = RELAYER_CHAINS.find(c => c.name.toLowerCase() === targetChain!.toLowerCase());
      if (!chainDef) {
        return NextResponse.json({ error: `Unknown chain: ${targetChain}` }, { status: 400 });
      }
      const singleRes = await fetchChainBalance(evmWallet.address, chainDef);
      return NextResponse.json({ success: true, balance: singleRes });
    }

    // Query all EVM chains + Stellar + Solana in parallel
    const evmPromises = RELAYER_CHAINS.map(c => fetchChainBalance(evmWallet.address, c));
    const stellarPromise = fetchStellarBalance();
    const solanaPromise = solAddress ? fetchSolanaBalance(solAddress) : Promise.resolve(null);

    const [evmResults, stellarResult, solanaResult] = await Promise.all([
      Promise.all(evmPromises),
      stellarPromise,
      solanaPromise
    ]);

    const allBalances = [...evmResults, stellarResult];
    if (solanaResult) {
      allBalances.push(solanaResult);
    }

    return NextResponse.json({
      success: true,
      evmAddress: evmWallet.address,
      stellarAddress,
      solAddress,
      balances: allBalances,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("[RelayerBalances API] Error:", error);
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
