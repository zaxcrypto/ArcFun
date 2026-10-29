// Defines the minimum amount of asset that must remain in the wallet for network operations/fees.
// Spendable Balance = Actual Balance - Network Reserve

export const NETWORK_RESERVES: Record<string, number> = {
  'ARC-TESTNET': 0.05,
  'SOL-DEVNET': 0.005,
  'SOLANA-DEVNET': 0.005,
  'ETH-SEPOLIA': 0.00, // Customize as needed for future networks
  'BASE': 0.00
};

export function getNetworkReserve(blockchain: string): number {
  if (!blockchain) return 0;
  let normalized = blockchain.toUpperCase().replace(/\s+/g, '-');
  return NETWORK_RESERVES[normalized] ?? 0;
}

export function calculateSpendableBalance(balance: number | string, blockchain: string, isGasToken = true): number {
  const numBalance = typeof balance === 'string' ? parseFloat(balance) : balance;
  if (isNaN(numBalance)) return 0;
  
  if (!isGasToken) return numBalance;
  const reserve = getNetworkReserve(blockchain);
  const spendable = numBalance - reserve;
  return spendable > 0 ? spendable : 0;
}
