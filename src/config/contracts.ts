export const ARCFUN_CURVE_FACTORY_ABI = [
  {
    inputs: [
      { internalType: "string", name: "name", type: "string" },
      { internalType: "string", name: "symbol", type: "string" },
      { internalType: "address", name: "quoteToken", type: "address" }
    ],
    name: "createLaunch",
    outputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address", name: "curve", type: "address" }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "quoteToken", type: "address" }],
    name: "isApprovedQuote",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "getCurve",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalLaunches",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "token", type: "address" },
      { indexed: true, internalType: "address", name: "curve", type: "address" },
      { indexed: true, internalType: "address", name: "quoteToken", type: "address" },
      { indexed: false, internalType: "address", name: "creator", type: "address" },
      { indexed: false, internalType: "string", name: "name", type: "string" },
      { indexed: false, internalType: "string", name: "symbol", type: "string" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" }
    ],
    name: "LaunchCreated",
    type: "event"
  }
] as const;

export const ARCFUN_BONDING_CURVE_ABI = [
  {
    inputs: [],
    name: "getCurrentPrice",
    outputs: [{ internalType: "uint256", name: "spotPrice", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "quoteAmountIn", type: "uint256" }],
    name: "getBuyQuote",
    outputs: [
      { internalType: "uint256", name: "tokensOut", type: "uint256" },
      { internalType: "uint256", name: "newRealQuote", type: "uint256" },
      { internalType: "uint256", name: "newTokensSold", type: "uint256" },
      { internalType: "uint256", name: "postSpotPrice", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenAmountIn", type: "uint256" }],
    name: "getSellQuote",
    outputs: [
      { internalType: "uint256", name: "quoteOut", type: "uint256" },
      { internalType: "uint256", name: "newRealQuote", type: "uint256" },
      { internalType: "uint256", name: "newTokensSold", type: "uint256" },
      { internalType: "uint256", name: "postSpotPrice", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "quoteAmountIn", type: "uint256" },
      { internalType: "uint256", name: "minTokensOut", type: "uint256" },
      { internalType: "address", name: "recipient", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" }
    ],
    name: "buy",
    outputs: [{ internalType: "uint256", name: "tokensOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenAmountIn", type: "uint256" },
      { internalType: "uint256", name: "minQuoteOut", type: "uint256" },
      { internalType: "address", name: "recipient", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" }
    ],
    name: "sell",
    outputs: [{ internalType: "uint256", name: "quoteOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "getCurveProgress",
    outputs: [{ internalType: "uint256", name: "progressBps", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getRealReserves",
    outputs: [
      { internalType: "uint256", name: "realQuote", type: "uint256" },
      { internalType: "uint256", name: "remainingSaleTokens", type: "uint256" },
      { internalType: "uint256", name: "dexTokens", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "state",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "realQuoteReserve",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "realTokenSold",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "quoteToken",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sender", type: "address" },
      { indexed: true, internalType: "address", name: "recipient", type: "address" },
      { indexed: false, internalType: "uint256", name: "quoteIn", "type": "uint256" },
      { indexed: false, internalType: "uint256", name: "tokensOut", "type": "uint256" },
      { indexed: false, internalType: "uint256", name: "spotPrice", "type": "uint256" },
      { indexed: false, internalType: "uint256", name: "realQuoteReserve", "type": "uint256" },
      { indexed: false, internalType: "uint256", name: "realTokenSold", "type": "uint256" },
      { indexed: false, internalType: "uint256", name: "timestamp", "type": "uint256" }
    ],
    name: "Buy",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sender", type: "address" },
      { indexed: true, internalType: "address", name: "recipient", type: "address" },
      { indexed: false, internalType: "uint256", name: "tokensIn", "type": "uint256" },
      { indexed: false, internalType: "uint256", name: "quoteOut", "type": "uint256" },
      { indexed: false, internalType: "uint256", name: "spotPrice", "type": "uint256" },
      { indexed: false, internalType: "uint256", name: "realQuoteReserve", "type": "uint256" },
      { indexed: false, internalType: "uint256", name: "realTokenSold", "type": "uint256" },
      { indexed: false, internalType: "uint256", name: "timestamp", "type": "uint256" }
    ],
    name: "Sell",
    type: "event"
  }
] as const;

export const ARCFUN_CURVE_FACTORY_ADDRESSES: Record<number, string> = {
  11155111: "0x31F11b7456b2e15F91642B75dAdC0e69c5AAFAFa", // Ethereum Sepolia ArcFun Curve Factory
};

export const ERC20_FACTORY_ABI = [
  {
    inputs: [
      { internalType: "string", name: "name", type: "string" },
      { internalType: "string", name: "symbol", type: "string" },
      { internalType: "uint256", name: "totalSupply", type: "uint256" }
    ],
    name: "deployToken",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "tokenAddress", type: "address" },
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: false, internalType: "string", name: "name", type: "string" },
      { indexed: false, internalType: "string", name: "symbol", type: "string" },
      { indexed: false, internalType: "uint256", name: "totalSupply", type: "uint256" }
    ],
    name: "TokenDeployed",
    type: "event"
  }
] as const;

export const FACTORY_ADDRESSES: Record<number, string> = {
  11155111: "0x31F11b7456b2e15F91642B75dAdC0e69c5AAFAFa", // Ethereum Sepolia ArcFun Curve Factory (Upgraded)
  5042002: "0x980A2A1d0779Bc612FB8C3f3d0E9a08e0C4Fb781", // Arc Testnet
  91342: "0x9D620fD3bE140f1C227876CCF208c8Bd5E11d5a4",   // GIWA Sepolia
};

export const FACTORY_ADDRESS = "0x31F11b7456b2e15F91642B75dAdC0e69c5AAFAFa" as const;

export const ERC20_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" }
    ],
    name: "Transfer",
    type: "event"
  }
] as const;

export const MULTISENDER_ABI = [
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address[]", name: "recipients", type: "address[]" },
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" }
    ],
    name: "multisend",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

export const MULTISENDER_ADDRESS = "0x75A2011aa6121Da5a5f890276B56aa1233e18fAF";

export const SEPOLIA_WETH_ADDRESS = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";

export const WETH_ABI = [
  {
    inputs: [],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "wad", type: "uint256" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
