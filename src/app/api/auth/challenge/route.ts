import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateNonce } from 'siwe';

const rateLimit = new Map<string, number>();

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();
    const lastReq = rateLimit.get(ip) || 0;
    
    if (now - lastReq < 1000) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }
    rateLimit.set(ip, now);

    // 1. Oversized payload protection
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 1024) { // Challenge payload should be tiny (< 200 bytes)
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    // 2. Reject malformed JSON
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    // 3. Strict Address and Type validation
    const { address } = body || {};
    if (!address || typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Valid Ethereum address is required' }, { status: 400 });
    }
    const lowerAddr = address.toLowerCase();

    // Clean up expired nonces
    await supabaseAdmin.from('auth_challenges').delete().lt('expires_at', new Date().toISOString());

    const nonce = generateNonce();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin.from('auth_challenges').upsert({
      address: lowerAddr,
      nonce: nonce,
      expires_at: expiresAt
    });

    if (error) {
      return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 });
    }

    // Auth logging
    await supabaseAdmin.from('auth_logs').insert({
      wallet: lowerAddr,
      ip,
      user_agent: req.headers.get('user-agent') || 'unknown',
      action: 'challenge_created'
    });

    return NextResponse.json({ nonce });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
