import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SiweMessage } from 'siwe';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getDeterministicPasswords(address: string) {
  const secret = process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Missing SUPABASE_JWT_SECRET');
  const roleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!roleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  
  // Return an array of potential passwords to handle secret rotation
  return [
    crypto.createHmac('sha256', secret).update(address.toLowerCase()).digest('hex'),
    crypto.createHmac('sha256', roleKey).update(address.toLowerCase()).digest('hex')
  ];
}

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;
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
    if (contentLength > 10240) { // Limit payload to 10KB (SIWE JSON is typically < 2KB)
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    // 2. Reject malformed JSON
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const { message, signature } = body || {};
    
    // 3. Strict signature validation
    if (!signature || typeof signature !== 'string' || !/^0x[a-fA-F0-9]{130}$/.test(signature)) {
      return NextResponse.json({ error: 'Invalid or missing signature format' }, { status: 400 });
    }

    // 4. Strict message validation
    if (!message || (typeof message !== 'string' && typeof message !== 'object')) {
      return NextResponse.json({ error: 'Invalid or missing message format' }, { status: 400 });
    }

    const host = req.headers.get('host') || 'arcfun.app';
    const domain = host.split(':')[0]; // basic host stripping

    // 5. Reject malformed SIWE message structure
    let siweMessage;
    try {
      siweMessage = new SiweMessage(message);
    } catch (err: any) {
      return NextResponse.json({ error: `Malformed SIWE message: ${err.message}` }, { status: 400 });
    }

    // 6. Verify signature and basic parsing
    const { data: fields } = await siweMessage.verify({ signature });

    if (fields.domain !== domain && fields.domain !== 'localhost' && fields.domain !== host) {
       await logAuth(fields.address.toLowerCase(), ip, req, 'login_failed');
       return NextResponse.json({ error: 'Domain binding failed' }, { status: 401 });
    }

    const lowerAddr = fields.address.toLowerCase();

    // Consume the nonce using ONE atomic SQL statement (DELETE ... RETURNING equivalent)
    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from('auth_challenges')
      .delete()
      .eq('address', lowerAddr)
      .eq('nonce', fields.nonce)
      .select('nonce, expires_at')
      .single();

    if (challengeError || !challenge) {
      await logAuth(lowerAddr, ip, req, 'login_failed');
      return NextResponse.json({ error: 'Invalid, consumed, or expired nonce' }, { status: 401 });
    }

    if (new Date(challenge.expires_at) < new Date()) {
      await logAuth(lowerAddr, ip, req, 'login_failed');
      return NextResponse.json({ error: 'Nonce expired' }, { status: 401 });
    }

    // Mint Custom Supabase JWT
    const token = jwt.sign(
      {
        sub: lowerAddr,
        role: 'authenticated',
        aud: 'authenticated',
        email: `${lowerAddr}@arcfun.xyz`
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // --- RESTORE SUPABASE AUTH FOR ARC WALLET ---
    const email = `${lowerAddr}@arcfun.xyz`;
    const passwords = getDeterministicPasswords(lowerAddr);
    const newPassword = passwords[0];

    let authData: any = null;
    let authError: any = null;

    // Try authenticating with current and legacy passwords (to handle secret rotation)
    for (const p of passwords) {
      const attempt = await supabaseAuth.auth.signInWithPassword({ email, password: p });
      if (attempt.data?.session) {
        authData = attempt.data;
        authError = attempt.error;
        
        // If they logged in with an old password, silently rotate it to the new one
        if (p !== newPassword && authData.user) {
          await supabaseAdmin.auth.admin.updateUserById(authData.user.id, { password: newPassword });
        }
        break;
      } else {
        authError = attempt.error;
      }
    }

    if (authError && authError.message.includes('Invalid login credentials') && !authData) {
      const { error: createError, data: newUser } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: newPassword,
        email_confirm: true,
      });
      
      if (createError) {
        throw new Error(`Failed to create proxy user: ${createError.message}`);
      }
      
      const loginAttempt = await supabaseAuth.auth.signInWithPassword({ email, password: newPassword });
      authData = loginAttempt.data;
      authError = loginAttempt.error;
    }

    if (authError || !authData.session) {
      throw new Error(authError?.message || 'Failed to establish Supabase session');
    }

    // Set HttpOnly Cookie for Chat & Pay
    const res = NextResponse.json({ 
      success: true, 
      address: lowerAddr,
      session: authData.session 
    });
    res.cookies.set('arc_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    await logAuth(lowerAddr, ip, req, 'login_success');

    return res;
  } catch (err: any) {
    console.error("SIWE Verify error:", err);
    return NextResponse.json({ error: `Verification failed: ${err.message}` }, { status: 401 });
  }
}

async function logAuth(wallet: string, ip: string, req: Request, action: string) {
  await supabaseAdmin.from('auth_logs').insert({
    wallet,
    ip,
    user_agent: req.headers.get('user-agent') || 'unknown',
    action
  });
}
