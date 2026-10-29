import { createClient } from '@supabase/supabase-js';
import { RealtimeClient } from '@supabase/realtime-js';

const isBrowser = typeof window !== 'undefined';
const supabaseUrl = isBrowser ? `${window.location.origin}/supabase-proxy` : (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

// Configure Realtime client: Next.js middleware cannot proxy WebSockets.
// Point Realtime WebSocket connection directly to Supabase if NEXT_PUBLIC_SUPABASE_URL is defined.
if (isBrowser && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const directRealtimeUrl = new URL('realtime/v1', process.env.NEXT_PUBLIC_SUPABASE_URL);
    directRealtimeUrl.protocol = directRealtimeUrl.protocol.replace('http', 'ws');
    (supabase as any).realtimeUrl = directRealtimeUrl;
    (supabase as any).realtime = new RealtimeClient(directRealtimeUrl.href, {
      params: { apikey: supabaseAnonKey }
    });
  } catch (e) {
    console.warn('[Supabase] Failed to configure direct Realtime endpoint:', e);
  }
}

