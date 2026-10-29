/**
 * hooks/use-ens.ts
 *
 * Reusable React hook for ENS name resolution.
 *
 * Behavior:
 *  - Calls resolveEnsName() from lib/ens.ts (cache-aware, single lookup per address).
 *  - Returns the cached value synchronously if already resolved.
 *  - Returns null while loading or if no ENS name exists.
 *  - No polling. Re-runs only when the address changes.
 *  - Safe against stale updates via cancelled flag.
 */

import { useState, useEffect } from "react";
import { resolveEnsName, resolveEnsAvatar } from "@/lib/ens";

export function useEnsName(address: string | undefined): string | null {
  const [ensName, setEnsName] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setEnsName(null);
      return;
    }

    let cancelled = false;

    resolveEnsName(address).then((name) => {
      if (!cancelled) setEnsName(name);
    });

    return () => {
      cancelled = true;
    };
  }, [address]);

  return ensName;
}

export function useEnsAvatar(nameOrAddress: string | undefined | null): string | null {
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!nameOrAddress) {
      setAvatar(null);
      return;
    }

    let cancelled = false;

    resolveEnsAvatar(nameOrAddress).then((url) => {
      if (!cancelled) setAvatar(url);
    });

    return () => {
      cancelled = true;
    };
  }, [nameOrAddress]);

  return avatar;
}

export function useEnsProfile(address: string | undefined): { ensName: string | null; ensAvatar: string | null } {
  const [profile, setProfile] = useState<{ ensName: string | null; ensAvatar: string | null }>({
    ensName: null,
    ensAvatar: null,
  });

  useEffect(() => {
    if (!address) {
      setProfile({ ensName: null, ensAvatar: null });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const name = await resolveEnsName(address);
        if (cancelled) return;

        if (name) {
          // Immediately set name
          setProfile(prev => ({ ...prev, ensName: name }));
          const avatar = await resolveEnsAvatar(name);
          if (!cancelled) {
            setProfile({ ensName: name, ensAvatar: avatar });
          }
        } else {
          // If no ENS name, check if avatar exists directly
          const avatar = await resolveEnsAvatar(address);
          if (!cancelled) {
            setProfile({ ensName: null, ensAvatar: avatar });
          }
        }
      } catch {
        if (!cancelled) {
          setProfile({ ensName: null, ensAvatar: null });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  return profile;
}
