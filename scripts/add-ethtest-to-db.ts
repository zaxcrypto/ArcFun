import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
dotenv.config({ path: ".env.local" });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const tokenAddress = "0xC96EE59ba8b8fAF540e12F53FB74dF6aA56bf733".toLowerCase();
  const curveAddress = "0x74a3048E73C80D447c217960409fBC311a8f7B78".toLowerCase();

  const metadataPayload = JSON.stringify({
    name: "Eth Test",
    symbol: "ETHTEST",
    supply: "1,000,000,000",
    curveAddress: curveAddress,
    txHash: "",
    pairedStock: {
      id: "ETH",
      symbol: "ETH",
      name: "Ethereum (Sepolia ETH)",
      contractAddress: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
      caip10: "eip155:11155111",
    },
  });

  const { data, error } = await supabase
    .from("projects")
    .insert({
      id: randomUUID(),
      name: "ETHTEST - Eth Test",
      description: "Eth Test token launched on bonding curve paired with Sepolia ETH.",
      category: "Launchpad_Token",
      logo_url: "https://api.dicebear.com/7.x/identicon/svg?seed=ETHTEST",
      contract_address: tokenAddress,
      owner_wallet: "0xe2ed006dbb1726e0f577733f65d30a94d34bdd77",
      about_project: metadataPayload,
      status: "approved",
      is_verified: true,
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase insert error:", error);
  } else {
    console.log("Successfully registered ETHTEST in Supabase:", data);
  }
}

main().catch(console.error);
