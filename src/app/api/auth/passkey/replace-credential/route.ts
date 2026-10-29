import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getWebAuthnConfig, validateProductionWebAuthnConfig } from '@/lib/auth/webauthn-config';
import * as bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const { password } = await req.json();
    if (!password) {
       return NextResponse.json({ error: "Current password is required to replace a passkey." }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Verify Password
    const { data: policy, error: policyErr } = await supabaseAdmin
      .from('user_security_policies')
      .select('password_hash')
      .eq('user_id', user.id)
      .maybeSingle();

    if (policyErr || !policy?.password_hash) {
      return NextResponse.json({ error: 'No password configured for this account. Cannot replace passkey.' }, { status: 403 });
    }

    const isValidPassword = await bcrypt.compare(password, policy.password_hash);
    if (!isValidPassword) {
      return NextResponse.json({ error: 'Invalid password.' }, { status: 403 });
    }

    const config = getWebAuthnConfig();
    try {
      validateProductionWebAuthnConfig(config);
    } catch (e: any) {
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
    
    const userEmail = user.email || `${user.id}@arcfun.xyz`;
    
    // 2. Generate New Options
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userID: new Uint8Array(Buffer.from(user.id)),
      userName: userEmail,
      userDisplayName: userEmail,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred' },
      excludeCredentials: []
    });

    // 3. Save new challenge with structured atomic intent
    let sessionId = null;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      sessionId = payload.session_id;
    } catch (e) {}

    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        pendingPasskeyReplacement: {
           active: true,
           challengeId: options.challenge,
           sessionId: sessionId,
           createdAt: new Date().toISOString(),
           expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        },
        currentChallenge: options.challenge,
        currentAuthChallenge: null,
        pendingTx: null
      },
      user_metadata: {
        ...user.user_metadata,
        passkeys: null
      }
    });

    return NextResponse.json({ success: true, options });

  } catch (error: any) {
    console.error('Failed to replace passkey:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
