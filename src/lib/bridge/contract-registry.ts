/**
 * Contract Address Registry
 * 
 * Centralized mapping of all smart contract addresses used across 
 * various chains and environments. Prevents hardcoding of addresses
 * inside UI or business logic components, enabling seamless upgrades.
 */

export type Environment = "development" | "testnet" | "mainnet";
export type ContractStatus = "active" | "deprecated" | "paused";

export interface ContractRegistration {
  chain: string;            // e.g. "Arc Testnet", "Ethereum Sepolia"
  contractName: string;     // e.g. "Swap Contract", "Bridge Contract", "Liquidity Vault"
  address: string;          // 0x...
  version: string;          // e.g. "v1.0.0"
  status: ContractStatus;
  environment: Environment;
}

export class ContractRegistry {
  private static contracts: ContractRegistration[] = [
    // Pre-populated examples based on requirements
    {
      chain: "Arc Testnet",
      contractName: "Swap Contract",
      address: "0x0000000000000000000000000000000000000000", // Placeholder
      version: "v1.0.0",
      status: "paused", // Initialized as paused for safety
      environment: "testnet"
    },
    {
      chain: "Arc Testnet",
      contractName: "Bridge Contract",
      address: "0x0000000000000000000000000000000000000000", // Placeholder
      version: "v1.0.0",
      status: "paused",
      environment: "testnet"
    },
    {
      chain: "Ethereum Sepolia",
      contractName: "Liquidity Vault",
      address: "0x0000000000000000000000000000000000000000", // Placeholder
      version: "v1.0.0",
      status: "paused",
      environment: "testnet"
    }
  ];

  /**
   * Retrieves an active contract address for a specific chain and service.
   * Throws if no active contract is found.
   */
  static getAddress(chain: string, contractName: string, env: Environment = "testnet"): string {
    const contract = this.contracts.find(c => 
      c.chain === chain && 
      c.contractName === contractName && 
      c.environment === env &&
      c.status === "active"
    );

    if (!contract) {
      throw new Error(`No active ${contractName} found on ${chain} for ${env}`);
    }

    return contract.address;
  }

  /**
   * (Admin) Updates a contract registration or adds a new one (Contract Upgrades).
   */
  static updateRegistration(registration: ContractRegistration): void {
    const existingIndex = this.contracts.findIndex(c => 
      c.chain === registration.chain && 
      c.contractName === registration.contractName &&
      c.environment === registration.environment
    );

    if (existingIndex !== -1) {
      // If upgrading, deprecate the old one and add new (simplified logic here)
      this.contracts[existingIndex] = registration;
    } else {
      this.contracts.push(registration);
    }
  }

  /**
   * Fetches all registered contracts (for Admin Panel display).
   */
  static getAllRegistrations(): ContractRegistration[] {
    return [...this.contracts];
  }
}
