import { ArcFunRoute, IQuoteProvider, QuoteRequestParams } from './types';
import { UniswapProvider } from './providers/uniswap-provider';
import { KyberswapProvider } from './providers/kyberswap-provider';

export interface ValidatedQuote {
  providerId: string;
  quote: ArcFunRoute | null;
  isValid: boolean;
  failureReason?: string;
}

export class QuoteEngine {
  private providers: IQuoteProvider[] = [];

  constructor() {
    // We are temporarily replacing Uniswap with KyberSwap due to Robinhood Chain (4663) upstream Universal Router bugs.
    this.providers.push(new KyberswapProvider());
  }

  // Internal testing/dependency injection
  public registerProvider(provider: IQuoteProvider) {
    this.providers.push(provider);
  }

  public getProvider(providerId: string): IQuoteProvider | undefined {
    return this.providers.find(p => p.getProviderId() === providerId);
  }

  /**
   * Discovers and polls all capable providers for quotes in parallel.
   */
  async getOptimalQuotes(params: QuoteRequestParams): Promise<ArcFunRoute[]> {
    const capableProviders = this.providers.filter(p => p.supports(params));

    const quotePromises = capableProviders.map(async (provider): Promise<ValidatedQuote> => {
      try {
        const quote = await provider.getQuote(params);
        return this.validateQuote(provider.getProviderId(), quote);
      } catch (error: any) {
        return {
          providerId: provider.getProviderId(),
          quote: null,
          isValid: false,
          failureReason: `Exception: ${error.message}`
        };
      }
    });

    const results = await Promise.allSettled(quotePromises);
    const validQuotes: ArcFunRoute[] = [];

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        const validation = result.value;
        if (validation.isValid && validation.quote) {
          validQuotes.push(validation.quote);
        } else {
          console.warn(`QuoteEngine: Provider [${validation.providerId}] rejected: ${validation.failureReason}`);
        }
      }
    });

    // Score and sort only valid quotes
    return this.rankQuotes(validQuotes);
  }

  /**
   * STEP 1: Provider Validation Layer
   * Every provider must strictly pass all criteria before reaching execution.
   */
  private validateQuote(providerId: string, quote: ArcFunRoute | null): ValidatedQuote {
    if (!quote) return { providerId, quote: null, isValid: false, failureReason: "No quote returned" };

    if (!quote.toAmount || BigInt(quote.toAmount) <= 0n) return { providerId, quote, isValid: false, failureReason: "Zero output amount" };
    if (quote.gasCostUSD === undefined || quote.gasCostUSD < 0) return { providerId, quote, isValid: false, failureReason: "Missing or invalid gas estimate" };
    if (!quote.routePath || quote.routePath.length === 0) return { providerId, quote, isValid: false, failureReason: "Empty route path" };

    return { providerId, quote, isValid: true };
  }

  /**
   * STEP 2: Quote Ranking
   * Ranks valid providers objectively based on mathematically sound parameters.
   */
  public rankQuotes(routes: ArcFunRoute[]): ArcFunRoute[] {
    return routes.sort((a, b) => {
      // 1. Calculate strictly objective Net USD Output
      const netUsdA = a.toAmountUSD - a.gasCostUSD - a.bridgeFeeUSD - a.platformFeeUSD;
      const netUsdB = b.toAmountUSD - b.gasCostUSD - b.bridgeFeeUSD - b.platformFeeUSD;
      
      // 2. Adjust for execution time
      const timePenaltyA = Math.max(0, a.estimatedTimeSeconds - 30) * 0.01;
      const timePenaltyB = Math.max(0, b.estimatedTimeSeconds - 30) * 0.01;

      // 3. Adjust for Price Impact Penalty
      const impactPenaltyA = a.priceImpactPercent > 5 ? netUsdA * 0.1 : 0;
      const impactPenaltyB = b.priceImpactPercent > 5 ? netUsdB * 0.1 : 0;

      const finalScoreA = netUsdA - timePenaltyA - impactPenaltyA;
      const finalScoreB = netUsdB - timePenaltyB - impactPenaltyB;

      a.score = finalScoreA;
      b.score = finalScoreB;

      // Sort descending
      return finalScoreB - finalScoreA;
    });
  }
}

// Export a singleton instance for ease of use
export const arcFunQuoteEngine = new QuoteEngine();
