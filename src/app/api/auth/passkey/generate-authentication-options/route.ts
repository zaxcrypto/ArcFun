import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
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

    const userPasskeys = user.app_metadata?.passkeys || [];
    if (userPasskeys.length === 0) {
      return NextResponse.json({ error: 'No passkeys registered for this user' }, { status: 400 });
    }

    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      allowCredentials: userPasskeys.map((key: any) => ({
        id: key.credentialID })),
      userVerification: 'preferred' });

    // Save the challenge securely in system_settings table for single-use atomic consumption
    const { error: insertErr } = await supabaseAdmin.from('system_settings').insert({
      key: options.challenge,
      value: `PENDING_${user.id}_${Date.now() + 5 * 60 * 1000}`
    });

    if (insertErr) {
      console.error('Failed to insert auth challenge:', insertErr);
      return NextResponse.json({ error: 'Failed to generate secure challenge' }, { status: 500 });
    }

    return NextResponse.json({ success: true, options });
  } catch (error: any) {
    console.error('Passkey authentication options generation error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
