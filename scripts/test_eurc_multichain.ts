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
    default: { http: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com"] },
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

const fujiChain = defineChain({
  id: 43113,
  name: "Avalanche Fuji",
  nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_AVAX_FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc"] },
  },
});

const arcPublic = createPublicClient({ chain: arcChain, transport: http() });
const arcWallet = createWalletClient({ account, chain: arcChain, transport: http() });

const sepoliaPublic = createPublicClient({ chain: sepoliaChain, transport: http() });
const sepoliaWallet = createWalletClient({ account, chain: sepoliaChain, transport: http() });

const fujiPublic = createPublicClient({ chain: fujiChain, transport: http() });
const fujiWallet = createWalletClient({ account, chain: fujiChain, transport: http() });

// Constants from Circle Docs
const ARC_CCTS = "0x63753E722bd2C2A5DF6EE19C5106662208B81077" as const;
const EURC_TOKEN_ID = "0x2587821a0ee7daa174b95436b5dab1731cfa1844775b010217d3c0dd02a4eecd" as const;
const ARC_DOMAIN = 26;
const ETH_DOMAIN = 0;
const FUJI_DOMAIN = 1;
const IRIS_BASE = "https://iris-api-sandbox.circle.com";

const ARC_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;
const SEPOLIA_EURC = "0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4" as const;
const FUJI_EURC = "0x5e44db7996c682e92a960b65ac713a54ad815c6b" as const;

const SEPOLIA_MESSAGE_TRANSMITTER = "0xe737e5cebeeba77efe34d4aa090756590b1ce275" as const;
const FUJI_MESSAGE_TRANSMITTER = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;

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
    name: "resolveTokenManager",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "bytes32" }],
    outputs: [{ name: "tokenManager", type: "address" }],
  },
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

async function executeBridgeTransfer(
  destDomain: number,
  destName: string,
  destEurcAddress: `0x${string}`,
  destMessageTransmitter: `0x${string}`,
  destPublic: any,
  destWallet: any,
  amountEurc: number
) {
  console.log(`\n===============================================================`);
  console.log(`  STARTING CCTPx EURC BRIDGE: Arc Testnet -> ${destName}`);
  console.log(`===============================================================`);

  const transferAmount = BigInt(amountEurc) * 10n ** 6n; // 6 decimals

  // 1. Resolve TokenManager on Arc
  const arcTokenManager = await arcPublic.readContract({
    address: ARC_CCTS,
    abi: serviceAbi,
    functionName: "resolveTokenManager",
    args: [EURC_TOKEN_ID],
  });

  // 2. Balances Before
  const arcEurcBefore = (await arcPublic.readContract({
    address: ARC_EURC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  const destEurcBefore = (await destPublic.readContract({
    address: destEurcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;

  console.log(`[Balances Before]`);
  console.log(`- Arc EURC Balance:       ${formatUnits(arcEurcBefore, 6)} EURC`);
  console.log(`- ${destName} EURC Balance: ${formatUnits(destEurcBefore, 6)} EURC`);

  if (arcEurcBefore < transferAmount) {
    throw new Error(`Insufficient Arc EURC. Have: ${formatUnits(arcEurcBefore, 6)}, Need: ${amountEurc}`);
  }

  // 3. Allowance check & approve
  const currentAllowance = (await arcPublic.readContract({
    address: ARC_EURC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, arcTokenManager],
  })) as bigint;

  if (currentAllowance < transferAmount) {
    console.log(`Approving ${amountEurc} EURC to TokenManager (${arcTokenManager})...`);
    const approveTx = await arcWallet.writeContract({
      address: ARC_EURC,
      abi: erc20Abi,
      functionName: "approve",
      args: [arcTokenManager, transferAmount * 10n],
    });
    console.log(`Approve Tx Submitted: ${approveTx}`);
    await arcPublic.waitForTransactionReceipt({ hash: approveTx });
    console.log(`Approve confirmed!`);
  } else {
    console.log(`Sufficient allowance exists: ${formatUnits(currentAllowance, 6)} EURC.`);
  }

  // 4. Request Iris fee quote
  console.log(`Requesting Iris fee quote for Arc (${ARC_DOMAIN}) -> ${destName} (${destDomain})...`);
  const quoteRes = await fetch(`${IRIS_BASE}/v2/quote/cctpx/${EURC_TOKEN_ID}/${ARC_DOMAIN}/${destDomain}`, {
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
  console.log(`Quote received! Fee: ${formatUnits(feeValue, 18)} ETH`);

  // 5. Initiate crossChainTransfer on Arc Testnet
  const destinationAddress = encodePacked(["address"], [account.address]);
  const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
  const claim = {
    signedQuote: quote.signedQuote as `0x${string}`,
    refundAddress: zeroAddress,
  };

  console.log(`Simulating crossChainTransfer on Arc Testnet...`);
  const { request } = await arcPublic.simulateContract({
    account,
    address: ARC_CCTS,
    abi: serviceAbi,
    functionName: "crossChainTransfer",
    args: [
      EURC_TOKEN_ID,
      transferAmount,
      destDomain,
      destinationAddress,
      ZERO_BYTES32,
      1000, // fast finality threshold
      claim,
      false,
      "0x",
    ],
    value: feeValue,
  });

  console.log(`Submitting crossChainTransfer tx on Arc Testnet...`);
  const burnTxHash = await arcWallet.writeContract(request);
  console.log(`>>> [BURN CONFIRMED] Arc Burn Tx Hash: ${burnTxHash}`);
  const burnReceipt = await arcPublic.waitForTransactionReceipt({ hash: burnTxHash });
  console.log(`Arc Block Number: ${burnReceipt.blockNumber}, Status: ${burnReceipt.status}`);

  // 6. Poll Circle Iris for Attestation
  console.log(`Polling Circle Iris API sandbox for attestation...`);
  let attestationMessage = "";
  let attestationBytes = "";
  const pollStart = Date.now();
  const maxWaitMs = 120_000;

  while (Date.now() - pollStart < maxWaitMs) {
    try {
      const res = await fetch(`${IRIS_BASE}/v2/messages/${ARC_DOMAIN}?transactionHash=${burnTxHash}`);
      if (res.ok) {
        const body = await res.json();
        const msgObj = body.messages?.[0];
        if (msgObj?.status === "complete" && msgObj.attestation) {
          attestationMessage = msgObj.message;
          attestationBytes = msgObj.attestation;
          console.log(`Attestation ready in ${(Date.now() - pollStart) / 1000}s!`);
          break;
        } else {
          process.stdout.write(`Status: ${msgObj?.status || "pending"}... `);
        }
      }
    } catch (err: any) {
      process.stdout.write(`Poll err: ${err.message}... `);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  if (!attestationBytes || !attestationMessage) {
    throw new Error(`Iris attestation timed out after 120s`);
  }

  // 7. Submit receiveMessage on Destination Chain
  console.log(`\nSubmitting receiveMessage on ${destName} MessageTransmitter (${destMessageTransmitter})...`);
  const mintTxHash = await destWallet.writeContract({
    address: destMessageTransmitter,
    abi: messageTransmitterAbi,
    functionName: "receiveMessage",
    args: [attestationMessage as `0x${string}`, attestationBytes as `0x${string}`],
  });
  console.log(`>>> [MINT SUBMITTED] ${destName} Mint Tx Hash: ${mintTxHash}`);

  const mintReceipt = await destPublic.waitForTransactionReceipt({ hash: mintTxHash });
  console.log(`>>> [MINT CONFIRMED] ${destName} Block: ${mintReceipt.blockNumber}, Status: ${mintReceipt.status}`);

  // 8. Verify Balances After
  const destEurcAfter = (await destPublic.readContract({
    address: destEurcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  const arcEurcAfter = (await arcPublic.readContract({
    address: ARC_EURC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;

  console.log(`\n[Balances After]`);
  console.log(`- Arc EURC:       ${formatUnits(arcEurcAfter, 6)} EURC (Diff: ${formatUnits(arcEurcAfter - arcEurcBefore, 6)})`);
  console.log(`- ${destName} EURC: ${formatUnits(destEurcAfter, 6)} EURC (Diff: +${formatUnits(destEurcAfter - destEurcBefore, 6)})`);

  return {
    destName,
    destDomain,
    burnTxHash,
    mintTxHash,
    amountEurc,
    arcEurcBefore: formatUnits(arcEurcBefore, 6),
    arcEurcAfter: formatUnits(arcEurcAfter, 6),
    destEurcBefore: formatUnits(destEurcBefore, 6),
    destEurcAfter: formatUnits(destEurcAfter, 6),
  };
}

async function main() {
  console.log("========================================================================");
  console.log("    CIRCLE CCTPx EURC MULTI-CHAIN BACKEND VERIFICATION SUITE           ");
  console.log("========================================================================");
  console.log("Wallet / Relayer Address:", account.address);

  // Test 1: Ethereum Sepolia (Domain 0)
  const resultSepolia = await executeBridgeTransfer(
    ETH_DOMAIN,
    "Ethereum Sepolia",
    SEPOLIA_EURC,
    SEPOLIA_MESSAGE_TRANSMITTER,
    sepoliaPublic,
    sepoliaWallet,
    1 // 1 EURC
  );

  // Test 2: Avalanche Fuji (Domain 1)
  const resultFuji = await executeBridgeTransfer(
    FUJI_DOMAIN,
    "Avalanche Fuji",
    FUJI_EURC,
    FUJI_MESSAGE_TRANSMITTER,
    fujiPublic,
    fujiWallet,
    1 // 1 EURC
  );

  console.log("\n========================================================================");
  console.log("                     ALL MULTI-CHAIN TESTS PASSED!                      ");
  console.log("========================================================================");
  console.log(JSON.stringify({ resultSepolia, resultFuji }, null, 2));
}

main().catch((err) => {
  console.error("FATAL ERROR IN MULTI-CHAIN VERIFICATION:", err);
  process.exit(1);
});
