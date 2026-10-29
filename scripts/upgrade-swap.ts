import { ethers, upgrades } from "hardhat";

async function main() {
  const swapAddress = "0xb81f957A499Db2F2680E5CaD74eb8839Bc3421C5";
  const newEurcAddress = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

  const [deployer] = await ethers.getSigners();
  console.log(`\nUpgrading ArcFunSwap proxy at ${swapAddress} with account ${deployer.address}`);

  const ArcFunSwap = await ethers.getContractFactory("ArcFunSwap");

  // 1. Upgrade the proxy implementation
  console.log("Upgrading implementation...");
  const upgraded = await upgrades.upgradeProxy(swapAddress, ArcFunSwap, { unsafeAllow: ["constructor"] });
  await upgraded.waitForDeployment();
  console.log("Implementation upgraded successfully.");

  // 2. Set the official EURC address
  console.log(`Setting EURC address to: ${newEurcAddress}`);
  const tx = await upgraded.setEURCAddress(newEurcAddress);
  console.log(`Waiting for tx: ${tx.hash}...`);
  const receipt = await tx.wait(2);

  console.log(`\n✅ Upgrade Complete!`);
  console.log(`Block Number: ${receipt.blockNumber}`);
  console.log(`Transaction Hash: ${tx.hash}`);

  // 3. Verify storage
  const usdc = await upgraded.usdcAddress();
  const eurc = await upgraded.eurcAddress();
  console.log(`\n--- Verification ---`);
  console.log(`Stored USDC Address: ${usdc}`);
  console.log(`Stored EURC Address: ${eurc}`);
}

main().catch(console.error);
