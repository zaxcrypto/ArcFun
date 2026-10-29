import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const IRIS_BASE = "https://iris-api-sandbox.circle.com";
const EURC_TOKEN_ID = "0x2587821a0ee7daa174b95436b5dab1731cfa1844775b010217d3c0dd02a4eecd";
const zeroAddress = "0x0000000000000000000000000000000000000000";

async function checkQuote(srcDomain: number, dstDomain: number, name: string) {
  console.log(`\n================== Checking: ${name} ==================`);
  for (const reqType of ["PRE_FINALITY", "FINALITY"]) {
    try {
      const res = await fetch(`${IRIS_BASE}/v2/quote/cctpx/${EURC_TOKEN_ID}/${srcDomain}/${dstDomain}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: "1000000", // 1 EURC
          feeToken: zeroAddress,
          requests: [{ type: reqType }],
        }),
      });
      console.log(`[${reqType}] Status: ${res.status}`);
      if (res.ok) {
        const quote = await res.json();
        console.log(`[${reqType}] Fee Total: ${quote.feeTotalAmount} wei`);
        console.log(`[${reqType}] SignedQuote prefix: ${quote.signedQuote.slice(0, 30)}...`);
      } else {
        const text = await res.text();
        console.log(`[${reqType}] Error: ${text}`);
      }
    } catch (e: any) {
      console.error(`[${reqType}] Exception: ${e.message}`);
    }
  }
}

async function main() {
  await checkQuote(26, 0, "Arc Testnet (26) -> Ethereum Sepolia (0)");
  await checkQuote(26, 1, "Arc Testnet (26) -> Avalanche Fuji (1)");
  await checkQuote(0, 26, "Ethereum Sepolia (0) -> Arc Testnet (26)");
  await checkQuote(1, 26, "Avalanche Fuji (1) -> Arc Testnet (26)");
  await checkQuote(0, 1, "Ethereum Sepolia (0) -> Avalanche Fuji (1)");
  await checkQuote(1, 0, "Avalanche Fuji (1) -> Ethereum Sepolia (0)");
}

main();
