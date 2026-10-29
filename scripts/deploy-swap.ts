import { ethers, upgrades, network } from "hardhat";
import { getNetworkConfig, DEPLOYMENT_CONFIG } from "./deployment-config";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ArcFunSwap with the account:", deployer.address);

  const netConfig = getNetworkConfig(network.name);
  
  const USDC_ADDRESS = netConfig.usdcAddress;
  const EURC_ADDRESS = netConfig.eurcAddress;
  const ADMIN_MULTISIG = DEPLOYMENT_CONFIG.ADMIN_MULTISIG || deployer.address;

  if (!USDC_ADDRESS || !EURC_ADDRESS) {
    throw new Error(`USDC or EURC address missing for network ${network.name}`);
  }

  console.log("Deploying ArcFunSwap...");
  const ArcFunSwap = await ethers.getContractFactory("ArcFunSwap");
  
  const swap = await upgrades.deployProxy(ArcFunSwap, [
    USDC_ADDRESS,
    EURC_ADDRESS,
    ADMIN_MULTISIG
  ], { kind: "uups", unsafeAllow: ["constructor"] });

  await swap.waitForDeployment();
  const address = await swap.getAddress();
  console.log("ArcFunSwap proxy deployed to:", address);

  console.log("Waiting for block confirmations...");
  const tx = swap.deploymentTransaction();
  if (tx) {
    await tx.wait(5);
  }

  console.log("Deployment complete. To verify, run:");
  console.log(`npx hardhat verify --network ${network.name} ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
