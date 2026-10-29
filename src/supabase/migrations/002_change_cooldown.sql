-- V2 Addendum: Sensitive Change Cooldown System
-- Run AFTER 001_dapps_hub.sql
-- Compatible with: Supabase (PostgreSQL 15+)

-- ── New columns on projects ─────────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sensitive_change_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contract_address TEXT;

-- ── Project Change Requests ──────────────────────────────────────────────────
-- One row per sensitive field change. Requires admin approval before applying.
CREATE TABLE IF NOT EXISTS project_change_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  requested_by TEXT NOT NULL,
  change_type TEXT NOT NULL,   -- e.g. 'name', 'logo_url', 'website_url'
  old_value TEXT,
  new_value TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT REFERENCES dapps_admins(wallet_address),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Admin Audit Logs ──────────────────────────────────────────────────────────
-- Immutable log of every admin action.
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_wallet TEXT NOT NULL,
  action TEXT NOT NULL,        -- 'approve_change' | 'reject_change' | 'override_cooldown'
                               -- | 'suspend' | 'delete' | 'verify_project'
  target_project UUID REFERENCES projects(id) ON DELETE SET NULL,
  metadata JSONB,              -- field_name, old_value, new_value, project_name, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_change_requests_project_id ON project_change_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_status    ON project_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project        ON admin_audit_logs(target_project);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin          ON admin_audit_logs(admin_wallet);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action         ON admin_audit_logs(action);

-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE project_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs        ENABLE ROW LEVEL SECURITY;

-- Change Requests: owners see their own; admins see all
CREATE POLICY "Owners view own change requests" ON project_change_requests FOR SELECT USING (
  lower(requested_by) = get_jwt_wallet() OR is_admin(get_jwt_wallet())
);

-- SERVER-SIDE COOLDOWN ENFORCEMENT: 
-- Only the project owner may submit; wallet must match.
-- CRITICAL: Rejects insert if sensitive_change_approved_at is within the last 14 days.
CREATE POLICY "Owners insert change requests" ON project_change_requests FOR INSERT WITH CHECK (
  get_jwt_wallet() IS NOT NULL
  AND lower(requested_by) = get_jwt_wallet()
  AND EXISTS (
    SELECT 1 FROM projects 
    WHERE id = project_id 
      AND lower(owner_wallet) = get_jwt_wallet()
      AND (
        sensitive_change_approved_at IS NULL 
        OR sensitive_change_approved_at < NOW() - INTERVAL '14 days'
      )
  )
);
-- Only admins may approve or reject
CREATE POLICY "Admins update change requests" ON project_change_requests FOR UPDATE USING (
  is_admin(get_jwt_wallet())
);

-- Audit log: admins view, admins insert (only for their own wallet)
CREATE POLICY "Admins view audit log" ON admin_audit_logs FOR SELECT USING (
  is_admin(get_jwt_wallet())
);
CREATE POLICY "Admins insert audit log" ON admin_audit_logs FOR INSERT WITH CHECK (
  get_jwt_wallet() IS NOT NULL
  AND lower(admin_wallet) = get_jwt_wallet()
  AND is_admin(get_jwt_wallet())
);
