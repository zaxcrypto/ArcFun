import { supabaseAdmin } from '@/lib/supabase-admin';
import type { ArcAccountStats } from '@/lib/arc-api';
import { apiGet } from '@/lib/arc-api';

export async function getArcStatsForBackend(address: string): Promise<ArcAccountStats> {
  const addr = address.toLowerCase();

  const empty: ArcAccountStats = {
    balance: "0",
    txCount: 0,
    receivedTxCount: 0,
    internalTxCount: 0,
    tokenTxCount: 0,
    firstTxDate: null,
    lastTxDate: null,
    activeDays: 0,
    activeWeeks: 0,
    activeMonths: 0,
    dayStreak: 0,
    perDayActivity: {},
    unfinalizedDays: [],
    contractsDeployed: 0,
    totalGasUsed: 0,
    uniqueInteractions: 0,
    loading: false,
    error: null,
    needsSync: false,
    cooldownUntil: null,
  };

  try {
    let balance = "0";
    try {
      const balData = await apiGet({ module: "account", action: "balance", address: addr });
      if (typeof balData === "string") balance = balData;
    } catch {}

    const { data: aggs } = await supabaseAdmin
      .from('user_analytics_aggregates')
      .select('*')
      .eq('address', addr)
      .single();

    if (!aggs) {
      return { ...empty, balance };
    }

    const { data: dailyActivity } = await supabaseAdmin
      .from('user_daily_activity')
      .select('date_utc, tx_count')
      .eq('address', addr)
      .order('date_utc', { ascending: false });

    const { count: uniqueInteractionsCount } = await supabaseAdmin
      .from('user_unique_addresses')
      .select('*', { count: 'exact', head: true })
      .eq('address', addr);

    const dailyCounts: Record<string, number> = {};
    const activeDaysCount = dailyActivity?.length || 0;
    
    let currentStreak = 0;
    if (dailyActivity && dailyActivity.length > 0) {
      dailyActivity.forEach(d => {
        dailyCounts[d.date_utc] = d.tx_count;
      });

      const today = new Date();
      for (let i = 0; i < 90; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dailyCounts[key]) {
          currentStreak++;
        } else if (i > 0) {
          break;
        }
      }
    }

    const firstTx = aggs.first_tx_date ? new Date(aggs.first_tx_date) : null;
    const lastTx = aggs.last_tx_date ? new Date(aggs.last_tx_date) : null;
    const activeWeeks = Math.floor(activeDaysCount / 7);
    const uniqueMonths = new Set(Object.keys(dailyCounts).map(date => date.substring(0, 7)));
    const activeMonths = uniqueMonths.size;

    return {
      balance,
      txCount: aggs.sent_count || 0,
      receivedTxCount: aggs.received_count || 0,
      internalTxCount: aggs.internal_tx_count || 0,
      tokenTxCount: aggs.token_transfer_count || 0,
      firstTxDate: firstTx,
      lastTxDate: lastTx,
      activeDays: activeDaysCount,
      activeWeeks,
      activeMonths,
      dayStreak: currentStreak,
      perDayActivity: dailyCounts,
      unfinalizedDays: [],
      contractsDeployed: aggs.contracts_deployed || 0,
      totalGasUsed: aggs.total_gas_used || 0,
      uniqueInteractions: uniqueInteractionsCount || 0,
      loading: false,
      error: null,
      needsSync: false,
      cooldownUntil: aggs.cooldown_until || null,
    };
  } catch (err) {
    console.error("getArcStatsForBackend error:", err);
    return { ...empty, error: "true" };
  }
}
