-- V5 Addendum: Storage RLS Fix for Anon Uploads
-- Replaces JWT-dependent INSERT policy for storage with relaxed anon inserts.
-- Removes support for 'project-banners' as it was removed from the product.
-- Maintains strict file extension constraints for security.

DROP POLICY IF EXISTS "Secure Upload" ON storage.objects;

CREATE POLICY "Project Logo Upload"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'project-logos'
  AND (
    right(name, 4) IN ('.png', '.jpg', '.svg', '.gif')
    OR right(name, 5) IN ('.jpeg', '.webp')
  )
);
