import { SUI_CCTP_TESTNET_CONFIG, SUI_CCTP_MAINNET_CONFIG } from "./sui-cctp-config";

/**
 * Fetches the user's USDC balance on Sui (Testnet or Mainnet).
 *
 * Uses the official Mysten Labs Sui GraphQL API (https://graphql.testnet.sui.io/graphql)
 * as the primary source of truth, because Sui v1.82+ deprecated JSON-RPC on public fullnodes
 * and Alchemy endpoints.
 *
 * Automatically checks for:
 * 1. Official Circle CCTP USDC coin type
 * 2. Alternate/faucet USDC coin types on Sui
 * 3. Graceful fallback to legacy JSON-RPC if available
 */
export async function fetchSuiUsdcBalance(
  ownerAddress: string,
  chainName: string = "Sui Testnet"
): Promise<{ balance: bigint; decimals: number }> {
  if (!ownerAddress) return { balance: 0n, decimals: 6 };

  const isMainnet = chainName.toLowerCase().includes("mainnet");
  const gqlEndpoint = isMainnet
    ? "https://graphql.mainnet.sui.io/graphql"
    : "https://graphql.testnet.sui.io/graphql";

  const targetCoinType = isMainnet
    ? SUI_CCTP_MAINNET_CONFIG.usdcCoinType
    : SUI_CCTP_TESTNET_CONFIG.usdcCoinType;

  // 1. Primary Strategy: Official Sui GraphQL API
  try {
    const query = {
      query: `
        query GetAddressBalances($address: SuiAddress!) {
          address(address: $address) {
            balances {
              nodes {
                coinType {
                  repr
                }
                totalBalance
              }
            }
          }
        }
      `,
      variables: { address: ownerAddress }
    };

    const res = await fetch(gqlEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query)
    });

    if (res.ok) {
      const json = await res.json();
      const nodes = json?.data?.address?.balances?.nodes;
      if (Array.isArray(nodes)) {
        // Priority A: Exact Circle CCTP USDC coin type
        const exactMatch = nodes.find(
          (n: any) => n?.coinType?.repr?.toLowerCase() === targetCoinType.toLowerCase()
        );
        if (exactMatch && exactMatch.totalBalance !== undefined) {
          return { balance: BigInt(exactMatch.totalBalance), decimals: 6 };
        }

        // Priority B: Any token matching USDC
        const anyUsdcMatch = nodes.find(
          (n: any) => n?.coinType?.repr?.toLowerCase()?.includes("usdc")
        );
        if (anyUsdcMatch && anyUsdcMatch.totalBalance !== undefined) {
          return { balance: BigInt(anyUsdcMatch.totalBalance), decimals: 6 };
        }

        return { balance: 0n, decimals: 6 };
      }
    }
  } catch (gqlErr) {
    console.warn("[SuiBalance] GraphQL fetch failed, trying JSON-RPC fallback:", gqlErr);
  }

  // 2. Fallback Strategy: JSON-RPC (for private nodes or custom fullnodes)
  const rpcEndpoints = [
    process.env.NEXT_PUBLIC_SUI_RPC_URL,
    isMainnet ? "https://fullnode.mainnet.sui.io:443" : "https://fullnode.testnet.sui.io:443"
  ].filter(Boolean) as string[];

  for (const rpcUrl of rpcEndpoints) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "suix_getBalance",
          params: [ownerAddress, targetCoinType]
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.result?.totalBalance !== undefined) {
          return { balance: BigInt(data.result.totalBalance), decimals: 6 };
        }
      }
    } catch {}
  }

  return { balance: 0n, decimals: 6 };
}
