import { createPublicClient, http, decodeEventLog } from "viem";
import { sepolia } from "viem/chains";
import { ARCFUN_BONDING_CURVE_ABI } from "../src/config/contracts";

async function main() {
  const rpcUrl = "https://ethereum-sepolia-rpc.publicnode.com";
  console.log("Testing with PublicNode RPC:", rpcUrl);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const curveAddress = "0x74a3048E73C80D447c217960409fBC311a8f7B78"; // ETHTEST curve
  const currentBlock = await publicClient.getBlockNumber();
  console.log("Current block:", currentBlock);

  const CHUNK_SIZE = 10000n;
  const MAX_CHUNKS = 10n;

  let logs: any[] = [];
  let toBlock = currentBlock;

  for (let i = 0n; i < MAX_CHUNKS; i++) {
    const fromBlock = toBlock > CHUNK_SIZE ? toBlock - CHUNK_SIZE : 0n;
    console.log(`Chunk #${i}: querying logs from ${fromBlock} to ${toBlock}...`);
    try {
      const chunkLogs = await publicClient.getLogs({
        address: curveAddress as `0x${string}`,
        fromBlock,
        toBlock,
      });
      console.log(`Chunk #${i} returned ${chunkLogs.length} logs`);
      logs = [...logs, ...chunkLogs];
      if (fromBlock === 0n) break;
      toBlock = fromBlock - 1n;
    } catch (err: any) {
      console.error(`Chunk #${i} failed:`, err?.message || err);
      break;
    }
  }

  console.log(`Total logs collected: ${logs.length}`);

  let buyCount = 0;
  let sellCount = 0;
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: ARCFUN_BONDING_CURVE_ABI,
        data: log.data,
        topics: log.topics,
      });
      console.log("Decoded event:", decoded.eventName, decoded.args);
      if (decoded.eventName === "Buy") buyCount++;
      if (decoded.eventName === "Sell") sellCount++;
    } catch (e: any) {
      console.error("Decode error:", e?.message);
    }
  }

  console.log(`SUCCESS! Parsed ${buyCount} buys and ${sellCount} sells.`);
}

main().catch(console.error);
