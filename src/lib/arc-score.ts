import type { ArcAccountStats } from "./arc-api";

export interface ScoreBreakdownItem {
  label: string;
  points: number;
  max: number;
  tooltip: string;
  icon: string;
}

export interface ArcScore {
  total: number;          // 0-100
  tier: ScoreTier;
  breakdown: ScoreBreakdownItem[];
}

export type ScoreTier =
  | "Explorer"
  | "Builder"
  | "Contributor"
  | "Power User"
  | "Arc Legend";

export const TIER_CONFIG: Record<ScoreTier, { color: string; gradient: string; min: number; max: number }> = {
  "Explorer":    { color: "#94a3b8", gradient: "linear-gradient(135deg,#64748b,#94a3b8)", min: 0,  max: 20  },
  "Builder":     { color: "#60a5fa", gradient: "linear-gradient(135deg,#3b82f6,#60a5fa)", min: 21, max: 40  },
  "Contributor": { color: "#34d399", gradient: "linear-gradient(135deg,#10b981,#34d399)", min: 41, max: 60  },
  "Power User":  { color: "#b30000", gradient: "linear-gradient(135deg,#7a0000,#ff0000)", min: 61, max: 80  },
  "Arc Legend":  { color: "#b30000", gradient: "linear-gradient(135deg,#dc2626,#b30000,#4a0000)", min: 81, max: 100 },
};

/** Diminishing returns: score = max * (1 - e^(-k*x)) */
function dimReturns(value: number, k: number, max: number): number {
  return max * (1 - Math.exp(-k * value));
}

/** Clamp to max */
function clamp(v: number, mx: number): number {
  return Math.min(v, mx);
}

export function calculateArcScore(stats: ArcAccountStats, tokensDeployed = 0): ArcScore {
  const {
    txCount = 0,
    receivedTxCount = 0,
    internalTxCount = 0,
    tokenTxCount = 0,
    activeDays = 0,
    activeWeeks = 0,
    dayStreak = 0,
    contractsDeployed = 0,
    uniqueInteractions = 0,
    firstTxDate = null,
    totalGasUsed = 0,
  } = stats;

  const totalDeployed = Math.max(tokensDeployed, contractsDeployed);

  // ── 1. Transactions (max 20) ─────────────────────────────────────────────
  const totalTxs = txCount + receivedTxCount;
  const txPts = clamp(dimReturns(totalTxs, 0.035, 20), 20);

  // ── 2. Token Deployments (max 18) ───────────────────────────────────────
  const deployPts = clamp(dimReturns(totalDeployed, 0.4, 18), 18);

  // ── 3. Active Streak (max 12) ───────────────────────────────────────────
  const streakPts = clamp(dimReturns(dayStreak, 0.2, 12), 12);

  // ── 4. Days Active (max 10) ─────────────────────────────────────────────
  const daysPts = clamp(dimReturns(activeDays, 0.06, 10), 10);

  // ── 5. Weekly Consistency (max 8) ────────────────────────────────────────
  const weeklyPts = clamp(dimReturns(activeWeeks, 0.15, 8), 8);

  // ── 6. Unique Contract Interactions (max 8) ──────────────────────────────
  const uniquePts = clamp(dimReturns(uniqueInteractions, 0.12, 8), 8);

  // ── 7. Token Transfers (max 6) ───────────────────────────────────────────
  const tokenTxPts = clamp(dimReturns(tokenTxCount, 0.08, 6), 6);

  // ── 8. Internal / Contract Calls (max 5) ─────────────────────────────────
  const internalPts = clamp(dimReturns(internalTxCount, 0.12, 5), 5);

  // ── 9. Gas Spent — Power User (max 5) ───────────────────────────────────
  const gasPts = clamp(dimReturns(Number(totalGasUsed) / 1e6, 0.05, 5), 5);

  // ── 10. Early User Bonus (max 8) ────────────────────────────────────────
  let earlyPts = 0;
  if (firstTxDate) {
    const daysSinceFirst = (Date.now() - firstTxDate.getTime()) / 86400000;
    if (daysSinceFirst >= 180) earlyPts = 8;
    else if (daysSinceFirst >= 90) earlyPts = 5;
    else if (daysSinceFirst >= 30) earlyPts = 3;
    else if (daysSinceFirst >= 7) earlyPts = 1;
  }

  const rawTotal = txPts + deployPts + streakPts + daysPts + weeklyPts + uniquePts + tokenTxPts + internalPts + gasPts + earlyPts;
  let total = Math.round(Math.min(rawTotal, 100));
  
  // Cap at 99 unless they have 1000+ total transactions
  if (total >= 100 && totalTxs < 1000) {
    total = 99;
  }

  const tier: ScoreTier =
    total <= 20 ? "Explorer" :
    total <= 40 ? "Builder" :
    total <= 60 ? "Contributor" :
    total <= 80 ? "Power User" : "Arc Legend";

  const breakdown: ScoreBreakdownItem[] = [
    { label: "Transactions",         points: Math.round(txPts),       max: 20, icon: "⚡", tooltip: "Total sent + received txs. Diminishing returns after 100 txs." },
    { label: "Token Deployments",    points: Math.round(deployPts),   max: 18, icon: "🚀", tooltip: "Tokens/contracts deployed via Arc Launcher. Each deployment earns points." },
    { label: "Active Streak",        points: Math.round(streakPts),   max: 12, icon: "🔥", tooltip: "Consecutive days with at least one transaction on Arc Testnet." },
    { label: "Days Active",          points: Math.round(daysPts),     max: 10, icon: "📅", tooltip: "Total unique calendar days with on-chain activity." },
    { label: "Weekly Consistency",   points: Math.round(weeklyPts),   max: 8,  icon: "📊", tooltip: "Number of distinct weeks with activity — rewards sustained engagement." },
    { label: "Unique Interactions",  points: Math.round(uniquePts),   max: 8,  icon: "🤝", tooltip: "Unique wallet addresses interacted with. Shows network engagement." },
    { label: "Token Transfers",      points: Math.round(tokenTxPts),  max: 6,  icon: "💸", tooltip: "ERC-20 token transfer events. Measures DeFi participation." },
    { label: "Contract Calls",       points: Math.round(internalPts), max: 5,  icon: "⚙️", tooltip: "Internal/smart contract interactions triggered by your transactions." },
    { label: "Gas Contribution",     points: Math.round(gasPts),      max: 5,  icon: "⛽", tooltip: "Total gas spent on-chain. Power users naturally accumulate more." },
    { label: "Early User Bonus",     points: Math.round(earlyPts),    max: 8,  icon: "🌟", tooltip: "Bonus for early testnet adoption — reflects long-term commitment." },
  ];

  return { total, tier, breakdown };
}
