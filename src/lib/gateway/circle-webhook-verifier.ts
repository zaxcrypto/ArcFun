import * as crypto from "crypto";

// Thread-safe in-memory cache for Circle public keys
const publicKeyCache = new Map<string, crypto.KeyObject>();

/**
 * Retrieves the base URL for Circle Notifications API depending on environment
 */
export function getCircleApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_CIRCLE_IRIS_API?.includes("sandbox") || process.env.CIRCLE_ENV === "sandbox") {
    return "https://api-sandbox.circle.com";
  }
  return "https://api.circle.com";
}

/**
 * Fetches and parses Circle's notification public key using the key ID from the header.
 * Public keys are cached in-memory to prevent outbound HTTP requests on every event.
 */
export async function getCirclePublicKey(keyId: string): Promise<crypto.KeyObject> {
  if (!keyId || typeof keyId !== "string" || keyId.trim().length === 0) {
    throw new Error("Invalid keyId supplied for Circle public key retrieval");
  }

  const cached = publicKeyCache.get(keyId);
  if (cached) {
    return cached;
  }

  const apiKey = process.env.CIRCLE_API_KEY;
  const baseUrl = getCircleApiBaseUrl();
  const url = `${baseUrl}/v2/notifications/publicKey/${encodeURIComponent(keyId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Circle public key from ${baseUrl}: HTTP ${res.status}`);
  }

  const data = await res.json();
  const rawKey = data?.data?.publicKey;
  const algorithm = data?.data?.algorithm;

  if (!rawKey || typeof rawKey !== "string") {
    throw new Error("Malformed public key response from Circle API: missing data.publicKey");
  }

  if (algorithm && algorithm !== "ECDSA_SHA_256") {
    throw new Error(`Unsupported signature algorithm reported by Circle: ${algorithm}`);
  }

  let keyObject: crypto.KeyObject;
  try {
    if (rawKey.includes("BEGIN PUBLIC KEY") || rawKey.includes("BEGIN EC PUBLIC KEY")) {
      keyObject = crypto.createPublicKey({
        key: rawKey,
        format: "pem",
        type: "spki",
      });
    } else {
      keyObject = crypto.createPublicKey({
        key: Buffer.from(rawKey, "base64"),
        format: "der",
        type: "spki",
      });
    }
  } catch (err: any) {
    throw new Error(`Failed to parse Circle public key as SPKI format: ${err?.message || "Unknown error"}`);
  }

  publicKeyCache.set(keyId, keyObject);
  return keyObject;
}

/**
 * Verifies an incoming webhook request signature using Circle's ECDSA_SHA_256 protocol.
 * Must be executed against the UNMODIFIED raw text body.
 */
export async function verifyCircleGatewayWebhookSignature(
  rawBody: string,
  signatureBase64: string | null,
  keyId: string | null
): Promise<{ isValid: boolean; error?: string }> {
  if (!signatureBase64 || !keyId) {
    return {
      isValid: false,
      error: "Missing required Circle signature headers (X-Circle-Signature or X-Circle-Key-Id)",
    };
  }

  if (!rawBody || typeof rawBody !== "string") {
    return {
      isValid: false,
      error: "Invalid or empty request body provided for signature verification",
    };
  }

  try {
    const publicKey = await getCirclePublicKey(keyId);
    const signatureBuffer = Buffer.from(signatureBase64, "base64");

    const isValid = crypto.verify(
      "sha256",
      Buffer.from(rawBody, "utf8"),
      publicKey,
      signatureBuffer
    );

    if (!isValid) {
      return { isValid: false, error: "Cryptographic signature verification failed: signature mismatch" };
    }

    return { isValid: true };
  } catch (err: any) {
    return {
      isValid: false,
      error: err?.message || "Internal signature verification error",
    };
  }
}

/**
 * Testing helper: Allows injecting known key pairs for deterministic unit testing without outbound calls.
 */
export function setCachedPublicKeyForTesting(keyId: string, keyObject: crypto.KeyObject): void {
  publicKeyCache.set(keyId, keyObject);
}

/**
 * Testing helper: Clears key cache.
 */
export function clearCachedPublicKeysForTesting(): void {
  publicKeyCache.clear();
}
