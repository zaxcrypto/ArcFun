import { ethers } from "hardhat";

async function main() {
  console.log("Deploying ERC20Factory to Ethereum Sepolia...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

  const ERC20Factory = await ethers.getContractFactory("ERC20Factory");
  const factory = await ERC20Factory.deploy();
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("ERC20Factory deployed to:", factoryAddress);
  console.log("Deployment tx hash:", factory.deploymentTransaction()?.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
