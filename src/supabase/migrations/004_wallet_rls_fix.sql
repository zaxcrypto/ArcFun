-- V4 Addendum: Wallet-Based Submission RLS Fixes
-- Replaces JWT-dependent INSERT policies with relaxed anon inserts that force the 'pending' status.
-- This securely allows unauthenticated frontend submissions via Arc Wallet while keeping 
-- pending data hidden and secure from public viewing.

-- 1. Fix Projects INSERT
-- Drops the old JWT requirement and allows anon inserts ONLY if status is 'pending'.
DROP POLICY IF EXISTS "Secure insert projects" ON projects;
CREATE POLICY "Anon insert pending projects" ON projects FOR INSERT TO anon WITH CHECK (
  status = 'pending'
);

-- 2. Fix Submissions (Audit Log) INSERT
-- Drops the old JWT requirement and allows anon inserts for the initial pending state.
DROP POLICY IF EXISTS "Secure insert submissions" ON project_submissions;
CREATE POLICY "Anon insert submissions" ON project_submissions FOR INSERT TO anon WITH CHECK (
  status = 'pending'
);

-- 3. Fix Team Members INSERT
-- Allows anon inserts to the team table (required during the initial submission flow).
DROP POLICY IF EXISTS "Owners insert team" ON project_team;
CREATE POLICY "Anon insert team" ON project_team FOR INSERT TO anon WITH CHECK (true);

-- NOTE ON SELECT POLICIES:
-- We DO NOT drop or alter the original `projects` SELECT policy:
-- "Public view approved projects" (status IN ('approved', 'featured') OR lower(owner_wallet) = get_jwt_wallet() OR is_admin(get_jwt_wallet()))
-- Because `get_jwt_wallet()` will evaluate to NULL for unauthenticated frontend users,
-- this guarantees that pending/rejected projects remain STRICTLY HIDDEN from the public API.
-- 
-- Admins and Owners will need to view and manage pending projects via a Backend API Route 
-- that verifies a wallet signature and uses the Supabase Service Role key (which bypasses RLS).
