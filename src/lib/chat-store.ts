import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { globalEventBus } from '@/lib/portfolio/EventBus';
import { Message, Chat } from './chat-service'; // Import types

interface ChatState {
  chats: Chat[];
  messages: Record<string, Message[]>; // Map<conversationId, Message[]>
  unreadCounts: Record<string, number>;
  totalUnread: number;
  
  // Load States
  isChatsLoading: boolean;
  hasLoadedChats: boolean;
  isMessagesLoading: Record<string, boolean>;
  hasLoadedMessages: Record<string, boolean>;
  
  // Pagination
  chatCursors: number; // offset
  messageCursors: Record<string, string>; // Map<conversationId, timestamp>
  hasMoreMessages: Record<string, boolean>;

  // Actions
  initStore: (walletAddress: string) => Promise<void>;
  fetchChats: (walletAddress: string, loadMore?: boolean) => Promise<void>;
  fetchMessages: (walletAddress: string, activeChatAddress: string, loadMore?: boolean) => Promise<void>;
  markMessageSeen: (messageId: string, sender: string, receiver: string) => Promise<void>;
  upsertMessage: (conversationId: string, message: Message, isNew?: boolean) => void;
  removeMessage: (conversationId: string, messageId: string) => void;
  removeMessageById: (messageId: string) => void;
  clearConversation: (conversationId: string) => void;
  upsertChat: (chat: Chat) => void;
  decrementUnread: (sender: string) => void;
  clearStore: () => void;

  // Global UI State
  activeChatAddress: string | null;
  setActiveChatAddress: (addr: string | null) => void;
}

const PAGE_SIZE = 50;
const MSG_PAGE_SIZE = 20;

function getConversationId(addr1: string, addr2: string) {
   return [addr1.toLowerCase(), addr2.toLowerCase()].sort().join("_");
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messages: {},
  unreadCounts: {},
  totalUnread: 0,
  
  isChatsLoading: true,
  hasLoadedChats: false,
  isMessagesLoading: {},
  hasLoadedMessages: {},
  
  chatCursors: 0,
  messageCursors: {},
  hasMoreMessages: {},

  activeChatAddress: null,
  setActiveChatAddress: (addr) => set({ activeChatAddress: addr }),

  clearStore: () => set({
     chats: [], messages: {}, unreadCounts: {}, totalUnread: 0,
     isChatsLoading: false, hasLoadedChats: false, isMessagesLoading: {}, hasLoadedMessages: {},
     chatCursors: 0, messageCursors: {}, hasMoreMessages: {},
     activeChatAddress: null
  }),

  initStore: async (walletAddress: string) => {
    const lowerAddress = walletAddress.toLowerCase();

    // 1. Instant Cache Hydration (SWR - 0ms display)
    let hasLocalCache = false;
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(`arc_chat_cache_${lowerAddress}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            set({ chats: parsed, isChatsLoading: false, hasLoadedChats: true });
            hasLocalCache = true;
          }
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    if (!hasLocalCache) {
      set({ isChatsLoading: true, hasLoadedChats: false });
    }
    
    // Fetch fresh chats from optimized server API
    await get().fetchChats(lowerAddress);
  },

  fetchChats: async (walletAddress: string, loadMore = false) => {
    const state = get();
    const offset = loadMore ? state.chatCursors : 0;
    const lowerAddress = walletAddress.toLowerCase();
    
    if (loadMore && state.isChatsLoading) return;
    if (!loadMore && state.chats.length === 0) {
      set({ isChatsLoading: true });
    }

    try {
      // 1. Primary: High-performance dedicated server API (Bypasses RLS bottleneck, batch hydrates profiles)
      const res = await fetch(`/api/chat/conversations?address=${lowerAddress}&offset=${offset}&limit=${PAGE_SIZE}`, {
        cache: 'no-store'
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.chats)) {
          const incomingChats: Chat[] = json.chats;

          set(curr => {
            let updatedChats: Chat[];
            if (loadMore) {
              const existingIds = new Set(curr.chats.map(c => c.id));
              const uniqueChats = incomingChats.filter(c => !existingIds.has(c.id));
              updatedChats = [...curr.chats, ...uniqueChats];
            } else {
              const existingMap = new Map(curr.chats.map(c => [c.id, c]));
              for (const c of incomingChats) {
                existingMap.set(c.id, c);
              }
              updatedChats = Array.from(existingMap.values())
                .sort((a, b) => (Number(b.lastMessageAt) || 0) - (Number(a.lastMessageAt) || 0));
            }

            // Persist to local cache for instant 0ms loads
            if (typeof window !== 'undefined' && !loadMore) {
              try {
                localStorage.setItem(`arc_chat_cache_${lowerAddress}`, JSON.stringify(updatedChats.slice(0, 50)));
              } catch (e) {}
            }

            return {
              chats: updatedChats,
              chatCursors: offset + incomingChats.length,
              unreadCounts: json.unreadCounts ? { ...curr.unreadCounts, ...json.unreadCounts } : curr.unreadCounts,
              totalUnread: typeof json.totalUnread === 'number' ? json.totalUnread : curr.totalUnread,
              isChatsLoading: false,
              hasLoadedChats: true
            };
          });
          return;
        }
      }
    } catch (apiErr) {
      console.warn('[chat-store] Conversations API failed, falling back to direct Supabase query:', apiErr);
    }

    // 2. Fallback: Direct Supabase query if API is temporarily unavailable
    try {
      const { data, error } = await supabase.from("chats")
        .select("*")
        .contains('participants', [lowerAddress])
        .order("last_message_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (!error && data) {
        const mappedChats: Chat[] = data.filter(c => !(c.hidden_by || []).includes(lowerAddress)).map(c => ({
          id: c.id,
          userAddress: c.participants.find((p: string) => p.toLowerCase() !== lowerAddress) || lowerAddress,
          lastMessageAt: Number(c.last_message_at) || 0,
          lastMessageBody: c.last_message_body,
          isPinned: c.is_pinned || (c.pinned_by || []).includes(lowerAddress),
          isArchived: c.is_archived || (c.archived_by || []).includes(lowerAddress),
          isHidden: c.is_hidden || (c.hidden_by || []).includes(lowerAddress),
          participants: c.participants,
          hidden_by: c.hidden_by,
          unreadCount: 0
        }));

        set(curr => {
          let updatedChats;
          if (loadMore) {
            const existingIds = new Set(curr.chats.map(c => c.id));
            const uniqueChats = mappedChats.filter(c => !existingIds.has(c.id));
            updatedChats = [...curr.chats, ...uniqueChats];
          } else {
            const existingMap = new Map(curr.chats.map(c => [c.id, c]));
            for (const c of mappedChats) {
              existingMap.set(c.id, c);
            }
            updatedChats = Array.from(existingMap.values())
              .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
          }

          if (typeof window !== 'undefined' && !loadMore) {
            try {
              localStorage.setItem(`arc_chat_cache_${lowerAddress}`, JSON.stringify(updatedChats.slice(0, 50)));
            } catch (e) {}
          }

          return {
            chats: updatedChats,
            chatCursors: offset + data.length,
            isChatsLoading: false,
            hasLoadedChats: true
          };
        });
      } else {
        set({ isChatsLoading: false, hasLoadedChats: true });
      }
    } catch (fallbackErr) {
      console.error('[chat-store] Both API and Supabase direct query failed:', fallbackErr);
      set({ isChatsLoading: false, hasLoadedChats: true });
    }
  },

  fetchMessages: async (walletAddress: string, activeChatAddress: string, loadMore = false) => {
    const lowerAddress = walletAddress.toLowerCase();
    const activeAddr = activeChatAddress.toLowerCase();
    const convoId = getConversationId(lowerAddress, activeAddr);
    
    const state = get();
    
    // Deduplication: Return cache instantly if not loading more and messages are already present in store
    if (!loadMore && state.hasLoadedMessages[convoId] && (state.messages[convoId]?.length > 0)) {
       return; 
    }

    const cursor = loadMore ? state.messageCursors[convoId] : undefined;
    
    const existing = get().messages[convoId] || [];
    if (existing.length === 0) {
      set(s => ({ isMessagesLoading: { ...s.isMessagesLoading, [convoId]: true } }));
    }

    const parseTs = (ts: any) => {
      if (!ts) return 0;
      if (typeof ts === 'number') return ts;
      if (typeof ts === 'string' && /^\d+$/.test(ts)) return parseInt(ts, 10);
      return new Date(ts).getTime() || 0;
    };

    let mappedData: Message[] = [];
    let nextCursor: string | undefined = undefined;
    let hasMore = false;
    let fetchSucceeded = false;

    // 1. Primary: Server-side API endpoint using supabaseAdmin to reliably bypass RLS
    try {
      const url = `/api/chat/messages?address=${encodeURIComponent(lowerAddress)}&activeChatAddress=${encodeURIComponent(activeAddr)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}&limit=${MSG_PAGE_SIZE}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.messages)) {
          mappedData = json.messages;
          nextCursor = json.nextCursor;
          hasMore = Boolean(json.hasMore);
          fetchSucceeded = true;

          // Merge any returned payments into local cache
          if (Array.isArray(json.payments) && json.payments.length > 0 && typeof window !== 'undefined') {
            try {
              const cacheKey = `arc_payments_cache_${lowerAddress}`;
              const existing = JSON.parse(localStorage.getItem(cacheKey) || '[]');
              const existingMap = new Map(existing.map((p: any) => [p.id, p]));
              for (const p of json.payments) {
                existingMap.set(p.id, { ...(existingMap.get(p.id) || {}), ...p });
              }
              const merged = Array.from(existingMap.values());
              localStorage.setItem(cacheKey, JSON.stringify(merged));
              window.dispatchEvent(new CustomEvent('arc_payments_synced', { detail: merged }));
            } catch {}
          }
        }
      }
    } catch (apiErr) {
      console.warn('[chat-store] Messages API error, falling back to direct query:', apiErr);
    }

    // 2. Fallback: Direct client query if server API fails or is unreachable
    if (!fetchSucceeded) {
      try {
        let query = supabase.from("messages")
           .select("*")
           .or(`and(sender.eq."${lowerAddress}",receiver.eq."${activeAddr}"),and(sender.eq."${activeAddr}",receiver.eq."${lowerAddress}")`)
           .order("created_at", { ascending: false }) // Pagination requires descending
           .limit(MSG_PAGE_SIZE);
           
        if (cursor) {
           query = query.lt("created_at", cursor);
        }
        
        const { data, error } = await query;
        if (!error && data) {
          mappedData = data.map(m => ({
            id: m.id,
            sender: m.sender,
            receiver: m.receiver,
            body: m.body,
            mediaUrl: m.media_url,
            replyTo: m.reply_to,
            paymentId: m.payment_id,
            reactions: m.reactions || [],
            seen: m.seen,
            delivered: m.delivered,
            edited: m.edited,
            deletedFor: m.deleted_for || [],
            createdAt: parseTs(m.created_at)
          }));
          nextCursor = data.length > 0 ? data[data.length - 1].created_at : undefined;
          hasMore = data.length === MSG_PAGE_SIZE;
          fetchSucceeded = true;
        }
      } catch (fallbackErr) {
        console.error('[chat-store] Both messages API and Supabase direct query failed:', fallbackErr);
      }
    }

    if (fetchSucceeded) {
       // Reverse because UI expects chronologically ascending but query was descending
       const finalData = [...mappedData].reverse();

       set(s => {
          const existing = s.messages[convoId] || [];
          let updatedMessages: Message[];
          
          if (loadMore) {
             const existingIds = new Set(existing.map(m => m.id));
             const uniqueFinal = finalData.filter(m => !existingIds.has(m.id));
             updatedMessages = [...uniqueFinal, ...existing];
          } else {
             const existingMap = new Map(existing.map(m => [m.id, m]));
             for (const m of finalData) {
                 existingMap.set(m.id, m);
             }
             updatedMessages = Array.from(existingMap.values())
                 .sort((a, b) => a.createdAt - b.createdAt);
          }
          
          const nextCursorMap = nextCursor ? { [convoId]: nextCursor } : {};
          
          return {
             messages: { ...s.messages, [convoId]: updatedMessages },
             messageCursors: { ...s.messageCursors, ...nextCursorMap },
             hasMoreMessages: { ...s.hasMoreMessages, [convoId]: hasMore },
             isMessagesLoading: { ...s.isMessagesLoading, [convoId]: false },
             hasLoadedMessages: { ...s.hasLoadedMessages, [convoId]: true }
          };
       });
    } else {
       set(s => ({ isMessagesLoading: { ...s.isMessagesLoading, [convoId]: false } }));
    }
  },

  markMessageSeen: async (messageId: string, sender: string, receiver: string) => {
     try {
       // Force local state update immediately to prevent infinite React effect loops
       set(state => {
         const newMessages = { ...state.messages };
         for (const convoId in newMessages) {
           const idx = newMessages[convoId].findIndex(m => m.id === messageId);
           if (idx >= 0 && !newMessages[convoId][idx].seen) {
             const updated = [...newMessages[convoId]];
             updated[idx] = { ...updated[idx], seen: true };
             newMessages[convoId] = updated;
           }
         }
         return { messages: newMessages };
       });

       // Bypass RLS strict sender-only UPDATE policies using admin route
       await fetch('/api/chat/mark-seen', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ messageId })
       });
     } catch (e) {
       console.error("Failed to mark message as seen:", e);
     }
  },

  decrementUnread: (sender: string) => {
     const s = sender.toLowerCase();
     set(state => {
        const current = state.unreadCounts[s] || 0;
        if (current === 0) return state;
        return {
           unreadCounts: { ...state.unreadCounts, [s]: current - 1 },
           totalUnread: Math.max(0, state.totalUnread - 1)
        };
     });
  },

  upsertMessage: (convoId: string, msg: Message, isNew = false) => {
     set(state => {
        const existing = state.messages[convoId] || [];
        const idx = existing.findIndex(m => m.id === msg.id);
        
        let newArray = [...existing];
        if (idx >= 0) {
           // If message transitioned from unseen to seen
           if (!existing[idx].seen && msg.seen && msg.receiver.toLowerCase() !== msg.sender.toLowerCase()) {
              // Note: Receiver marking as read triggers decrementUnread externally now, but we can also handle it here if needed.
           }
           newArray[idx] = msg;
        } else {
           newArray.push(msg);
           if (isNew && !msg.seen) {
              const s = msg.sender.toLowerCase();
              return {
                 messages: { ...state.messages, [convoId]: newArray },
                 unreadCounts: { ...state.unreadCounts, [s]: (state.unreadCounts[s] || 0) + 1 },
                 totalUnread: state.totalUnread + 1
              };
           }
        }
        return { messages: { ...state.messages, [convoId]: newArray } };
     });
  },

  removeMessage: (convoId: string, messageId: string) => {
     set(state => {
        const existing = state.messages[convoId] || [];
        const newArray = existing.filter(m => m.id !== messageId);
        return { messages: { ...state.messages, [convoId]: newArray } };
     });
  },

  removeMessageById: (messageId: string) => {
     set(state => {
        let newMessages = { ...state.messages };
        let modified = false;
        for (const convoId in newMessages) {
           const existing = newMessages[convoId];
           const newArray = existing.filter(m => m.id !== messageId);
           if (newArray.length !== existing.length) {
              newMessages[convoId] = newArray;
              modified = true;
           }
        }
        if (modified) return { messages: newMessages };
        return state;
     });
  },

  clearConversation: (convoId: string) => {
     set(state => {
        const updatedChats = state.chats.filter(c => {
           const cId = c.participants.map((p: string) => p.toLowerCase()).sort().join("_");
           return cId !== convoId;
        });

        return {
           messages: { ...state.messages, [convoId]: [] },
           messageCursors: { ...state.messageCursors, [convoId]: "" },
           hasMoreMessages: { ...state.hasMoreMessages, [convoId]: false },
           hasLoadedMessages: { ...state.hasLoadedMessages, [convoId]: false },
           chats: updatedChats
        };
     });
  },

  upsertChat: (chat: Chat) => {
     set(state => {
        const idx = state.chats.findIndex(c => c.id === chat.id);
        const newChats = [...state.chats];
        if (idx >= 0) newChats[idx] = chat;
        else newChats.unshift(chat); // Put new chat at top
        
        // Sort by latest activity
        newChats.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
        return { chats: newChats };
     });
  }
}));
