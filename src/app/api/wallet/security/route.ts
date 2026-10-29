import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcryptjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { data: policy, error: policyErr } = await supabaseAdmin
      .from('user_security_policies')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (policyErr) {
      return NextResponse.json({ error: 'Failed to fetch policy' }, { status: 500 });
    }

    const has_passkey = user.app_metadata?.passkeys && user.app_metadata.passkeys.length > 0;

    const safePolicy = policy || {};
    const hasExistingPassword = typeof safePolicy.password_hash === 'string' && safePolicy.password_hash.trim().length > 0 && safePolicy.password_hash !== 'null';
    
    safePolicy.has_password = Boolean(hasExistingPassword);
    delete safePolicy.password_hash;
    safePolicy.has_passkey = Boolean(has_passkey);

    return NextResponse.json({ policy: safePolicy });

  } catch (error: any) {
    console.error('Failed to fetch security policy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const updates = await req.json();

    let payload: any = { ...updates, updated_at: Date.now() };
    delete payload.password_hash;
    delete payload.password_hash_client_provided;

    const { data: currentPolicy } = await supabaseAdmin
      .from('user_security_policies')
      .select('password_hash')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (updates.new_password) {
      const pwd = updates.new_password;
      if (pwd.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      if (!/[A-Z]/.test(pwd)) return NextResponse.json({ error: "Password must contain an uppercase letter" }, { status: 400 });
      if (!/[a-z]/.test(pwd)) return NextResponse.json({ error: "Password must contain a lowercase letter" }, { status: 400 });
      if (!/[0-9]/.test(pwd)) return NextResponse.json({ error: "Password must contain a number" }, { status: 400 });
      if (!/[^A-Za-z0-9]/.test(pwd)) return NextResponse.json({ error: "Password must contain a special character" }, { status: 400 });

      const hasExistingPassword = typeof currentPolicy?.password_hash === 'string' && currentPolicy.password_hash.trim().length > 0 && currentPolicy.password_hash !== 'null';

      if (hasExistingPassword) {
        if (!updates.current_password) return NextResponse.json({ error: "Current password is required to set a new password" }, { status: 400 });
        const isValid = await bcrypt.compare(updates.current_password, currentPolicy.password_hash);
        if (!isValid) return NextResponse.json({ error: "Invalid current password" }, { status: 403 });
      }

      const salt = await bcrypt.genSalt(12);
      payload.password_hash = await bcrypt.hash(updates.new_password, salt);
      payload.password_enabled = true;
      delete payload.new_password;
      delete payload.current_password;
    }

    const requiresAuth = updates.passkey_mode !== undefined || 
                         updates.passkey_threshold !== undefined || 
                         updates.daily_transfer_limit !== undefined || 
                         updates.daily_transfer_count_limit !== undefined || 
                         updates.max_transaction_amount !== undefined;

    if (requiresAuth) {
        const hasExistingPassword = typeof currentPolicy?.password_hash === 'string' && currentPolicy.password_hash.trim().length > 0 && currentPolicy.password_hash !== 'null';
        const hasPasskey = user.app_metadata?.passkeys && user.app_metadata.passkeys.length > 0;

        if (hasExistingPassword || hasPasskey) {
           let authenticated = false;
           
           if (updates.current_password && hasExistingPassword) {
               const isValid = await bcrypt.compare(updates.current_password, currentPolicy.password_hash);
               if (isValid) authenticated = true;
           } 
           
           if (!authenticated && updates.passkeyProof && hasPasskey) {
              let expectedChallenge: string | null = null;
              try {
                const clientData = JSON.parse(Buffer.from(updates.passkeyProof.response.clientDataJSON, 'base64').toString('utf8'));
                expectedChallenge = clientData.challenge;
              } catch (e) {
                console.error("Invalid passkey clientDataJSON:", e);
              }

              if (expectedChallenge) {
                  // Verify challenge in system_settings or app_metadata
                  let challengeValid = false;
                  const { data: challengeData } = await supabaseAdmin
                    .from('system_settings')
                    .select('value')
                    .eq('key', expectedChallenge)
                    .maybeSingle();

                  if (challengeData && challengeData.value !== 'CONSUMED') {
                    const [status, challengeUserId, expiresAt] = challengeData.value.split('_');
                    if (challengeUserId === user.id && Date.now() <= parseInt(expiresAt)) {
                      challengeValid = true;
                      await supabaseAdmin
                        .from('system_settings')
                        .update({ value: 'CONSUMED' })
                        .eq('key', expectedChallenge);
                    }
                  } else if (user.app_metadata?.currentAuthChallenge === expectedChallenge) {
                    challengeValid = true;
                  }

                  if (challengeValid) {
                      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
                      const { getWebAuthnConfig, validateProductionWebAuthnConfig } = await import('@/lib/auth/webauthn-config');
                      const originHeader = req.headers.get("origin") || undefined;
                      const config = getWebAuthnConfig(originHeader);
                      try {
                        validateProductionWebAuthnConfig(config);
                      } catch (err: any) {
                        console.warn("WebAuthn config validation note:", err.message);
                      }

                      const passkey = user.app_metadata.passkeys.find((k: any) => k.credentialID === updates.passkeyProof.id);
                      if (passkey) {
                          try {
                              const verification = await verifyAuthenticationResponse({
                                  response: updates.passkeyProof,
                                  expectedChallenge,
                                  expectedOrigin: config.origin,
                                  expectedRPID: config.rpID,
                                  credential: {
                                      id: passkey.credentialID,
                                      publicKey: new Uint8Array(Buffer.from(passkey.credentialPublicKey, 'base64')),
                                      counter: passkey.counter
                                  }
                              });
                              if (verification.verified) {
                                  authenticated = true;
                                  // Update counter in user app_metadata
                                  const updatedPasskeys = (user.app_metadata?.passkeys || []).map((k: any) => 
                                      k.credentialID === passkey.credentialID ? { ...k, counter: verification.authenticationInfo.newCounter } : k
                                  );
                                  await supabaseAdmin.auth.admin.updateUserById(user.id, {
                                      app_metadata: {
                                          ...user.app_metadata,
                                          passkeys: updatedPasskeys
                                      }
                                  });
                              }
                          } catch (e) {
                              console.error("Passkey verification failed during policy update:", e);
                          }
                      }
                  }
              }
           }

           if (!authenticated) {
               return NextResponse.json({ error: "Unauthorized: Valid current password or passkey authentication required to change security settings." }, { status: 403 });
           }
        }
    }

    delete payload.current_password;
    delete payload.passkeyProof;

    const { data, error } = await supabaseAdmin
      .from('user_security_policies')
      .upsert({ user_id: user.id, ...payload })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    if (data.password_hash) {
      data.has_password = true;
      delete data.password_hash;
    }
    
    data.has_passkey = user.app_metadata?.passkeys && user.app_metadata.passkeys.length > 0;

    return NextResponse.json({ policy: data });

  } catch (error: any) {
    console.error('Failed to update security policy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
