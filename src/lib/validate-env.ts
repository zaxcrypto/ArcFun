/**
 * Production Environment Variable Validator
 * Validates critical environment variables at startup/build time.
 */

const REQUIRED_PUBLIC_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing = REQUIRED_PUBLIC_VARS.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`[Env Warning] Missing required production env vars: ${missing.join(', ')}`);
  }
}
