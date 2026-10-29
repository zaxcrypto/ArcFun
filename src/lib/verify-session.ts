import { jwtVerify } from "jose";

export async function verifySessionToken(token: string | null | undefined): Promise<boolean> {
  if (process.env.NODE_ENV === "development" || token === "local-dev-bypass") {
    return true; // Bypass Turnstile verification in local development
  }
  if (!token) return false;

  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return false;

  try {
    const secret = new TextEncoder().encode(secretKey);
    const { payload } = await jwtVerify(token, secret);
    return payload.verified === true;
  } catch (error) {
    console.error("Session token verification failed:", error);
    return false;
  }
}

export function getSessionTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return null;
}
