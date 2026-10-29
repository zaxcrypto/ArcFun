import { IQuoteProvider, QuoteRequestParams, ArcFunRoute, ProviderCapabilities, ProviderHealth } from '../types';

export class KyberswapProvider implements IQuoteProvider {
  private readonly QUOTE_API_URL = "/api/swap/kyber/quote";
  private readonly BUILD_API_URL = "/api/swap/kyber/build";
  
  private readonly chainIdMap: Record<number, string> = {
    4663: 'robinhood',
    1: 'ethereum',
    42161: 'arbitrum',
    10: 'optimism',
    8453: 'base',
    137: 'polygon'
  };

  getProviderId(): string { 
    return "kyberswap"; 
  }
  
  getCapabilities(): ProviderCapabilities {
    return {
      sameChain: true,
      crossChain: false,
      swap: true,
      bridge: false,
      approval: true,
      permit2: false,
      nativeWrap: true
    };
  }

  async getHealthStatus(): Promise<ProviderHealth> {
    return { status: 'Healthy', latencyMs: 200, successRatePercent: 100 };
  }

  supports(params: QuoteRequestParams): boolean {
    return params.fromChainId === params.toChainId && !!this.chainIdMap[params.fromChainId];
  }

  async getQuote(params: QuoteRequestParams): Promise<ArcFunRoute | null> {
    const network = this.chainIdMap[params.fromChainId];
    if (!network) {
      throw new Error(`KyberSwap does not support chain ${params.fromChainId}`);
    }

    // Native ETH is represented as 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee in KyberSwap
    const tokenIn = params.fromTokenAddress === '0x0000000000000000000000000000000000000000' 
      ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' 
      : params.fromTokenAddress;
      
    const tokenOut = params.toTokenAddress === '0x0000000000000000000000000000000000000000' 
      ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' 
      : params.toTokenAddress;

    const requestBody = {
      network,
      tokenIn,
      tokenOut,
      amountIn: params.fromAmount
    };

    const { fetchWithRetry } = await import('../utils');
    const response = await fetchWithRetry(this.QUOTE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    if (data.code !== 0 || !data.data || !data.data.routeSummary) {
      throw new Error(`KyberSwap Route Error: ${data.message || 'No route found'}`);
    }

    const routeSummary = data.data.routeSummary;

    const isTokenApprovalApplicable = tokenIn !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

    return {
      id: `kyber-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      providerId: this.getProviderId(),
      providerName: "KyberSwap",
      providerLogoUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/9444.png", // KyberSwap KNC logo
      
      fromAmount: routeSummary.amountIn,
      toAmount: routeSummary.amountOut,
      toAmountMin: (BigInt(routeSummary.amountOut) * BigInt(Math.floor((1 - (params.slippageTolerance || 0.05)) * 10000)) / 10000n).toString(),
      toAmountUSD: parseFloat(routeSummary.amountOutUsd || '0'),
      
      gasCostUSD: parseFloat(routeSummary.gasUsd || '0'),
      bridgeFeeUSD: 0,
      platformFeeUSD: 0,
      
      estimatedTimeSeconds: 5,
      priceImpactPercent: 0, // In a full prod app we might parse this from Kyber
      slippagePercent: (params.slippageTolerance || 0.05) * 100,
      routePath: ["Swap"],
      steps: 1,
      isCrossChain: false,
      
      score: 100,
      badges: ["Optimal", "Aggregator"],
      riskLevel: "Safe",
      
      allowanceTarget: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Universal KyberSwap MetaRouter
      isTokenApprovalApplicable: isTokenApprovalApplicable,
      
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 60 * 1000 * 5,
      
      rawPayload: { ...routeSummary, arcFunUserAddress: params.userAddress, originalParams: params, network }
    };
  }

  async getExecutionPayload(quote: ArcFunRoute, signature?: string): Promise<{ to: string, data: string, value: string }> {
    const routeSummary = quote.rawPayload;
    const tokenIn = routeSummary.tokenIn;
    const network = routeSummary.network;
    const userAddress = routeSummary.arcFunUserAddress;
    
    const requestBody = {
      network,
      routeSummary: routeSummary,
      sender: userAddress,
      recipient: userAddress, 
      slippageTolerance: (quote.slippagePercent || 5) * 100, // KyberSwap expects basis points (e.g., 50 for 0.5%)
      deadline: Math.floor(Date.now() / 1000) + 60 * 20
    };

    const { fetchWithRetry } = await import('../utils');
    const buildResponse = await fetchWithRetry(this.BUILD_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const buildData = await buildResponse.json();
    if (buildData.code !== 0 || !buildData.data) {
      throw new Error(`KyberSwap Build Error: ${buildData.message || 'Failed to build transaction'}`);
    }

    const txData = buildData.data.data;
    const routerAddress = buildData.data.routerAddress;

    return {
      to: routerAddress,
      data: txData,
      value: (tokenIn === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ? routeSummary.amountIn : '0')
    };
  }
}
