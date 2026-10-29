import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/rate-limit';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'secret';

export async function GET(req: Request) {
  try {
    const rateLimitError = await checkRateLimit(req, undefined, { maxRequests: 5, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    const cookieStore = await cookies();
    const token = cookieStore.get('arc_session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ token });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
