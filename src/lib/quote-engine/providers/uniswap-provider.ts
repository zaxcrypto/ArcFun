import {
  IQuoteProvider,
  ArcFunRoute,
  QuoteRequestParams,
  ProviderCapabilities,
  ProviderHealth
} from "../types";

export class UniswapProvider implements IQuoteProvider {
  // Fetching via internal backend to protect API key
  private readonly QUOTE_API_URL = "/api/swap/quote";
  private readonly EXECUTE_API_URL = "/api/swap/execute";

  // The official Uniswap Trade API supports these chains based on their validation schemas.
  private readonly supportedChains = new Set([
    1, 10, 137, 42161, 56, 8453, 43114, 42220, 324, 11155111, 
    84532, 1301, 480, 130, 1868, 143, 196, 59144, 4326, 4217, 
    4663, 5042, 57073
  ]);

  getProviderId(): string {
    return "uniswap";
  }

  getCapabilities(): ProviderCapabilities {
    return {
      sameChain: true,
      crossChain: false, // Uniswap API primarily handles single-chain routing (UniswapX cross-chain is via different endpoints/beta)
      swap: true,
      bridge: false,
      approval: true,
      permit2: true,     // Officially integrated with Permit2
      nativeWrap: true
    };
  }

  async getHealthStatus(): Promise<ProviderHealth> {
    // In a full production implementation, we'd ping a lightweight endpoint or track rolling averages.
    // Assuming healthy if the class is instantiated.
    return {
      status: "Healthy",
      latencyMs: 150,
      successRatePercent: 99.9
    };
  }

  supports(params: QuoteRequestParams): boolean {
    // Uniswap Trade API only handles same-chain swaps
    if (params.fromChainId !== params.toChainId) {
      return false;
    }
    // Check if the chain is officially supported
    if (!this.supportedChains.has(params.fromChainId)) {
      return false;
    }
    return true;
  }

  async getQuote(params: QuoteRequestParams): Promise<ArcFunRoute | null> {
    const { fetchWithRetry } = await import('../utils');

    try {
      // 1. Build a minimal request payload. Extra params cause ResourceNotFound on V4/Robinhood
      let slippage = 0.5; // Default to 0.5%
      if (params.slippageTolerance !== undefined) {
        // If frontend passes a decimal like 0.05 (for 5%), convert it to 5.0 for the API
        slippage = params.slippageTolerance <= 1 ? params.slippageTolerance * 100 : params.slippageTolerance;
      }

      const requestBody = {
        amount: params.fromAmount,
        tokenInChainId: params.fromChainId,
        tokenOutChainId: params.toChainId,
        tokenIn: params.fromTokenAddress,
        tokenOut: params.toTokenAddress,
        swapper: params.userAddress,
        type: "EXACT_INPUT",
        slippageTolerance: slippage
      };

      // 2. Fetch from the secure backend API
      const response = await fetchWithRetry(this.QUOTE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (data.errorCode) {
        if (data.errorCode === "ResourceNotFound" || data.detail?.includes("No quotes")) {
          // This happens when there is no liquidity for the pair
          console.warn("Uniswap Trade API - Resource Not Found:", JSON.stringify({
            request: requestBody,
            response: data
          }, null, 2));
          return null;
        }
        throw new Error(`Uniswap API Error: ${data.detail || data.errorCode}`);
      }

      // 3. Normalize the API response into the universal ArcFunRoute format
      const quoteData = data.quote;
      
      // Determine the path from the multi-hop route array
      const routePath: string[] = [];
      let steps = 0;
      if (quoteData.route && quoteData.route.length > 0) {
        // Flatten the multi-hop pools to get unique symbols
        const uniqueSymbols = new Set<string>();
        quoteData.route.forEach((pathSegment: any) => {
          pathSegment.forEach((pool: any) => {
            if (pool.tokenIn?.symbol) uniqueSymbols.add(pool.tokenIn.symbol);
            if (pool.tokenOut?.symbol) uniqueSymbols.add(pool.tokenOut.symbol);
            steps++;
          });
        });
        routePath.push(...Array.from(uniqueSymbols));
      }

      // Map expected output and minimums
      // The API returns the amount out in raw wei
      const toAmount = quoteData.output?.amount || "0";
      
      // Calculate slippage impact based on the quote configuration
      const slippagePercent = parseFloat(quoteData.slippage || "0.005");
      
      // Uniswap doesn't return `toAmountMin` natively at the root in exact_input sometimes, 
      // but it handles it inside the calldata. We estimate it purely for the UI display.
      const toAmountMin = quoteData.output?.minimumAmount || (
        (BigInt(toAmount) * BigInt(Math.floor((1 - slippagePercent/100) * 10000))) / 10000n
      ).toString();

      const priceImpactPercent = parseFloat(quoteData.priceImpact || "0");
      const gasCostUSD = parseFloat(quoteData.gasFeeUSD || "0");
      
      // Convert output USD to number for scoring
      const toAmountUSD = parseFloat(quoteData.output?.amountUSD || "0"); // optional if present

      return {
        id: `uniswap-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        providerId: this.getProviderId(),
        providerName: "Uniswap",
        providerLogoUrl: "/icons/uniswap.svg", // We will need to ensure this icon exists
        fromAmount: params.fromAmount,
        toAmount,
        toAmountMin,
        toAmountUSD,
        gasCostUSD,
        bridgeFeeUSD: 0, // Swap only
        platformFeeUSD: 0, // No extra fees
        estimatedTimeSeconds: 15, // Single chain swap usually ~1 block
        priceImpactPercent,
        slippagePercent,
        routePath,
        steps,
        isCrossChain: false,
        score: 0, // Will be populated by the Scoring Engine
        badges: [],
        riskLevel: priceImpactPercent > 5 ? "High Price Impact" : "Safe",
        
        
        allowanceTarget: data.permitData?.domain?.verifyingContract || "0x000000000022d473030f116ddee9f6b43ac78ba3", 
        isTokenApprovalApplicable: data.isTokenApprovalApplicable,
        permitData: data.permitData,
        
        fetchedAt: Date.now(),
        expiresAt: Date.now() + 60 * 1000 * 5, // 5 minute Quote TTL
        
        rawPayload: { ...data, originalParams: params } // Keep the entire raw payload + original params for auto-refresh
      };
    } catch (error) {
      console.error("UniswapProvider getQuote failed:", error);
      return null;
    }
  }

  async getExecutionPayload(quote: ArcFunRoute, signature?: string): Promise<{ to: string, data: string, value: string }> {
    const { fetchWithRetry } = await import('../utils');
    const requestBody: any = {
      quote: quote.rawPayload.quote
    };
    
    if (quote.permitData && signature) {
      requestBody.permitData = quote.permitData;
      requestBody.signature = signature;
    }

    const response = await fetchWithRetry(this.EXECUTE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Uniswap /swap execution failed: ${err}`);
    }

    const data = await response.json();
    if (!data.swap) {
      throw new Error('API did not return a valid swap execution payload.');
    }

    return {
      to: data.swap.to,
      data: data.swap.data,
      value: data.swap.value
    };
  }
}
