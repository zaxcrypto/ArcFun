import { ethers } from "ethers";
import { ChainRegistry } from "./chain-registry";
import { getLiveAssetPriceUsd } from "@/lib/gateway/price-oracle";

export interface ChainGasStatus {
  chain: string;
  nativeSymbol: string;
  nativeDecimals: number;
  balance: string;
  balanceUsd: number;
  operationalReserveUsd: number;
  estimatedTxGasWei: string;
  estimatedTxGasUsd: number;
  isSponsoredAvailable: boolean;
  reason?: string;
  relayerAddress?: string;
  lastChecked: string;
}

export interface UserGasCheckResult {
  sufficient: boolean;
  chain: string;
  nativeSymbol: string;
  currentBalance: string;
  estimatedCost: string;
  estimatedCostUsd?: number;
  reason?: string;
}

// ─── Cache Configuration ───────────────────────────────────────────────────────
interface CachedGasStatus {
  timestamp: number;
  data: ChainGasStatus;
}

const gasStatusCache = new Map<string, CachedGasStatus>();
const CACHE_TTL_MS = 15_000; // 15 seconds server-side cache

// Required minimum operational reserve ($5.00 USD)
export const MIN_OPERATIONAL_RESERVE_USD = 5.0;

// Conservative gas limits for destination CCTP receiveMessage / mint
export const EVM_RECEIVE_MESSAGE_GAS_UNITS = 180_000n;
export const SUI_MINT_GAS_BUDGET_MIST = 100_000_000n; // 0.1 SUI
export const SOLANA_MINT_FEE_LAMPORTS = 5_000_000n;   // 0.005 SOL
export const STELLAR_MINT_FEE_STROOPS = 50_000_000n;  // 5 XLM

/**
 * Returns the configured relayer private key for EVM chains.
 */
export function getEvmRelayerPrivateKey(): string {
  const rawKey = (
    process.env.EVM_PRIVATE_KEY ||
    process.env.DEPLOYER_PRIVATE_KEY ||
    process.env.GATEWAY_RELAYER_PRIVATE_KEY ||
    ""
  ).trim().replace(/^["']|["']$/g, "");

  if (!rawKey) {
    throw new Error("EVM relayer private key is not configured on the server.");
  }
  return rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
}

export function getEvmRelayerAddress(): string {
  const pk = getEvmRelayerPrivateKey();
  return new ethers.Wallet(pk).address;
}

/**
 * Master method: Verifies backend relayer gas availability on any destination chain.
 * Strictly enforces:
 * 1. At least $5 USD worth of available native gas operational reserve.
 * 2. Sufficient spendable gas to execute the expected claim/mint with a 1.5x safety buffer.
 */
export async function checkDestinationRelayerGas(
  destinationChain: string,
  bypassCache: boolean = false
): Promise<ChainGasStatus> {
  const chainName = destinationChain.trim();
  const now = Date.now();

  if (!bypassCache) {
    const cached = gasStatusCache.get(chainName);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  let status: ChainGasStatus;

  if (chainName.toLowerCase().includes("solana")) {
    status = await checkSolanaRelayerGas(chainName);
  } else if (chainName.toLowerCase().includes("sui")) {
    status = await checkSuiRelayerGas(chainName);
  } else if (chainName.toLowerCase().includes("stellar")) {
    status = await checkStellarRelayerGas(chainName);
  } else {
    // Default: EVM chain
    status = await checkEvmRelayerGas(chainName);
  }

  gasStatusCache.set(chainName, { timestamp: now, data: status });
  return status;
}

/**
 * EVM chains relayer gas balance check
 */
async function checkEvmRelayerGas(chainName: string): Promise<ChainGasStatus> {
  const chainConfig = ChainRegistry.getChainSafe(chainName);
  if (!chainConfig) {
    return createUnavailableStatus(chainName, "ETH", `Unregistered chain: ${chainName}`);
  }

  const nativeSymbol = chainConfig.nativeCurrency.symbol;
  const nativeDecimals = chainConfig.nativeCurrency.decimals;

  let relayerAddress = "";
  try {
    relayerAddress = getEvmRelayerAddress();
  } catch (err: any) {
    return createUnavailableStatus(chainName, nativeSymbol, "EVM relayer key not configured on server");
  }

  try {
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl, undefined, {
      staticNetwork: true,
    });

    // 5-second timeout for RPC balance fetch
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("RPC timeout")), 5000)
    );

    const [balanceWei, feeData] = await Promise.race([
      Promise.all([
        provider.getBalance(relayerAddress),
        provider.getFeeData().catch(() => ({
          gasPrice: ethers.parseUnits("0.1", "gwei"),
          maxFeePerGas: null,
        })),
      ]),
      timeoutPromise,
    ]);

    const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits("0.1", "gwei");
    const estimatedGasUnits = EVM_RECEIVE_MESSAGE_GAS_UNITS;
    const estimatedTxCostWei = estimatedGasUnits * gasPrice;
    const requiredTxBufferWei = (estimatedTxCostWei * 150n) / 100n; // 1.5x buffer

    // Price Oracle check
    const { priceUsd } = await getLiveAssetPriceUsd(nativeSymbol);
    const balanceUnits = parseFloat(ethers.formatUnits(balanceWei, nativeDecimals));
    const balanceUsd = balanceUnits * priceUsd;

    const estimatedTxGasUsd = parseFloat(ethers.formatUnits(estimatedTxCostWei, nativeDecimals)) * priceUsd;

    // Operational threshold: >= $5.00 USD AND sufficient for 1.5x tx fee
    const hasOperationalReserve = balanceUsd >= MIN_OPERATIONAL_RESERVE_USD;
    const hasTxFeeCoverage = balanceWei >= requiredTxBufferWei;

    let isSponsoredAvailable = hasOperationalReserve && hasTxFeeCoverage;
    let reason: string | undefined = undefined;

    if (!hasOperationalReserve) {
      reason = `Relayer gas reserve ($${balanceUsd.toFixed(2)}) is below the required $${MIN_OPERATIONAL_RESERVE_USD.toFixed(2)} USD threshold.`;
    } else if (!hasTxFeeCoverage) {
      reason = `Relayer gas balance is insufficient to execute destination claim with safety margin.`;
    }

    return {
      chain: chainName,
      nativeSymbol,
      nativeDecimals,
      balance: balanceUnits.toFixed(6),
      balanceUsd: parseFloat(balanceUsd.toFixed(2)),
      operationalReserveUsd: MIN_OPERATIONAL_RESERVE_USD,
      estimatedTxGasWei: estimatedTxCostWei.toString(),
      estimatedTxGasUsd: parseFloat(estimatedTxGasUsd.toFixed(4)),
      isSponsoredAvailable,
      reason,
      relayerAddress,
      lastChecked: new Date().toISOString(),
    };
  } catch (err: any) {
    console.warn(`[BridgeGasMonitor] RPC check failed on ${chainName}:`, err?.message || err);
    return createUnavailableStatus(
      chainName,
      nativeSymbol,
      `RPC node temporarily unavailable: ${err?.message || err}`,
      relayerAddress
    );
  }
}

/**
 * Solana relayer gas balance check
 */
async function checkSolanaRelayerGas(chainName: string): Promise<ChainGasStatus> {
  const isDevnet = chainName.toLowerCase().includes("devnet");
  const rpcUrl = isDevnet
    ? (process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com")
    : (process.env.SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com");

  const solPrivateKey = process.env.SOL_CCTP_TEST_KEY;
  if (!solPrivateKey) {
    return createUnavailableStatus(chainName, "SOL", "Solana relayer key not configured on server");
  }

  let solAddress = "";
  try {
    const { Keypair } = await import("@solana/web3.js");
    const bs58 = (await import("bs58")).default;
    let secretKey: Uint8Array;
    const trimmed = solPrivateKey.trim();
    if (trimmed.startsWith("[") || trimmed.includes(",")) {
      secretKey = new Uint8Array(JSON.parse(trimmed));
    } else if (/^[1-9A-HJ-NP-Za-km-z]{44,88}$/.test(trimmed)) {
      secretKey = bs58.decode(trimmed);
    } else {
      secretKey = new Uint8Array(Buffer.from(trimmed.replace(/^0x/, ""), "hex"));
    }
    const keypair = Keypair.fromSecretKey(secretKey);
    solAddress = keypair.publicKey.toBase58();
  } catch (e: any) {
    return createUnavailableStatus(chainName, "SOL", `Invalid Solana key: ${e?.message || e}`);
  }

  try {
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const connection = new Connection(rpcUrl, "confirmed");

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Solana RPC timeout")), 5000)
    );

    const lamports = await Promise.race([
      connection.getBalance(new PublicKey(solAddress)),
      timeoutPromise,
    ]);

    const solBalance = lamports / 1e9;
    const { priceUsd } = await getLiveAssetPriceUsd("SOL");
    const balanceUsd = solBalance * priceUsd;

    const estimatedTxCostLamports = SOLANA_MINT_FEE_LAMPORTS;
    const estimatedTxGasUsd = (Number(estimatedTxCostLamports) / 1e9) * priceUsd;
    const requiredBufferLamports = (estimatedTxCostLamports * 150n) / 100n;

    const hasOperationalReserve = balanceUsd >= MIN_OPERATIONAL_RESERVE_USD;
    const hasTxFeeCoverage = BigInt(lamports) >= requiredBufferLamports;

    const isSponsoredAvailable = hasOperationalReserve && hasTxFeeCoverage;
    let reason: string | undefined = undefined;
    if (!hasOperationalReserve) {
      reason = `Relayer SOL reserve ($${balanceUsd.toFixed(2)}) is below $${MIN_OPERATIONAL_RESERVE_USD.toFixed(2)} USD.`;
    } else if (!hasTxFeeCoverage) {
      reason = `Relayer SOL balance is insufficient to execute transaction.`;
    }

    return {
      chain: chainName,
      nativeSymbol: "SOL",
      nativeDecimals: 9,
      balance: solBalance.toFixed(6),
      balanceUsd: parseFloat(balanceUsd.toFixed(2)),
      operationalReserveUsd: MIN_OPERATIONAL_RESERVE_USD,
      estimatedTxGasWei: estimatedTxCostLamports.toString(),
      estimatedTxGasUsd: parseFloat(estimatedTxGasUsd.toFixed(4)),
      isSponsoredAvailable,
      reason,
      relayerAddress: solAddress,
      lastChecked: new Date().toISOString(),
    };
  } catch (err: any) {
    return createUnavailableStatus(
      chainName,
      "SOL",
      `Solana node unreachable: ${err?.message || err}`,
      solAddress
    );
  }
}

/**
 * Sui relayer gas balance check
 */
async function checkSuiRelayerGas(chainName: string): Promise<ChainGasStatus> {
  let suiAddress = "";
  try {
    const { SuiAdapter } = await import("./adapters/sui-adapter");
    const keypair = SuiAdapter.getKeypair();
    suiAddress = keypair.toSuiAddress();
  } catch (e: any) {
    return createUnavailableStatus(chainName, "SUI", "SUI relayer key not configured on server");
  }

  const isMainnet = chainName.toLowerCase().includes("mainnet");
  const rpcUrl = isMainnet
    ? (process.env.NEXT_PUBLIC_SUI_MAINNET_RPC_URL || "https://fullnode.mainnet.sui.io:443")
    : (process.env.NEXT_PUBLIC_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443");

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_getBalance",
        params: [suiAddress, "0x2::sui::SUI"],
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Sui HTTP status ${res.status}`);
    const data = await res.json();
    const totalMist = BigInt(data?.result?.totalBalance || "0");
    const suiBalance = Number(totalMist) / 1e9;

    const { priceUsd } = await getLiveAssetPriceUsd("SUI");
    const balanceUsd = suiBalance * priceUsd;

    const estimatedTxCostMist = SUI_MINT_GAS_BUDGET_MIST;
    const estimatedTxGasUsd = (Number(estimatedTxCostMist) / 1e9) * priceUsd;
    const requiredBufferMist = (estimatedTxCostMist * 150n) / 100n;

    const hasOperationalReserve = balanceUsd >= MIN_OPERATIONAL_RESERVE_USD;
    const hasTxFeeCoverage = totalMist >= requiredBufferMist;

    const isSponsoredAvailable = hasOperationalReserve && hasTxFeeCoverage;
    let reason: string | undefined = undefined;
    if (!hasOperationalReserve) {
      reason = `Relayer SUI reserve ($${balanceUsd.toFixed(2)}) is below $${MIN_OPERATIONAL_RESERVE_USD.toFixed(2)} USD.`;
    } else if (!hasTxFeeCoverage) {
      reason = `Relayer SUI balance is insufficient to execute destination claim.`;
    }

    return {
      chain: chainName,
      nativeSymbol: "SUI",
      nativeDecimals: 9,
      balance: suiBalance.toFixed(6),
      balanceUsd: parseFloat(balanceUsd.toFixed(2)),
      operationalReserveUsd: MIN_OPERATIONAL_RESERVE_USD,
      estimatedTxGasWei: estimatedTxCostMist.toString(),
      estimatedTxGasUsd: parseFloat(estimatedTxGasUsd.toFixed(4)),
      isSponsoredAvailable,
      reason,
      relayerAddress: suiAddress,
      lastChecked: new Date().toISOString(),
    };
  } catch (err: any) {
    return createUnavailableStatus(
      chainName,
      "SUI",
      `Sui node unreachable: ${err?.message || err}`,
      suiAddress
    );
  }
}

/**
 * Stellar relayer gas balance check
 */
async function checkStellarRelayerGas(chainName: string): Promise<ChainGasStatus> {
  const stellarAddress =
    process.env.STELLAR_PUBLIC_KEY ||
    "GDNYGPTSGXQSPCMN27M354Y2FOK52KDPLRSLUF54E7DZ7XFQPPGW4E7T";
  const horizonUrl =
    process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";

  try {
    const res = await fetch(`${horizonUrl}/accounts/${stellarAddress}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Horizon HTTP ${res.status}`);
    const data = await res.json();
    const nativeBal = data?.balances?.find((b: any) => b.asset_type === "native");
    const balXlm = parseFloat(nativeBal?.balance || "0");

    const { priceUsd } = await getLiveAssetPriceUsd("XLM");
    const balanceUsd = balXlm * priceUsd;

    const estimatedTxCostStroops = STELLAR_MINT_FEE_STROOPS;
    const estimatedTxGasUsd = (Number(estimatedTxCostStroops) / 1e7) * priceUsd;
    const requiredBufferXlm = (Number(estimatedTxCostStroops) * 1.5) / 1e7;

    const hasOperationalReserve = balanceUsd >= MIN_OPERATIONAL_RESERVE_USD;
    const hasTxFeeCoverage = balXlm >= requiredBufferXlm;

    const isSponsoredAvailable = hasOperationalReserve && hasTxFeeCoverage;
    let reason: string | undefined = undefined;
    if (!hasOperationalReserve) {
      reason = `Relayer XLM reserve ($${balanceUsd.toFixed(2)}) is below $${MIN_OPERATIONAL_RESERVE_USD.toFixed(2)} USD.`;
    } else if (!hasTxFeeCoverage) {
      reason = `Relayer XLM balance is insufficient for gas.`;
    }

    return {
      chain: chainName,
      nativeSymbol: "XLM",
      nativeDecimals: 7,
      balance: balXlm.toFixed(4),
      balanceUsd: parseFloat(balanceUsd.toFixed(2)),
      operationalReserveUsd: MIN_OPERATIONAL_RESERVE_USD,
      estimatedTxGasWei: estimatedTxCostStroops.toString(),
      estimatedTxGasUsd: parseFloat(estimatedTxGasUsd.toFixed(4)),
      isSponsoredAvailable,
      reason,
      relayerAddress: stellarAddress,
      lastChecked: new Date().toISOString(),
    };
  } catch (err: any) {
    return createUnavailableStatus(
      chainName,
      "XLM",
      `Stellar Horizon unreachable: ${err?.message || err}`,
      stellarAddress
    );
  }
}

/**
 * Creates safe fallback status when a chain check fails
 */
function createUnavailableStatus(
  chain: string,
  nativeSymbol: string,
  reason: string,
  relayerAddress?: string
): ChainGasStatus {
  return {
    chain,
    nativeSymbol,
    nativeDecimals: 18,
    balance: "0.000000",
    balanceUsd: 0.0,
    operationalReserveUsd: MIN_OPERATIONAL_RESERVE_USD,
    estimatedTxGasWei: "0",
    estimatedTxGasUsd: 0.0,
    isSponsoredAvailable: false,
    reason,
    relayerAddress,
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Verifies whether a user's wallet has enough native gas on the destination chain
 * to execute a manual claim / receiveMessage transaction.
 */
export async function checkUserDestinationGas(params: {
  destinationChain: string;
  userAddress: string;
}): Promise<UserGasCheckResult> {
  const { destinationChain, userAddress } = params;
  const chainName = destinationChain.trim();

  if (!userAddress) {
    return {
      sufficient: false,
      chain: chainName,
      nativeSymbol: "ETH",
      currentBalance: "0",
      estimatedCost: "0",
      reason: "Wallet address is required",
    };
  }

  // EVM User Gas Check
  const chainConfig = ChainRegistry.getChainSafe(chainName);
  if (chainConfig && userAddress.startsWith("0x")) {
    try {
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl, undefined, {
        staticNetwork: true,
      });
      const balanceWei = await provider.getBalance(userAddress);
      const feeData = await provider.getFeeData().catch(() => ({
        gasPrice: ethers.parseUnits("0.1", "gwei"),
        maxFeePerGas: null,
      }));
      const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits("0.1", "gwei");
      const estimatedCostWei = EVM_RECEIVE_MESSAGE_GAS_UNITS * gasPrice;

      const balanceFormatted = ethers.formatUnits(balanceWei, chainConfig.nativeCurrency.decimals);
      const costFormatted = ethers.formatUnits(estimatedCostWei, chainConfig.nativeCurrency.decimals);

      const sufficient = balanceWei >= estimatedCostWei;
      return {
        sufficient,
        chain: chainName,
        nativeSymbol: chainConfig.nativeCurrency.symbol,
        currentBalance: parseFloat(balanceFormatted).toFixed(6),
        estimatedCost: parseFloat(costFormatted).toFixed(6),
        reason: sufficient
          ? undefined
          : `Insufficient ${chainConfig.nativeCurrency.symbol} for this claim. Add gas to your destination wallet and try again.`,
      };
    } catch (e: any) {
      console.warn(`[UserGasCheck] Failed to check EVM gas for ${userAddress} on ${chainName}:`, e);
      return {
        sufficient: true, // Default permissive if RPC check fails, wallet itself will guard
        chain: chainName,
        nativeSymbol: chainConfig.nativeCurrency.symbol,
        currentBalance: "0",
        estimatedCost: "0",
      };
    }
  }

  // Non-EVM chains: default to true unless proven otherwise
  return {
    sufficient: true,
    chain: chainName,
    nativeSymbol: "GAS",
    currentBalance: "0",
    estimatedCost: "0",
  };
}
