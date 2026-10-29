export interface ProviderCapabilities {
  sameChain: boolean;
  crossChain: boolean;
  swap: boolean;
  bridge: boolean;
  approval: boolean;
  permit2: boolean;
  nativeWrap: boolean;
}

export interface ProviderHealth {
  status: 'Healthy' | 'Degraded' | 'Offline';
  latencyMs: number;
  successRatePercent: number;
}

export type RiskLevel = 'Safe' | 'Medium Risk' | 'High Price Impact' | 'Low Liquidity' | 'Experimental';

export interface QuoteRequestParams {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string; // in wei
  userAddress: string;
  slippageTolerance?: number; // e.g. 0.005 for 0.5%
}

export interface ArcFunRoute {
  id: string;
  providerId: string;
  providerName: string;
  providerLogoUrl: string;
  
  // Amounts
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  toAmountUSD: number;
  
  // Costs
  gasCostUSD: number;
  bridgeFeeUSD: number;
  platformFeeUSD: number;
  
  // Execution Metadata
  estimatedTimeSeconds: number;
  priceImpactPercent: number;
  slippagePercent: number;
  routePath: string[]; // Symbols
  steps: number;
  isCrossChain: boolean;
  
  // Badges & Risk
  score: number;
  badges: string[];
  riskLevel: RiskLevel;
  providerHealth?: number; // 0-100 success rate
  
  // Execution details
  allowanceTarget: string; // The contract to approve
  isTokenApprovalApplicable?: boolean;
  permitData?: any; // EIP-712 structured data for Permit2
  transactionRequest?: {
    to: string;
    data: string;
    value: string;
    gasLimit?: string;
  };
  
  // Expiry handling
  fetchedAt: number; // timestamp in ms
  expiresAt: number; // timestamp in ms
  
  // Raw payload
  rawPayload: any;
}

export interface IQuoteProvider {
  getProviderId(): string;
  getCapabilities(): ProviderCapabilities;
  getHealthStatus(): Promise<ProviderHealth>;
  supports(params: QuoteRequestParams): boolean;
  getQuote(params: QuoteRequestParams): Promise<ArcFunRoute | null>;
  getExecutionPayload?(quote: ArcFunRoute, signature?: string): Promise<{ to: string, data: string, value: string }>;
}
