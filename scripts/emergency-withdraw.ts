import { ethers } from "hardhat";

async function main() {
  const ESCROW_ADDRESS = "0x9D620fD3bE140f1C227876CCF208c8Bd5E11d5a4"; 
  const [deployer] = await ethers.getSigners();
  
  console.log("Attempting emergency withdrawal for:", deployer.address);

  const Escrow = await ethers.getContractAt("ArcApiEscrow", ESCROW_ADDRESS);
  
  try {
    const tx = await Escrow.emergencyWithdraw(deployer.address);
    console.log("Transaction sent! Hash:", tx.hash);
    await tx.wait();
    console.log("✅ Funds successfully refunded to your wallet!");
  } catch (error: any) {
    console.error("Failed to withdraw:", error.message || error);
    console.log("\nMake sure you are using the same wallet that made the payment.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
