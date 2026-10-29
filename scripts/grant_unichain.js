const { ethers } = require("ethers");
require("dotenv").config({ path: ".env.local" });

const UNICHAIN_RPC = "https://sepolia.unichain.org";
const SETTLEMENT_ADDRESS = "0x9D620fD3bE140f1C227876CCF208c8Bd5E11d5a4";

async function main() {
    const provider = new ethers.JsonRpcProvider(UNICHAIN_RPC);
    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

    const checkRoleAbi = [
      "function grantRole(bytes32,address)",
      "function SETTLEMENT_SIGNER_ROLE() view returns (bytes32)"
    ];

    const settle = new ethers.Contract(SETTLEMENT_ADDRESS, checkRoleAbi, wallet);
    const role = await settle.SETTLEMENT_SIGNER_ROLE();

    console.log("Granting role on Unichain...");
    const tx = await settle.grantRole(role, wallet.address);
    await tx.wait();
    console.log("Granted!");
}
main().catch(console.error);
