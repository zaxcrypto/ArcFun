import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const IRIS_BASE = "https://iris-api-sandbox.circle.com";
const EURC_TOKEN_ID = "0x2587821a0ee7daa174b95436b5dab1731cfa1844775b010217d3c0dd02a4eecd";
const ARC_DOMAIN = 26;
const ETHEREUM_DOMAIN = 0;
const BASE_DOMAIN = 6;
const recipient = "0xe2ED006Dbb1726e0f577733F65d30a94D34bDD77";
const transferAmount = (5n * 10n ** 6n).toString(); // 5 EURC

async function testQuotes() {
  console.log("=== Testing Arc (26) -> Sepolia (0) Direct Mint Quote ===");
  try {
    const res = await fetch(`${IRIS_BASE}/v2/quote/cctpx/${EURC_TOKEN_ID}/${ARC_DOMAIN}/${ETHEREUM_DOMAIN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: transferAmount,
        feeToken: "0x0000000000000000000000000000000000000000",
        requests: [{ type: "PRE_FINALITY" }],
      }),
    });
    console.log("Arc -> Sepolia Direct Status:", res.status);
    const json = await res.json();
    console.log("Arc -> Sepolia Direct Quote:", JSON.stringify(json, null, 2));
  } catch (err: any) {
    console.error("Arc -> Sepolia Direct Error:", err.message);
  }

  console.log("\n=== Testing Arc (26) -> Sepolia (0) Forwarded Mint Quote ===");
  try {
    const res = await fetch(`${IRIS_BASE}/v2/quote/cctpx/${EURC_TOKEN_ID}/${ARC_DOMAIN}/${ETHEREUM_DOMAIN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: transferAmount,
        feeToken: "0x0000000000000000000000000000000000000000",
        requests: [
          { type: "PRE_FINALITY" },
          {
            type: "FORWARD",
            params: {
              msgType: "TransferMessage",
              destinationAddress: recipient,
            },
          },
        ],
      }),
    });
    console.log("Arc -> Sepolia Forwarded Status:", res.status);
    const json = await res.json();
    console.log("Arc -> Sepolia Forwarded Quote:", JSON.stringify(json, null, 2));
  } catch (err: any) {
    console.error("Arc -> Sepolia Forwarded Error:", err.message);
  }

  console.log("\n=== Testing Arc (26) -> Base Sepolia (6) Direct Mint Quote ===");
  try {
    const res = await fetch(`${IRIS_BASE}/v2/quote/cctpx/${EURC_TOKEN_ID}/${ARC_DOMAIN}/${BASE_DOMAIN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: transferAmount,
        feeToken: "0x0000000000000000000000000000000000000000",
        requests: [{ type: "PRE_FINALITY" }],
      }),
    });
    console.log("Arc -> Base Direct Status:", res.status);
    const json = await res.json();
    console.log("Arc -> Base Direct Quote:", JSON.stringify(json, null, 2));
  } catch (err: any) {
    console.error("Arc -> Base Direct Error:", err.message);
  }

  console.log("\n=== Testing Arc (26) -> Base Sepolia (6) Forwarded Mint Quote ===");
  try {
    const res = await fetch(`${IRIS_BASE}/v2/quote/cctpx/${EURC_TOKEN_ID}/${ARC_DOMAIN}/${BASE_DOMAIN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: transferAmount,
        feeToken: "0x0000000000000000000000000000000000000000",
        requests: [
          { type: "PRE_FINALITY" },
          {
            type: "FORWARD",
            params: {
              msgType: "TransferMessage",
              destinationAddress: recipient,
            },
          },
        ],
      }),
    });
    console.log("Arc -> Base Forwarded Status:", res.status);
    const json = await res.json();
    console.log("Arc -> Base Forwarded Quote:", JSON.stringify(json, null, 2));
  } catch (err: any) {
    console.error("Arc -> Base Forwarded Error:", err.message);
  }
}

testQuotes().catch(console.error);
