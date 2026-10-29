import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('arc_session')?.value;
    
    let wallet = 'unknown';
    if (token) {
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
        wallet = decoded.sub || 'unknown';
      } catch (e) {}
    }

    const res = NextResponse.json({ success: true });
    res.cookies.delete('arc_session');

    // Auth logging
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    await supabaseAdmin.from('auth_logs').insert({
      wallet,
      ip,
      user_agent: req.headers.get('user-agent') || 'unknown',
      action: 'logout'
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ success: true });
  }
}
