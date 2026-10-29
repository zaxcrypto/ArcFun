import { ethers } from "hardhat";

async function main() {
  const factoryAddress = "0x31F11b7456b2e15F91642B75dAdC0e69c5AAFAFa";
  const WETH_SEPOLIA = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";

  console.log("Checking factory at:", factoryAddress);
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const factory = await ethers.getContractAt("ArcFunCurveFactory", factoryAddress);
  
  const isApproved = await factory.isApprovedQuote(WETH_SEPOLIA);
  console.log("Is WETH (Sepolia) already approved?", isApproved);

  if (!isApproved) {
    console.log("Whitelisting WETH on ArcFunCurveFactory...");
    const tx = await factory.setQuoteAssetWhitelist(WETH_SEPOLIA, true);
    await tx.wait();
    console.log("WETH successfully whitelisted! Tx:", tx.hash);
  } else {
    console.log("WETH is already whitelisted.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
