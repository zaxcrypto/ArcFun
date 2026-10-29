-- 020_profile_avatars_storage.sql
-- Sets up the 'avatars' storage bucket and granular owner-only policies.

-- Create public avatars bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

-- Update SELECT policy to allow public access to project-logos, project-banners, and avatars
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id IN ('project-logos', 'project-banners', 'avatars'));

-- granular INSERT policy for owner-only avatar upload
DROP POLICY IF EXISTS "Avatar Upload" ON storage.objects;
CREATE POLICY "Avatar Upload" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'avatars'
  AND (auth.jwt() ->> 'email' = (lower(split_part(name, '.', 1)) || '@arcfun.xyz'))
  AND (right(name, 4) IN ('.png', '.jpg', '.svg', '.gif') OR right(name, 5) IN ('.jpeg', '.webp'))
);

-- granular UPDATE policy for owner-only avatar replacement
DROP POLICY IF EXISTS "Avatar Update" ON storage.objects;
CREATE POLICY "Avatar Update" 
ON storage.objects FOR UPDATE 
USING (
  bucket_id = 'avatars'
  AND (auth.jwt() ->> 'email' = (lower(split_part(name, '.', 1)) || '@arcfun.xyz'))
);

-- granular DELETE policy for owner-only avatar deletion
DROP POLICY IF EXISTS "Avatar Delete" ON storage.objects;
CREATE POLICY "Avatar Delete" 
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'avatars'
  AND (auth.jwt() ->> 'email' = (lower(split_part(name, '.', 1)) || '@arcfun.xyz'))
);
