import { ethers } from 'ethers'; // Force recompile
import { ChainRegistry } from '../chain-registry';
import { CCTP_DOMAINS, MAINNET_CCTP_DOMAINS } from '../cctp-provider';

// Standard ABI for CCTP V1/V2
const MESSAGE_TRANSMITTER_V2_ABI = [
  "function receiveMessage(bytes memory message, bytes memory signature) external returns (bool)",
  "function usedNonces(bytes32) external view returns (uint256)"
];

export function isRelayerInsufficientGasError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  
  return (
    msg.includes("insufficient funds") ||
    msg.includes("insufficient_funds") ||
    msg.includes("insufficient funds for gas") ||
    msg.includes("insufficient funds for intrinsic transaction cost") ||
    msg.includes("sender doesn't have enough funds") ||
    msg.includes("account balance too low") ||
    msg.includes("exceeds balance") ||
    msg.includes("gas required exceeds allowance") ||
    msg.includes("relayer_low_gas")
  );
}

export class EvmAdapter {
  static async submitMint(
    destinationDomain: number,
    messageHex: string,
    attestationHex: string,
    destinationChainName?: string
  ): Promise<string> {
    const isMainnet = destinationChainName?.includes("Mainnet") || false;
    const activeDomains = isMainnet ? MAINNET_CCTP_DOMAINS : CCTP_DOMAINS;

    // 1. Map domain number to network name
    let destination_network = destinationChainName || "";
    if (!destination_network || !activeDomains[destination_network]) {
      for (const [name, config] of Object.entries(activeDomains)) {
        if (config.domain === destinationDomain) {
          destination_network = name;
          break;
        }
      }
    }

    if (!destination_network) {
      throw new Error(`Unsupported destination domain: ${destinationDomain}`);
    }

    const chainConfig = ChainRegistry.getChain(destination_network);
    const fallbacks = [chainConfig.rpcUrl];

    const domainConfig = activeDomains[destination_network];
    if (!domainConfig) {
      throw new Error(`Domain config not found for ${destination_network}`);
    }
    const domainName = destination_network;

    let lastError: Error = new Error("Unknown error");
    const rawKey = (process.env.EVM_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "").trim().replace(/^["']|["']$/g, '');
    const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;

    for (const rpcUrl of fallbacks) {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);

        // Pre-flight Relayer Gas Balance Check (soft — only logs; hard failure comes from RPC)
        try {
          const balance = await provider.getBalance(wallet.address);
          const feeData = await provider.getFeeData();
          const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits("0.1", "gwei");
          const requiredGasReserve = gasPrice * 100000n; // 100k gas reserve estimate for receiveMessage

          if (balance === 0n) {
            // Truly empty wallet — fail fast with explicit error before wasting an RPC call
            console.warn(`[EvmAdapter] Relayer wallet ${wallet.address} has 0 ETH on this network. Fund the relayer to enable auto-mint.`);
            throw new Error(`RELAYER_LOW_GAS: Relayer address ${wallet.address} has 0 ETH. Fund wallet to enable auto-mint.`);
          } else if (balance < requiredGasReserve) {
            // Low but non-zero — warn and attempt anyway; the RPC will reject if truly insufficient
            console.warn(`[EvmAdapter] Relayer balance (${ethers.formatEther(balance)} ETH) is below recommended reserve (${ethers.formatEther(requiredGasReserve)} ETH). Attempting anyway...`);
          }
        } catch (gasErr: any) {
          if (gasErr.message.includes("RELAYER_LOW_GAS")) {
            throw gasErr;
          }
          // Any other error (e.g., RPC failure reading balance) — skip check and proceed
          console.warn(`[EvmAdapter] Gas pre-check skipped: ${gasErr.message?.slice(0, 60)}`);
        }

        const messageBuf = Buffer.from(messageHex.startsWith('0x') ? messageHex.slice(2) : messageHex, 'hex');
        const sourceDomainNum = messageBuf.readUInt32BE(4);
        const nonceNum = messageBuf.readBigUInt64BE(12);
        
        // Select correct MessageTransmitter address (CCTP V1 vs V2)
        const rawTransmitterAddr = (sourceDomainNum === 8 && domainConfig.messageTransmitterV1)
          ? domainConfig.messageTransmitterV1
          : domainConfig.messageTransmitter;

        const targetTransmitterAddr = ethers.getAddress(rawTransmitterAddr.toLowerCase());

        (process.env.NODE_ENV === "development" ? console.log : () => {})(
          `[EvmAdapter] Routing receiveMessage for source domain ${sourceDomainNum} to transmitter ${targetTransmitterAddr} on ${domainName}`
        );

        let contract = new ethers.Contract(targetTransmitterAddr, MESSAGE_TRANSMITTER_V2_ABI, wallet);

        // STANDARD EVM V1/V2 NONCE MATH
        const hashKey = ethers.solidityPackedKeccak256(['uint32', 'uint64'], [sourceDomainNum, nonceNum]);

        // Execution options (declared here so V1 fallback catch block can also access)
        const txOptions: any = {};

        // Pre-flight nonce check (non-fatal — skip on BAD_DATA/contract mismatch)
        let nonceCheckPassed = false;
        try {
          const used = await contract.usedNonces(hashKey);
          const isUsed = used > 0n;
          nonceCheckPassed = true;
          
          if (isUsed) {
            (process.env.NODE_ENV === "development" ? console.log : () => {})(`[EvmAdapter] Pre-flight check: Nonce already used on ${domainName}. Querying logs for tx hash...`);
            try {
              const topic0 = ethers.id("MessageReceived(address,uint32,uint64,bytes32,bytes)");
              const topic2 = ethers.toBeHex(nonceNum, 32);
              const logs = await provider.getLogs({
                address: ethers.getAddress(domainConfig.messageTransmitter.toLowerCase()),
                topics: [topic0, null, topic2],
                fromBlock: -10000,
                toBlock: 'latest'
              });
              if (logs.length > 0) {
                (process.env.NODE_ENV === "development" ? console.log : () => {})(`[EvmAdapter] Found already minted tx hash: ${logs[0].transactionHash}`);
                return logs[0].transactionHash;
              }
            } catch (logErr) {
              console.warn(`[EvmAdapter] Failed to query logs for already claimed nonce:`, String(logErr));
            }
            throw new Error("ALREADY_CLAIMED: This CCTP attestation has already been executed on the EVM chain.");
          }
        } catch (nonceErr: any) {
          if (nonceErr?.message?.includes("ALREADY_CLAIMED")) throw nonceErr;
          // BAD_DATA / empty 0x = contract not found or wrong interface — skip pre-flight, proceed to mint
          console.warn(`[EvmAdapter] usedNonces pre-flight skipped on ${domainName}: ${nonceErr?.code || nonceErr?.message?.slice(0, 80)}`);
        }

        try {
          if (destination_network === "Optimism Sepolia") {
            const feeData = await provider.getFeeData();
            if (feeData.maxFeePerGas) txOptions.maxFeePerGas = feeData.maxFeePerGas;
            if (feeData.maxPriorityFeePerGas) txOptions.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
          }

          const tx = await contract.receiveMessage(messageHex, attestationHex, txOptions);
          (process.env.NODE_ENV === "development" ? console.log : () => {})(`[EvmAdapter] TX submitted: ${tx.hash}`);

          const receipt = await Promise.race([
            tx.wait(1),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error("Timeout waiting for confirmation")), 60000)
            )
          ]);

          if (receipt && receipt.status === 1) {
            (process.env.NODE_ENV === "development" ? console.log : () => {})(`[EvmAdapter] TX confirmed ✅: ${tx.hash}`);
            return tx.hash;
          } else {
            throw new Error("Transaction reverted on-chain");
          }
        } catch (e: any) {
          console.warn(`[EvmAdapter] RPC Failed (${rpcUrl.split('?')[0]}):`, e.message);
          
          const errStr = String(e?.message || e);
          if (errStr.includes("ALREADY_CLAIMED")) {
            throw e; 
          }

          if (errStr.includes("Invalid signature: not attester") && domainConfig.messageTransmitterV1 && targetTransmitterAddr !== domainConfig.messageTransmitterV1) {
            console.log(`[EvmAdapter] V2 returned 'Invalid signature: not attester'. Retrying with V1 MessageTransmitter (${domainConfig.messageTransmitterV1})...`);
            try {
              const v1Address = ethers.getAddress(domainConfig.messageTransmitterV1.toLowerCase());
              const v1Contract = new ethers.Contract(v1Address, MESSAGE_TRANSMITTER_V2_ABI, wallet);
              const v1Tx = await v1Contract.receiveMessage(messageHex, attestationHex, txOptions);
              console.log(`[EvmAdapter] V1 Fallback TX submitted: ${v1Tx.hash}`);
              const v1Receipt = await v1Tx.wait(1);
              if (v1Receipt && v1Receipt.status === 1) {
                console.log(`[EvmAdapter] V1 Fallback TX confirmed ✅: ${v1Tx.hash}`);
                return v1Tx.hash;
              }
            } catch (v1Err: any) {
              console.error(`[EvmAdapter] V1 Fallback also failed:`, v1Err?.message || v1Err);
            }
          }
          
          if (e.code === 'CALL_EXCEPTION' || errStr.includes('execution reverted') || errStr.includes('reverted') || errStr.includes('Nonce already used') || errStr.includes('Invalid caller')) {
            console.error(`[EvmAdapter] Transaction reverted during estimateGas:`, errStr);
            throw new Error(`ERR_TRANSACTION_FAILED: ${errStr}`);
          }
          
          lastError = e;
        }
      } catch (outerE: any) {
          console.warn(`[EvmAdapter] Fatal error setting up RPC:`, outerE.message);
          lastError = outerE;
      }
    }

    throw new Error(`EvmAdapter Mint Failed: ${lastError.message}`);
  }
}
