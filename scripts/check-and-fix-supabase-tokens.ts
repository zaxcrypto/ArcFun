import { ethers } from "hardhat";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fix TAFCAT address in Supabase to its real on-chain address 0xce451faaB592aC100ae6C95696EC23310E95e033
  const { data, error } = await supabase
    .from("projects")
    .update({ contract_address: "0xce451faab592ac100ae6c95696ec23310e95e033" })
    .eq("id", "d9381fff-ee60-451a-8062-b2c1b21a1163")
    .select();

  if (error) {
    console.error("Failed to update TAFCAT address:", error);
  } else {
    console.log("Successfully updated TAFCAT address in Supabase:", data);
  }
}

main().catch(console.error);
