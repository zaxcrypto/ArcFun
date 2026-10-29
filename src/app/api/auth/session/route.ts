import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('arc_session')?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      
      return NextResponse.json({
        authenticated: true,
        address: decoded.sub
      });
    } catch (e) {
      // Invalid or expired token
      const res = NextResponse.json({ authenticated: false });
      res.cookies.delete('arc_session');
      return res;
    }
  } catch (err: any) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
}
