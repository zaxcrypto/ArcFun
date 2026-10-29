import { rpc, Horizon, Contract, Address, Account, TransactionBuilder, Networks, BASE_FEE, scValToNative } from '@stellar/stellar-sdk';

export const STELLAR_SOROBAN_PROVIDERS = [
    process.env.NEXT_PUBLIC_STELLAR_RPC_URL || process.env.STELLAR_RPC_URL || "https://stellar-testnet.g.alchemy.com/v2/Vt9_fvDipTI7hEZdMc950",
    ...(process.env.NEXT_PUBLIC_STELLAR_RPC_FALLBACK_URL || process.env.STELLAR_RPC_FALLBACK_URL ? [process.env.NEXT_PUBLIC_STELLAR_RPC_FALLBACK_URL || process.env.STELLAR_RPC_FALLBACK_URL!] : []),
    "https://soroban-testnet.stellar.org",
].filter((url, i, arr) => arr.indexOf(url) === i);

export const STELLAR_HORIZON_PROVIDERS = [
    process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
];

export const USDC_SOROBAN_CONTRACT = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
export const USDC_STELLAR_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

/**
 * Enterprise-grade Stellar RPC Manager.
 * Supports automated failover for Horizon (REST) and Soroban (RPC).
 */
export class StellarRpcManager {
    private sorobanProviders: string[];
    private horizonProviders: string[];
    
    constructor() {
        this.sorobanProviders = [...STELLAR_SOROBAN_PROVIDERS];
        this.horizonProviders = [...STELLAR_HORIZON_PROVIDERS];
    }

    async getSorobanServer(): Promise<{ server: rpc.Server, url: string }> {
        for (const url of this.sorobanProviders) {
            try {
                const server = new rpc.Server(url, { allowHttp: false });
                const health = await server.getHealth();
                if (health.status === 'healthy') {
                    return { server, url };
                }
            } catch (e: any) {
                console.warn(`[StellarRPC] Failed to connect to Soroban provider ${url}:`, e?.message || e);
            }
        }
        throw new Error("All Soroban RPC providers failed.");
    }

    async getHorizonServer(): Promise<{ server: Horizon.Server, url: string }> {
        for (const url of this.horizonProviders) {
            try {
                const server = new Horizon.Server(url);
                await server.root(); 
                return { server, url };
            } catch (e: any) {
                console.warn(`[StellarRPC] Failed to connect to Horizon provider ${url}:`, e?.message || e);
            }
        }
        throw new Error("All Horizon API providers failed.");
    }
}

export const stellarRpcManager = new StellarRpcManager();

/**
 * Robust live Stellar USDC balance fetcher.
 * Uses Alchemy Soroban RPC as primary, with Soroban Testnet and Horizon REST API fallbacks.
 */
export async function fetchLiveStellarUsdcBalance(address: string): Promise<{ balance: bigint; decimals: number; formatted: string }> {
    if (!address) return { balance: 0n, decimals: 7, formatted: "0.00" };

    // 1. Try Soroban RPCs (Alchemy Primary, Official Soroban Fallback)
    for (const url of STELLAR_SOROBAN_PROVIDERS) {
        try {
            const server = new rpc.Server(url, { allowHttp: false });
            const contract = new Contract(USDC_SOROBAN_CONTRACT);
            const dummyAccount = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
            const tx = new TransactionBuilder(dummyAccount, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
                .addOperation(contract.call("balance", new Address(address).toScVal()))
                .setTimeout(30)
                .build();
            const sim: any = await server.simulateTransaction(tx);
            if (sim.result?.retval) {
                const raw = scValToNative(sim.result.retval);
                const bInt = BigInt(raw.toString());
                const num = Number(bInt) / 1e7;
                return { balance: bInt, decimals: 7, formatted: num.toFixed(4) };
            }
            if (sim.error && sim.error.includes("trustline entry is missing")) {
                return { balance: 0n, decimals: 7, formatted: "0.00" };
            }
        } catch (err: any) {
            console.warn(`[StellarRPC] Soroban provider ${url} failed:`, err?.message || err);
        }
    }

    // 2. Fallback to Horizon REST APIs
    for (const hUrl of STELLAR_HORIZON_PROVIDERS) {
        try {
            const horizon = new Horizon.Server(hUrl);
            const account = await horizon.loadAccount(address);
            let usdcStr = "0";
            for (const b of account.balances as any[]) {
                if (b.asset_code === "USDC") {
                    if (b.asset_issuer === USDC_STELLAR_ISSUER || usdcStr === "0") {
                        usdcStr = b.balance;
                    }
                }
            }
            const bInt = BigInt(Math.round(parseFloat(usdcStr || "0") * 1e7));
            return { balance: bInt, decimals: 7, formatted: parseFloat(usdcStr || "0").toFixed(4) };
        } catch (hErr: any) {
            if (hErr.response?.status === 404) {
                return { balance: 0n, decimals: 7, formatted: "0.00" };
            }
            console.warn(`[StellarRPC] Horizon provider ${hUrl} failed:`, hErr?.message || hErr);
        }
    }

    return { balance: 0n, decimals: 7, formatted: "0.00" };
}
