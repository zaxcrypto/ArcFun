export interface UserAnalyticsAggregates {
  address: string;
  tx_count: number;
  sent_count: number;
  received_count: number;
  token_transfer_count: number;
  internal_tx_count: number;
  contracts_deployed: number;
  total_gas_used: number; // numeric is returned as string or number depending on driver, but usually number if cast
  first_tx_date: string | null;
  last_tx_date: string | null;
  last_synced_block: number | null;
  sync_locked_until: string | null;
  cooldown_until?: string | null;
}

export interface UserDailyActivity {
  address: string;
  date_utc: string; // YYYY-MM-DD format
  tx_count: number;
}

export interface UserUniqueAddress {
  address: string;
  interacted_address: string;
}

export interface UnfinalizedTransaction {
  address: string;
  tx_hash: string;
  block_number: number;
  type: string;
}

export interface PendingInternalTransaction {
  address: string;
  tx_hash: string;
  created_at: string;
}

// DTO for the unified Analytics Response
export interface ProfileAnalyticsResponse {
  balance: string;
  analytics: UserAnalyticsAggregates & { uniqueInteractions: number };
  cooldownUntil?: string;
  heatmap: {
    dailyCounts: Record<string, number>;
    activeDays: number;
    currentStreak: number;
    unfinalizedDays?: string[];
  };
  needsSync: boolean;
}
