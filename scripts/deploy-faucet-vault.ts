import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * deploy-faucet-vault.ts
 * Deploys ArcFunFaucetVault to the target network and records the address.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-faucet-vault.ts --network arc_testnet
 *   npx hardhat run scripts/deploy-faucet-vault.ts --network sepolia
 *   npx hardhat run scripts/deploy-faucet-vault.ts --network base_sepolia
 *   ... and so on for each supported chain.
 */

// Known token addresses per network (for auto-whitelisting post-deploy)
const ASSET_WHITELIST: Record<string, string[]> = {
  arc_testnet:       ["0x3600000000000000000000000000000000000000", "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"],
  sepolia:           ["0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"],
  base_sepolia:      ["0x036CbD53842c5426634e7929541eC2318f3dCF7e", "0x808456652fdb597867f38412077A9182bf77359F"],
  arbitrum_sepolia:  ["0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"],
  monad_testnet:     ["0x534b2f3A21130d7a60830c2Df862319e593943A3"],
  sonic_testnet:     ["0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51"],
  unichain_sepolia:  ["0x31d0220469e10c4E71834a79b1f276d740d3768F"],
  ink_sepolia:       ["0xFabab97dCE620294D2B0b0e46C68964e326300Ac"],
  linea_sepolia:     ["0xFEce4462D57bD51A6A552365A011b95f0E16d9B7"],
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = process.env.HARDHAT_NETWORK || "unknown";

  console.log(`Deploying ArcFunFaucetVault on ${networkName} (chainId: ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const Factory = await ethers.getContractFactory("ArcFunFaucetVault");
  const vault = await Factory.deploy(deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`ArcFunFaucetVault deployed: ${vaultAddress}`);

  // Auto-whitelist known assets for this network
  const assetsToWhitelist = ASSET_WHITELIST[networkName] || [];
  if (assetsToWhitelist.length > 0) {
    console.log("Whitelisting known assets...");
    for (const asset of assetsToWhitelist) {
      const tx = await (vault as any).toggleAsset(asset, true);
      await tx.wait();
      console.log(`  Whitelisted: ${asset}`);
    }
  }

  // Persist address to a registry JSON file for frontend consumption
  const registryPath = path.join(__dirname, "../src/config/faucet-vault-registry.json");
  let registry: Record<string, string> = {};
  if (fs.existsSync(registryPath)) {
    registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  }
  registry[networkName] = vaultAddress;
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  console.log(`Registry updated: ${registryPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
