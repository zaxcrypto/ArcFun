"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";


import { UserProfile, getProfileFromGlobalDB, hydrateProfiles, batchFetchProfiles } from "@/components/profile-manager";
import { supabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { useChatStore } from "./chat-store";
import { globalEventBus } from "@/lib/portfolio/EventBus";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  sender: string;
  receiver: string;
  body: string;
  mediaUrl?: string | null;
  replyTo?: string | null;
  reactions: { userId: string; emoji: string }[];
  seen: boolean;
  delivered: boolean;
  edited: boolean;
  deletedFor: string[];
  paymentId?: string | null;
  txHash?: string | null;
  createdAt: number;
}

export interface Payment {
  id: string;
  sender: string;
  receiver: string;
  amount: number;
  token: string;
  description?: string;
  txHash?: string;
  status: "pending" | "confirmed" | "failed" | "cancelled";
  isRecurring: boolean;
  recurringInterval?: "daily" | "weekly" | "monthly";
  nextPaymentAt?: number;
  active: boolean;
  createdAt: number;
}

export interface Chat {
  id: string;
  userAddress: string;
  lastMessageAt: number;
  lastMessageBody?: string;
  lastMessageIsMe?: boolean;
  draftText?: string;
  isPinned: boolean;
  isArchived: boolean;
  isHidden: boolean;
  unreadCount: number;
  profile?: UserProfile;
  participants: string[];
  hidden_by?: string[];
}

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  type: "message" | "payment" | "autopay" | "mention";
  createdAt: number;
  read: boolean;
}

interface ChatContextType {
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  authenticate: () => Promise<boolean>;
  chats: Chat[];
  messages: Message[];
  payments: Payment[];
  activeChatUser: UserProfile | null;
  setActiveChatUser: (user: UserProfile | null) => void;
  typingUsers: string[];
  setTyping: (isTyping: boolean) => void;
  sendMessage: (body: string, mediaUrl?: string, replyTo?: string, paymentId?: string, skipEnsureChatExists?: boolean) => Promise<void>;
  editMessage: (messageId: string, newBody: string) => Promise<void>;
  deleteMessage: (messageId: string, everyone: boolean) => Promise<void>;
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  searchUser: (addressOrName: string) => Promise<UserProfile | null>;
  sendPayment: (amount: number, txHash: string, description?: string, isRecurring?: boolean, interval?: "daily" | "weekly" | "monthly", token?: string) => Promise<string>;
  verifyPayment: (paymentId: string, txHash?: string) => Promise<boolean>;
  toggleAutoPay: (paymentId: string, active: boolean) => Promise<void>;
  cancelAutoPay: (paymentId: string, secondaryId?: string) => Promise<void>;
  togglePin: (chatId: string) => void;
  toggleArchive: (chatId: string) => void;
  toggleHide: (chatId: string) => void;
  saveDraft: (chatId: string, draftText: string) => void;
  deleteConversationHistory: (otherAddress: string, everyone: boolean, hideChat?: boolean) => Promise<void>;
  notifications: InAppNotification[];
  clearNotification: (id: string) => void;
  totalUnread: number;
  isChatsLoading: boolean;
  hasLoadedChats: boolean;
  isPaymentsLoading: boolean;
  refreshPayments: () => Promise<void>;
  fetchPaymentById: (paymentId: string) => Promise<Payment | null>;
  authError: string | null;
  clearAuthError: () => void;
  isCheckingSession: boolean;
}

const getCachedAuth = (addr?: string | null): boolean => {
  if (typeof window === 'undefined' || !addr) return false;
  try {
    const raw = localStorage.getItem(`arc_chat_auth_${addr.toLowerCase()}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.authenticated && parsed?.expiresAt > Date.now()) {
        return true;
      }
    }
  } catch {}
  return false;
};

const setCachedAuth = (addr: string, auth: boolean) => {
  if (typeof window === 'undefined' || !addr) return;
  try {
    if (auth) {
      localStorage.setItem(`arc_chat_auth_${addr.toLowerCase()}`, JSON.stringify({
        authenticated: true,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
      }));
    } else {
      localStorage.removeItem(`arc_chat_auth_${addr.toLowerCase()}`);
    }
  } catch {}
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

// ─── ChatProvider ─────────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, chain, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => getCachedAuth(address));
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(() => !getCachedAuth(address));
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeChatUser, _setActiveChatUser] = useState<UserProfile | null>(null);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [chatPrefs, setChatPrefs] = useState<Record<string, { pinned: boolean; archived: boolean; hidden: boolean; draftText?: string }>>({});
  const prevMsgIdsRef = useRef<Set<string>>(new Set());
  // Ref that always holds the latest activeChatUser without causing channel re-setup
  const activeChatUserRef = useRef<UserProfile | null>(null);
  useEffect(() => { activeChatUserRef.current = activeChatUser; }, [activeChatUser]);

  const [chatPayProtectionEnabled, setChatPayProtectionEnabled] = useState(false);
  const [profileSyncTick, setProfileSyncTick] = useState(0);


  // ─── Self-chat guard on setActiveChatUser ──────────────────────────────────
  const setActiveChatUser = useCallback((user: UserProfile | null) => {
    if (user && address && user.address.toLowerCase() === address.toLowerCase()) {
      // Block opening a chat with yourself
      return;
    }
    _setActiveChatUser(user);
    useChatStore.getState().setActiveChatAddress(user ? user.address : null);
  }, [address]);

  const {
    chats: storeChats,
    messages: storeMessages,
    unreadCounts,
    totalUnread,
    isChatsLoading,
    hasLoadedChats,
    isMessagesLoading,
    hasLoadedMessages,
    fetchChats,
    fetchMessages,
    initStore,
    upsertMessage,
    upsertChat,
    clearStore,
    removeMessage
  } = useChatStore();

  const conversationId = address && activeChatUser
    ? [address.toLowerCase(), activeChatUser.address.toLowerCase()].sort().join("_")
    : null;

  const rawMessages = conversationId ? storeMessages[conversationId] || [] : [];
  const rawChats = storeChats;
  const rawUnreadCounts = unreadCounts;
  
  const rawPayments = null; // Payments handled separately if needed
  const rawLastMessages = null;

  // Search
  const [searchTerm, setSearchTerm] = useState("");
  const [supaSearchResults, setSupaSearchResults] = useState<any[] | null>(null);

  useEffect(() => {
    if (searchTerm.length >= 2) {
      supabase
        .from("users")
        .select("*")
        .or(`name.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%`)
        .limit(10)
        .then(({ data, error }) => {
          if (error) {
            console.warn(`[Supabase Fallback] Component: chat-service (search) | Error: ${error.message} | Timestamp: ${new Date().toISOString()}`);
            setSupaSearchResults(null);
          } else if (data) {
            setSupaSearchResults(
              data.map(u => ({
                address: u.address,
                name: u.name,
                avatar: u.avatar,
                photoUrl: u.photo_url || undefined,
                lastSeen: u.last_seen,
                isOnline: u.is_online
              }))
            );
          }
        });
    } else {
      setSupaSearchResults(null);
    }
  }, [searchTerm]);

  const rawSearchResults = supaSearchResults;


  const [supaPayments, setSupaPayments] = useState<any[] | null>(() => {
    if (typeof window !== 'undefined' && address) {
      try {
        const cached = localStorage.getItem(`arc_payments_cache_${address.toLowerCase()}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            // Cleanse any corrupt dummy records missing sender or receiver
            return parsed.filter((p: any) => p && typeof p.sender === 'string' && typeof p.receiver === 'string');
          }
        }
      } catch {}
    }
    return null;
  });

  const refreshPayments = useCallback(async () => {
    if (!address) return;
    const lowerAddress = address.toLowerCase();

    // 1. Primary: Use backend /api/chat/payments which uses supabaseAdmin and validates wallet identity
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      headers['x-wallet-address'] = lowerAddress;

      const res = await fetch(`/api/chat/payments?address=${lowerAddress}&limit=50&offset=0`, {
        headers,
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.payments)) {
          const mapped: Payment[] = json.payments.map((p: any) => ({
            id: p.id,
            sender: p.sender,
            receiver: p.receiver,
            amount: p.amount,
            token: p.token,
            description: p.description,
            status: p.status,
            active: p.active !== false,
            createdAt: typeof p.createdAt === 'number' ? p.createdAt : (new Date(p.createdAt).getTime() || Date.now()),
            txHash: p.txHash,
            isRecurring: !!p.isRecurring,
            recurringInterval: p.recurringInterval,
            nextPaymentAt: p.nextPaymentAt ? (typeof p.nextPaymentAt === 'number' ? p.nextPaymentAt : new Date(p.nextPaymentAt).getTime()) : undefined
          }));

          setSupaPayments(mapped);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(`arc_payments_cache_${lowerAddress}`, JSON.stringify(mapped));
            } catch {}
          }
          return;
        }
      }
    } catch (apiErr) {
      console.warn('[chat-service] refreshPayments API fetch notice:', apiErr);
    }

    // 2. Client fallback
    try {
      const { data: pData } = await supabase.from("payments").select("*")
        .or(`sender.eq."${lowerAddress}",receiver.eq."${lowerAddress}"`);
      if (pData) {
        const mapped = pData.map(p => ({
          id: p.id,
          sender: p.sender,
          receiver: p.receiver,
          amount: p.amount,
          token: p.token,
          description: p.description,
          status: p.status,
          active: p.active !== false,
          createdAt: typeof p.created_at === 'number' ? p.created_at : (new Date(p.created_at).getTime() || Date.now()),
          txHash: p.tx_hash,
          isRecurring: !!p.is_recurring,
          recurringInterval: p.recurring_interval,
          nextPaymentAt: p.next_payment_at ? (typeof p.next_payment_at === 'number' ? p.next_payment_at : new Date(p.next_payment_at).getTime()) : undefined
        }));
        setSupaPayments(mapped);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`arc_payments_cache_${lowerAddress}`, JSON.stringify(mapped));
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[chat-service] refreshPayments direct fallback notice:', err);
    }
  }, [address]);

  const fetchPaymentById = useCallback(async (paymentId: string): Promise<Payment | null> => {
    if (!paymentId) return null;
    try {
      // 1. Primary: Server-side API endpoint using supabaseAdmin to reliably bypass RLS & retrieve on-chain txHash
      try {
        const res = await fetch(`/api/chat/payment-details?id=${encodeURIComponent(paymentId)}`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json?.payment) {
            const mapped: Payment = json.payment;
            setSupaPayments(prev => {
              if (!prev) return [mapped];
              const exists = prev.some(p => p.id === mapped.id);
              const next = exists
                ? prev.map(p => p.id === mapped.id ? mapped : p)
                : [...prev, mapped];
              if (typeof window !== 'undefined' && address) {
                try {
                  localStorage.setItem(`arc_payments_cache_${address.toLowerCase()}`, JSON.stringify(next));
                } catch {}
              }
              return next;
            });
            return mapped;
          }
        }
      } catch (apiErr) {
        console.warn('[chat-service] payment-details API fallback notice:', apiErr);
      }

      // 2. Direct client fallback
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .maybeSingle();

      if (data) {
        const mapped: Payment = {
          id: data.id,
          sender: data.sender,
          receiver: data.receiver,
          amount: data.amount,
          token: data.token,
          description: data.description,
          status: data.status,
          active: data.active !== false,
          createdAt: typeof data.created_at === 'number' ? data.created_at : (new Date(data.created_at).getTime() || Date.now()),
          txHash: data.tx_hash,
          isRecurring: !!data.is_recurring,
          recurringInterval: data.recurring_interval,
          nextPaymentAt: data.next_payment_at ? (typeof data.next_payment_at === 'number' ? data.next_payment_at : new Date(data.next_payment_at).getTime()) : undefined
        };
        setSupaPayments(prev => {
          if (!prev) return [mapped];
          const exists = prev.some(p => p.id === mapped.id);
          const next = exists
            ? prev.map(p => p.id === mapped.id ? mapped : p)
            : [...prev, mapped];
          if (typeof window !== 'undefined' && address) {
            try {
              localStorage.setItem(`arc_payments_cache_${address.toLowerCase()}`, JSON.stringify(next));
            } catch {}
          }
          return next;
        });
        return mapped;
      }
    } catch (e) {
      console.warn('Failed to fetch payment by id:', paymentId, e);
    }
    return null;
  }, [address]);

  // Sync external autopay status changes across ledger, dashboard and chat
  useEffect(() => {
    const handleAutopayEvent = (e: any) => {
      const { scheduleId, action } = e.detail || {};
      if (scheduleId && action === 'CANCEL') {
        if (typeof window !== 'undefined') {
          try {
            const cur = JSON.parse(localStorage.getItem('arc_cancelled_autopay_ids') || '[]');
            if (!cur.includes(scheduleId)) {
              localStorage.setItem('arc_cancelled_autopay_ids', JSON.stringify([...cur, scheduleId]));
            }
          } catch {}
        }
        setSupaPayments(prev => {
          if (!prev) return prev;
          const updated = prev.map(p => p.id === scheduleId ? { ...p, active: false, status: 'cancelled' as const } : p);
          if (typeof window !== 'undefined' && address) {
            try {
              localStorage.setItem(`arc_payments_cache_${address.toLowerCase()}`, JSON.stringify(updated));
            } catch {}
          }
          return updated;
        });
      }
      refreshPayments();
    };
    window.addEventListener('arc_autopay_updated', handleAutopayEvent);
    return () => window.removeEventListener('arc_autopay_updated', handleAutopayEvent);
  }, [address, refreshPayments]);

  // ─── Effect A: wallet-scoped data + stable Realtime channel ─────────────────
  useEffect(() => {
    if (!address || !isAuthenticated) {
      clearStore();
      setSupaPayments(null);
      return;
    }
    const lowerAddress = address.toLowerCase();

    const loadWalletData = async () => {
      const { data: protData } = await supabase.from("platform_settings").select("bool_value").eq("key", "chatPayProtectionEnabled").maybeSingle();
      if (protData) setChatPayProtectionEnabled(!!protData.bool_value);

      await initStore(lowerAddress);
      await refreshPayments();
    };

    loadWalletData();

    const parseTs = (ts: any) => {
      if (!ts) return 0;
      if (typeof ts === 'number') return ts;
      if (typeof ts === 'string' && /^\d+$/.test(ts)) return parseInt(ts, 10);
      return new Date(ts).getTime() || 0;
    };

    let channel: any = null;
    let realtimeClientRef: any = null;

    const setupRealtime = async () => {
      try {
        const tokenRes = await fetch('/api/auth/supabase-token');
        if (!tokenRes.ok) return;
        const { token } = await tokenRes.json();
        if (!token) return;

        const { createClient } = await import('@supabase/supabase-js');
        const rtClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
          {
            realtime: { params: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder' } },
            global: { headers: { Authorization: `Bearer ${token}` } }
          }
        );

        // Crucial: Authenticate the WebSocket connection itself against RLS
        rtClient.realtime.setAuth(token);

        channel = rtClient.channel(`chat_realtime_${lowerAddress}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload: any) => {
            const m = payload.new;
            if (m.receiver.toLowerCase() !== lowerAddress && m.sender.toLowerCase() !== lowerAddress) return;
            
            const convoId = [m.sender.toLowerCase(), m.receiver.toLowerCase()].sort().join("_");
            const isNew = m.receiver.toLowerCase() === lowerAddress;
            
            upsertMessage(convoId, {
                id: m.id, sender: m.sender, receiver: m.receiver, body: m.body, mediaUrl: m.media_url, replyTo: m.reply_to, paymentId: m.payment_id, reactions: m.reactions || [], seen: m.seen, delivered: m.delivered, edited: m.edited, deletedFor: m.deleted_for || [], createdAt: parseTs(m.created_at)
            }, isNew);
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload: any) => {
            const m = payload.new;
            if (m.receiver.toLowerCase() !== lowerAddress && m.sender.toLowerCase() !== lowerAddress) return;

            const convoId = [m.sender.toLowerCase(), m.receiver.toLowerCase()].sort().join("_");
            upsertMessage(convoId, { id: m.id, sender: m.sender, receiver: m.receiver, body: m.body, mediaUrl: m.media_url, replyTo: m.reply_to, paymentId: m.payment_id, reactions: m.reactions || [], seen: m.seen, delivered: m.delivered, edited: m.edited, deletedFor: m.deleted_for || [], createdAt: parseTs(m.created_at) });
          })
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload: any) => {
            // Because DELETE payloads only contain the row ID (unless REPLICA IDENTITY is FULL), 
            // we use the global removal scanner to wipe it from any active conversation buffers.
            if (payload.old && payload.old.id) {
               useChatStore.getState().removeMessageById(payload.old.id);
            }
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload: any) => {
            const c = payload.new;
            if (!c.participants?.includes(lowerAddress)) return;
            const isHiddenForMe = c.is_hidden || (c.hidden_by || []).includes(lowerAddress);
            if (isHiddenForMe) {
               const convoId = c.participants.map((p: string) => p.toLowerCase()).sort().join("_");
               useChatStore.getState().clearConversation(convoId);
               return;
            }
            upsertChat({ id: c.id, userAddress: c.participants.find((p: string) => p !== lowerAddress) || lowerAddress, lastMessageAt: c.last_message_at, lastMessageBody: c.last_message_body, isPinned: c.is_pinned || (c.pinned_by || []).includes(lowerAddress), isArchived: c.is_archived || (c.archived_by || []).includes(lowerAddress), isHidden: false, participants: c.participants, hidden_by: c.hidden_by, unreadCount: 0 });
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, (payload: any) => {
            const c = payload.new;
            if (!c.participants?.includes(lowerAddress)) return;
            const isHiddenForMe = c.is_hidden || (c.hidden_by || []).includes(lowerAddress);
            if (isHiddenForMe) {
               const convoId = c.participants.map((p: string) => p.toLowerCase()).sort().join("_");
               useChatStore.getState().clearConversation(convoId);
               return;
            }
            upsertChat({ id: c.id, userAddress: c.participants.find((p: string) => p !== lowerAddress) || lowerAddress, lastMessageAt: c.last_message_at, lastMessageBody: c.last_message_body, isPinned: c.is_pinned || (c.pinned_by || []).includes(lowerAddress), isArchived: c.is_archived || (c.archived_by || []).includes(lowerAddress), isHidden: false, participants: c.participants, hidden_by: c.hidden_by, unreadCount: 0 });
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, (payload: any) => {
            const p = payload.new;
            if (!p?.receiver || !p?.sender || typeof p.receiver !== 'string' || typeof p.sender !== 'string') return;
            if (p.receiver.toLowerCase() !== lowerAddress && p.sender.toLowerCase() !== lowerAddress) return;
            setSupaPayments(prev => {
               const mapped = {
                 id: p.id,
                 sender: p.sender,
                 receiver: p.receiver,
                 amount: p.amount,
                 token: p.token,
                 description: p.description,
                 status: p.status,
                 active: p.active !== false,
                 createdAt: typeof p.created_at === 'number' ? p.created_at : (new Date(p.created_at).getTime() || Date.now()),
                 txHash: p.tx_hash,
                 isRecurring: !!p.is_recurring,
                 recurringInterval: p.recurring_interval,
                 nextPaymentAt: p.next_payment_at ? (typeof p.next_payment_at === 'number' ? p.next_payment_at : new Date(p.next_payment_at).getTime()) : undefined
               };
               if (!prev) return [mapped];
               if (prev.find(existing => existing.id === p.id)) return prev;
               return [...prev, mapped];
            });
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments' }, (payload: any) => {
            const p = payload.new;
            if (!p?.receiver || !p?.sender || typeof p.receiver !== 'string' || typeof p.sender !== 'string') return;
            if (p.receiver.toLowerCase() !== lowerAddress && p.sender.toLowerCase() !== lowerAddress) return;
            setSupaPayments(prev => {
               const mapped = {
                 id: p.id,
                 sender: p.sender,
                 receiver: p.receiver,
                 amount: p.amount,
                 token: p.token,
                 description: p.description,
                 status: p.status,
                 active: p.active !== false,
                 createdAt: typeof p.created_at === 'number' ? p.created_at : (new Date(p.created_at).getTime() || Date.now()),
                 txHash: p.tx_hash,
                 isRecurring: !!p.is_recurring,
                 recurringInterval: p.recurring_interval,
                 nextPaymentAt: p.next_payment_at ? (typeof p.next_payment_at === 'number' ? p.next_payment_at : new Date(p.next_payment_at).getTime()) : undefined
               };
               if (!prev) return [mapped];
               return prev.map(existing => existing.id === p.id ? mapped : existing);
            });
          })
          .subscribe();
          
        realtimeClientRef = rtClient;
      } catch (err) {
        console.error("Failed to setup direct Realtime WebSocket:", err);
      }
    };
    setupRealtime();

    const handleOnline = async () => {
       await fetchChats(lowerAddress);
       if (activeChatUserRef.current) {
          await fetchMessages(lowerAddress, activeChatUserRef.current.address);
       }
    };

    window.addEventListener('online', handleOnline);

    return () => {
      if (channel && realtimeClientRef) {
         realtimeClientRef.removeChannel(channel);
      } else {
         supabase.removeChannel(channel);
      }
      window.removeEventListener('online', handleOnline);
    };
  }, [address, isAuthenticated]);

  // ─── Effect B: conversation-scoped messages (Lazy Load & Deduped via Store) ───
  useEffect(() => {
    if (!address || !activeChatUser) return;
    
    // Initial fetch only - WebSockets handle real-time now!
    fetchMessages(address, activeChatUser.address, false);
  }, [address, activeChatUser?.address]);

  // --- OVERRIDE FALLBACKS ---
  // ─── Authentication ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!address) {
      if (isAuthenticated) {
        fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      }
      setIsAuthenticated(false);
      setIsCheckingSession(false);
      return;
    }
    const cached = getCachedAuth(address);
    if (cached) {
      setIsAuthenticated(true);
      setIsCheckingSession(false);
    } else {
      setIsCheckingSession(true);
    }
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.authenticated && data.address.toLowerCase() === address.toLowerCase()) {
          setIsAuthenticated(true);
          setCachedAuth(address, true);
        } else {
          setIsAuthenticated(false);
          setCachedAuth(address, false);
          await fetch('/api/auth/logout', { method: 'POST' });
        }
      } catch (err) {
        if (!cached) {
          setIsAuthenticated(false);
          setCachedAuth(address, false);
        }
      } finally {
        setIsCheckingSession(false);
      }
    };
    checkSession();
  }, [address]);

  const authenticate = async () => {
    if (!address) {
      setAuthError("No EVM wallet connected");
      return false;
    }
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      // 1. Get Challenge Nonce
      const challengeRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.toLowerCase() })
      });
      const challengeData = await challengeRes.json();
      if (!challengeData.nonce) throw new Error(challengeData.error || "Failed to get challenge nonce");

      // 2. Format SIWE Message
      const activeChainId = chain?.id || chainId || 1;
      const { SiweMessage } = await import('siwe');
      const message = new SiweMessage({
        domain: window.location.host,
        address: address,
        statement: 'Authorize ArcFun Messaging Session',
        uri: window.location.origin,
        version: '1',
        chainId: activeChainId,
        nonce: challengeData.nonce
      });
      const preparedMessage = message.prepareMessage();

      // 3. Sign Message
      const signature = await signMessageAsync({ message: preparedMessage });

      // 4. Verify Signature
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: preparedMessage, signature })
      });
      
      const verifyData = await verifyRes.json();
      if (!verifyData.success) throw new Error(verifyData.error || "Signature verification failed");

      // 5. Sync Session Client-Side
      const sessionRes = await fetch('/api/auth/session');
      const sessionData = await sessionRes.json();
      if (sessionData.authenticated && sessionData.address.toLowerCase() === address.toLowerCase()) {
        setIsAuthenticated(true);
        setCachedAuth(address, true);
      }

      setIsAuthenticating(false);

      const localProfile = getProfileFromGlobalDB(address);
      const { error } = await supabase.from('users').upsert({
        address: address.toLowerCase(),
        name: localProfile?.name || `User ${address.substring(2, 8).toUpperCase()}`,
        avatar: localProfile?.avatar || "slate",
        photo_url: localProfile?.photoUrl,
        twitter_id: localProfile?.twitterId || undefined,
        telegram_id: localProfile?.telegramId || undefined,
        is_online: true,
        last_seen: Date.now()
      }, { onConflict: 'address' });
      if (error) console.error("Supabase upsertUser failed", error);

      return true;
    } catch (e: any) {
      console.error("Signature rejected or verification failed", e);
      const msg = e?.message || "Signature rejected or verification failed";
      if (msg.includes("User rejected") || msg.includes("denied") || msg.includes("rejected")) {
        setAuthError("Signature request was declined in your wallet");
      } else {
        setAuthError(msg);
      }
      setIsAuthenticating(false);
      return false;
    }
  };


  // ─── Chat preferences (pin/archive/hide) from localStorage ─────────────────
  useEffect(() => {
    if (!address) return;
    try {
      const raw = localStorage.getItem(`arc_chat_prefs_${address.toLowerCase()}`);
      if (raw) setChatPrefs(JSON.parse(raw));
    } catch {}
  }, [address]);

  const savePrefs = (newPrefs: typeof chatPrefs) => {
    if (!address) return;
    setChatPrefs(newPrefs);
    localStorage.setItem(`arc_chat_prefs_${address.toLowerCase()}`, JSON.stringify(newPrefs));
  };

  const syncPrefToSupabase = async (chatIdKey: string, field: 'pinned_by' | 'archived_by' | 'hidden_by', isActive: boolean) => {
    if (!address) return;
    const myAddr = address.toLowerCase();
    try {
      const { data: chatRow } = await supabase.from('chats').select(`id, ${field}`).contains('participants', [myAddr, chatIdKey]).maybeSingle();
      if (chatRow) {
        let currentArray = (chatRow as any)[field] || [];
        if (isActive && !currentArray.includes(myAddr)) {
          currentArray.push(myAddr);
        } else if (!isActive) {
          currentArray = currentArray.filter((a: string) => a !== myAddr);
        }
        await supabase.from('chats').update({ [field]: currentArray }).eq('id', chatRow.id);
      }
    } catch (e) {
      console.warn("Failed to sync pref to supabase", e);
    }
  };

  const togglePin = (chatId: string) => {
    const key = chatId.toLowerCase();
    const current = chatPrefs[key] || { pinned: false, archived: false, hidden: false };
    const nextPinned = !current.pinned;
    savePrefs({ ...chatPrefs, [key]: { ...current, pinned: nextPinned, archived: false } });
    syncPrefToSupabase(key, 'pinned_by', nextPinned);
    if (nextPinned) syncPrefToSupabase(key, 'archived_by', false);
  };

  const toggleArchive = (chatId: string) => {
    const key = chatId.toLowerCase();
    const current = chatPrefs[key] || { pinned: false, archived: false, hidden: false };
    const nextArchived = !current.archived;
    savePrefs({ ...chatPrefs, [key]: { ...current, archived: nextArchived, pinned: false } });
    syncPrefToSupabase(key, 'archived_by', nextArchived);
    if (nextArchived) syncPrefToSupabase(key, 'pinned_by', false);
  };

  const toggleHide = (chatId: string) => {
    const key = chatId.toLowerCase();
    const current = chatPrefs[key] || { pinned: false, archived: false, hidden: false };
    const nextHidden = !current.hidden;
    savePrefs({ ...chatPrefs, [key]: { ...current, hidden: nextHidden } });
    syncPrefToSupabase(key, 'hidden_by', nextHidden);
  };

  const saveDraft = (chatId: string, draftText: string) => {
    const key = chatId.toLowerCase();
    const current = chatPrefs[key] || { pinned: false, archived: false, hidden: false };
    savePrefs({ ...chatPrefs, [key]: { ...current, draftText } });
  };

  // ─── Auto mark-seen removed — viewport intersection will handle it ───

  // ─── Incoming message notifications ─────────────────────────────────────────
  useEffect(() => {
    if (!address || !isAuthenticated || !rawMessages) return;
    const myAddr = address.toLowerCase();
    const currentIds = new Set(rawMessages.map((m: any) => m.id as string)); 
    for (const msg of rawMessages) { 
      const msgId = msg.id as string;
      if (!prevMsgIdsRef.current.has(msgId) && msg.receiver === myAddr && !msg.seen) {
        if (!activeChatUser || activeChatUser.address.toLowerCase() !== msg.sender) {
          addNotification({
            title: `New Message`,
            body: msg.body.substring(0, 60) + (msg.body.length > 60 ? "..." : ""),
            type: "message",
          });
        }
      }
    }

    prevMsgIdsRef.current = currentIds;
  }, [rawMessages, address, isAuthenticated, activeChatUser]);

  // ─── Derived: Messages ──────────────────────────────────────────────────────
  const messages: Message[] = React.useMemo(() => {
    if (!rawMessages || !address) return [];
    const myAddr = address.toLowerCase();
    return rawMessages.filter((m) => !m.deletedFor?.includes(myAddr));
  }, [rawMessages, address]);

  // ─── Derived: Chats list with real unread counts and last message ──────────
  const chats: Chat[] = React.useMemo(() => {
    if (!rawChats || !address) return [];
    return rawChats.map(c => {
      const pref = chatPrefs[c.userAddress.toLowerCase()] || { pinned: false, archived: false, hidden: false };
      const localProfile = getProfileFromGlobalDB(c.userAddress);
      return {
        ...c,
        isPinned: pref.pinned || c.isPinned,
        isArchived: pref.archived || c.isArchived,
        isHidden: pref.hidden || c.isHidden,
        draftText: pref.draftText,
        unreadCount: rawUnreadCounts?.[c.userAddress] || 0,
        profile: c.profile || localProfile || {
          address: c.userAddress,
          name: `ArcFun|User#${parseInt(c.userAddress.slice(2, 8), 16) % 9999 + 1}`,
          avatar: "slate",
          twitterId: "",
          telegramId: "",
          twitterLink: "",
          telegramLink: "",
        }
      };
    }).sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (new Date(b.lastMessageAt).getTime() || 0) - (new Date(a.lastMessageAt).getTime() || 0);
    });
  }, [rawChats, address, chatPrefs, rawUnreadCounts, profileSyncTick]);

  // ─── Proactive Profile Sync ──────────────────────────────────────────────────
  const attemptedProfiles = useRef<Set<string>>(new Set());

  // Fetches missing avatars/names from Supabase for cross-browser consistency
  useEffect(() => {
    if (!rawChats || rawChats.length === 0) return;
    
    const fetchMissingProfiles = async () => {
      const missingAddresses = rawChats
        .map(c => c.userAddress)
        .filter(addr => !getProfileFromGlobalDB(addr) && !attemptedProfiles.current.has(addr.toLowerCase()));


      if (missingAddresses.length === 0) return;

      missingAddresses.forEach(a => attemptedProfiles.current.add(a.toLowerCase()));


      const { data, error } = await supabase
        .from('users')
        .select('*')
        .in('address', missingAddresses.map(a => a.toLowerCase()));

      if (!error && data && data.length > 0) {
        const profiles = data.map(u => ({
          address: u.address,
          name: u.name,
          avatar: u.avatar,
          photoUrl: u.photo_url || undefined,
          twitterId: u.twitter_id || "",
          telegramId: u.telegram_id || "",
          twitterLink: u.twitter_id ? `https://x.com/${u.twitter_id}` : "",
          telegramLink: u.telegram_id ? `https://t.me/${u.telegram_id}` : "",
        }));
        hydrateProfiles(profiles);
        setProfileSyncTick(t => t + 1); // Force re-render of chats list
      }
    };
    
    fetchMissingProfiles();
  }, [rawChats]);



  // ─── Derived: Payments ──────────────────────────────────────────────────────
  const payments: Payment[] = React.useMemo(() => {
    if (!supaPayments) return [];
    return supaPayments
      .filter((p): p is Payment => Boolean(p && typeof p.sender === 'string' && typeof p.receiver === 'string'))
      .map(p => ({
        ...p,
        createdAt: new Date(p.createdAt).getTime()
      }));
  }, [supaPayments]);

  // ─── Poll for Pending Payments (Server-Side Verification) ───────────────────
  useEffect(() => {
    const pendingPayments = supaPayments?.filter(p => p.status === 'pending' && p.txHash) || [];
    if (pendingPayments.length === 0) return;

    let mounted = true;
    const interval = setInterval(async () => {
      if (!mounted) return;
      
      let authToken: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) authToken = data.session.access_token;
      } catch {}

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      
      for (const p of pendingPayments) {
        try {
          const res = await fetch('/api/chat/verify-payment', {
            method: 'POST',
            headers,
            body: JSON.stringify({ paymentId: p.id, txHash: p.txHash })
          });
          if (!res.ok) continue;
          const data = await res.json();
          if (data && data.status && data.status !== 'pending') {
            setSupaPayments(prev => prev?.map(item => item.id === p.id ? { ...item, status: data.status, txHash: data.txHash || item.txHash } : item) || null);
          }
        } catch (e) {
          console.error("Polling verification error:", e);
        }
      }
    }, 4000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [supaPayments]);

  // ─── Derived: Typing users (Disabled for testnet) ──────────────────────────
  const typingUsers: string[] = [];



  // ─── Typing debounce (Disabled) ─────────────────────────────────────────────
  const setTyping = useCallback(async (isTyping: boolean) => {
    // No-op for testnet
  }, []);

  // ─── Messaging actions ──────────────────────────────────────────────────────
  const ensureChatExists = async (myAddr: string, destAddr: string, bodyPreview?: string) => {


    if (!myAddr || !destAddr) return;
    
    // 1. Check local cache — supaChats items are MAPPED objects using userAddress (the counterparty address)
    //    We match by userAddress === destAddr (the address we're sending to).
    //    This replaces the previous participants[] lookup which always missed because
    //    the mapped shape does not carry a participants array.
    const existing = (rawChats || []).find(c =>
      c.userAddress?.toLowerCase() === destAddr
    );

    if (existing) {
      const updatePayload: any = { last_message_at: Date.now() };
      if (bodyPreview !== undefined) updatePayload.last_message_body = bodyPreview;

      // Resurrection: unconditionally clear hidden_by so BOTH users see the chat again
      if (existing.hidden_by && existing.hidden_by.length > 0) {
        updatePayload.hidden_by = [];
      }

      const updatedChat = { ...existing, lastMessageAt: Date.now() };
      if (bodyPreview !== undefined) updatedChat.lastMessageBody = bodyPreview;
      if (existing.hidden_by && existing.hidden_by.length > 0) updatedChat.hidden_by = [];
      upsertChat(updatedChat);

      await supabase.from('chats').update(updatePayload).eq('id', existing.id);
      return;
    }

    // 2. Check DB fallback

    const { data: dbExisting, error: dbErr } = await supabase.from('chats').select('id, hidden_by').contains('participants', [myAddr, destAddr]).maybeSingle();


    if (dbExisting) {

      const updatePayload: any = { last_message_at: Date.now() };
      if (bodyPreview !== undefined) updatePayload.last_message_body = bodyPreview;

      // Resurrection: unconditionally clear hidden_by so BOTH users see the chat again
      if (dbExisting.hidden_by?.length > 0) {
        updatePayload.hidden_by = [];
      }

      await supabase.from('chats').update(updatePayload).eq('id', dbExisting.id);
      return;
    }

    // 3. Create new chat


    // Conversation limit check (only if creating a NEW chat)
    if (chatPayProtectionEnabled && !isAdmin(myAddr)) {
      const todayChats = (rawChats || []).filter(c => c.lastMessageAt > Date.now() - 86400000).length;
      if (todayChats >= 30) {
        addNotification({
          title: "Limit Reached",
          body: "Daily conversation limit reached (30/day). Protection is enabled.",
          type: "message",
        });
        throw new Error("Conversation Limit Reached");
      }
    }

    const newChat: any = {
      participants: [myAddr, destAddr],
      last_message_at: Date.now(),
      pinned_by: [],
      archived_by: [],
      hidden_by: [],
      is_pinned: false,
      is_archived: false,
      is_hidden: false
    };
    if (bodyPreview !== undefined) newChat.last_message_body = bodyPreview;

    const { data: inserted, error } = await supabase.from('chats').insert(newChat).select('*').single();

    if (!error && inserted) {
       upsertChat({
          id: inserted.id,
          userAddress: inserted.participants.find((p: string) => p !== myAddr) || destAddr,
          lastMessageAt: inserted.last_message_at,
          lastMessageBody: inserted.last_message_body,
          isPinned: inserted.is_pinned,
          isArchived: inserted.is_archived,
          isHidden: inserted.is_hidden,
          participants: inserted.participants,
          hidden_by: inserted.hidden_by || [],
          unreadCount: 0
       });
    }
  };

  const MAX_MESSAGE_LENGTH = 2000;

  const sendMessage = async (body: string, mediaUrl?: string, replyTo?: string, paymentId?: string, skipEnsureChatExists = false) => {
    if (!address || !activeChatUser || !isAuthenticated) {

      return;
    }

    // Enforce message body length limit (matches DB CHECK constraint)
    if (body.trim().length > MAX_MESSAGE_LENGTH) {
      addNotification({
        title: "Message Too Long",
        body: `Messages cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
        type: "message",
      });
      return;
    }

    const myAddr = address.toLowerCase();
    const destAddr = activeChatUser.address.toLowerCase();

    // Guard: cannot message yourself
    if (myAddr === destAddr) return;

    // Chat Protection Limit Check
    if (chatPayProtectionEnabled && !isAdmin(myAddr)) {
      const { data: recentMsgs } = await supabase.from('messages').select('created_at')
        .eq('sender', myAddr).gte('created_at', Date.now() - 86400000);
      
      if (recentMsgs) {
        if (recentMsgs.length >= 300) { 
          addNotification({
            title: "Limit Reached",
            body: "Daily message limit reached (300/day). Protection is enabled.",
            type: "message",
          });
          return; 
        }
        const hourCount = recentMsgs.filter(m => m.created_at > Date.now() - 3600000).length;
        if (hourCount >= 30) { 
          addNotification({
            title: "Limit Reached",
            body: "Hourly message limit reached (30/hour). Protection is enabled.",
            type: "message",
          });
          return; 
        }
      }
    }

    // Ensure chat exists permanently with correct preview body.
    const bodyPreview = paymentId ? `Sent a payment` : mediaUrl ? `Sent an attachment` : body.trim();
    
    // 1. Optimistic UI Update (0ms latency "WhatsApp" feel)
    const messageId = crypto.randomUUID();
    const convoId = [myAddr, destAddr].sort().join("_");
    const now = Date.now();
    
    upsertMessage(convoId, {
      id: messageId,
      sender: myAddr,
      receiver: destAddr,
      body: body.trim(),
      mediaUrl: mediaUrl || null,
      replyTo: replyTo || null,
      paymentId: paymentId || null,
      seen: false,
      delivered: false,
      edited: false,
      deletedFor: [],
      createdAt: now,
      reactions: []
    }, false);

    setTyping(false);
    saveDraft(destAddr, "");

    // 2. Background DB Sync (Non-blocking)
    if (!skipEnsureChatExists) {
      ensureChatExists(myAddr, destAddr, bodyPreview);
    }

    supabase.from('messages').insert({
      id: messageId, // Send the same ID so Realtime can deduplicate
      created_at: now,
      sender: myAddr,
      receiver: destAddr,
      body: body.trim().slice(0, MAX_MESSAGE_LENGTH),
      media_url: mediaUrl || null,
      reply_to: replyTo || null,
      payment_id: paymentId || null,
      seen: false,
      delivered: false,
      edited: false,
      deleted_for: []
    }).then(({ error }) => {
      if (error) {
        console.error("Message insert failed:", error);
        // Handle DB-level rate limit trigger (P0429)
        if (error.code === 'P0429' || error.message?.includes('rate limit')) {
          addNotification({
            title: "Slow Down",
            body: "You're sending messages too quickly. Please wait a moment.",
            type: "message",
          });
        }
      } else {
        // Silent fallback to guarantee consistency if Realtime drops
        fetchMessages(myAddr, destAddr, false);
      }
    });
  };

  const editMessage = async (messageId: string, newBody: string) => {
    if (!isAuthenticated) return;
    if (newBody.trim().length > MAX_MESSAGE_LENGTH) return;
    await supabase.from('messages').update({ body: newBody.trim().slice(0, MAX_MESSAGE_LENGTH), edited: true }).eq('id', messageId).eq('sender', address!.toLowerCase());
  };

  const deleteMessage = async (messageId: string, everyone: boolean) => {
    if (!address || !isAuthenticated || !activeChatUser) return;
    const myAddr = address.toLowerCase();
    const convoId = [myAddr, activeChatUser.address.toLowerCase()].sort().join("_");
    
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId);
    if (!isUuid) return; // Do not attempt DB operations on optimistic IDs

    // Instantly clear from local UI for perceived zero-latency
    removeMessage(convoId, messageId);

    try {
      const res = await fetch('/api/chat/delete-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId })
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Delete failed:", data.error);
        // Optionally rollback the optimistic UI update if it fails
      }
    } catch (e) {
      console.error("Delete request error:", e);
    }
  };

  const deleteConversationHistory = async (otherAddress: string, everyone: boolean, hideChat?: boolean) => {
    if (!address || !isAuthenticated) return;
    if (hideChat) {
      toggleHide(otherAddress);
      return;
    }

    const myAddr = address.toLowerCase();
    const otherAddr = otherAddress.toLowerCase();
    const convoId = [myAddr, otherAddr].sort().join("_");

    // 1. Instantly clear from local memory UI to prevent ghost recovery
    useChatStore.getState().clearConversation(convoId);

    if (everyone) {
      // PERMANENT DELETE (Both Users via secure admin bypass)
      try {
        await fetch('/api/chat/delete-conversation', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ targetAddress: otherAddress })
        });
      } catch (err) {
        console.error('Failed to permanently delete messages:', err);
      }
    } else {
      // 2. Soft-delete messages for the current user asynchronously
      supabase.from('messages').select('id, deleted_for')
        .or(`and(sender.eq."${myAddr}",receiver.eq."${otherAddr}"),and(sender.eq."${otherAddr}",receiver.eq."${myAddr}")`)
        .then(async ({ data: msgs }) => {
          if (msgs) {
            const updates = msgs.filter(m => !(m.deleted_for || []).includes(myAddr));
            for (let i = 0; i < updates.length; i += 10) {
              const batch = updates.slice(i, i + 10);
              await Promise.all(batch.map(m => 
                supabase.from('messages').update({ deleted_for: [...(m.deleted_for || []), myAddr] }).eq('id', m.id)
              ));
            }
          }
        });
    }

    // 3. Hide the chat row for the current user in the UI sidebar
    const { data: chatRow } = await supabase.from('chats').select('id, hidden_by').contains('participants', [myAddr, otherAddr]).maybeSingle();
    if (chatRow) {
      const currentHidden = chatRow.hidden_by || [];
      if (!currentHidden.includes(myAddr)) {
        await supabase.from('chats').update({ hidden_by: [...currentHidden, myAddr] }).eq('id', chatRow.id);
      }
    }
    
    // Sync UI sidebar
    await fetchChats(myAddr, false);
  };


  const addReaction = async (messageId: string, emoji: string) => {
    if (!address || !isAuthenticated) return;
    const { data } = await supabase.from('messages').select('reactions').eq('id', messageId).single(); const current = data?.reactions || []; await supabase.from('messages').update({ reactions: [...current, { userId: address.toLowerCase(), emoji }] }).eq('id', messageId);
  };

  // ─── User Discovery (fixed: no setTimeout race condition) ──────────────────
  const searchUser = async (addressOrName: string): Promise<UserProfile | null> => {
    const term = addressOrName.toLowerCase().trim();
    if (!term) return null;

    // Block searching for your own address
    if (address && term === address.toLowerCase()) return null;

    // 1. Supabase Database Search
    try {
      const { data: results, error } = await supabase
        .from("users")
        .select("*")
        .or(`name.ilike.%${term}%,address.ilike.%${term}%`)
        .limit(1);

      if (!error && results && results.length > 0) {
        const p = {
          address: results[0].address,
          name: results[0].name,
          avatar: results[0].avatar,
          photoUrl: results[0].photo_url || undefined,
          twitterId: results[0].twitter_id || "",
          telegramId: results[0].telegram_id || "",
          twitterLink: results[0].twitter_id ? `https://x.com/${results[0].twitter_id}` : "",
          telegramLink: results[0].telegram_id ? `https://t.me/${results[0].telegram_id}` : "",
        };
        hydrateProfiles([p]); // Hydrate cache immediately
        setProfileSyncTick(t => t + 1);
        return p;
      }
    } catch (e) {
      console.error("Supabase search failed:", e);
    }

    // 2. Check local profiles cache as fallback
    const localProfile = getProfileFromGlobalDB(term);
    if (localProfile && localProfile.address.toLowerCase() !== address?.toLowerCase()) {
      return localProfile;
    }

    // 3. Check localStorage global profiles
    try {
      const raw = localStorage.getItem("lf_global_profiles");
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const [addr, p] of Object.entries(parsed)) {
          if (addr.toLowerCase() === address?.toLowerCase()) continue;
          const profile = p as UserProfile;
          if (
            addr.toLowerCase() === term ||
            profile.name?.toLowerCase().includes(term) ||
            profile.twitterId?.toLowerCase().includes(term) ||
            profile.telegramId?.toLowerCase().includes(term)
          ) {
            return profile;
          }
        }
      }
    } catch {}

    // 4. Fallback for valid EVM address format
    if (term.length === 42 && term.startsWith("0x")) {
      return {
        address: term,
        name: `User ${term.substring(2, 8).toUpperCase()}`,
        avatar: "sunset",
        twitterId: "",
        telegramId: "",
        twitterLink: "",
        telegramLink: "",
      };
    }

    return null;
  };

  const sendPayment = async (
    amount: number,
    txHash: string,
    description?: string,
    isRecurring = false,
    interval?: "daily" | "weekly" | "monthly",
    token: string = "USDC"
  ): Promise<string> => {
    if (!address || !activeChatUser || !isAuthenticated) {

      throw new Error("Unauthenticated");
    }


    // Payment limit check
    if (chatPayProtectionEnabled && !isAdmin(address)) {
      const todayPayments = (supaPayments || []).filter(p => p.sender === address.toLowerCase() && p.createdAt > Date.now() - 86400000).length;
      if (todayPayments >= 10) {
        addNotification({
          title: "Limit Reached",
          body: "Daily payment limit reached (10/day). Protection is enabled.",
          type: "payment",
        });
        throw new Error("Payment Limit Reached");
      }
    }

    // Ensure chat exists permanently

    await ensureChatExists(address.toLowerCase(), activeChatUser.address.toLowerCase(), `Sent a payment of ${amount} ${token}`);


    const newPayment = {
      sender: address.toLowerCase(),
      receiver: activeChatUser.address.toLowerCase(),
      amount,
      token,
      status: "pending", // Security invariant: Always start as pending until verified server-side
      active: true,
      created_at: Date.now(),
      tx_hash: txHash,
      is_recurring: isRecurring,
      recurring_interval: interval,
      description: description || null
    };

    const { data: inserted, error } = await supabase.from('payments').insert(newPayment).select('id').single();

    if (error) {
      throw error;
    }

    // Immediately trigger server-side verification in background
    (async () => {
      try {
        let authToken: string | null = null;
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.access_token) authToken = data.session.access_token;
        } catch {}

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const vRes = await fetch('/api/chat/verify-payment', {
          method: 'POST',
          headers,
          body: JSON.stringify({ paymentId: inserted.id, txHash })
        });
        if (vRes.ok) {
          const vData = await vRes.json();
          if (vData.status && vData.status !== 'pending') {
            setSupaPayments(prev => prev?.map(p => p.id === inserted.id ? { ...p, status: vData.status, txHash: vData.txHash || p.txHash } : p) || null);
          }
        }
      } catch (err) {
        console.warn("Immediate verification background error:", err);
      }
    })();
    
    setSupaPayments(prev => [...(prev || []), { 
      id: inserted.id,
      sender: newPayment.sender,
      receiver: newPayment.receiver,
      amount: newPayment.amount,
      token: newPayment.token,
      status: newPayment.status as "pending" | "confirmed" | "failed",
      active: newPayment.active,
      createdAt: newPayment.created_at,
      txHash: newPayment.tx_hash,
      isRecurring: newPayment.is_recurring,
      recurringInterval: newPayment.recurring_interval as "daily" | "weekly" | "monthly" | undefined,
      description: newPayment.description || undefined
    }]);

    try {
      // Pass skipEnsureChatExists=true — sendPayment already called ensureChatExists() above.
      // This eliminates 3 duplicate DB requests (2x SELECT chats + 1x UPDATE chats).
      await sendMessage(`Sent ${amount} ${token}`, undefined, undefined, inserted.id, true);
    } catch (msgErr) {
      console.warn("Automated payment message failed (rate limit or duplicate):", msgErr);
    }

    addNotification({
      title: "Payment Sent Successfully",
      body: `${amount} ${token} to ${activeChatUser.name} is Confirmed.`,
      type: "payment",
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('refresh-portfolio'));
      window.dispatchEvent(new Event('refresh-wallet-history'));
      window.dispatchEvent(new CustomEvent('arc_payments_synced'));
      setTimeout(() => {
        window.dispatchEvent(new Event('refresh-portfolio'));
        window.dispatchEvent(new Event('refresh-wallet-history'));
      }, 2500);
    }

    return inserted.id;
  };

  const toggleAutoPay = async (paymentId: string, active: boolean) => {
    await supabase.from('payments').update({ active }).eq('id', paymentId);
    addNotification({
      title: active ? "Auto-Pay Resumed" : "Auto-Pay Paused",
      body: `Recurring schedule has been ${active ? "resumed" : "paused"}.`,
      type: "autopay",
    });
  };

  const cancelAutoPay = async (paymentId: string, secondaryId?: string) => {
    const idsToCancel = Array.from(new Set([paymentId, secondaryId].filter(Boolean) as string[]));

    // 1. Optimistic update to local storage cancelled registry immediately
    if (typeof window !== 'undefined') {
      try {
        const cur = JSON.parse(localStorage.getItem('arc_cancelled_autopay_ids') || '[]');
        const updated = Array.from(new Set([...cur, ...idsToCancel]));
        localStorage.setItem('arc_cancelled_autopay_ids', JSON.stringify(updated));
      } catch {}
    }

    // 2. Optimistically update local in-memory payments and wallet cache
    setSupaPayments(prev => {
      if (!prev) return prev;
      const updated = prev.map(p => {
        if (!p) return p;
        if (idsToCancel.includes(p.id)) {
          return { ...p, active: false, status: 'cancelled' as const };
        }
        return p;
      });
      if (typeof window !== 'undefined' && address) {
        try {
          localStorage.setItem(`arc_payments_cache_${address.toLowerCase()}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });

    // 3. Update database via authorized API route (which updates both autopay_schedules and payments tables)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (address) headers['x-wallet-address'] = address;

      for (const id of idsToCancel) {
        try {
          await fetch('/api/autopay/update-status', {
            method: 'POST',
            headers,
            body: JSON.stringify({ scheduleId: id, action: 'CANCEL', walletAddress: address })
          });
        } catch (callErr) {
          console.warn(`[cancelAutoPay] API call error for ${id}:`, callErr);
        }
      }
    } catch (schedErr) {
      console.warn("Failed to cancel linked backend autopay schedule:", schedErr);
    }

    // 4. Notify all components & tabs and re-fetch latest ledger state
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('arc_autopay_updated', {
        detail: { scheduleId: paymentId, action: 'CANCEL' }
      }));
    }

    await refreshPayments();

    addNotification({
      title: "Auto-Pay Canceled",
      body: "Recurring payment schedule has been canceled.",
      type: "autopay",
    });
  };

  // ─── Notification helpers ────────────────────────────────────────────────────
  const addNotification = (notif: Omit<InAppNotification, "id" | "createdAt" | "read">) => {
    const newN: InAppNotification = {
      id: Math.random().toString(36).substring(7),
      ...notif,
      createdAt: Date.now(),
      read: false,
    };
    setNotifications((prev) => [newN, ...prev]);

    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        if (Notification.permission === "granted") {
          new Notification(newN.title, { body: newN.body });
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission().then((p) => {
            if (p === "granted") {
              try {
                new Notification(newN.title, { body: newN.body });
              } catch (e) {
                console.warn("Notification constructor failed", e);
              }
            }
          });
        }
      } catch (e) {
        console.warn("Notification constructor failed", e);
      }
    }
  };

  const clearNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const verifyPayment = async (paymentId: string, txHash?: string): Promise<boolean> => {
    try {
      const targetPayment = supaPayments?.find(p => p.id === paymentId);
      const hash = txHash || targetPayment?.txHash;
      if (!hash) return false;

      let authToken: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) authToken = data.session.access_token;
      } catch {}

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('/api/chat/verify-payment', {
        method: 'POST',
        headers,
        body: JSON.stringify({ paymentId, txHash: hash })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status && data.status !== 'pending') {
          setSupaPayments(prev => prev?.map(p => p.id === paymentId ? { ...p, status: data.status, txHash: data.txHash || p.txHash } : p) || null);
          return true;
        }
      }
      return false;
    } catch (e) {
      console.error("Manual verify-payment error:", e);
      return false;
    }
  };

  return (
    <ChatContext.Provider
      value={{
        isAuthenticated,
        isAuthenticating,
        authenticate,
        chats,
        messages,
        payments,
        activeChatUser,
        setActiveChatUser,
        typingUsers,
        setTyping,
        sendMessage,
        editMessage,
        deleteMessage,
        addReaction,
        searchUser,
        sendPayment,
        verifyPayment,
        toggleAutoPay,
        cancelAutoPay,
        togglePin,
        toggleArchive,
        toggleHide,
        saveDraft,
        deleteConversationHistory,
        notifications,
        clearNotification,
        totalUnread,
        isChatsLoading,
        hasLoadedChats,
        isPaymentsLoading: supaPayments === null,
        refreshPayments,
        fetchPaymentById,
        authError,
        clearAuthError: () => setAuthError(null),
        isCheckingSession,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
