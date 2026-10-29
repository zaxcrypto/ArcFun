import { createPublicClient, http, formatUnits, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const privateKey = (process.env.EVM_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY) as `0x${string}`;
const account = privateKeyToAccount(privateKey);

console.log("-----------------------------------------");
console.log("Account Address:", account.address);
console.log("-----------------------------------------");

const arcClient = createPublicClient({
  transport: http(process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com"),
});

const sepoliaClient = createPublicClient({
  transport: http(process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || "https://rpc.sepolia.org"),
});

const baseSepoliaClient = createPublicClient({
  transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"),
});

const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "symbol", type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "decimals", type: "uint8" }],
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
] as const;

const SEPOLIA_CCTS = "0x63753E722bd2C2A5DF6EE19C5106662208B81077" as const;
const ARC_CCTS = "0x63753E722bd2C2A5DF6EE19C5106662208B81077" as const;
const EURC_TOKEN_ID = "0x2587821a0ee7daa174b95436b5dab1731cfa1844775b010217d3c0dd02a4eecd" as `0x${string}`;

async function main() {
  const nativeBalArc = await arcClient.getBalance({ address: account.address });
  console.log("Arc Native Balance (ETH):", formatUnits(nativeBalArc, 18));

  const nativeBalSepolia = await sepoliaClient.getBalance({ address: account.address });
  console.log("Sepolia Native Balance (ETH):", formatUnits(nativeBalSepolia, 18));

  const nativeBalBase = await baseSepoliaClient.getBalance({ address: account.address });
  console.log("Base Sepolia Native Balance (ETH):", formatUnits(nativeBalBase, 18));

  console.log("\n--- Resolving EURC on Arc Testnet via CCTS ---");
  try {
    const arcEurcToken = await arcClient.readContract({
      address: ARC_CCTS,
      abi: serviceAbi,
      functionName: "resolveTokenAddress",
      args: [EURC_TOKEN_ID],
    });
    const arcTokenManager = await arcClient.readContract({
      address: ARC_CCTS,
      abi: serviceAbi,
      functionName: "resolveTokenManager",
      args: [EURC_TOKEN_ID],
    });
    console.log("Arc EURC token address:", arcEurcToken);
    console.log("Arc EURC token manager:", arcTokenManager);

    const eurcBal = await arcClient.readContract({
      address: arcEurcToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    console.log(">>> Arc EURC Balance:", formatUnits(eurcBal, 6), "EURC");
  } catch (err: any) {
    console.log("Arc CCTS error:", err.message);
  }

  console.log("\n--- Resolving EURC on Sepolia via CCTS ---");
  try {
    const sepoliaEurcToken = await sepoliaClient.readContract({
      address: SEPOLIA_CCTS,
      abi: serviceAbi,
      functionName: "resolveTokenAddress",
      args: [EURC_TOKEN_ID],
    });
    const sepoliaTokenManager = await sepoliaClient.readContract({
      address: SEPOLIA_CCTS,
      abi: serviceAbi,
      functionName: "resolveTokenManager",
      args: [EURC_TOKEN_ID],
    });
    console.log("Sepolia EURC token address:", sepoliaEurcToken);
    console.log("Sepolia EURC token manager:", sepoliaTokenManager);

    const eurcBalSepolia = await sepoliaClient.readContract({
      address: sepoliaEurcToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    console.log(">>> Sepolia EURC Balance:", formatUnits(eurcBalSepolia, 6), "EURC");
  } catch (err: any) {
    console.log("Sepolia CCTS error:", err.message);
  }

  // Also query Iris allowances and token info
  console.log("\n--- Querying Iris API ---");
  try {
    const IRIS_BASE = "https://iris-api-sandbox.circle.com";
    const res = await fetch(`${IRIS_BASE}/v2/cctpx/tokens?tokenid=${EURC_TOKEN_ID}`);
    const tokenInfo = await res.json();
    console.log("Iris Token Info:", JSON.stringify(tokenInfo));

    const allowRes = await fetch(`${IRIS_BASE}/v2/cctpx/allowances`);
    const allowInfo = await allowRes.json();
    console.log("Iris Allowances:", JSON.stringify(allowInfo));
  } catch (err: any) {
    console.log("Iris error:", err.message);
  }
}

main().catch(console.error);
