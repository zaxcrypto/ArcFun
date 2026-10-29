import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const start = Date.now();
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const rateLimitError = await checkRateLimit(req, user.id, { maxRequests: 200, windowMs: 60000 });
    if (rateLimitError) {
      return rateLimitError;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const [policiesRes, dailyLimitRes] = await Promise.all([
      supabaseAdmin
        .from('user_security_policies')
        .select('max_transaction_amount, daily_transfer_limit')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('user_daily_limits')
        .select('spent_today')
        .eq('user_id', user.id)
        .eq('date', todayStr)
        .maybeSingle()
    ]);

    const maxPerTransaction = policiesRes.data?.max_transaction_amount ?? 1000.0;
    const dailyLimit = policiesRes.data?.daily_transfer_limit ?? 5000.0;
    const spentToday = parseFloat(dailyLimitRes.data?.spent_today || '0');
    const remainingAvailableToday = Math.max(0, dailyLimit - spentToday);

    return NextResponse.json({ 
      dailyLimit, 
      maxPerTransaction, 
      completedSpentToday: spentToday, 
      pendingReservedToday: 0, 
      remainingAvailableToday 
    }, {
      headers: {
        'Cache-Control': 'private, max-age=10, stale-while-revalidate=30'
      }
    });

  } catch (error: any) {
    console.error('Wallet Limits Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
