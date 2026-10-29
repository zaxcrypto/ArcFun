import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { getWebAuthnConfig, validateProductionWebAuthnConfig } from '@/lib/auth/webauthn-config';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const expectedChallenge = user.app_metadata?.currentChallenge;
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'No active registration session found' }, { status: 400 });
    }

    const body = await req.json();
    const { registrationResponse } = body;
    
    if (!registrationResponse) {
      return NextResponse.json({ error: 'Registration response missing' }, { status: 400 });
    }

    const config = getWebAuthnConfig();
    try {
      validateProductionWebAuthnConfig(config);
    } catch (e: any) {
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID });
    } catch (error: any) {
      console.error('Passkey verification failed:', error);
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

      // Save credential securely against Arc Account (in app_metadata)
      const existingPasskeys = user.app_metadata?.passkeys || [];
      
      let isReplacement = false;
      const replacementObj = user.app_metadata?.pendingPasskeyReplacement;
      
      if (replacementObj && typeof replacementObj === 'object' && replacementObj.active) {
        let currentSessionId = null;
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          currentSessionId = payload.session_id;
        } catch (e) {}

        const isExpired = new Date() > new Date(replacementObj.expiresAt);
        const isSessionMatch = !replacementObj.sessionId || currentSessionId === replacementObj.sessionId;
        const isChallengeMatch = expectedChallenge === replacementObj.challengeId;

        if (isExpired || !isSessionMatch || !isChallengeMatch) {
           await supabaseAdmin.auth.admin.updateUserById(user.id, {
             app_metadata: { ...user.app_metadata, pendingPasskeyReplacement: null, currentChallenge: null }
           });
           return NextResponse.json({ error: 'Passkey replacement request is stale, expired, or invalid. Please try again.' }, { status: 403 });
        }
        isReplacement = true;
      }
      
      const newPasskey = {
        credentialID: credential.id,
        credentialPublicKey: Buffer.from(credential.publicKey).toString('base64'),
        counter: credential.counter,
        credentialDeviceType,
        credentialBackedUp,
        createdAt: new Date().toISOString()
      };

      const updatedMetadata = {
        ...user.app_metadata,
        passkeys: isReplacement ? [newPasskey] : [...existingPasskeys, newPasskey],
        currentChallenge: null, // Clear challenge
        pendingPasskeyReplacement: null // Clear replacement intent flag safely
      };

      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: updatedMetadata
      });

      return NextResponse.json({ success: true, message: 'Passkey registered successfully' });
    }

    return NextResponse.json({ error: 'Verification returned unverified state' }, { status: 400 });

  } catch (error: any) {
    console.error('Passkey registration error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
