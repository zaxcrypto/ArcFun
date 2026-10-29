import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });
    }

    const { data: payment, error } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let txHash = payment?.tx_hash || null;
    let status = payment?.status || 'pending';

    // Check autopay_executions for confirmed blockchain tx hash if missing
    if (!txHash) {
      try {
        const { data: exRow } = await supabaseAdmin
          .from('autopay_executions')
          .select('blockchain_tx_hash, status')
          .eq('id', id)
          .maybeSingle();

        if (exRow?.blockchain_tx_hash) {
          txHash = exRow.blockchain_tx_hash;
          status = 'confirmed';
        }
      } catch {}
    }

    // Check payment_ledger for confirmed blockchain hash if still missing
    if (!txHash) {
      try {
        const { data: ledgerRow } = await supabaseAdmin
          .from('payment_ledger')
          .select('blockchain_hash, status')
          .eq('id', id)
          .maybeSingle();

        if (ledgerRow?.blockchain_hash) {
          txHash = ledgerRow.blockchain_hash;
          status = 'confirmed';
        }
      } catch {}
    }

    if (!payment && !txHash) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Self-heal: Synchronize payments row in database so status is permanently confirmed
    if (status === 'confirmed' && payment && payment.status !== 'confirmed') {
      supabaseAdmin
        .from('payments')
        .update({ status: 'confirmed', tx_hash: txHash })
        .eq('id', id)
        .then(() => {}, () => {});
    }

    const mappedPayment = {
      id: payment?.id || id,
      sender: payment?.sender || '',
      receiver: payment?.receiver || '',
      amount: payment?.amount || 0,
      token: payment?.token || 'USDC',
      description: payment?.description || null,
      status,
      active: payment?.active !== false,
      createdAt: payment?.created_at ? (typeof payment.created_at === 'number' ? payment.created_at : new Date(payment.created_at).getTime()) : Date.now(),
      txHash,
      isRecurring: !!payment?.is_recurring,
      recurringInterval: payment?.recurring_interval || null,
      nextPaymentAt: payment?.next_payment_at ? (typeof payment.next_payment_at === 'number' ? payment.next_payment_at : new Date(payment.next_payment_at).getTime()) : undefined
    };

    return NextResponse.json(
      {
        success: true,
        payment: mappedPayment
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate'
        }
      }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
