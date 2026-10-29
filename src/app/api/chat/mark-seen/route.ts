import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

export async function POST(req: Request) {
  try {
    const { messageId } = await req.json();
    if (!messageId) return NextResponse.json({ error: 'Missing messageId' }, { status: 400 });

    const cookieStore = await cookies();
    const token = cookieStore.get('arc_session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const myAddress = decoded.sub.toLowerCase();

    // Prevent unauthorized read receipts by confirming the caller is the true receiver
    const { data: msg } = await supabaseAdmin.from('messages').select('receiver').eq('id', messageId).single();
    if (!msg || msg.receiver.toLowerCase() !== myAddress) {
      return NextResponse.json({ error: 'Not authorized to mark this message as seen' }, { status: 403 });
    }

    // Bypass strict RLS using service role to successfully update the read state
    const { error } = await supabaseAdmin.from('messages').update({ seen: true }).eq('id', messageId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Mark seen error:", e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
