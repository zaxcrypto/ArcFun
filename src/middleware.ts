import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';

  // Subdomain rewrite for docs (e.g. docs.thearcfun.xyz)
  if (host.startsWith('docs.') && !req.nextUrl.pathname.startsWith('/_next') && !req.nextUrl.pathname.startsWith('/api')) {
    if (req.nextUrl.pathname === '/') {
      return NextResponse.rewrite(new URL('/docs', req.url));
    }
  }

  // Proxy /supabase-proxy requests to the actual Supabase instance
  if (req.nextUrl.pathname.startsWith('/supabase-proxy')) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return NextResponse.next();

    // Reconstruct the actual Supabase URL
    const targetPath = req.nextUrl.pathname.replace('/supabase-proxy', '');
    const targetUrl = new URL(targetPath, supabaseUrl);
    
    // Copy original query parameters
    req.nextUrl.searchParams.forEach((value, key) => {
      targetUrl.searchParams.append(key, value);
    });

    const requestHeaders = new Headers(req.headers);
    
    // Read the HttpOnly cookie
    const token = req.cookies.get('arc_session')?.value;
    
    if (token) {
      const isAuthOrRealtime = 
        targetPath.startsWith('/rest/v1/auth_challenges') ||
        targetPath.startsWith('/rest/v1/auth_logs') ||
        targetPath.startsWith('/realtime/v1');

      const authHeader = requestHeaders.get('Authorization');
      const isAnon = !authHeader || authHeader === `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`;

      // Only forcefully inject the custom JWT if targeting Chat/Realtime infrastructure
      // OR if the request is unauthenticated (using anon key).
      // This preserves the real Supabase Auth session token for /auth/v1/user and Wallet APIs.
      if (isAuthOrRealtime || isAnon) {
        requestHeaders.set('Authorization', `Bearer ${token}`);
        // DO NOT overwrite apikey. Kong requires it to be the Anon Key.
      }
    }

    return NextResponse.rewrite(targetUrl, {
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/supabase-proxy/:path*', '/'],
};
