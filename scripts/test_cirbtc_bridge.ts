import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  formatUnits,
  http,
  zeroAddress,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const privateKey = (process.env.EVM_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY) as `0x${string}`;
const account = privateKeyToAccount(privateKey);

const arcChain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "Arc ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://arc-testnet.g.alchemy.com/v2/Vt9_fvDipTI7hEZdMc950"] },
  },
});

const sepoliaChain = defineChain({
  id: 11155111,
  name: "Ethereum Sepolia",
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || "https://rpc.sepolia.org"] },
  },
});

const arcPublic = createPublicClient({ chain: arcChain, transport: http() });
const arcWallet = createWalletClient({ account, chain: arcChain, transport: http() });

const sepoliaPublic = createPublicClient({ chain: sepoliaChain, transport: http() });
const sepoliaWallet = createWalletClient({ account, chain: sepoliaChain, transport: http() });

// CCTP Constants for cirBTC
const ARC_CCTS = "0x63753E722bd2C2A5DF6EE19C5106662208B81077" as const;
const CIRBTC_TOKEN_ID = "0x7c27b7b6485f3ea49b7d1a439e288d3c3116f533302afabb7e372dfc0770cc7d" as const;
const CIRBTC_TOKEN_MANAGER = "0xb995f4060c38b7608626d0ccabe547cdc2c7390a" as const;

const ARC_DOMAIN = 26;
const ETH_DOMAIN = 0;
const IRIS_BASE = "https://iris-api-sandbox.circle.com";

const ARC_CIRBTC = "0xf0c4a4ce82a5746abaad9425360ab04fbba432bf" as const;
const SEPOLIA_CIRBTC = "0x3a3fe695f684bf9b9e43cf43c2b895ea5e392bb3" as const;
const SEPOLIA_MESSAGE_TRANSMITTER = "0xe737e5cebeeba77efe34d4aa090756590b1ce275" as const;

const erc20Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "ok", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "remaining", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

const serviceAbi = [
  {
    name: "crossChainTransfer",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "tokenId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "destinationAddress", type: "bytes" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "minFinalityThreshold", type: "uint32" },
      {
        name: "claim",
        type: "tuple",
        components: [
          { name: "signedQuote", type: "bytes" },
          { name: "refundAddress", type: "address" },
        ],
      },
      { name: "autoExecuteHookData", type: "bool" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const messageTransmitterAbi = [
  {
    name: "receiveMessage",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

async function pollAttestationByTx(txHash: string): Promise<{ message: `0x${string}`; attestation: `0x${string}` }> {
  console.log(`[Iris API] Polling attestation for burn tx: ${txHash}...`);
  const start = Date.now();
  const url = `${IRIS_BASE}/v2/messages/${ARC_DOMAIN}?transactionHash=${txHash}`;

  while (Date.now() - start < 180_000) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const msg = data.messages?.[0];
        if (msg && msg.status === "complete" && msg.attestation) {
          console.log(`[Iris API] Attestation received in ${((Date.now() - start) / 1000).toFixed(3)}s!`);
          return {
            message: msg.message as `0x${string}`,
            attestation: msg.attestation as `0x${string}`,
          };
        }
      }
    } catch (e: any) {
      console.warn(`[Iris API] Polling error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Attestation polling timed out after 3 minutes");
}

async function main() {
  console.log("================================================================================");
  console.log("           LIVE CCTP TEST: Arc Testnet ➔ Ethereum Sepolia (cirBTC)             ");
  console.log("================================================================================");
  console.log("Wallet:", account.address);

  // 1. Initial Balances
  const arcBalBefore = (await arcPublic.readContract({
    address: ARC_CIRBTC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;

  const sepBalBefore = (await sepoliaPublic.readContract({
    address: SEPOLIA_CIRBTC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;

  console.log(`\n[Initial Balances]`);
  console.log(`  Arc cirBTC:     ${formatUnits(arcBalBefore, 8)} (${arcBalBefore} raw)`);
  console.log(`  Sepolia cirBTC: ${formatUnits(sepBalBefore, 8)} (${sepBalBefore} raw)`);

  const transferAmount = 10000n; // 0.0001 cirBTC (8 decimals)
  console.log(`\nTransferring: ${formatUnits(transferAmount, 8)} cirBTC`);

  // 2. Approve TokenManager
  console.log(`\n1. Checking Allowance for TokenManager (${CIRBTC_TOKEN_MANAGER})...`);
  const allowance = (await arcPublic.readContract({
    address: ARC_CIRBTC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, CIRBTC_TOKEN_MANAGER],
  })) as bigint;

  if (allowance < transferAmount) {
    console.log("   Approving TokenManager...");
    const approveTx = await arcWallet.writeContract({
      address: ARC_CIRBTC,
      abi: erc20Abi,
      functionName: "approve",
      args: [CIRBTC_TOKEN_MANAGER, 100000000n],
    });
    console.log(`   Approve Tx: ${approveTx}`);
    await arcPublic.waitForTransactionReceipt({ hash: approveTx });
    console.log("   Approve confirmed!");
  } else {
    console.log("   Sufficient allowance exists.");
  }

  // 3. Request Iris Fee Quote
  console.log("\n2. Requesting Iris Fee Quote for cirBTC transfer...");
  const quoteRes = await fetch(`${IRIS_BASE}/v2/quote/cctpx/${CIRBTC_TOKEN_ID}/${ARC_DOMAIN}/${ETH_DOMAIN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: transferAmount.toString(),
      feeToken: zeroAddress,
      requests: [{ type: "PRE_FINALITY" }],
    }),
  });

  if (!quoteRes.ok) {
    throw new Error(`Iris fee quote failed: ${await quoteRes.text()}`);
  }
  const quote = await quoteRes.json();
  const feeValue = BigInt(quote.feeTotalAmount);
  console.log(`   Quote received! Fee: ${formatUnits(feeValue, 18)} Arc ETH`);

  // 4. Initiate Cross-Chain Transfer (Burn) on Arc
  console.log("\n3. Calling crossChainTransfer on Arc CCTS...");
  const destinationAddress = encodePacked(["address"], [account.address]);
  const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
  const claim = {
    signedQuote: quote.signedQuote as `0x${string}`,
    refundAddress: zeroAddress,
  };

  const burnTx = await arcWallet.writeContract({
    address: ARC_CCTS,
    abi: serviceAbi,
    functionName: "crossChainTransfer",
    args: [
      CIRBTC_TOKEN_ID,
      transferAmount,
      ETH_DOMAIN,
      destinationAddress,
      ZERO_BYTES32,
      1000,
      claim,
      false,
      "0x",
    ],
    value: feeValue,
  });

  console.log(`   Burn Tx: ${burnTx}`);
  const receipt = await arcPublic.waitForTransactionReceipt({ hash: burnTx });
  console.log(`   Confirmed in Arc block: ${receipt.blockNumber}, status: ${receipt.status}`);

  // 5. Poll Iris Sandbox for Attestation
  console.log("\n4. Waiting for Circle Iris Attestation...");
  const { message, attestation } = await pollAttestationByTx(burnTx);

  // 6. Receive Message (Mint) on Sepolia
  console.log("\n5. Minting on Ethereum Sepolia via MessageTransmitter...");
  const mintTx = await sepoliaWallet.writeContract({
    address: SEPOLIA_MESSAGE_TRANSMITTER,
    abi: messageTransmitterAbi,
    functionName: "receiveMessage",
    args: [message, attestation],
  });

  console.log(`   Sepolia Mint Tx: ${mintTx}`);
  const mintReceipt = await sepoliaPublic.waitForTransactionReceipt({ hash: mintTx });
  console.log(`   Confirmed in Sepolia block: ${mintReceipt.blockNumber}, status: ${mintReceipt.status}`);

  // 7. Verify Final Balances
  const arcBalAfter = (await arcPublic.readContract({
    address: ARC_CIRBTC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;

  const sepBalAfter = (await sepoliaPublic.readContract({
    address: SEPOLIA_CIRBTC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;

  console.log(`\n================================================================================`);
  console.log(`                        TEST COMPLETED SUCCESSFULLY!                            `);
  console.log(`================================================================================`);
  console.log(`Arc Testnet (Burn):`);
  console.log(`  Tx Hash:  ${burnTx}`);
  console.log(`  Block:    ${receipt.blockNumber}`);
  console.log(`  Balance:  ${formatUnits(arcBalBefore, 8)} -> ${formatUnits(arcBalAfter, 8)}`);
  console.log(`Ethereum Sepolia (Mint):`);
  console.log(`  Tx Hash:  ${mintTx}`);
  console.log(`  Block:    ${mintReceipt.blockNumber}`);
  console.log(`  Balance:  ${formatUnits(sepBalBefore, 8)} -> ${formatUnits(sepBalAfter, 8)}`);
}

main().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
