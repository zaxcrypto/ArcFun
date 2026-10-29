import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { PrivyClient } from '@privy-io/node';

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  appSecret: process.env.PRIVY_APP_SECRET || ''
});

export interface AuthenticatedUser {
  address?: string;
  user?: any;
}

export async function authenticateUser(req: Request, explicitPrivyToken?: string): Promise<AuthenticatedUser | null> {
  let address: string | undefined = undefined;

  // 1. Try to read from cookie session (arc_session)
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('arc_session')?.value;
    if (token) {
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET!) as any;
      const decodedAddress = decoded.sub.toLowerCase();
      if (decodedAddress.startsWith('0x')) {
        address = decodedAddress;
      }
    }
  } catch (err: any) {
    // Session cookie invalid or missing — fall through to Privy
  }

  // 2. Try Privy token (from explicit parameter or Authorization header)
  const authHeader = req.headers.get('Authorization');
  let privyToken = explicitPrivyToken;
  if (!privyToken && authHeader?.startsWith('Bearer ')) {
    privyToken = authHeader.substring(7);
  }

  let user: any = null;
  if (privyToken && privyToken !== 'null' && privyToken !== 'undefined' && privyToken.trim() !== '') {
    try {
      const verifiedClaims = await privy.utils().auth().verifyAccessToken(privyToken);
      const userId = verifiedClaims?.user_id || (verifiedClaims as any)?.sub;
      if (userId) {
        try {
          user = await privy.users().get(userId);
          let userAddress = user.wallet?.address;
          if (!userAddress) {
            const walletAccount = (user.linkedAccounts || user.linked_accounts)?.find((a: any) => a.type === 'wallet');
            if (walletAccount) userAddress = walletAccount.address;
          }
          if (userAddress) {
            address = userAddress.toLowerCase();
          }
        } catch (getErr: any) {
          // Privy users.get failed — no dev bypass; fail closed.
          throw getErr;
        }
      }
    } catch (err: any) {
      console.warn('Privy token auth failed:', err.message || err);
    }
  }

  if (address || user) {
    return { address, user };
  }
  return null;
}
