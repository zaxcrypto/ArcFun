-- V5 Addendum: Service Role Grants
-- The Supabase 'service_role' needs explicit table-level permissions.
-- In some custom or strict Postgres setups, the service_role is not automatically 
-- granted access to new tables created by the 'postgres' superuser.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dapps_admins TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_submissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_team TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_announcements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_reviews TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_likes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_change_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_logs TO service_role;

-- Also ensure future tables get these grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
