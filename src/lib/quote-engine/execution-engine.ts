import { createPublicClient, createWalletClient, custom, http, parseAbi } from 'viem';
import { ArcFunRoute } from './types';
import { arcFunQuoteEngine } from './index';

export class ExecutionEngine {
  /**
   * Executes a normalized ArcFunRoute using the completely abstracted provider logic.
   * Lifecycle: Quote Expiry Check -> Permit2 (if required) -> Swap -> Simulation -> Broadcast
   */
  async executeRoute(
    route: ArcFunRoute,
    publicClient: ReturnType<typeof createPublicClient>,
    walletClient: ReturnType<typeof createWalletClient>,
    callbacks?: {
      onApprovalRequested?: () => void;
      onApprovalSuccess?: () => void;
      onSignatureRequested?: () => void;
      onSignatureSuccess?: () => void;
      onExecutionRequested?: () => void;
    }
  ) {
    const account = walletClient.account;
    if (!account) throw new Error("Wallet not connected");

    let currentRoute = route;

    // Phase 1: Quote Expiry Check & Auto-Refresh
    if (Date.now() > currentRoute.expiresAt) {
      if (callbacks?.onExecutionRequested) callbacks.onExecutionRequested(); // Notify UI that we are working
      const originalParams = currentRoute.rawPayload?.originalParams;
      if (!originalParams) {
        throw new Error("Quote has expired and auto-refresh is unavailable. Please restart the swap.");
      }
      
      const providerObj = arcFunQuoteEngine.getProvider(currentRoute.providerId);
      if (!providerObj) throw new Error("Quote expired and provider lost.");
      
      const refreshedRoute = await providerObj.getQuote(originalParams);
      if (!refreshedRoute) {
        throw new Error("Quote expired and auto-refresh failed to find liquidity.");
      }
      currentRoute = refreshedRoute;
    }

    const provider = arcFunQuoteEngine.getProvider(currentRoute.providerId);
    if (!provider || !provider.getExecutionPayload) {
      throw new Error(`Execution Engine Error: Provider [${currentRoute.providerId}] is not registered or lacks execution capabilities.`);
    }

    let signature = undefined;

    // Phase 2: Permit2 / Approval Handling
    if (currentRoute.isTokenApprovalApplicable) {
      if (currentRoute.permitData) {
        // EIP-712 Permit2 Flow
        const permit2Address = currentRoute.permitData.domain.verifyingContract;
        const tokenAddress = currentRoute.rawPayload?.quote?.input?.token || currentRoute.rawPayload?.tokenIn;
        
        if (tokenAddress) {
          // 1. Check ERC20 Allowance to Permit2 Contract
          const allowance = await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: parseAbi(['function allowance(address owner, address spender) view returns (uint256)']),
            functionName: 'allowance',
            args: [account.address, permit2Address]
          });

          const amountToSwap = BigInt(currentRoute.fromAmount);
          
          if (allowance < amountToSwap) {
            if (callbacks?.onApprovalRequested) callbacks.onApprovalRequested();
            
            // Approve Permit2 Contract (MaxUint256)
            const { request } = await publicClient.simulateContract({
              account,
              address: tokenAddress as `0x${string}`,
              abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
              functionName: 'approve',
              args: [permit2Address, 115792089237316195423570985008687907853269984665640564039457584007913129639935n]
            });
            
            const approveHash = await walletClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash: approveHash });
            
            if (callbacks?.onApprovalSuccess) callbacks.onApprovalSuccess();
          }
        }

        // Fetch true on-chain Permit2 nonce to avoid stale API indexer issues on testnets
        if (tokenAddress && currentRoute.permitData.values?.spender) {
          try {
            const permit2Data = await publicClient.readContract({
              address: permit2Address as `0x${string}`,
              abi: parseAbi(['function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)']),
              functionName: 'allowance',
              args: [account.address, tokenAddress as `0x${string}`, currentRoute.permitData.values.spender as `0x${string}`]
            });
            const trueNonce = permit2Data[2];
            currentRoute.permitData.values.details.nonce = trueNonce.toString();
          } catch (e) {
            console.error("Failed to fetch on-chain Permit2 nonce:", e);
          }
        }

        // Normalize types for wagmi/viem
        const types = { ...currentRoute.permitData.types };
        if (types.EIP712Domain) delete types.EIP712Domain;
        const primaryType = Object.keys(types).find(t => t.startsWith('Permit')) || 'PermitSingle';

        // Deep clone and safely cast values for viem
        const valuesToSign = JSON.parse(JSON.stringify(currentRoute.permitData.values));
        if (valuesToSign.details) {
          valuesToSign.details.amount = BigInt(valuesToSign.details.amount);
          valuesToSign.details.expiration = Number(valuesToSign.details.expiration);
          valuesToSign.details.nonce = Number(valuesToSign.details.nonce);
        }
        valuesToSign.sigDeadline = BigInt(valuesToSign.sigDeadline);

        signature = await walletClient.signTypedData({
          account,
          domain: currentRoute.permitData.domain,
          types: types,
          primaryType: primaryType as string,
          message: valuesToSign
        });

        if (callbacks?.onSignatureSuccess) callbacks.onSignatureSuccess();
      } else if (currentRoute.allowanceTarget) {
        // Standard ERC-20 Approve Flow
        if (callbacks?.onApprovalRequested) callbacks.onApprovalRequested();
        
        const tokenAddress = currentRoute.rawPayload?.quote?.input?.token || currentRoute.rawPayload?.tokenIn;
        if (tokenAddress) {
          const allowance = await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: parseAbi(['function allowance(address owner, address spender) view returns (uint256)']),
            functionName: 'allowance',
            args: [account.address, currentRoute.allowanceTarget as `0x${string}`]
          });

          if (allowance < BigInt(currentRoute.fromAmount)) {
            const approveHash = await walletClient.writeContract({
              account,
              address: tokenAddress as `0x${string}`,
              abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
              functionName: 'approve',
              args: [currentRoute.allowanceTarget as `0x${string}`, 115792089237316195423570985008687907853269984665640564039457584007913129639935n],
              chain: walletClient.chain
            });
            await publicClient.waitForTransactionReceipt({ hash: approveHash });
          }
        }
        
        if (callbacks?.onApprovalSuccess) callbacks.onApprovalSuccess();
      }
    }

    // Phase 3: Fetch Final Calldata (/swap execution)
    const txRequest = await provider.getExecutionPayload(currentRoute, signature);

    if (!txRequest || !txRequest.data) {
      throw new Error("Execution Failed: Provider did not return executable calldata.");
    }

    const payloadToSimulate = {
      to: txRequest.to as `0x${string}`,
      data: txRequest.data as `0x${string}`,
      value: BigInt(txRequest.value || '0')
    };

    // Phase 4: Pre-flight Simulation (Removed)
    // We intentionally skip publicClient.call() here because walletClient.sendTransaction() 
    // will natively call eth_estimateGas. If eth_estimateGas fails (e.g. due to slippage), 
    // the wallet will handle it or viem will throw a clear EstimateGasExecutionError.

    // Phase 5: Broadcast Execution
    if (callbacks?.onExecutionRequested) callbacks.onExecutionRequested();
    
    let txHash: `0x${string}`;
    try {
      txHash = await walletClient.sendTransaction({
        account,
        to: payloadToSimulate.to,
        data: payloadToSimulate.data,
        value: payloadToSimulate.value,
        chain: walletClient.chain
      });
    } catch (error: any) {
      console.error("Broadcast/Estimation Revert:", error);
      if (error.message?.includes("revert")) {
        throw new Error("Transaction is expected to fail on-chain (likely due to high Slippage or price movement). Please refresh the quote and try again.");
      }
      throw error;
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    
    return {
      transactionHash: receipt.transactionHash,
      status: receipt.status === 'success' ? 'SUCCESS' : 'REVERTED',
      receipt
    };
  }
}
