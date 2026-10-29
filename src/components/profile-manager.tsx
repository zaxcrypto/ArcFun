"use client";

import React from "react";
import { supabase } from "@/lib/supabase";

export interface UserProfile {
  address: string;
  name: string;
  avatar: string;
  photoUrl?: string;
  twitterId: string;
  twitterLink: string;
  telegramId: string;
  telegramLink: string;
  cachedAt?: number;
}

export function UsdcLogo({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <img
      src="/usdc.png"
      alt="USDC"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "contain",
        display: "inline-block",
        verticalAlign: "middle",
        ...style
      }}
    />
  );
}

export const AVATAR_PRESETS = [
  { id: "sunset", label: "Sunset", cls: "av-sunset" },
  { id: "ocean", label: "Ocean", cls: "av-ocean" },
  { id: "midnight", label: "Midnight", cls: "av-midnight" },
  { id: "aurora", label: "Aurora", cls: "av-aurora" },
  { id: "rose", label: "Rose", cls: "av-rose" },
  { id: "gold", label: "Gold", cls: "av-gold" },
  { id: "slate", label: "Slate", cls: "av-slate" },
  { id: "cobalt", label: "Cobalt", cls: "av-cobalt" },
];

export function getAvatarClass(id: string): string {
  return AVATAR_PRESETS.find(p => p.id === id)?.cls ?? "av-slate";
}

// ── Profile Service (Single Source of Truth) ───────────────────────────────────

// Memory cache prevents repetitive parsing of localStorage during renders
const memoryProfileCache = new Map<string, UserProfile>();

export function getProfileFromGlobalDB(address: string, allowExpired = true): UserProfile | null {
  if (typeof window === "undefined" || !address) return null;
  const key = address.toLowerCase();

  const getFromCache = () => {
    if (memoryProfileCache.has(key)) return memoryProfileCache.get(key) || null;
    try {
      const raw = localStorage.getItem("lf_global_profiles");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed[key]) {
          memoryProfileCache.set(key, parsed[key]);
          return parsed[key];
        }
      }
    } catch {}
    return null;
  };

  const cached = getFromCache();
  if (!cached) return null;

  // Stale-While-Revalidate: 1 hour Cache TTL (3600000 ms)
  const CACHE_TTL = 3600_000;
  const isExpired = !cached.cachedAt || (Date.now() - cached.cachedAt > CACHE_TTL);

  if (isExpired && !allowExpired) {
    return null;
  }

  return cached;
}

export function hydrateProfiles(profiles: UserProfile[]) {
  if (typeof window === "undefined" || profiles.length === 0) return;
  
  let changed = false;
  let localDb: Record<string, UserProfile> = {};
  
  try {
    const raw = localStorage.getItem("lf_global_profiles");
    if (raw) localDb = JSON.parse(raw);
  } catch {}

  for (const p of profiles) {
    const key = p.address.toLowerCase();
    const existing = memoryProfileCache.get(key) || localDb[key];
    
    // Merge Strategy: Rich profile always wins. Don't overwrite rich fields with missing data.
    const merged: UserProfile = {
      address: key,
      name: p.name || existing?.name || `User ${key.substring(2, 8).toUpperCase()}`,
      avatar: p.avatar || existing?.avatar || "slate",
      photoUrl: p.photoUrl || existing?.photoUrl,
      twitterId: p.twitterId || existing?.twitterId || "",
      telegramId: p.telegramId || existing?.telegramId || "",
      twitterLink: p.twitterLink || existing?.twitterLink || "",
      telegramLink: p.telegramLink || existing?.telegramLink || "",
      cachedAt: Date.now(), // update expiration timestamp
    };

    memoryProfileCache.set(key, merged);
    localDb[key] = merged;
    changed = true;
  }

  if (changed) {
    localStorage.setItem("lf_global_profiles", JSON.stringify(localDb));
  }
}

export async function batchFetchProfiles(addresses: string[]): Promise<void> {
  if (typeof window === "undefined" || addresses.length === 0) return;
  
  const uniqueAddresses = Array.from(new Set(addresses.map(a => a.toLowerCase())));
  // Only fetch profiles that are completely missing or expired (allowExpired = false)
  const missing = uniqueAddresses.filter(a => !getProfileFromGlobalDB(a, false));
  
  if (missing.length === 0) return; 
  
  try {
    const { data: supaUsers, error } = await supabase
      .from("users")
      .select("*")
      .in("address", missing);

    if (error) throw error;
    if (!supaUsers || supaUsers.length === 0) return;

    const fetchedProfiles: UserProfile[] = supaUsers.map(u => ({
      address: u.address,
      name: u.name,
      avatar: u.avatar,
      photoUrl: u.photo_url || undefined,
      twitterId: u.twitter_id || "",
      twitterLink: u.twitter_id ? `https://x.com/${u.twitter_id}` : "",
      telegramId: u.telegram_id || "",
      telegramLink: u.telegram_id ? `https://t.me/${u.telegram_id}` : "",
    }));

    hydrateProfiles(fetchedProfiles);
  } catch (err) {
    console.error("Batch profile fetch failed", err);
  }
}

export async function getProfileFromFirestore(address: string): Promise<UserProfile | null> {
  if (!address) return null;
  const local = getProfileFromGlobalDB(address, false);
  if (local) return local;

  try {
    const { data: supaUser, error } = await supabase
      .from("users")
      .select("*")
      .eq("address", address.toLowerCase())
      .single();

    if (!error && supaUser) {
      const p: UserProfile = {
        address: supaUser.address,
        name: supaUser.name,
        avatar: supaUser.avatar,
        photoUrl: supaUser.photo_url || undefined,
        twitterId: supaUser.twitter_id || "",
        twitterLink: supaUser.twitter_id ? `https://x.com/${supaUser.twitter_id}` : "",
        telegramId: supaUser.telegram_id || "",
        telegramLink: supaUser.telegram_id ? `https://t.me/${supaUser.telegram_id}` : "",
      };
      hydrateProfiles([p]);
      return p;
    }
  } catch (err: any) {
    console.warn(`[Supabase Fallback] Component: profile-manager | Error: ${err.message}`);
  }

  return null;
}

export const TwitterIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export const TelegramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" {...props}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
  </svg>
);

export function ProfileManager() {
  return null;
}
