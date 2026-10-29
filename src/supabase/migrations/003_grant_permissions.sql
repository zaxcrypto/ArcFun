-- V3 Addendum: PostgREST Role Permissions
-- Ensures the Supabase API Gateway roles (anon, authenticated) have table-level access.
-- Without these grants, PostgREST throws a 42501 Permission Denied error before RLS is even evaluated.
-- Actual data isolation and security remains strictly enforced by the Row Level Security (RLS) policies defined in V1 and V2.

-- 1. Ensure basic schema usage is allowed
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2. Grant table-level CRUD permissions to both roles for all V1 Core Tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dapps_admins TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_submissions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_team TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_announcements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_reviews TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_likes TO anon, authenticated;

-- 3. Grant table-level CRUD permissions for V2 Cooldown/Audit Tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_change_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_logs TO anon, authenticated;
