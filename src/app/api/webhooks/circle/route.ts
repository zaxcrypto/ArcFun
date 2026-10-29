import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { circleClient } from '@/lib/circle/wallet-service';
import { safeReleaseReservation } from '@/lib/security/policy-engine';
import * as crypto from 'crypto';
import { v5 as uuidv5 } from 'uuid';
import { getTodayZonedDateString, calculateNextExecutionTimestamp } from '@/lib/autopay/schedule-calculator';
import { AutopayFrequency } from '@/lib/autopay/autopay-types';

const WEBHOOK_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';
const publicKeyCache = new Map<string, crypto.KeyObject>();

export async function POST(req: Request) {
    const traceLogs: string[] = [];
    const logTrace = (msg: string) => {
        traceLogs.push(new Date().toISOString() + " - " + msg);
        (process.env.NODE_ENV === "development" ? console.log : () => {})(msg);
    };
    logTrace("ENTRY - Webhook route called");

    const exit = async (body: any, init?: ResponseInit) => {
        logTrace(`EXITING with body: ${JSON.stringify(body)} and status: ${init?.status || 200}`);
        
        const isError = (init?.status && init.status >= 400) || body?.error;
        
        if (isError) {
            try {
                const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
                    auth: { autoRefreshToken: false, persistSession: false }
                });
                await supabaseAdmin.from('snapshot_failures').insert({
                    user_id: '00000000-0000-0000-0000-000000000000',
                    wallet_address: 'Webhook Trace',
                    network: 'TRACE',
                    error_message: traceLogs.join('\n')
                });
            } catch(e) {}
        }
        return NextResponse.json(body, init);
    };

  try {
    const rawBody = await req.text();
    // 1. Fetch Headers
    const signature = req.headers.get('x-circle-signature');
    const allHeaders: Record<string, string> = {};
    req.headers.forEach((val, key) => { allHeaders[key] = val; });
    logTrace("All headers: " + JSON.stringify(allHeaders));

    const keyId = req.headers.get('x-circle-key-id');

    if (!signature || !keyId) {
      return await exit({ error: "Missing webhook signature or key ID" }, { status: 401 });
    }

    // 2. Fetch or Use Cached Public Key
    let publicKey = publicKeyCache.get(keyId);
    if (!publicKey) {
      try {
        const pkRes = await fetch(`https://api.circle.com/v2/notifications/publicKey/${keyId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.CIRCLE_API_KEY}`
          }
        });
        if (!pkRes.ok) {
          throw new Error(`Failed to fetch public key from Circle: ${pkRes.status}`);
        }
        const pkData = await pkRes.json();
        
        if (pkData?.data?.publicKey && pkData?.data?.algorithm === 'ECDSA_SHA_256') {
          const rawKeyBase64 = pkData.data.publicKey;
          const keyObject = crypto.createPublicKey({
            key: Buffer.from(rawKeyBase64, 'base64'),
            format: 'der',
            type: 'spki'
          });
          publicKeyCache.set(keyId, keyObject);
          publicKey = keyObject;
        } else {
          throw new Error("Invalid response format or unsupported algorithm from Circle");
        }
      } catch (err) {
        console.error("Error fetching public key:", err);
        return await exit({ error: "Unable to retrieve public key" }, { status: 500 });
      }
    }

    logTrace('Starting ECDSA Verification');
    // 3. Verify Signature
    try {
      const isValid = crypto.verify(
        'sha256',
        Buffer.from(rawBody, 'utf8'),
        publicKey!,
        Buffer.from(signature, 'base64')
      );
      
      if (!isValid) {
        return await exit({ error: "Invalid webhook signature" }, { status: 401 });
      }
    } catch (err) {
      console.error("Signature verification error:", err);
      return await exit({ error: "Signature verification error" }, { status: 500 });
    }

    // 4. Parse JSON
    logTrace('ECDSA Verification Successful');
    let body;
    try {
        body = JSON.parse(rawBody);
    } catch (e) {
        return await exit({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // Verify it's a transactions notification
    if (body.notificationType === 'transactions' || body.transaction || body.Type === 'Notification') {
      
      let tx = body.transaction || body.event;
      if (body.Type === 'Notification' && body.Message) {
          try {
              const msg = JSON.parse(body.Message);
              tx = msg.transaction || msg.event || msg;
          } catch(e) {}
      }
      
      logTrace("Transaction extraction result: " + (tx ? JSON.stringify(tx) : "null"));
      if (!tx || !tx.id) {
        return await exit({ success: true, message: "No transaction found in payload" });
      }

      logTrace("Replay Protection Check. txTime: " + (tx.updateDate || tx.createDate));
      const txTime = tx.updateDate || tx.createDate;
      if (txTime) {
          const eventTime = new Date(txTime).getTime();
          const now = Date.now();
          const ONE_HOUR = 60 * 60 * 1000;
          if (now - eventTime > ONE_HOUR) {
              return await exit({ error: "Event too old (Replay Protection)" }, { status: 400 });
          }
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      logTrace("Replay Protection Passed");
      const eventId = body.MessageId || tx.id + '_' + tx.state;
      const { data: existingEvent } = await supabaseAdmin
          .from('webhook_events')
          .select('id, processed')
          .eq('circle_notification_id', eventId)
          .maybeSingle();
          
      if (existingEvent && existingEvent.processed) {
          return await exit({ success: true, message: "Duplicate event ignored" });
      }
      
      const uuidId = uuidv5(eventId, WEBHOOK_NAMESPACE);

      logTrace("Idempotency Passed, attempting DB Insert");
      if (!existingEvent) {
          const { error: insertErr } = await supabaseAdmin.from('webhook_events').insert({ 
              id: uuidId,
              circle_notification_id: eventId,
              event_type: body.notificationType || 'transactions',
              payload: body,
              processed: false,
              created_at: Date.now(),
              processed_at: Date.now()
          });
          
          if (insertErr) {
              if (insertErr.code === '23505') {
                  return await exit({ success: true, message: "Duplicate event caught by database constraint" });
              }
              throw new Error(`Failed to insert webhook event: ${insertErr.message}`);
          }
      }

      // 4. Update or Insert Ledger Status
      if (tx.transactionType === 'INBOUND' && tx.state === 'COMPLETE') {
          const { data: wallet } = await supabaseAdmin
              .from('arc_wallets')
              .select('user_id, blockchain, circle_wallet_id')
              .eq('wallet_address', tx.destinationAddress?.toLowerCase() || '')
              .maybeSingle();

          if (wallet) {
              const { data: existingLedger } = await supabaseAdmin
                  .from('payment_ledger')
                  .select('id')
                  .eq('circle_tx_id', tx.id)
                  .maybeSingle();

              if (!existingLedger) {
                  let tokenSymbol = 'USDC';
                  try {
                      if (tx.tokenId) {
                          const balResp = await circleClient.getWalletTokenBalance({ id: wallet.circle_wallet_id });
                          const foundToken = balResp.data?.tokenBalances?.find((tb: any) => tb.token?.id === tx.tokenId);
                          if (foundToken?.token?.symbol) {
                              tokenSymbol = foundToken.token.symbol;
                          }
                      }
                  } catch (e: any) {
                      console.warn(`[Webhook] Could not resolve token symbol for tokenId ${tx.tokenId}:`, e.message);
                  }

                  const { error: insertLedgerErr } = await supabaseAdmin.from('payment_ledger').insert({
                      user_id: wallet.user_id,
                      status: 'COMPLETE',
                      amount: tx.amounts?.[0] || '0',
                      token: tokenSymbol,
                      from_wallet: tx.sourceAddress || 'External',
                      to_wallet: tx.destinationAddress,
                      blockchain_hash: tx.txHash,
                      circle_tx_id: tx.id,
                      created_at: Date.now(),
                      updated_at: Date.now()
                  });
                  
                  if (insertLedgerErr) {
                      console.error(`[Webhook] Inbound ledger insert failed for ${tx.id}:`, insertLedgerErr);
                      return await exit({ error: 'Failed to insert inbound ledger' }, { status: 500 });
                  }
                  logTrace(`[Webhook] Inserted INBOUND ledger for user ${wallet.user_id}, tx: ${tx.txHash}`);
              }
          }
      } else if (tx.transactionType !== 'INBOUND') {
          let fetchQuery = supabaseAdmin.from('payment_ledger').select('id, status');
          if (tx.refId) {
              fetchQuery = fetchQuery.or(`circle_tx_id.eq.${tx.id},intent_id.eq.${tx.refId}`);
          } else {
              const sourceWallet = tx.sourceAddress || 'External';
              const destWallet = tx.destinationAddress || 'External';
              const amt = tx.amounts?.[0] || '0';
              fetchQuery = fetchQuery.or(`circle_tx_id.eq.${tx.id},and(status.eq.UNKNOWN,from_wallet.ilike.${sourceWallet},to_wallet.ilike.${destWallet},amount.eq.${amt})`);
          }
          
          const { data: currentRows } = await fetchQuery;
          const currentRow = currentRows?.[0];

          if (currentRow) {
              const currentStatus = currentRow.status;
              let shouldUpdate = true;
              
              if ((tx.state === 'INITIATED' || tx.state === 'PENDING') && (currentStatus === 'COMPLETE' || currentStatus === 'FAILED' || currentStatus === 'UNKNOWN')) {
                  shouldUpdate = false;
              }
              if (tx.state === 'FAILED' && currentStatus === 'COMPLETE') {
                  shouldUpdate = false;
              }
              if (tx.state === 'COMPLETE' && currentStatus === 'FAILED') {
                  shouldUpdate = false;
              }

              if (shouldUpdate) {
                  console.log(JSON.stringify({
                      level: 'INFO',
                      event: 'WEBHOOK_STATE_TRANSITION',
                      intentId: tx.refId,
                      circleTxId: tx.id,
                      from: currentStatus,
                      to: tx.state
                  }));
                  
                  if (tx.state === 'FAILED') {
                      await safeReleaseReservation(supabaseAdmin, tx.refId, tx.errorReason || 'Circle Webhook: FAILED');
                      await supabaseAdmin.from('payment_ledger').update({ circle_tx_id: tx.id, updated_at: Date.now() }).eq('id', currentRow.id);
                      await supabaseAdmin.from('payments').update({ status: 'failed' }).eq('id', currentRow.id);
                  } else {
                      const { error: ledgerErr } = await supabaseAdmin
                        .from('payment_ledger')
                        .update({
                          circle_tx_id: tx.id,
                          status: tx.state,
                          blockchain_hash: tx.txHash,
                          updated_at: Date.now()
                        })
                        .eq('id', currentRow.id);

                      if (ledgerErr) {
                          console.error(`[Webhook] Ledger update failed for ${tx.id}:`, ledgerErr);
                          return await exit({ error: 'Failed to update ledger' }, { status: 500 });
                      }

                      if (tx.state === 'COMPLETE') {
                          await supabaseAdmin
                            .from('payments')
                            .update({
                              status: 'confirmed',
                              tx_hash: tx.txHash || null
                            })
                            .eq('id', currentRow.id);
                      }
                  }
              }
          }
      }

      // 4.1 Reconcile Autopay Executions if refId is from Autopay or matches intent_id/circle_tx_id
      if (tx.refId || tx.id) {
        const isComplete = (tx.state === 'COMPLETE' || tx.state === 'CONFIRMED') && !!tx.txHash;
        const isFailed = tx.state === 'FAILED' || tx.state === 'CANCELLED' || tx.state === 'DENIED';
        const autopayExecStatus = isComplete ? 'CONFIRMED' : (isFailed ? 'FAILED' : 'PENDING');
        const updatePayload: Record<string, any> = {
          circle_tx_id: tx.id,
          status: autopayExecStatus,
          updated_at: Date.now()
        };
        if (tx.txHash) {
          updatePayload.blockchain_tx_hash = tx.txHash;
        }
        if (tx.errorReason) {
          updatePayload.error_reason = tx.errorReason;
        }

        let execQuery = supabaseAdmin.from('autopay_executions').update(updatePayload);
        if (tx.refId && tx.refId.startsWith('autopay_')) {
          execQuery = execQuery.eq('idempotency_key', tx.refId);
        } else if (tx.refId) {
          execQuery = execQuery.or(`intent_id.eq.${tx.refId},circle_tx_id.eq.${tx.id}`);
        } else {
          execQuery = execQuery.eq('circle_tx_id', tx.id);
        }

        const { data: updatedExec } = await execQuery
          .select('id, schedule_id, amount')
          .maybeSingle();

        if (updatedExec?.schedule_id) {
          if (isComplete) {
            const { data: schedule } = await supabaseAdmin
              .from('autopay_schedules')
              .select('*')
              .eq('id', updatedExec.schedule_id)
              .maybeSingle();

            let scheduleUpdate: Record<string, any> = {
              last_execution_status: 'CONFIRMED',
              updated_at: Date.now()
            };
            let paymentsUpdate: Record<string, any> = {
              status: 'confirmed',
              ...(tx.txHash ? { tx_hash: tx.txHash } : {}),
              active: true
            };

            if (schedule && schedule.status === 'ACTIVE' && schedule.next_execution_at && Number(schedule.next_execution_at) <= Date.now()) {
              const nextTimestamp = calculateNextExecutionTimestamp({
                frequency: schedule.frequency as AutopayFrequency,
                executionTime: schedule.execution_time,
                timezone: schedule.timezone,
                monthlyDay: schedule.monthly_day,
                weeklyDay: schedule.weekly_day,
                startDate: schedule.start_date,
                fromTimestamp: Date.now()
              });

              const todayIso = getTodayZonedDateString(schedule.timezone || 'Asia/Kolkata');
              const nextZoned = getTodayZonedDateString(schedule.timezone || 'Asia/Kolkata', nextTimestamp);
              const isExhausted = Boolean(
                schedule.end_date &&
                (schedule.end_date < todayIso || nextZoned > schedule.end_date)
              );

              if (isExhausted) {
                scheduleUpdate.status = 'EXHAUSTED';
                scheduleUpdate.next_execution_at = null;
                paymentsUpdate.active = false;
                paymentsUpdate.next_payment_at = null;
              } else {
                scheduleUpdate.next_execution_at = nextTimestamp;
                paymentsUpdate.active = true;
                paymentsUpdate.next_payment_at = new Date(nextTimestamp).toISOString();
              }
            }

            await supabaseAdmin
              .from('autopay_schedules')
              .update(scheduleUpdate)
              .eq('id', updatedExec.schedule_id);

            await supabaseAdmin
              .from('payments')
              .update(paymentsUpdate)
              .eq('id', updatedExec.schedule_id);

            if (tx.txHash && updatedExec.id) {
              await supabaseAdmin
                .from('payments')
                .update({
                  status: 'confirmed',
                  tx_hash: tx.txHash
                })
                .eq('id', updatedExec.id);
            }
          } else if (isFailed) {
            const { data: schedule } = await supabaseAdmin
              .from('autopay_schedules')
              .select('current_month_spent, consecutive_failures')
              .eq('id', updatedExec.schedule_id)
              .maybeSingle();

            const newFailures = (schedule?.consecutive_failures || 0) + 1;
            const revertedSpent = Math.max(0, (schedule?.current_month_spent || 0) - (Number(updatedExec.amount) || 0));
            const shouldPause = newFailures >= 3;

            const scheduleUpdate: Record<string, any> = {
              last_execution_status: 'FAILED',
              last_error_reason: tx.errorReason || 'Circle transaction failed on-chain',
              consecutive_failures: newFailures,
              current_month_spent: revertedSpent,
              updated_at: Date.now()
            };
            if (shouldPause) {
              scheduleUpdate.status = 'PAUSED';
            }

            await supabaseAdmin
              .from('autopay_schedules')
              .update(scheduleUpdate)
              .eq('id', updatedExec.schedule_id);
          }
        }

        logTrace(`[Webhook] Reconciled autopay execution for refId ${tx.refId} to status ${autopayExecStatus} (txHash: ${tx.txHash || 'none'})`);
      }
      
      // 5. Mark Event Processed
      await supabaseAdmin
        .from('webhook_events')
        .update({ processed: true, processed_at: Date.now() })
        .eq('id', existingEvent ? existingEvent.id : uuidId);
        
      logTrace(`[Webhook] Updated payment ${tx.id} to state ${tx.state}`);

      if (tx.state === 'COMPLETE') {
          const { data: ledgerEntry } = await supabaseAdmin
              .from('payment_ledger')
              .select('user_id, from_wallet, to_wallet, amount, token')
              .eq('circle_tx_id', tx.id)
              .maybeSingle();

          // Notification processed successfully
      }
    }

    return await exit({ success: true });
  } catch (error) {
    console.error('Webhook processing failed:', error);
    return await exit({ error: 'Internal Server Error' }, { status: 500 });
  }
}
