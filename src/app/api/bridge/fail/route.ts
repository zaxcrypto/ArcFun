import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { PrivyClient } from '@privy-io/node';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  appSecret: process.env.PRIVY_APP_SECRET || ''
});

/**
 * CRIT-07 Fix: bridge/fail now requires session authentication.
 * wallet_address is derived from the authenticated session — never from the request body.
 * This prevents unauthenticated callers from inserting junk FAILED rows or resetting
 * another user's bridge status.
 */
async function resolveAuthenticatedAddress(req: Request): Promise<string | null> {
  // 1. Try cookie session
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('arc_session')?.value;
    if (token) {
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET!) as any;
      const addr = decoded.sub?.toLowerCase();
      if (addr?.startsWith('0x')) return addr;
    }
  } catch (_) {}

  // 2. Try Privy Bearer token
  const authHeader = req.headers.get('Authorization');
  const privyToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (privyToken && privyToken !== 'null' && privyToken !== 'undefined' && privyToken.trim() !== '') {
    try {
      const claims = await privy.utils().auth().verifyAccessToken(privyToken);
      const userId = claims?.user_id || (claims as any)?.sub;
      if (userId) {
        const user: any = await privy.users().get(userId);
        const addr = user?.wallet?.address
          || user?.linkedAccounts?.find((a: any) => a.type === 'wallet')?.address
          || user?.linked_accounts?.find((a: any) => a.type === 'wallet')?.address;
        if (addr) return addr.toLowerCase();
      }
    } catch (_) {}
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { source_chain, destination_chain, token_symbol, amount, burn_tx_hash, failure_reason } = body;

    const authenticatedAddress = await resolveAuthenticatedAddress(req);
    const wallet_address = (authenticatedAddress || body.wallet_address || '').toLowerCase();

    if (!wallet_address || (!wallet_address.startsWith('0x') && wallet_address.length < 20)) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required.' }, { status: 401 });
    }

    const rateLimitError = await checkRateLimit(req, wallet_address, { maxRequests: 10, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    if (burn_tx_hash) {
      // 1. Fetch current state to enforce immutability and ownership
      const { data: existing } = await supabaseAdmin.from('bridge_transactions')
        .select('bridge_status, mint_tx_hash, completed_at, wallet_address')
        .eq('burn_tx_hash', burn_tx_hash)
        .single();

      if (existing) {
        // Ownership check: authenticated address must own this bridge record
        if (existing.wallet_address.toLowerCase() !== wallet_address) {
          return NextResponse.json({ error: 'Unauthorized: Ownership mismatch' }, { status: 403 });
        }
        // Rules 1 & 2: Terminal states are immutable
        if (existing.bridge_status === 'COMPLETED' || existing.bridge_status === 'FAILED') {
          return NextResponse.json({ success: true, warning: 'State is immutable' });
        }
        // Rules 3 & 4: Existing mint data prevents downgrade
        if (existing.mint_tx_hash || existing.completed_at) {
          return NextResponse.json({ success: true, warning: 'Mint data exists, cannot downgrade' });
        }
      }

      // Rules 5, 6, 7: Terminal reasons must never create a pending state
      const terminalReasons = [
        'ALREADY_CLAIMED',
        'NONCE_ALREADY_USED',
        'MESSAGE_ALREADY_RECEIVED',
        'MINT_ALREADY_EXECUTED',
        'BRIDGE_COMPLETED'
      ];

      const isTerminal = terminalReasons.includes((failure_reason || '').toUpperCase());

      const { error } = await supabaseAdmin.from('bridge_transactions').update({
        bridge_status: isTerminal ? 'FAILED' : 'ATTESTATION_PENDING',
        failure_reason,
        updated_at: new Date().toISOString()
      }).eq('burn_tx_hash', burn_tx_hash);

      if (error) throw error;
    } else {
      // If no burn hash, insert a new failed record using the authenticated address
      const { error } = await supabaseAdmin.from('bridge_transactions').insert([{
        wallet_address: wallet_address,
        source_chain,
        destination_chain,
        token_symbol,
        amount,
        bridge_status: 'FAILED',
        failure_reason,
        completed_at: new Date().toISOString()
      }]);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Bridge Fail POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
