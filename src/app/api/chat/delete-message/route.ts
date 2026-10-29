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

    // Fetch the message
    const { data: message, error: fetchError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Determine authorization and type of delete
    const isSender = message.sender.toLowerCase() === myAddress;
    const isReceiver = message.receiver.toLowerCase() === myAddress;

    if (!isSender && !isReceiver) {
      return NextResponse.json({ error: 'Unauthorized to delete this message' }, { status: 403 });
    }

    const isPayment = !!message.payment_id;
    const shouldHardDelete = isSender && !isPayment;

    if (shouldHardDelete) {
      // 1. Hard Delete
      const { error: deleteError } = await supabaseAdmin.from('messages').delete().eq('id', messageId);
      if (deleteError) throw deleteError;
    } else {
      // 2. Soft Delete (Receiver, or Sender of a Payment message)
      const currentDeletedFor = message.deleted_for || [];
      if (!currentDeletedFor.includes(myAddress)) {
        const { error: updateError } = await supabaseAdmin
          .from('messages')
          .update({ deleted_for: [...currentDeletedFor, myAddress] })
          .eq('id', messageId);
        if (updateError) throw updateError;
      }
    }

    // 3. Sidebar Consistency: Update the chats table preview
    // We only need to check if this deleted message was the latest one
    // To do this reliably, fetch the *actual* latest remaining message between these two users
    const convoIdParts = [message.sender.toLowerCase(), message.receiver.toLowerCase()].sort();

    const { data: latestMessages } = await supabaseAdmin
      .from('messages')
      .select('body, sender, created_at, media_url, payment_id')
      .or(`and(sender.eq."${convoIdParts[0]}",receiver.eq."${convoIdParts[1]}"),and(sender.eq."${convoIdParts[1]}",receiver.eq."${convoIdParts[0]}")`)
      .order('created_at', { ascending: false })
      .limit(1);

    const updatePayload: any = {};
    if (latestMessages && latestMessages.length > 0) {
      const latest = latestMessages[0];
      const preview = latest.payment_id ? 'Sent a payment' : latest.media_url ? 'Sent an attachment' : latest.body.trim();
      updatePayload.last_message_body = preview;
      updatePayload.last_message_at = new Date(latest.created_at).getTime();
    } else {
      // No messages left in history
      updatePayload.last_message_body = null;
      // We don't nullify last_message_at to keep the chat sorted by its last known activity
    }

    // Update the chats table for both participants
    const { error: chatUpdateError } = await supabaseAdmin
      .from('chats')
      .update(updatePayload)
      .contains('participants', [convoIdParts[0], convoIdParts[1]]);

    if (chatUpdateError) {
      console.error("Failed to update chat preview:", chatUpdateError);
    }

    return NextResponse.json({ success: true, hardDeleted: shouldHardDelete });
  } catch (e: any) {
    console.error("Delete message error:", e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
