import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/rate-limit';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'secret';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedAddress = searchParams.get('address')?.toLowerCase();
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    // 1. Session verification
    const cookieStore = await cookies();
    const token = cookieStore.get('arc_session')?.value;
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const activeToken = token || bearerToken;

    let authenticatedAddress: string | null = null;
    if (activeToken) {
      try {
        const decoded: any = jwt.verify(activeToken, JWT_SECRET);
        authenticatedAddress = decoded?.sub?.toLowerCase() || null;
      } catch (e) {
        // Token verification failed or expired
      }
    }

    // Determine the target wallet address to query
    const targetAddress = authenticatedAddress || requestedAddress;
    if (!targetAddress) {
      return NextResponse.json({ error: 'Missing or unauthorized wallet address' }, { status: 401 });
    }

    // Rate limit: 60 requests per minute per wallet (generous for active chat use)
    const rateLimitError = await checkRateLimit(req, targetAddress, { maxRequests: 60, windowMs: 60000 });
    if (rateLimitError) return rateLimitError;

    // 2. Fetch chats and unread counts concurrently from Supabase
    const [chatsRes, unreadRes] = await Promise.all([
      supabaseAdmin
        .from('chats')
        .select('*')
        .contains('participants', [targetAddress])
        .order('last_message_at', { ascending: false })
        .range(offset, offset + limit - 1),
      supabaseAdmin
        .from('messages')
        .select('sender')
        .eq('receiver', targetAddress)
        .eq('seen', false)
    ]);

    if (chatsRes.error) {
      console.error('[Conversations API] Error fetching chats:', chatsRes.error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    const rawChats = chatsRes.data || [];

    // Aggregate unread counts
    const unreadCounts: Record<string, number> = {};
    let totalUnread = 0;
    if (!unreadRes.error && unreadRes.data) {
      for (const row of unreadRes.data) {
        const s = row.sender.toLowerCase();
        unreadCounts[s] = (unreadCounts[s] || 0) + 1;
        totalUnread++;
      }
    }

    // 3. Batch fetch partner profiles for instant client hydration
    const partnerAddresses = Array.from(
      new Set(
        rawChats.map(c => {
          const partner = (c.participants || []).find((p: string) => p.toLowerCase() !== targetAddress);
          return (partner || targetAddress).toLowerCase();
        })
      )
    );

    let profilesMap: Record<string, any> = {};
    if (partnerAddresses.length > 0) {
      const { data: profilesData } = await supabaseAdmin
        .from('users')
        .select('address, name, avatar, photo_url, is_online, last_seen')
        .in('address', partnerAddresses);

      if (profilesData) {
        for (const p of profilesData) {
          profilesMap[p.address.toLowerCase()] = {
            address: p.address,
            name: p.name,
            avatar: p.avatar,
            photoUrl: p.photo_url || undefined,
            isOnline: p.is_online,
            lastSeen: p.last_seen
          };
        }
      }
    }

    // 4. Map chats into normalized format
    const chats = rawChats
      .filter(c => !(c.hidden_by || []).includes(targetAddress))
      .map(c => {
        const partner = (c.participants || []).find((p: string) => p.toLowerCase() !== targetAddress) || targetAddress;
        const lowerPartner = partner.toLowerCase();
        const profile = profilesMap[lowerPartner] || null;

        return {
          id: c.id,
          userAddress: partner,
          lastMessageAt: Number(c.last_message_at) || 0,
          lastMessageBody: c.last_message_body || null,
          isPinned: Boolean(c.is_pinned || (c.pinned_by || []).includes(targetAddress)),
          isArchived: Boolean(c.is_archived || (c.archived_by || []).includes(targetAddress)),
          isHidden: Boolean(c.is_hidden || (c.hidden_by || []).includes(targetAddress)),
          participants: c.participants,
          hidden_by: c.hidden_by || [],
          unreadCount: unreadCounts[lowerPartner] || 0,
          profile
        };
      });

    return NextResponse.json(
      {
        success: true,
        chats,
        unreadCounts,
        totalUnread,
        hasMore: rawChats.length === limit
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate'
        }
      }
    );
  } catch (error: any) {
    console.error('[Conversations API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
