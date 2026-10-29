import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

export async function POST(req: Request) {
  try {
    const { targetAddress } = await req.json();
    if (!targetAddress) return NextResponse.json({ error: 'Missing targetAddress' }, { status: 400 });

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
    const otherAddr = targetAddress.toLowerCase();

    // Bypass strict RLS using service role to execute a true hard DELETE for both users
    const { error } = await supabaseAdmin.from('messages')
      .delete()
      .or(`and(sender.eq."${myAddress}",receiver.eq."${otherAddr}"),and(sender.eq."${otherAddr}",receiver.eq."${myAddress}")`);

    if (error) throw error;

    // Scrub the preview text from the left-side profile
    await supabaseAdmin.from('chats')
      .update({ last_message_body: null })
      .contains('participants', [myAddress, otherAddr]);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Delete conversation error:", e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
