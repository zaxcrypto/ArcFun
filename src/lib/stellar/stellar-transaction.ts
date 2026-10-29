import { Keypair, TransactionBuilder, Networks, Horizon, Account } from '@stellar/stellar-sdk';
import { stellarRpcManager } from './stellar-rpc';

/**
 * Enterprise-grade Stellar Transaction Manager.
 * Safely handles transaction building, signing, atomic sequence caching, 
 * and robust retry logic for transient Horizon failures and tx_bad_seq errors.
 */
export class StellarTransactionManager {
    private sequenceCache: Map<string, bigint> = new Map();
    private lock: Promise<void> = Promise.resolve();

    /**
     * Atomically fetches and increments the sequence number to allow
     * highly concurrent transaction submissions without `tx_bad_seq`.
     */
    async getNextSequence(publicKey: string, server: Horizon.Server): Promise<string> {
        let release: () => void;
        const nextLock = new Promise<void>(resolve => { release = resolve; });
        const currentLock = this.lock;
        this.lock = this.lock.then(() => nextLock);

        await currentLock;

        try {
            let seq = this.sequenceCache.get(publicKey);
            if (!seq) {
                const account = await server.loadAccount(publicKey);
                seq = BigInt(account.sequence);
            }
            seq = seq + 1n; 
            this.sequenceCache.set(publicKey, seq);
            return seq.toString();
        } finally {
            release!();
        }
    }

    resetSequence(publicKey: string) {
        this.sequenceCache.delete(publicKey);
    }

    /**
     * Submits a constructed transaction, retrying automatically on sequence race conditions
     * or 504 timeouts.
     */
    async submitTransaction(keypair: Keypair, operations: any[], fee: string = "1000"): Promise<any> {
        const { server } = await stellarRpcManager.getHorizonServer();
        const publicKey = keypair.publicKey();
        
        let success = false;
        let response = null;
        let retries = 3;

        while (!success && retries > 0) {
            try {
                const nextSeq = await this.getNextSequence(publicKey, server);
                const currentSeq = (BigInt(nextSeq) - 1n).toString();
                const account = new Account(publicKey, currentSeq);
                
                const txBuilder = new TransactionBuilder(account, {
                    fee,
                    networkPassphrase: Networks.TESTNET // Note: Production env variables should determine this
                });

                for (const op of operations) {
                    txBuilder.addOperation(op);
                }

                txBuilder.setTimeout(30);
                const tx = txBuilder.build();
                tx.sign(keypair);

                response = await server.submitTransaction(tx);
                success = true;
            } catch (e: any) {
                if (e.response?.data?.extras?.result_codes?.transaction === 'tx_bad_seq') {
                    console.warn(`[StellarTransaction] tx_bad_seq encountered. Resetting sequence and retrying...`);
                    this.resetSequence(publicKey);
                    retries--;
                } else if (e.response?.status === 504) {
                    console.warn(`[StellarTransaction] 504 Timeout encountered. Retrying...`);
                    retries--;
                } else {
                    console.error("[StellarTransaction] Unknown Tx Error:", e.response?.data || e);
                    throw e;
                }
            }
        }
        
        if (!success) {
            throw new Error("Transaction failed after retries due to sequence or timeout issues.");
        }
        
        return response;
    }
}

export const stellarTransactionManager = new StellarTransactionManager();
