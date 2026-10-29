// @ts-nocheck
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: 'Server misconfiguration: Missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { admin_wallet, action, target_id, payload, project_name, signature, timestamp } = await req.json();

    if (!admin_wallet || !action || !target_id || !signature || !timestamp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeof timestamp !== 'number' || Math.abs(Date.now() - timestamp) > 600000) {
      return NextResponse.json({ error: 'Unauthorized: Signature has expired' }, { status: 401 });
    }

    const cleanWallet = admin_wallet.toLowerCase().trim();

    // 0. Verify Signature
    try {
      const { verifyMessage } = await import('viem');
      const isValidSignature = await verifyMessage({
        address: admin_wallet,
        message: `ArcFun Admin Action: ${action} on ${target_id} at ${timestamp}`,
        signature 
      });
      if (!isValidSignature) {
         return NextResponse.json({ error: 'Unauthorized: Invalid admin signature' }, { status: 401 });
      }
    } catch (e) {
      return NextResponse.json({ error: 'Unauthorized: Signature verification failed' }, { status: 401 });
    }

    // 1. Verify Admin
    const { data: adminCheck, error: adminErr } = await supabaseAdmin
      .from('dapps_admins')
      .select('wallet_address')
      .eq('wallet_address', cleanWallet.toLowerCase())
      .limit(1)
      .maybeSingle();

    if (adminErr || !adminCheck) {
      return NextResponse.json({ error: 'Unauthorized: Wallet is not an ArcFun admin' }, { status: 403 });
    }

    const adminAddressLower = admin_wallet.toLowerCase();
    const auditMeta: any = { project_name: project_name || 'Unknown' };

    // 2. Process Admin Action
    switch (action) {


      case 'update_status':
        const { status } = payload;
        const updates: any = { status };
        
        if (status === 'approved' || status === 'featured') {
          updates.approved_by = adminAddressLower;
          updates.approved_at = new Date().toISOString();
        }

        const { error: statusErr } = await supabaseAdmin.from('projects').update(updates).eq('id', target_id);
        if (statusErr) throw statusErr;
        
        auditMeta.new_status = status;
        break;

      case 'toggle_verify':
        const { is_verified } = payload;
        const { error: verifyErr } = await supabaseAdmin.from('projects').update({
          is_verified,
          verified_at: is_verified ? new Date().toISOString() : null
        }).eq('id', target_id);
        
        if (verifyErr) throw verifyErr;
        auditMeta.is_verified = is_verified;
        break;

      case 'delete_project':
        const { error: delErr } = await supabaseAdmin.from('projects').delete().eq('id', target_id);
        if (delErr) throw delErr;
        break;

      case 'process_request':
        const { req_status, change_type, new_value, old_value, project_id } = payload;
        
        // Update request status
        const { error: reqErr } = await supabaseAdmin.from('project_change_requests').update({
          status: req_status,
          reviewed_by: adminAddressLower,
          reviewed_at: new Date().toISOString()
        }).eq('id', target_id);
        if (reqErr) throw reqErr;

        // Apply change to project if approved
        if (req_status === 'approved') {
          const { error: applyErr } = await supabaseAdmin.from('projects').update({
            [change_type]: new_value,
            sensitive_change_approved_at: new Date().toISOString()
          }).eq('id', project_id);
          if (applyErr) throw applyErr;
        }

        auditMeta.field = change_type;
        auditMeta.old = old_value;
        auditMeta.new = new_value;
        break;

      case 'update_system_setting':
        const { key, value } = payload;
        const { error: upsertErr } = await supabaseAdmin.from('system_settings').upsert({
          key,
          value,
          updated_at: Date.now(),
          updated_by: adminAddressLower
        }, { onConflict: 'key' });
        
        if (upsertErr) throw upsertErr;
        
        auditMeta.key = key;
        auditMeta.value = value;
        break;

      case 'update_platform_setting':
        const { setting_key, bool_value } = payload;
        if (typeof setting_key !== 'string' || typeof bool_value !== 'boolean') {
          return NextResponse.json({ error: 'Invalid platform setting payload' }, { status: 400 });
        }
        const { error: platformErr } = await supabaseAdmin.from('platform_settings').upsert({
          key: setting_key,
          bool_value,
          updated_at: Date.now(),
          updated_by: adminAddressLower
        }, { onConflict: 'key' });
        
        if (platformErr) throw platformErr;
        
        auditMeta.setting_key = setting_key;
        auditMeta.bool_value = bool_value;
        break;

      case 'update_onchain_access_setting':
        const { module, mode } = payload;
        const { error: accessErr } = await supabaseAdmin.from('onchain_access_settings').upsert({
          module,
          mode,
          updated_at: Date.now(),
          updated_by: adminAddressLower
        }, { onConflict: 'module' });
        
        if (accessErr) throw accessErr;
        
        auditMeta.module = module;
        auditMeta.mode = mode;
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // 3. Write Audit Log
    const isProjectUUID = target_id && target_id.length === 36 && target_id.includes('-');
    await supabaseAdmin.from('admin_audit_logs').insert({
      target_project: action === 'process_request' ? payload.project_id : (isProjectUUID ? target_id : null),
      admin_wallet: adminAddressLower,
      action: action === 'process_request' ? `${payload.req_status}_change` : action,
      metadata: {
        ...auditMeta,
        target_id: !isProjectUUID ? target_id : undefined
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Admin Action Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
