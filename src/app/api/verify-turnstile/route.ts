import { NextResponse } from "next/server";

// Cloudflare's official test secret — used when TURNSTILE_SECRET_KEY env var is absent (local dev).
// Pairs with test site key "1x00000000000000000000AA" on the client.
const CF_TEST_SECRET = "1x0000000000000000000000000000000AA";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "No token provided" }, { status: 400 });
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) throw new Error("TURNSTILE_SECRET_KEY is missing");

    // ── Call Cloudflare Siteverify API ──────────────────────────────────────
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: token }),
    });

    const verifyData: {
      success: boolean;
      "error-codes"?: string[];
      challenge_ts?: string;
      hostname?: string;
      action?: string;
    } = await verifyRes.json();

    if (verifyData.success) {
      // Issue a 30-day signed JWT bound to this verification
      const { SignJWT } = await import("jose");
      const signingSecret = new TextEncoder().encode(secretKey);
      const sessionToken = await new SignJWT({ verified: true })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(signingSecret);

      return NextResponse.json({ success: true, sessionToken });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: "Verification failed",
        errorCodes: verifyData["error-codes"],
      }, { status: 400 });
    }
  } catch (error) {
    console.error("[Turnstile] Verification error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
