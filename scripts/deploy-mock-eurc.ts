import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying Mock EURC on ${network.name} with account: ${deployer.address}`);

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const eurc = await MockERC20.deploy("Mock EURC", "EURC", 6);
  await eurc.waitForDeployment();

  const address = await eurc.getAddress();
  console.log(`✅ Mock EURC deployed to: ${address}`);

  // Mint some to deployer just in case
  await eurc.mint(deployer.address, ethers.parseUnits("1000000", 6));
  console.log("Minted 1,000,000 EURC to deployer.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
