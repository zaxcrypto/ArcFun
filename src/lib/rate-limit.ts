import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function checkRateLimit(
  req: Request, 
  walletAddress?: string, 
  options: { maxRequests: number, windowMs: number } = { maxRequests: 20, windowMs: 60000 }
): Promise<NextResponse | null> {
  const pathname = new URL(req.url).pathname;
  
  // IP Rate Limiting (Basic)
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
  if (ip !== 'unknown') {
    const ipKey = `ip:${pathname}:${ip}`;
    const { data: allowed, error } = await supabaseAdmin.rpc('increment_rate_limit', {
      p_key: ipKey,
      p_window_ms: options.windowMs,
      p_max: options.maxRequests
    });
    if (error) console.error("Rate limit error (IP):", error);
    
    if (allowed === false) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please wait and try again.' }, { status: 429 });
    }
  }

  // Wallet Rate Limiting (If provided)
  if (walletAddress) {
    const cleanWallet = `wallet:${pathname}:${walletAddress.toLowerCase()}`;
    // Wallets get full allowance specified by maxRequests (minimum 5)
    const walletMax = Math.max(5, options.maxRequests);
    const { data: allowed, error } = await supabaseAdmin.rpc('increment_rate_limit', {
      p_key: cleanWallet,
      p_window_ms: options.windowMs,
      p_max: walletMax
    });
    if (error) console.error("Rate limit error (Wallet):", error);
    
    if (allowed === false) {
      return NextResponse.json({ error: 'Wallet rate limit exceeded. Cooldown active.' }, { status: 429 });
    }
  }

  return null; // OK
}

// In-memory simple rate limiter and circuit breaker
const ipRateLimits = new Map<string, { count: number; windowStart: number }>();
const MAX_REQUESTS_PER_MINUTE = 20;

let circuitBreakerFailures = 0;
let circuitBreakerTrippedUntil = 0;
const MAX_FAILURES = 5;
const BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRateLimits.get(ip);

  if (!record) {
    ipRateLimits.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (now - record.windowStart > 60000) {
    record.count = 1;
    record.windowStart = now;
    return true;
  }

  record.count += 1;
  return record.count <= MAX_REQUESTS_PER_MINUTE;
}

export function isCircuitBreakerTripped(): boolean {
  if (Date.now() < circuitBreakerTrippedUntil) {
    return true;
  }
  if (circuitBreakerTrippedUntil !== 0 && Date.now() > circuitBreakerTrippedUntil) {
    circuitBreakerFailures = 0;
    circuitBreakerTrippedUntil = 0;
  }
  return false;
}

export function recordExplorerFailure(): void {
  circuitBreakerFailures += 1;
  if (circuitBreakerFailures >= MAX_FAILURES) {
    circuitBreakerTrippedUntil = Date.now() + BREAKER_COOLDOWN_MS;
    console.error(`[CIRCUIT BREAKER] Tripped for 5 minutes due to ${MAX_FAILURES} consecutive Explorer API failures.`);
  }
}

export function recordExplorerSuccess(): void {
  if (circuitBreakerFailures > 0 && !isCircuitBreakerTripped()) {
    circuitBreakerFailures = 0;
  }
}

export function getBreakerRetryAfter(): number {
  return circuitBreakerTrippedUntil;
}
