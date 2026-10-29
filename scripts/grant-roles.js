const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  
  console.log(`Deployer Address: ${deployerAddress}`);

  const userAddress = "0xd448777940dFaBF65FD259fA8a9903e60E1FF178";

  const swapAddr = "0xb81f957A499Db2F2680E5CaD74eb8839Bc3421C5";

  const accessControlAbi = [
    "function grantRole(bytes32 role, address account) external"
  ];

  const swap = await ethers.getContractAt(accessControlAbi, swapAddr);

  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));
  const WHITELIST_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WHITELIST_MANAGER_ROLE"));

  console.log("Granting roles on ArcFunSwap...");
  await (await swap.grantRole(DEFAULT_ADMIN_ROLE, userAddress)).wait();
  await (await swap.grantRole(PAUSER_ROLE, userAddress)).wait();
  await (await swap.grantRole(WHITELIST_MANAGER_ROLE, userAddress)).wait();



  console.log("All roles granted!");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
