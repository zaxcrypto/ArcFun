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

const baseSepoliaChain = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"] },
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

const basePublic = createPublicClient({ chain: baseSepoliaChain, transport: http() });
const baseWallet = createWalletClient({ account, chain: baseSepoliaChain, transport: http() });

const sepoliaPublic = createPublicClient({ chain: sepoliaChain, transport: http() });
const sepoliaWallet = createWalletClient({ account, chain: sepoliaChain, transport: http() });

// Constants from Circle Docs
const ARC_CCTS = "0x63753E722bd2C2A5DF6EE19C5106662208B81077" as const;
const EURC_TOKEN_ID = "0x2587821a0ee7daa174b95436b5dab1731cfa1844775b010217d3c0dd02a4eecd" as const;
const ARC_DOMAIN = 26;
const BASE_DOMAIN = 6;
const ETH_DOMAIN = 0;
const IRIS_BASE = "https://iris-api-sandbox.circle.com";

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
    name: "resolveTokenAddress",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "bytes32" }],
    outputs: [{ name: "token", type: "address" }],
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

async function run() {
  console.log("=================================================");
  console.log("   CIRCLE CCTPx EURC BRIDGE TEST: ARC -> BASE    ");
  console.log("=================================================");
  console.log("Signer / Recipient Address:", account.address);

  // Choose Destination: Base Sepolia (domain 6)
  const destDomain = BASE_DOMAIN;
  const destName = "Base Sepolia";
  const destPublic = basePublic;
  const destWallet = baseWallet;
  const destMessageTransmitter = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"; // MessageTransmitterV2 on Base Sepolia

  // 1. Resolve tokens
  const arcEurc = await arcPublic.readContract({
    address: ARC_CCTS,
    abi: serviceAbi,
    functionName: "resolveTokenAddress",
    args: [EURC_TOKEN_ID],
  });
  const arcTokenManager = await arcPublic.readContract({
    address: ARC_CCTS,
    abi: serviceAbi,
    functionName: "resolveTokenManager",
    args: [EURC_TOKEN_ID],
  });
  const baseEurc = "0x808456652fdb597867f38412077a9182bf77359f" as `0x${string}`;

  console.log("Arc EURC Address:", arcEurc);
  console.log("Arc TokenManager Address:", arcTokenManager);
  console.log("Base Sepolia EURC Address:", baseEurc);

  // 2. Balances Before
  const arcEurcBefore = await arcPublic.readContract({
    address: arcEurc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const baseEurcBefore = await basePublic.readContract({
    address: baseEurc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const arcEthBefore = await arcPublic.getBalance({ address: account.address });

  console.log("\n[BALANCES BEFORE]");
  console.log(`- Arc EURC Balance:         ${formatUnits(arcEurcBefore, 6)} EURC`);
  console.log(`- Base Sepolia EURC Balance: ${formatUnits(baseEurcBefore, 6)} EURC`);
  console.log(`- Arc Native ETH Balance:    ${formatUnits(arcEthBefore, 18)} ETH`);

  const transferAmount = 5n * 10n ** 6n; // 5 EURC
  if (arcEurcBefore < transferAmount) {
    throw new Error(`Insufficient Arc EURC balance. Have: ${formatUnits(arcEurcBefore, 6)}, Need: 5 EURC`);
  }

  // 3. Allowance check & approve
  console.log("\n[STEP 1: APPROVE TOKEN MANAGER]");
  const currentAllowance = await arcPublic.readContract({
    address: arcEurc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, arcTokenManager],
  });
  console.log(`Current Allowance for TokenManager: ${formatUnits(currentAllowance, 6)} EURC`);

  if (currentAllowance < transferAmount) {
    console.log(`Approving ${formatUnits(transferAmount, 6)} EURC to TokenManager...`);
    const approveTx = await arcWallet.writeContract({
      address: arcEurc,
      abi: erc20Abi,
      functionName: "approve",
      args: [arcTokenManager, transferAmount],
    });
    console.log(`Approve Tx Submitted: ${approveTx}`);
    const approveReceipt = await arcPublic.waitForTransactionReceipt({ hash: approveTx });
    console.log(`Approve Confirmed in block ${approveReceipt.blockNumber}! Status: ${approveReceipt.status}`);
  } else {
    console.log("Sufficient allowance already exists. Skipping approve.");
  }

  // 4. Fetch fee quote from Iris
  console.log("\n[STEP 2: FETCH FEE QUOTE FROM IRIS]");
  // We'll test with Direct Mint quote first (faster, we can see and control mint ourselves)
  // Or Forwarded quote? Let's check:
  // In Direct Mint: Circle Iris signs the quote, we burn on Arc, Iris generates attestation, we call receiveMessage on Base Sepolia!
  console.log(`Requesting Iris fee quote for Arc (${ARC_DOMAIN}) -> Base Sepolia (${destDomain})...`);
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
    throw new Error(`Failed to get fee quote: ${await quoteRes.text()}`);
  }
  const quote = await quoteRes.json();
  console.log(`Quote received! Total Fee: ${formatUnits(BigInt(quote.feeTotalAmount), 18)} ETH`);
  console.log(`Signed Quote: ${quote.signedQuote.slice(0, 30)}...`);

  // 5. Initiate crossChainTransfer on Arc
  console.log("\n[STEP 3: CALL crossChainTransfer ON ARC CCTS]");
  const destinationAddress = encodePacked(["address"], [account.address]);
  const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
  const claim = {
    signedQuote: quote.signedQuote as `0x${string}`,
    refundAddress: zeroAddress,
  };
  const feeValue = BigInt(quote.feeTotalAmount);

  console.log("Simulating crossChainTransfer on Arc Testnet...");
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
      1000, // fast finality
      claim,
      false,
      "0x",
    ],
    value: feeValue,
  });

  console.log("Simulation passed! Submitting crossChainTransfer tx...");
  const transferTx = await arcWallet.writeContract(request);
  console.log(`>>> Burn/Transfer Tx Hash on Arc: ${transferTx}`);
  const transferReceipt = await arcPublic.waitForTransactionReceipt({ hash: transferTx });
  console.log(`Burn Tx Confirmed in block ${transferReceipt.blockNumber}! Status: ${transferReceipt.status}`);
  console.log(`Explorer Link: https://testnet.arcscan.io/tx/${transferTx}`);

  // 6. Poll Iris for Attestation
  console.log("\n[STEP 4: POLL IRIS FOR ATTESTATION]");
  console.log(`Polling Iris at: ${IRIS_BASE}/v2/messages/${ARC_DOMAIN}?transactionHash=${transferTx}`);
  let attestationMessage = "";
  let attestationBytes = "";
  const pollStart = Date.now();
  const maxWaitMs = 120_000; // 2 minutes for fast transfer

  while (Date.now() - pollStart < maxWaitMs) {
    try {
      const res = await fetch(`${IRIS_BASE}/v2/messages/${ARC_DOMAIN}?transactionHash=${transferTx}`);
      if (res.ok) {
        const body = await res.json();
        const msg = body.messages?.[0];
        console.log(`[${Math.round((Date.now() - pollStart) / 1000)}s] Status: ${msg?.status || "waiting..."}`);
        if (msg && msg.status === "complete" && msg.attestation) {
          attestationMessage = msg.message;
          attestationBytes = msg.attestation;
          console.log(">>> Attestation Ready!");
          break;
        }
      }
    } catch (e: any) {
      console.log("Poll error:", e.message);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }

  if (!attestationBytes) {
    throw new Error("Attestation did not complete within timeout!");
  }

  // 7. Receive Message on Destination (Base Sepolia)
  console.log("\n[STEP 5: SUBMIT receiveMessage ON BASE SEPOLIA]");
  console.log(`Destination MessageTransmitter: ${destMessageTransmitter}`);

  const receiveTx = await destWallet.writeContract({
    address: destMessageTransmitter as `0x${string}`,
    abi: messageTransmitterAbi,
    functionName: "receiveMessage",
    args: [attestationMessage as `0x${string}`, attestationBytes as `0x${string}`],
  });
  console.log(`>>> Mint Tx Hash on Base Sepolia: ${receiveTx}`);
  console.log(`Explorer Link: https://sepolia.basescan.org/tx/${receiveTx}`);

  const receiveReceipt = await destPublic.waitForTransactionReceipt({ hash: receiveTx });
  console.log(`Mint Confirmed in block ${receiveReceipt.blockNumber}! Status: ${receiveReceipt.status}`);

  // 8. Verify Balances After
  console.log("\n[STEP 6: VERIFY FINAL BALANCES]");
  const arcEurcAfter = await arcPublic.readContract({
    address: arcEurc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const baseEurcAfter = await basePublic.readContract({
    address: baseEurc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  console.log(`- Arc EURC Balance:         ${formatUnits(arcEurcAfter, 6)} EURC (Delta: ${formatUnits(arcEurcAfter - arcEurcBefore, 6)})`);
  console.log(`- Base Sepolia EURC Balance: ${formatUnits(baseEurcAfter, 6)} EURC (Delta: +${formatUnits(baseEurcAfter - baseEurcBefore, 6)})`);
  console.log("\n>>> EURC CCTPx BRIDGE TEST COMPLETED SUCCESSFULLY! <<<");
}

run().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
