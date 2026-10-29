import { ethers } from "hardhat";
import hre from "hardhat";
import * as fs from "fs";

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY!;

const CHAINS = {
  sepolia: {
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    EURC: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4"
  },
  base_sepolia: {
    rpc: "https://sepolia.base.org",
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    EURC: "0x808456652fdd4740268597379ee0531c0ee154b9"
  },
  arbitrum_sepolia: {
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    USDC: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    EURC: "0x0000000000000000000000000000000000000000" // We might not have EURC here
  }
};

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

async function main() {
  const deployments = JSON.parse(fs.readFileSync("deployments.json", "utf-8"));
  
  for (const [name, addr] of Object.entries(deployments)) {
    console.log(`\n===========================================`);
    console.log(`Funding ${name} Settlement at ${addr}`);
    const chain = (CHAINS as any)[name];
    if (!chain) continue;

    const provider = new ethers.JsonRpcProvider(chain.rpc, undefined, { staticNetwork: true });
    const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

    // USDC
    try {
      const usdc = new ethers.Contract(chain.USDC, ERC20_ABI, wallet);
      const dec = await usdc.decimals();
      const bal = await usdc.balanceOf(wallet.address);
      console.log(`Wallet USDC Balance: ${ethers.formatUnits(bal, dec)}`);
      
      const setBal = await usdc.balanceOf(addr);
      console.log(`Settlement USDC Balance: ${ethers.formatUnits(setBal, dec)}`);

      if (bal > 0n) {
        // Send 10 USDC for test
        const amount = ethers.parseUnits("10", dec);
        if (bal >= amount) {
           console.log(`Sending 10 USDC to settlement...`);
           const tx = await usdc.transfer(addr as string, amount);
           await tx.wait(1);
           console.log(`✅ Funded USDC`);
        } else {
           console.log(`⚠️  Not enough USDC to fund 10.`);
        }
      }
    } catch(e: any) {
      console.log(`❌ Failed USDC: ${e.message}`);
    }

    // EURC
    if (chain.EURC !== "0x0000000000000000000000000000000000000000") {
      try {
        const eurc = new ethers.Contract(chain.EURC, ERC20_ABI, wallet);
        const dec = await eurc.decimals();
        const bal = await eurc.balanceOf(wallet.address);
        console.log(`Wallet EURC Balance: ${ethers.formatUnits(bal, dec)}`);
        
        if (bal > 0n) {
          const amount = ethers.parseUnits("10", dec);
          if (bal >= amount) {
             console.log(`Sending 10 EURC to settlement...`);
             const tx = await eurc.transfer(addr as string, amount);
             await tx.wait(1);
             console.log(`✅ Funded EURC`);
          } else {
             console.log(`⚠️  Not enough EURC to fund 10.`);
          }
        }
      } catch(e: any) {
        console.log(`❌ Failed EURC: ${e.message}`);
      }
    }
  }
}
main().catch(console.error);
