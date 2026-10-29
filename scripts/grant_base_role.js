const { ethers } = require("ethers");
require("dotenv").config({ path: ".env.local" });

async function main() {
    const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
    const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

    const SETTLEMENT_ADDRESS = "0xe3b60781058C2dD5c2f9Fd26fEE82dF73201f60B";

    const ABI = [
        "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
        "function grantRole(bytes32, address)"
    ];

    const contract = new ethers.Contract(SETTLEMENT_ADDRESS, ABI, wallet);
    const adminRole = await contract.DEFAULT_ADMIN_ROLE();
    const targetWallet = "0xd448777940dFaBF65FD259fA8a9903e60E1FF178";

    console.log(`Granting DEFAULT_ADMIN_ROLE to ${targetWallet} on Base Sepolia...`);
    const tx = await contract.grantRole(adminRole, targetWallet);
    await tx.wait();
    console.log("Granted successfully.");
}

main().catch(console.error);
