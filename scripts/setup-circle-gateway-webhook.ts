/**
 * Circle Gateway Webhook Subscription Setup Script
 *
 * Idempotently registers or validates the ArcFun Gateway Webhook subscription
 * with Circle's Permissionless Webhooks API.
 *
 * Usage:
 *   npx ts-node scripts/setup-circle-gateway-webhook.ts
 *   or:
 *   node --loader ts-node/esm scripts/setup-circle-gateway-webhook.ts [--dry-run]
 *
 * Required Environment Variables:
 *   CIRCLE_API_KEY                   - Your Circle Console API Key (Free tier, read/write)
 *   CIRCLE_GATEWAY_WEBHOOK_URL       - Optional. Explicit HTTPS endpoint URL (defaults to NEXT_PUBLIC_APP_URL + /api/webhooks/circle-gateway)
 *   NEXT_PUBLIC_APP_URL              - Public base URL (e.g. https://www.thearcfun.xyz)
 *   CIRCLE_ENV                       - "production" (default) or "sandbox"
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const REQUIRED_NOTIFICATION_TYPES = [
  "gateway.deposit.finalized",
  "gateway.mint.finalized",
  "gateway.mint.forwarded",
];

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const apiKey = process.env.CIRCLE_API_KEY;

  if (!apiKey) {
    console.error("❌ ERROR: CIRCLE_API_KEY is not defined in environment or .env.local.");
    console.error("Please obtain a free API key from Circle Console (https://console.circle.com) and add it to .env.local.");
    process.exit(1);
  }

  // Determine endpoint URL
  let endpointUrl = process.env.CIRCLE_GATEWAY_WEBHOOK_URL;
  if (!endpointUrl) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.thearcfun.xyz";
    endpointUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/circle-gateway`;
  }

  if (!endpointUrl.startsWith("https://")) {
    console.error(`❌ ERROR: Circle Webhook endpoint must use HTTPS. Provided: "${endpointUrl}"`);
    console.error("Local testing requires an HTTPS tunnel (e.g. ngrok or cloudflare tunnels).");
    process.exit(1);
  }

  const isSandbox =
    process.env.CIRCLE_ENV === "sandbox" ||
    process.env.NEXT_PUBLIC_CIRCLE_IRIS_API?.includes("sandbox");

  const baseUrl = isSandbox ? "https://api-sandbox.circle.com" : "https://api.circle.com";

  console.log("==================================================================");
  console.log(" ArcFun — Circle Gateway Webhook Subscription Setup");
  console.log("==================================================================");
  console.log(`Environment: ${isSandbox ? "Sandbox (Testnet)" : "Production (Mainnet/Testnet)"}`);
  console.log(`Circle API:  ${baseUrl}`);
  console.log(`Endpoint:    ${endpointUrl}`);
  console.log(`Event Types: ${REQUIRED_NOTIFICATION_TYPES.join(", ")}`);
  console.log(`Dry-Run:     ${isDryRun ? "YES (No changes will be sent)" : "NO"}`);
  console.log("------------------------------------------------------------------");

  // 1. Detect Existing Subscriptions
  console.log("\n[1/2] Checking for existing subscriptions in Circle...");
  try {
    const listRes = await fetch(`${baseUrl}/v2/notifications/subscriptions/permissionless`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (listRes.ok) {
      const listData = await listRes.json();
      const subscriptions: any[] = listData?.data || [];

      const existing = subscriptions.find(
        (sub) => sub?.endpoint?.toLowerCase() === endpointUrl.toLowerCase()
      );

      if (existing) {
        console.log(`✅ Subscription ALREADY EXISTS for this endpoint!`);
        console.log(`   Subscription ID: ${existing.id}`);
        console.log(`   Status:          ${existing.enabled ? "Active" : "Disabled"}`);
        console.log(`   Subscribed Types: ${JSON.stringify(existing.notificationTypes || [])}`);
        console.log("\nNo action required. Webhook is already configured and active.");
        return;
      } else {
        console.log(`Found ${subscriptions.length} existing subscriptions; none matched this endpoint.`);
      }
    } else {
      console.warn(`[Notice] Listing existing subscriptions returned HTTP ${listRes.status}. Proceeding to create subscription.`);
    }
  } catch (err: any) {
    console.warn(`[Warning] Could not list existing subscriptions (${err?.message}). Attempting idempotent subscription creation...`);
  }

  if (isDryRun) {
    console.log("\n[Dry-Run] Skipped subscription creation. Verification complete.");
    return;
  }

  // 2. Create Permissionless Subscription
  console.log("\n[2/2] Registering permissionless subscription with Circle...");
  
  // Circle permissionless Gateway subscriptions require environment ("TEST" | "LIVE"), domains, and addresses
  const targetEnvironment = process.env.CIRCLE_GATEWAY_ENV || (isSandbox ? "TEST" : "TEST");
  
  // Supported Gateway domains (0: Ethereum Sepolia, 1: Avalanche Fuji, 2: OP Sepolia, 3: Arbitrum Sepolia, 6: Base Sepolia, 7: Polygon Amoy, 26: Arc Testnet)
  const targetDomains = [0, 1, 2, 3, 6, 7, 26];

  // Monitored addresses (defaults to ArcFun Fee Treasury and custom configured addresses)
  const customAddresses = process.env.CIRCLE_GATEWAY_MONITORED_ADDRESSES
    ? process.env.CIRCLE_GATEWAY_MONITORED_ADDRESSES.split(",").map((a) => a.trim())
    : [];
  const targetAddresses = Array.from(
    new Set([
      "0xC1753399Fb68Cce753d5b51Bb22e4d79de13Fd2e", // ArcFun Treasury
      ...customAddresses,
    ])
  );

  const createPayload = {
    environment: targetEnvironment,
    endpoint: endpointUrl,
    domains: targetDomains,
    addresses: targetAddresses,
    notificationTypes: ["gateway.*"],
  };

  try {
    const createRes = await fetch(`${baseUrl}/v2/notifications/subscriptions/permissionless`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(createPayload),
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      console.error(`❌ Failed to create Circle subscription: HTTP ${createRes.status}`);
      console.error("Circle Response:", JSON.stringify(createData, null, 2));
      console.error("\nNote: Circle validates your endpoint by sending an HTTP HEAD request during subscription.");
      console.error(`Ensure "${endpointUrl}" is deployed and responds to HEAD with 200 OK.`);
      process.exit(1);
    }

    console.log("✅ Webhook subscription successfully created!");
    console.log(`   Subscription ID: ${createData?.data?.id || "Created"}`);
    console.log("Your ArcFun Gateway is now listening for real-time deposit and mint events!");
  } catch (err: any) {
    console.error("❌ Exception during subscription registration:", err?.message || err);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
