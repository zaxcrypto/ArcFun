import { ethers } from "hardhat";

async function main() {
  const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
  const VAULT_ADDRESS = "0x15fA88F1106e23Bfc20E8d4D97477b49463c2c77"; // ARCFUN_SWAP_VAULT_ADDRESS
  
  const eurc = await ethers.getContractAt("IERC20", EURC_ADDRESS);
  const [signer] = await ethers.getSigners();
  
  const balance = await eurc.balanceOf(signer.address);
  console.log("Signer EURC Balance:", ethers.formatUnits(balance, 6));

  const vaultBal = await eurc.balanceOf(VAULT_ADDRESS);
  console.log("Vault EURC Balance:", ethers.formatUnits(vaultBal, 6));

  const amountToTransfer = ethers.parseUnits("10000", 6);
  if (balance >= amountToTransfer) {
    console.log("Transferring 10,000 EURC to vault...");
    const tx = await eurc.transfer(VAULT_ADDRESS, amountToTransfer);
    await tx.wait();
    console.log("Transfer complete!");
  } else {
    console.log("Not enough EURC to transfer.");
  }
}

main().catch(console.error);
