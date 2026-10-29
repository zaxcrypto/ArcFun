import { ethers, upgrades } from "hardhat";

async function main() {
  const swapAddress = "0xb81f957A499Db2F2680E5CaD74eb8839Bc3421C5";

  console.log("Compiling and Upgrading ArcFunSwap V2 (Dynamic Decimals)...");
  
  const ArcFunSwap = await ethers.getContractFactory("ArcFunSwap");
  const upgraded = await upgrades.upgradeProxy(swapAddress, ArcFunSwap, { unsafeAllow: ["constructor"] });
  await upgraded.waitForDeployment();

  console.log("Upgrade Complete!");
}

main().catch(console.error);
