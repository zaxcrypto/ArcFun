export const PRIMARY_SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const FALLBACK_SOLANA_RPC = "https://api.devnet.solana.com";

/**
 * Executes a given operation using the primary RPC.
 * If it fails, times out, or returns invalid data, it automatically retries with the fallback RPC.
 */
export async function withSolanaFailover<T>(
  operation: (rpcUrl: string) => Promise<T>,
  context: string = "RPC Operation"
): Promise<T> {
  try {
    return await operation(PRIMARY_SOLANA_RPC);
  } catch (error) {
    console.warn(`[Solana RPC Failover] ${context} failed on primary RPC. Retrying with fallback...`, error);
    try {
      return await operation(FALLBACK_SOLANA_RPC);
    } catch (fallbackError) {
      console.error(`[Solana RPC Failover] ${context} failed on fallback RPC as well.`, fallbackError);
      throw fallbackError;
    }
  }
}
