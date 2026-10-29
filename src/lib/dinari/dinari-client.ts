/**
 * Dinari Enterprise v2 API Client & Types
 * Official Reference: https://docs.dinari.com/reference/getstocks
 */

export interface DinariRawStock {
  id: string; // UUID
  name: string;
  symbol: string;
  display_name?: string | null;
  description?: string | null;
  is_fractionable: boolean;
  is_tradable: boolean;
  tokens: string[]; // List of CAIP-10 formatted token addresses e.g. "eip155:1/erc20:0x..."
  composite_figi?: string | null;
  cusip?: string | null;
  cik?: string | null;
  logo_url?: string | null;
}

export interface ParsedCaip10Token {
  raw: string;
  namespace: string; // e.g. "eip155"
  chainId: string; // e.g. "1" (Ethereum), "42161" (Arbitrum), "8453" (Base), "43114" (Avalanche)
  chainName: string; // Human-friendly chain name
  assetType: string; // e.g. "erc20"
  contractAddress: string; // e.g. "0x..."
}

export interface DinariStockCatalogueItem {
  id: string;
  symbol: string;
  name: string;
  displayName: string;
  description: string | null;
  isTradable: boolean;
  isFractionable: boolean;
  logoUrl: string | null;
  tokens: ParsedCaip10Token[];
  compositeFigi: string | null;
  cik: string | null;
}

export interface DinariPaginatedStockResponse {
  _sv?: string;
  data: DinariRawStock[];
  pagination_metadata?: {
    previous?: string | null;
    next?: string | null;
  };
}

const CHAIN_ID_MAP: Record<string, string> = {
  '1': 'Ethereum Mainnet',
  '42161': 'Arbitrum One',
  '8453': 'Base',
  '43114': 'Avalanche C-Chain',
  '999': 'HyperEVM',
  '98866': 'Plume',
  '11155111': 'Ethereum Sepolia',
  '421614': 'Arbitrum Sepolia',
  '84532': 'Base Sepolia',
  '43113': 'Avalanche Fuji',
};

/**
 * Parses a CAIP-10 identifier (e.g. "eip155:1/erc20:0x1234...") into structured network and contract details.
 */
export function parseCaip10Token(caip10: string): ParsedCaip10Token {
  // Format: namespace:chainId/assetType:contractAddress OR namespace:chainId:contractAddress
  try {
    const [networkPart, assetPart] = caip10.split('/');
    const [namespace, chainId] = (networkPart || '').split(':');
    let assetType = 'erc20';
    let contractAddress = '';

    if (assetPart) {
      const splitAsset = assetPart.split(':');
      assetType = splitAsset[0] || 'erc20';
      contractAddress = splitAsset[1] || splitAsset[0] || '';
    } else {
      contractAddress = networkPart.split(':')[2] || '';
    }

    const chainName = (chainId && CHAIN_ID_MAP[chainId]) || (namespace ? `${namespace}:${chainId}` : 'Unknown Chain');

    return {
      raw: caip10,
      namespace: namespace || 'eip155',
      chainId: chainId || '',
      chainName,
      assetType,
      contractAddress,
    };
  } catch {
    return {
      raw: caip10,
      namespace: 'unknown',
      chainId: '',
      chainName: 'Unknown',
      assetType: 'unknown',
      contractAddress: caip10,
    };
  }
}

/**
 * Formats raw Dinari Stock object into standard ArcFun DinariStockCatalogueItem.
 */
export function formatDinariStock(raw: DinariRawStock): DinariStockCatalogueItem {
  return {
    id: raw.id,
    symbol: raw.symbol,
    name: raw.name,
    displayName: raw.display_name || raw.name,
    description: raw.description || null,
    isTradable: Boolean(raw.is_tradable),
    isFractionable: Boolean(raw.is_fractionable),
    logoUrl: raw.logo_url || null,
    tokens: (raw.tokens || []).map(parseCaip10Token),
    compositeFigi: raw.composite_figi || null,
    cik: raw.cik || null,
  };
}

/**
 * Returns Dinari Enterprise API base URL depending on configured environment.
 */
export function getDinariApiBaseUrl(env?: string): string {
  const selectedEnv = env || process.env.DINARI_ENV || 'sandbox';
  if (selectedEnv.toLowerCase() === 'production' || selectedEnv.toLowerCase() === 'live') {
    return 'https://api-enterprise.sbt.dinari.com';
  }
  return 'https://api-enterprise.sandbox.dinari.com';
}

/**
 * Server-side Dinari Enterprise API requester.
 */
export async function fetchDinariStocks(options?: {
  symbols?: string[];
  page?: number;
  pageSize?: number;
  order?: 'asc' | 'desc';
}): Promise<{
  stocks: DinariStockCatalogueItem[];
  raw: DinariRawStock[];
  pagination?: { next?: string | null; previous?: string | null };
}> {
  const apiKeyId = process.env.DINARI_API_KEY_ID;
  const apiSecretKey = process.env.DINARI_API_SECRET_KEY;

  if (!apiKeyId || !apiSecretKey) {
    throw new Error('Dinari API credentials not configured (missing DINARI_API_KEY_ID or DINARI_API_SECRET_KEY)');
  }

  const baseUrl = getDinariApiBaseUrl();
  const url = new URL('/api/v2/market_data/stocks/', baseUrl);

  if (options?.symbols && options.symbols.length > 0) {
    options.symbols.forEach((s) => url.searchParams.append('symbols', s.toUpperCase().trim()));
  }
  if (options?.page) {
    url.searchParams.set('page', String(options.page));
  }
  if (options?.pageSize) {
    url.searchParams.set('page_size', String(options.pageSize));
  } else {
    url.searchParams.set('page_size', '100'); // fetch up to max 100 per page to discover full catalogue
  }
  if (options?.order) {
    url.searchParams.set('order', options.order);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-API-Key-Id': apiKeyId,
      'X-API-Secret-Key': apiSecretKey,
      'Accept': 'application/json',
    },
    // cache for 60s in server memory or bypass depending on usage
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    let parsedError: any = null;
    try {
      parsedError = JSON.parse(errorText);
    } catch (_) {}

    const errMsg = parsedError?.message || errorText || `HTTP ${res.status}`;
    throw new Error(`Dinari API Error (${res.status}): ${errMsg}`);
  }

  const data: DinariPaginatedStockResponse | DinariRawStock[] = await res.json();
  
  let rawList: DinariRawStock[] = [];
  let pagination: { next?: string | null; previous?: string | null } | undefined = undefined;

  if (Array.isArray(data)) {
    rawList = data;
  } else if (data && Array.isArray(data.data)) {
    rawList = data.data;
    pagination = data.pagination_metadata;
  }

  const formatted = rawList.map(formatDinariStock);

  return {
    stocks: formatted,
    raw: rawList,
    pagination,
  };
}
