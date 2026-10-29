import { Wallet } from "ethers";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.log("No DEPLOYER_PRIVATE_KEY found in env");
    return;
  }
  const wallet = new Wallet(privateKey);
  console.log("ACTUAL_DEPLOYER_ADDRESS:", wallet.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
