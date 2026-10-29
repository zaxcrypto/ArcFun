export class UnsupportedDomainError extends Error {
    constructor(domain: any) {
        super(`UnsupportedDomainError: Domain ${domain} is not supported for execution.`);
        this.name = 'UnsupportedDomainError';
    }
}

/**
 * Routes cross-chain bridge execution requests to the correct 
 * chain-specific adapter based on the destination domain ID.
 * Keeps the Recovery Engine completely chain-agnostic.
 */
export class ChainRouter {
    /**
     * Executes the final CCTP mint/claim transaction on the destination chain.
     */
    static async executeMint(destinationDomain: number, message: string, attestation: string, destinationChainName?: string): Promise<string> {
        if (typeof destinationDomain !== 'number' || isNaN(destinationDomain) || destinationDomain < 0) {
            throw new UnsupportedDomainError(destinationDomain);
        }

        if (destinationDomain === 27) {
            // Domain 27: Stellar
            const { StellarAdapter } = await import('./stellar-adapter');
            return await StellarAdapter.submitMint(message, attestation);
        } else if (destinationDomain === 5) {
            // Domain 5: Solana
            (process.env.NODE_ENV === "development" ? console.log : () => {})(`[ChainRouter] Routing to Solana Adapter for domain ${destinationDomain}`);
            const { SolanaAdapter } = await import('./solana-adapter');
            return await SolanaAdapter.submitMint(destinationDomain, message, attestation, destinationChainName);
        } else if (destinationDomain === 8) {
            // Domain 8: Sui Testnet
            (process.env.NODE_ENV === "development" ? console.log : () => {})(`[ChainRouter] Routing to Sui Adapter for domain ${destinationDomain}`);
            const { SuiAdapter } = await import('./sui-adapter');
            return await SuiAdapter.submitMint(message, attestation, destinationChainName);
        } else if ([0, 1, 2, 3, 6, 7, 10, 11, 13, 15, 19, 21, 26, 29, 37].includes(destinationDomain)) {
            // Domain 0, 1, 2, 3, 6, 7, 10, 11, 13, 15, 19, 21, 26, 29, 37: EVM Chains
            (process.env.NODE_ENV === "development" ? console.log : () => {})(`[ChainRouter] Routing to EVM Adapter for domain ${destinationDomain}`);
            const { EvmAdapter } = await import('./evm-adapter');
            return await EvmAdapter.submitMint(destinationDomain, message, attestation, destinationChainName);
        } else {
            throw new UnsupportedDomainError(destinationDomain);
        }
    }
}
