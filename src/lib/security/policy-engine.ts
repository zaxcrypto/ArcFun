import { SupabaseClient } from '@supabase/supabase-js';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { getWebAuthnConfig, validateProductionWebAuthnConfig } from '@/lib/auth/webauthn-config';
import * as bcrypt from 'bcryptjs';

export interface TransactionPolicyRequest {
  supabaseAdmin: SupabaseClient;
  user: any;
  intentId: string;
  requestedAmountUsd: number;
  tokenAmount?: number;
  type: 'TRANSFER' | 'SWAP' | 'BRIDGE';
  tokenSymbol: string;
  fromWallet: string;
  toWallet: string;
  authDetails: {
    password?: string;
    passkeyProof?: any;
  };
}

export interface PolicyValidationResult {
  status: 'APPROVED' | 'PASSKEY_REQUIRED' | 'SECURITY_SETUP_REQUIRED' | 'ALREADY_EXECUTED';
  ledgerId?: string; // The ID of the PENDING_LIMIT_CHECK row
  threshold?: number;
  has_password?: boolean;
  txHash?: string;
  reason?: string;
}

export async function safeReleaseReservation(supabaseAdmin: SupabaseClient, intentId: string, reason: string) {
  try {
    const { error } = await supabaseAdmin.rpc('release_reservation', { p_intent_id: intentId, p_reason: reason });
    if (!error) return;
  } catch (e) {
    // Ignore RPC missing error and proceed to direct fallback
  }

  try {
    await supabaseAdmin
      .from('payment_ledger')
      .update({ status: 'FAILED', error_reason: reason, updated_at: Date.now() })
      .eq('intent_id', intentId);
  } catch (err) {
    console.error("Direct release_reservation fallback error:", err);
  }
}

export async function validateAndLockTransaction(
  req: TransactionPolicyRequest
): Promise<PolicyValidationResult> {
  const {
    supabaseAdmin,
    user,
    intentId,
    requestedAmountUsd,
    type,
    tokenSymbol,
    fromWallet,
    toWallet,
    authDetails
  } = req;

  const actualTokenAmount = (req.tokenAmount !== undefined && req.tokenAmount !== null)
    ? req.tokenAmount
    : requestedAmountUsd;

  console.log(JSON.stringify({
    level: 'INFO',
    event: 'POLICY_VALIDATION_START',
    intentId,
    userId: user.id,
    walletId: fromWallet,
    requestedAmountUsd,
    actualTokenAmount,
    tokenSymbol
  }));

  // 1. Fetch user security policies
  const { data: policies } = await supabaseAdmin
    .from('user_security_policies')
    .select('passkey_mode, passkey_threshold, max_transaction_amount, daily_transfer_limit, daily_transfer_count_limit, auth_policy_mode, password_hash')
    .eq('user_id', user.id)
    .maybeSingle();

  const maxTx = policies?.max_transaction_amount ?? 1000.0;
  const dailyLimit = policies?.daily_transfer_limit ?? 5000.0;
  const passkeyMode = policies?.passkey_mode ?? 'ALWAYS';
  const passkeyThreshold = policies?.passkey_threshold ?? 0.0;

  // 2. Immediate Limits Check (Per Transaction)
  if (requestedAmountUsd > maxTx) {
    const tokenLabel = req.tokenAmount ? ` (${req.tokenAmount} ${tokenSymbol})` : '';
    const err = new Error(`Transaction amount $${requestedAmountUsd.toFixed(2)} USD${tokenLabel} exceeds your maximum per-transaction limit of $${maxTx.toFixed(2)} USD.`);
    (err as any).status = 403;
    throw err;
  }

  // 3 & 4. Atomic Intent Reservation & Daily Limit Check
  const countLimit = 1000;
  let insertedLedgerId: string;

  const reserveRes = await supabaseAdmin.rpc('reserve_daily_limit', {
    p_user_id: user.id,
    p_intent_id: intentId,
    p_amount: requestedAmountUsd,
    p_daily_limit: dailyLimit,
    p_max_count: countLimit,
    p_token: tokenSymbol,
    p_type: type,
    p_from_wallet: fromWallet,
    p_to_wallet: toWallet
  });

  if (reserveRes.error && (
    reserveRes.error.message?.includes('does not exist') || 
    reserveRes.error.message?.includes('Could not find the function') ||
    reserveRes.error.code === '42883' ||
    reserveRes.error.code === 'PGRST202'
  )) {
    // Graceful fallback for environments where reserve_daily_limit RPC is not deployed:
    // 1) Enforce rolling 24-hour daily limit across all non-failed transactions
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const { data: pastTxs } = await supabaseAdmin
      .from('payment_ledger')
      .select('amount, token, status')
      .eq('user_id', user.id)
      .gte('created_at', oneDayAgo)
      .neq('intent_id', intentId)
      .in('status', ['RESERVED', 'SUBMITTING', 'PENDING', 'CONFIRMED', 'COMPLETE']);

    const unitPriceUsd = (actualTokenAmount && actualTokenAmount > 0)
      ? (requestedAmountUsd / actualTokenAmount)
      : 1;

    const dailySpent = (pastTxs || []).reduce((sum, tx) => {
      let val = Number(tx.amount || 0);
      if (tx.token === 'SOL') {
        // Multiply SOL amount by unit price to get USD spent
        val = val * (unitPriceUsd > 1 ? unitPriceUsd : 103);
      }
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    if (dailySpent + requestedAmountUsd > dailyLimit) {
      const tokenLabel = req.tokenAmount ? ` (${req.tokenAmount} ${tokenSymbol})` : '';
      const err = new Error(`Transaction value of $${requestedAmountUsd.toFixed(2)} USD${tokenLabel} exceeds your daily transfer limit of $${dailyLimit.toFixed(2)} USD. Already spent in last 24h: $${dailySpent.toFixed(2)} USD.`);
      (err as any).status = 403;
      throw err;
    }

    // 2) Check existing intent
    const { data: existingIntent } = await supabaseAdmin
      .from('payment_ledger')
      .select('id, status, circle_tx_id, updated_at, error_reason')
      .eq('intent_id', intentId)
      .maybeSingle();

    if (existingIntent) {
      if (['PENDING', 'CONFIRMED', 'COMPLETE', 'SUBMITTING'].includes(existingIntent.status) && existingIntent.circle_tx_id) {
        return { status: 'ALREADY_EXECUTED', txHash: existingIntent.circle_tx_id };
      }

      const hasAuth = !!(authDetails.passkeyProof || authDetails.password);
      // Allow intent re-activation if:
      // a) The user is submitting credentials (passkey proof or password) for this challenge, OR
      // b) The intent was previously marked FAILED (e.g. 'Pending Passkey Prompt' or cancelled)
      if (hasAuth || existingIntent.status === 'FAILED') {
        const { error: reactivateErr } = await supabaseAdmin
          .from('payment_ledger')
          .update({
            status: 'RESERVED',
            amount: actualTokenAmount,
            error_reason: null,
            updated_at: Date.now()
          })
          .eq('id', existingIntent.id);

        if (reactivateErr) {
          const err = new Error('Failed to reactivate transaction intent: ' + reactivateErr.message);
          (err as any).status = 500;
          throw err;
        }

        insertedLedgerId = existingIntent.id;
      } else {
        const err = new Error('Duplicate transaction intent detected');
        (err as any).status = 409;
        throw err;
      }
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('payment_ledger')
        .insert({
          user_id: user.id,
          intent_id: intentId,
          amount: actualTokenAmount,
          token: tokenSymbol,
          status: 'RESERVED',
          from_wallet: fromWallet.toLowerCase(),
          to_wallet: toWallet.toLowerCase(),
          created_at: Date.now(),
          updated_at: Date.now()
        })
        .select('id')
        .single();

      if (insertErr) {
        const err = new Error('Failed to acquire ledger reservation: ' + insertErr.message);
        (err as any).status = 500;
        throw err;
      }
      insertedLedgerId = inserted.id;
    }
  } else if (reserveRes.error || !reserveRes.data || !reserveRes.data.success) {
    if (reserveRes.data?.error === 'DUPLICATE_INTENT') {
      const existingStatus = reserveRes.data.status;
      const ledgerId = reserveRes.data.ledger_id;
      const circleTxId = reserveRes.data.circle_tx_id;
      const updatedAt = reserveRes.data.updated_at;

      if (['PENDING', 'CONFIRMED', 'COMPLETE', 'SUBMITTING'].includes(existingStatus) && circleTxId) {
        return { status: 'ALREADY_EXECUTED', txHash: circleTxId };
      }

      const hasAuth = !!(authDetails.passkeyProof || authDetails.password);
      if (hasAuth || existingStatus === 'FAILED') {
        const { error: reactivateErr } = await supabaseAdmin
          .from('payment_ledger')
          .update({
            status: 'RESERVED',
            amount: actualTokenAmount,
            error_reason: null,
            updated_at: Date.now()
          })
          .eq('id', ledgerId);

        if (reactivateErr) {
          console.error('Failed to reactivate ledger intent:', reactivateErr);
          const err = new Error('Failed to reactivate transaction intent: ' + reactivateErr.message);
          (err as any).status = 500;
          throw err;
        }

        insertedLedgerId = ledgerId;
      } else if (['RESERVED', 'UNKNOWN'].includes(existingStatus) && updatedAt) {
        const ageMs = Date.now() - Number(updatedAt);
        if (ageMs > 60000) {
          console.log(JSON.stringify({ level: 'INFO', event: 'RECOVERY_ATTEMPT', intentId, ageMs }));
          try {
            const res = await fetch(`https://api.circle.com/v1/w3s/transactions?refIds=${intentId}`, {
              headers: { 'Authorization': `Bearer ${process.env.CIRCLE_API_KEY}` }
            });
            const circleData = await res.json();
            const tx = circleData?.data?.transactions?.[0];
            
            if (tx) {
              console.log(JSON.stringify({ level: 'INFO', event: 'RECOVERY_SUCCESS', intentId, circleTxId: tx.id }));
              await supabaseAdmin.from('payment_ledger').update({ status: 'PENDING', circle_tx_id: tx.id, updated_at: Date.now() }).eq('id', ledgerId);
              return { status: 'ALREADY_EXECUTED', txHash: tx.id };
            } else {
              console.log(JSON.stringify({ level: 'INFO', event: 'RECOVERY_RELEASE_RESERVATION', intentId }));
              await safeReleaseReservation(supabaseAdmin, intentId, 'Recovered from orphaned state (Circle timeout)');
              const err = new Error('Previous intent was stuck and has been automatically released. Please retry your request.');
              (err as any).status = 409;
              throw err;
            }
          } catch (recoveryErr: any) {
            console.error(JSON.stringify({ level: 'ERROR', event: 'RECOVERY_FAILED', intentId, error: recoveryErr.message }));
          }
        }
        const err = new Error('Duplicate transaction intent detected');
        (err as any).status = 409;
        throw err;
      } else {
        const err = new Error('Duplicate transaction intent detected');
        (err as any).status = 409;
        throw err;
      }
    } else if (reserveRes.data?.error === 'LIMIT_EXCEEDED') {
      const tokenLabel = req.tokenAmount ? ` (${req.tokenAmount} ${tokenSymbol})` : '';
      const err = new Error(`Transaction value of $${requestedAmountUsd.toFixed(2)} USD${tokenLabel} exceeds your daily limit of $${dailyLimit.toFixed(2)} USD or transaction count limit reached.`);
      (err as any).status = 403;
      throw err;
    } else {
      console.error('Failed to acquire DB-Atomic reservation lock:', reserveRes.error || reserveRes.data);
      const err = new Error('Failed to process transaction lock');
      (err as any).status = 500;
      throw err;
    }
  } else {
    insertedLedgerId = reserveRes.data.ledger_id;
  }

  // 5. Mandatory Security Setup Check
  const hasPasskey = user.app_metadata?.passkeys && user.app_metadata.passkeys.length > 0;
  const passkeyNotSupported = user.app_metadata?.passkey_not_supported === true;
  const hasPassword = !!policies?.password_hash;
  const isFullySecured = (hasPasskey || passkeyNotSupported) && hasPassword;

  if (!isFullySecured) {
    await safeReleaseReservation(supabaseAdmin, intentId, 'Wallet not activated');
    const err = new Error('Wallet is not active. You must complete both Passkey and Password security onboarding.');
    (err as any).status = 403;
    (err as any).code = 'SECURITY_SETUP_REQUIRED';
    throw err;
  }

  // 6. Evaluate Security Authentication Requirement
  let requirePasskey = false;
  let passkeyReason = '';

  if (passkeyMode === 'ALWAYS') {
    requirePasskey = true;
    passkeyReason = 'Passkey authentication required for all outgoing transactions.';
  } else if (passkeyMode === 'THRESHOLD') {
    if (requestedAmountUsd >= passkeyThreshold) {
      requirePasskey = true;
      const tokenLabel = req.tokenAmount ? ` (${req.tokenAmount} ${tokenSymbol})` : '';
      passkeyReason = `Transaction amount $${requestedAmountUsd.toFixed(2)} USD${tokenLabel} meets or exceeds your passkey threshold ($${passkeyThreshold.toFixed(2)} USD).`;
    }
  }

  const hasProvidedAuth = !!(authDetails.passkeyProof || authDetails.password);

  if (requirePasskey && !hasProvidedAuth) {
    // Release the intent reservation so the user can re-try after prompt
    await safeReleaseReservation(supabaseAdmin, intentId, 'Pending Passkey Prompt');
    
    // Save pending transaction details to secure app_metadata
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        pendingTx: { amount: requestedAmountUsd, destination: toWallet, intentId }
      }
    });
    
    return {
      status: 'PASSKEY_REQUIRED',
      threshold: passkeyMode === 'THRESHOLD' ? passkeyThreshold : 0,
      reason: passkeyReason,
      has_password: !!policies?.password_hash
    };
  } 
  
  if (requirePasskey) {
    if (authDetails.password) {
      if (!policies?.password_hash) {
         await safeReleaseReservation(supabaseAdmin, intentId, 'Password auth not configured');
         const err = new Error('Password authentication is not configured for this account.');
         (err as any).status = 403;
         throw err;
      }
      
      const isValidPassword = await bcrypt.compare(authDetails.password, policies.password_hash);
      if (!isValidPassword) {
         await safeReleaseReservation(supabaseAdmin, intentId, 'Invalid password');
         const err = new Error('Invalid password.');
         (err as any).status = 403;
         throw err;
      }
      // Password verified successfully!
    } else if (authDetails.passkeyProof) {
      let expectedChallenge = null;
      try {
        const clientData = JSON.parse(Buffer.from(authDetails.passkeyProof.response.clientDataJSON, 'base64').toString('utf8'));
        expectedChallenge = clientData.challenge;
      } catch (e) {
        await safeReleaseReservation(supabaseAdmin, intentId, 'Invalid passkey proof structure');
        const err = new Error('Invalid passkey proof structure.');
        (err as any).status = 400;
        throw err;
      }

      const pendingTx = user.app_metadata?.pendingTx;
      
      // Atomically consume the challenge using system_settings optimistic locking
      const { data: challengeData } = await supabaseAdmin
        .from('system_settings')
        .select('value')
        .eq('key', expectedChallenge)
        .maybeSingle();

      if (!challengeData || challengeData.value === 'CONSUMED') {
        await safeReleaseReservation(supabaseAdmin, intentId, 'Challenge invalid or consumed');
        const err = new Error('Authentication challenge invalid or expired. Please try again.');
        (err as any).status = 400;
        throw err;
      }

      const [status, challengeUserId, expiresAt] = challengeData.value.split('_');
      if (challengeUserId !== user.id || Date.now() > parseInt(expiresAt)) {
        await safeReleaseReservation(supabaseAdmin, intentId, 'Challenge expired or mismatch');
        const err = new Error('Authentication challenge invalid or expired. Please try again.');
        (err as any).status = 400;
        throw err;
      }

      // Optimistic concurrency check
      const { data: consumedData, error: consumeErr } = await supabaseAdmin
        .from('system_settings')
        .update({ value: 'CONSUMED' })
        .eq('key', expectedChallenge)
        .eq('value', challengeData.value)
        .select('key')
        .maybeSingle();

      if (consumeErr || !consumedData) {
        await safeReleaseReservation(supabaseAdmin, intentId, 'Challenge consumed concurrently');
        const err = new Error('Authentication challenge consumed concurrently. Please try again.');
        (err as any).status = 400;
        throw err;
      }

      // Cryptographically bind the passkey verification to the original transaction parameters
      if (!pendingTx || Math.abs(Number(pendingTx.amount) - requestedAmountUsd) > 0.01 || pendingTx.destination !== toWallet || pendingTx.intentId !== intentId) {
        await safeReleaseReservation(supabaseAdmin, intentId, 'Transaction tampering detected');
        const err = new Error('Transaction parameters have been tampered with. Authentication rejected.');
        (err as any).status = 403;
        throw err;
      }

      const config = getWebAuthnConfig();
      try {
        validateProductionWebAuthnConfig(config);
      } catch (e: any) {
        const err = new Error('Internal Server Error (WebAuthn config)');
        (err as any).status = 500;
        throw err;
      }
      
      const passkey = (user.app_metadata?.passkeys || []).find((k: any) => k.credentialID === authDetails.passkeyProof.id);
      
      if (!passkey) {
        await safeReleaseReservation(supabaseAdmin, intentId, 'Unregistered passkey used');
        const err = new Error('Authenticator is not registered with this account.');
        (err as any).status = 403;
        throw err;
      }

      try {
        const verification = await verifyAuthenticationResponse({
          response: authDetails.passkeyProof,
          expectedChallenge,
          expectedOrigin: config.origin,
          expectedRPID: config.rpID,
          credential: {
            id: passkey.credentialID,
            publicKey: new Uint8Array(Buffer.from(passkey.credentialPublicKey, 'base64')),
            counter: passkey.counter 
          } 
        });

        if (!verification.verified) {
          throw new Error('Cryptographic signature verification failed.');
        }

        // Update the counter
        const updatedPasskeys = (user.app_metadata?.passkeys || []).map((k: any) => 
          k.credentialID === passkey.credentialID ? { ...k, counter: verification.authenticationInfo.newCounter } : k
        );

        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          app_metadata: {
            ...user.app_metadata,
            pendingTx: null,
            passkeys: updatedPasskeys
          }
        });
      } catch (passkeyErr: any) {
        console.error("Passkey verification error:", passkeyErr);
        await safeReleaseReservation(supabaseAdmin, intentId, 'WebAuthn verification failed');
        const err = new Error('Passkey verification failed: ' + passkeyErr.message);
        (err as any).status = 400;
        throw err;
      }
    }
  
    // Clear pending transaction
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, pendingTx: null }
    });
    
    // Transition to SUBMITTING before calling Circle
    await supabaseAdmin.from('payment_ledger').update({ status: 'SUBMITTING', updated_at: Date.now() }).eq('id', insertedLedgerId);
  }

  return { status: 'APPROVED', ledgerId: insertedLedgerId };
}

export async function finalizeTransactionLock(
  supabaseAdmin: SupabaseClient,
  ledgerId: string,
  circleTxId: string | null,
  finalStatus: 'PENDING' | 'FAILED' | 'UNKNOWN',
  errorReason?: string
) {
  const updateData: any = {
    status: finalStatus,
    updated_at: Date.now()
  };
  if (circleTxId) updateData.circle_tx_id = circleTxId;
  if (errorReason) updateData.error_reason = errorReason;

  const { data: updatedData, error } = await supabaseAdmin
    .from('payment_ledger')
    .update(updateData)
    .eq('id', ledgerId)
    .select('user_id, amount')
    .maybeSingle();
    
  if (error) {
    console.error(`Failed to finalize ledger lock ${ledgerId} to ${finalStatus}:`, error);
  }
}
