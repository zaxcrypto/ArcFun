import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getWebAuthnConfig, validateProductionWebAuthnConfig } from '@/lib/auth/webauthn-config';

export async function GET(req: Request) {
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

    const config = getWebAuthnConfig();
    try {
      validateProductionWebAuthnConfig(config);
    } catch (e: any) {
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
    
    // User data for Passkey
    const userEmail = user.email || `${user.id}@arcfun.xyz`;
    
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
      // Exclude existing passkeys
      excludeCredentials: (user.app_metadata?.passkeys || []).map((key: any) => ({
        id: key.credentialID,
        type: 'public-key' }))
    });

    // Save the challenge securely in app_metadata for verification step
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        currentChallenge: options.challenge,
        pendingPasskeyReplacement: null // Clear any lingering replacement flags
      }
    });

    return NextResponse.json({ success: true, options });
  } catch (error: any) {
    console.error('Passkey generation error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
