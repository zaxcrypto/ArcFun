import {
  TransactionBuilder,
  Networks,
  BASE_FEE,
  rpc,
  Horizon,
  Account,
  nativeToScVal,
  Contract,
  Address,
} from '@stellar/stellar-sdk';

// Official Soroban USDC contract on Stellar Testnet (hardcoded per Circle docs)
// Source: https://developers.circle.com/cctp/quickstarts/transfer-usdc-stellar-arc
const STELLAR_USDC_CONTRACT = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
import { CCTP_DOMAINS } from '../cctp-provider';

const SOROBAN_PROVIDERS = [
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org"
];
const HORIZON_URL = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";

async function getSorobanServer(): Promise<rpc.Server> {
  for (const url of SOROBAN_PROVIDERS) {
    try {
      const server = new rpc.Server(url, { allowHttp: false });
      // Ping the server to confirm it's alive
      await server.getNetwork();
      return server;
    } catch (_) {
      console.warn(`[StellarClient] RPC ${url} unreachable, trying next...`);
    }
  }
  throw new Error("All Soroban RPC providers unavailable.");
}

/** Map CCTP Soroban contract error codes to human-readable messages */
function decodeCctpError(errorStr: string): string {
  // Extract error number from e.g. "Error(Contract, #7103)"
  const match = errorStr.match(/#(\d+)/);
  if (!match) return errorStr;
  const code = parseInt(match[1]);
  const CCTP_ERRORS: Record<number, string> = {
    1:    "Contract is paused",
    2:    "Invalid burn token — not registered with CCTP",
    3:    "Amount too small or exceeds max burn limit",
    4:    "Caller not authorized (check Freighter is the tx source)",
    5:    "Invalid destination domain",
    6:    "Invalid mint recipient (must be 32 bytes, non-zero)",
    7:    "Invalid destination caller",
    100:  "Token messenger already initialized",
    7103: "Insufficient USDC allowance or balance — approve USDC spend first",
  };
  return CCTP_ERRORS[code] ?? `CCTP contract error #${code}`;
}

import bs58 from 'bs58';

/**
 * Converts EVM hex or Solana base58 address to 32 bytes.
 */
function addressToBytes32(address: string): Buffer {
  if (address.startsWith('0x') || /^[0-9a-fA-F]+$/.test(address)) {
    const cleanAddress = address.replace(/^0x/, '');
    return Buffer.from(cleanAddress.padStart(64, '0'), 'hex');
  } else {
    // Assume Base58 (Solana)
    const decoded = bs58.decode(address);
    if (decoded.length !== 32) throw new Error("Invalid Solana address length");
    return Buffer.from(decoded);
  }
}

export class StellarClient {
  /**
   * Executes deposit_for_burn on Stellar via Freighter
   */
  static async submitBurn(
    amountUnits: string, // in stroops (7 decimals)
    destinationDomain: number,
    destinationAddress: string, // EVM Address
    stellarAddress: string, // Caller's Stellar Address
    signTransaction: (xdr: string) => Promise<string | null>
  ): Promise<string> {
    const domainConfig = CCTP_DOMAINS["Stellar Testnet"];
    if (!domainConfig.tokenMessenger) {
      throw new Error("Missing Stellar TokenMessenger config");
    }

    const soroban = await getSorobanServer();
    const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: false });

    // Sequence from Horizon
    const horizonAccount = await horizon.loadAccount(stellarAddress);
    const account = new Account(stellarAddress, horizonAccount.sequence);

    const contract = new Contract(domainConfig.tokenMessenger);

    // mintRecipient is the EVM/Solana address zero-padded/decoded to 32 bytes
    const mintRecipientBuf = addressToBytes32(destinationAddress);
    
    // destinationCaller = bytes32(0) = no restriction on who can call receiveMessage
    const destinationCallerBuf = Buffer.alloc(32, 0);

    // burn_token must be the Soroban C-address (hardcoded per Circle docs)
    // Do NOT use Asset.contractId() derivation — it caused error #7120
    const usdcContract = new Address(STELLAR_USDC_CONTRACT);

    // ─── Verified ABI from Circle docs (stellar-contracts + stellar-arc quickstart) ──
    // deposit_for_burn(
    //   caller: Address,           ← the invoking Stellar account
    //   amount: i128,
    //   destination_domain: u32,
    //   mint_recipient: Bytes(32),
    //   burn_token: Address,
    //   destination_caller: Bytes(32), ← bytes32(0) = no restriction
    //   max_fee: i128,             ← 0 for fast transfer
    //   finality_threshold: u32    ← 1000 = fast, 2000 = standard
    // )
    // Source: https://developers.circle.com/cctp/quickstarts/transfer-usdc-stellar-arc
    const callerAddress = new Address(stellarAddress);

    // CCTP fast transfer threshold
    const MIN_FINALITY_FAST = 1000;

    const args = [
      nativeToScVal(callerAddress, { type: 'address' }),
      nativeToScVal(BigInt(amountUnits), { type: 'i128' }),
      nativeToScVal(destinationDomain, { type: 'u32' }),
      nativeToScVal(mintRecipientBuf, { type: 'bytes' }),
      nativeToScVal(usdcContract, { type: 'address' }),
      nativeToScVal(destinationCallerBuf, { type: 'bytes' }),
      nativeToScVal(0n, { type: 'i128' }),
      nativeToScVal(MIN_FINALITY_FAST, { type: 'u32' }),
    ];

    const operation = contract.call('deposit_for_burn', ...args);

    // Fetch current ledger to set expiration for approve
    // +100_000 ledgers ≈ 140 hours (Circle docs use +100_000)
    const latestLedger = await soroban.getLatestLedger();
    const expirationLedger = latestLedger.sequence + 100_000;

    const usdcContractInstance = new Contract(usdcContract.toString());
    const tokenMessengerAddress = new Address(domainConfig.tokenMessenger);

    const approveArgs = [
      nativeToScVal(callerAddress, { type: 'address' }),
      nativeToScVal(tokenMessengerAddress, { type: 'address' }),
      nativeToScVal(BigInt(amountUnits), { type: 'i128' }),
      nativeToScVal(expirationLedger, { type: 'u32' }),
    ];
    const approveOp = usdcContractInstance.call('approve', ...approveArgs);

    // Helper to process a single Soroban operation end-to-end
    const executeOp = async (op: any, logPrefix: string) => {
      // Fetch fresh account sequence for each transaction
      const freshAccount = await soroban.getAccount(stellarAddress);
      const tx = new TransactionBuilder(freshAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(op)
        .setTimeout(120)
        .build();

      (process.env.NODE_ENV === "development" ? console.log : () => {})(`${logPrefix} Simulating transaction...`);
      const simResult = await soroban.simulateTransaction(tx);

      if (rpc.Api.isSimulationError(simResult)) {
        throw new Error(`${logPrefix} Soroban simulation failed: ${decodeCctpError(simResult.error)}`);
      }

      const assembled = rpc.assembleTransaction(tx, simResult).build();
      
      let signedXdr: string | null = null;
      try {
        signedXdr = await signTransaction(assembled.toXDR());
      } catch (err: any) {
        throw new Error("Please make sure your Freighter wallet is unlocked, then refresh the page and try again.");
      }
      if (!signedXdr) throw new Error("Please make sure your Freighter wallet is unlocked, then refresh the page and try again.");

      const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);

      (process.env.NODE_ENV === "development" ? console.log : () => {})(`${logPrefix} Submitting transaction to network...`);
      const sendResult = await soroban.sendTransaction(signedTx as any);

      if (sendResult.status === "ERROR") {
        throw new Error(`${logPrefix} Send failed: ${JSON.stringify(sendResult.errorResult)}`);
      }

      const txHash = sendResult.hash;
      (process.env.NODE_ENV === "development" ? console.log : () => {})(`${logPrefix} TX submitted: ${txHash}`);

      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const status = await soroban.getTransaction(txHash);
        if (status.status === rpc.Api.GetTransactionStatus.SUCCESS) {
          return txHash;
        }
        if (status.status === rpc.Api.GetTransactionStatus.FAILED) {
          throw new Error(`${logPrefix} TX failed on-chain: ${txHash}`);
        }
      }
      throw new Error(`${logPrefix} TX did not confirm after 120s: ${txHash}`);
    };

    // 1. Execute Approve Transaction
    await executeOp(approveOp, "[StellarClient: Approve USDC]");

    // 2. Execute Deposit_for_burn Transaction
    const depositHash = await executeOp(operation, "[StellarClient: Bridge]");
    return depositHash;
  }
}
