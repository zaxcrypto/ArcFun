import { ethers } from "hardhat";

async function main() {
  const factoryAddress = "0x31F11b7456b2e15F91642B75dAdC0e69c5AAFAFa";
  const factory = await ethers.getContractAt("ArcFunCurveFactory", factoryAddress);

  const total = await factory.totalLaunches();
  console.log("Total Launches on Sepolia Factory:", total.toString());

  for (let i = 0n; i < total; i++) {
    const tokenAddr = await factory.allTokens(i);
    const curveAddr = await factory.getCurve(tokenAddr);
    const token = await ethers.getContractAt("ArcFunMemeToken", tokenAddr);
    const name = await token.name();
    const symbol = await token.symbol();
    console.log(`Launch #${i}: Address=${tokenAddr}, Symbol=${symbol}, Name=${name}, Curve=${curveAddr}`);
  }
}

main().catch(console.error);
