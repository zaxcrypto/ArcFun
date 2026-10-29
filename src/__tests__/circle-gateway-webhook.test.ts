/* eslint-disable @typescript-eslint/no-require-imports */
import * as crypto from "crypto";
import {
  verifyCircleGatewayWebhookSignature,
  setCachedPublicKeyForTesting,
  clearCachedPublicKeysForTesting,
} from "@/lib/gateway/circle-webhook-verifier";
import { HEAD, POST } from "@/app/api/webhooks/circle-gateway/route";

// Mock Supabase Admin client
jest.mock("@/lib/supabase-admin", () => {
  const mockTable = (tableName: string) => {
    return {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockImplementation((data: any) => {
        if (data?.notification_id === "duplicate-in-flight-id") {
          return Promise.resolve({ error: { code: "23505", message: "duplicate key value" } });
        }
        if (data?.notification_id === "db-failure-notification-id") {
          return Promise.resolve({ error: { code: "50000", message: "Fatal database connection drop" } });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      update: jest.fn().mockImplementation((data: any) => {
        if (data?.status === "failed_db_error") {
          return Promise.resolve({ error: { message: "DB update error" } });
        }
        return {
          eq: jest.fn().mockImplementation((col: string, val: any) => {
            if (val === "transfer-db-failure") {
              return Promise.resolve({ error: { message: "DB write failure on transfer update" } });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        };
      }),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockImplementation(() => {
        return Promise.resolve({ data: null, error: null });
      }),
      single: jest.fn().mockImplementation(() => {
        return Promise.resolve({ data: null, error: null });
      }),
    };
  };

  return {
    supabaseAdmin: {
      from: jest.fn().mockImplementation((tableName: string) => mockTable(tableName)),
    },
  };
});

describe("Circle Gateway Webhooks Security & Event Lifecycle Test Suite", () => {
  let testKeyPair: crypto.KeyPairSyncResult<string, string>;
  const TEST_KEY_ID = "test-circle-key-uuid-123";

  beforeAll(() => {
    // Generate an authentic ECDSA P-256 keypair for deterministic local testing
    testKeyPair = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
  });

  beforeEach(() => {
    clearCachedPublicKeysForTesting();
    const pubKeyObject = crypto.createPublicKey(testKeyPair.publicKey);
    setCachedPublicKeyForTesting(TEST_KEY_ID, pubKeyObject);
    jest.clearAllMocks();

    const { supabaseAdmin } = require("@/lib/supabase-admin");
    supabaseAdmin.from.mockImplementation((tableName: string) => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockImplementation((data: any) => {
        if (data?.notification_id === "duplicate-in-flight-id") {
          return Promise.resolve({ error: { code: "23505", message: "duplicate key value" } });
        }
        if (data?.notification_id === "db-failure-notification-id") {
          return Promise.resolve({ error: { code: "50000", message: "Fatal database connection drop" } });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      update: jest.fn().mockImplementation(() => ({
        eq: jest.fn().mockResolvedValue({ error: null }),
      })),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
  });

  function signPayload(body: string): string {
    const sign = crypto.createSign("sha256");
    sign.update(body, "utf8");
    sign.end();
    return sign.sign(testKeyPair.privateKey, "base64");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Endpoint Validation & HEAD Handler
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. Endpoint Validation (HEAD)", () => {
    it("should respond with HTTP 200 OK to HEAD requests for Circle URL verification", async () => {
      const res = await HEAD();
      expect(res.status).toBe(200);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Cryptographic Signature Verification
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. Cryptographic Signature Verification", () => {
    it("should successfully verify a validly signed raw body", async () => {
      const rawBody = JSON.stringify({ message: "valid_gateway_event", timestamp: 123456789 });
      const signature = signPayload(rawBody);

      const result = await verifyCircleGatewayWebhookSignature(rawBody, signature, TEST_KEY_ID);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject an event if the raw body was tampered after signing", async () => {
      const originalBody = JSON.stringify({ amount: "10.00", txHash: "0x123" });
      const signature = signPayload(originalBody);

      const tamperedBody = JSON.stringify({ amount: "10000.00", txHash: "0x123" });
      const result = await verifyCircleGatewayWebhookSignature(tamperedBody, signature, TEST_KEY_ID);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("signature mismatch");
    });

    it("should reject an event with a corrupted signature", async () => {
      const rawBody = JSON.stringify({ test: "data" });
      const corruptSignature = Buffer.from("completely_invalid_signature_bytes").toString("base64");

      const result = await verifyCircleGatewayWebhookSignature(rawBody, corruptSignature, TEST_KEY_ID);
      expect(result.isValid).toBe(false);
    });

    it("should reject requests missing signature or key ID headers", async () => {
      const rawBody = JSON.stringify({ test: "data" });
      const resMissingSig = await POST(
        new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
          method: "POST",
          headers: { "x-circle-key-id": TEST_KEY_ID },
          body: rawBody,
        })
      );
      expect(resMissingSig.status).toBe(401);

      const resMissingKey = await POST(
        new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
          method: "POST",
          headers: { "x-circle-signature": "some_sig" },
          body: rawBody,
        })
      );
      expect(resMissingKey.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Payload Integrity & Envelope Validation
  // ──────────────────────────────────────────────────────────────────────────
  describe("3. Payload Integrity & Envelope Validation", () => {
    it("should reject malformed JSON payloads with HTTP 400", async () => {
      const malformedJson = "{ invalid_json: true, ";
      const signature = signPayload(malformedJson);

      const req = new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
        method: "POST",
        headers: {
          "x-circle-signature": signature,
          "x-circle-key-id": TEST_KEY_ID,
        },
        body: malformedJson,
      });

      const response = await POST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("Malformed JSON");
    });

    it("should reject payloads missing notificationId or notificationType envelope", async () => {
      const body = JSON.stringify({ someField: "no_notification_id" });
      const signature = signPayload(body);

      const req = new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
        method: "POST",
        headers: {
          "x-circle-signature": signature,
          "x-circle-key-id": TEST_KEY_ID,
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Missing notificationId or notificationType");
    });

    it("should safely ignore and acknowledge unsupported event types without error", async () => {
      const body = JSON.stringify({
        notificationId: "notif-unsupported-123",
        notificationType: "some.unsupported.circle.event",
        notification: { foo: "bar" },
      });
      const signature = signPayload(body);

      const req = new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
        method: "POST",
        headers: {
          "x-circle-signature": signature,
          "x-circle-key-id": TEST_KEY_ID,
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ignored");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Idempotency & Duplicate Delivery Protection
  // ──────────────────────────────────────────────────────────────────────────
  describe("4. Idempotency & Duplicate Delivery Protection", () => {
    it("should return HTTP 200 duplicate when an already-processed notification is redelivered", async () => {
      const { supabaseAdmin } = require("@/lib/supabase-admin");
      supabaseAdmin.from.mockImplementationOnce(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: "uuid-1", status: "processed" },
          error: null,
        }),
      }));

      const body = JSON.stringify({
        notificationId: "already-processed-notif-123",
        notificationType: "gateway.deposit.finalized",
        notification: { from: "0x123", txHash: "0xabc", domain: "0" },
      });
      const signature = signPayload(body);

      const req = new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
        method: "POST",
        headers: {
          "x-circle-signature": signature,
          "x-circle-key-id": TEST_KEY_ID,
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.duplicate).toBe(true);
    });

    it("should handle concurrent duplicate delivery safely via DB unique constraint 23505", async () => {
      const body = JSON.stringify({
        notificationId: "duplicate-in-flight-id",
        notificationType: "gateway.deposit.finalized",
        notification: { from: "0x123", txHash: "0xabc", domain: "0" },
      });
      const signature = signPayload(body);

      const req = new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
        method: "POST",
        headers: {
          "x-circle-signature": signature,
          "x-circle-key-id": TEST_KEY_ID,
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.duplicate).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Gateway Deposit Finalized Event (gateway.deposit.finalized)
  // ──────────────────────────────────────────────────────────────────────────
  describe("5. Event: gateway.deposit.finalized", () => {
    it("should advance status to ready_to_sign when source tx, domain, and depositor match", async () => {
      const { supabaseAdmin } = require("@/lib/supabase-admin");
      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabaseAdmin.from.mockImplementation((tableName: string) => {
        if (tableName === "gateway_pending_transfers") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: "transfer-123",
                status: "deposited_indexing",
                user_address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                source_domain: 0,
              },
              error: null,
            }),
            update: updateMock,
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          insert: jest.fn().mockResolvedValue({ error: null }),
          update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const body = JSON.stringify({
        notificationId: "deposit-notif-1",
        notificationType: "gateway.deposit.finalized",
        notification: {
          from: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
          txHash: "0xabcdef1234567890",
          domain: "0",
          amount: "100.00",
        },
      });
      const signature = signPayload(body);

      const req = new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
        method: "POST",
        headers: {
          "x-circle-signature": signature,
          "x-circle-key-id": TEST_KEY_ID,
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ready_to_sign",
        })
      );
    });

    it("CRITICAL: should NOT advance status if deposit from address does not match user_address (cross-user attack defense)", async () => {
      const { supabaseAdmin } = require("@/lib/supabase-admin");
      const updateMock = jest.fn();

      supabaseAdmin.from.mockImplementation((tableName: string) => {
        if (tableName === "gateway_pending_transfers") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            // No record matches because attacker depositor != victim user_address
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
            update: updateMock,
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          insert: jest.fn().mockResolvedValue({ error: null }),
          update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const body = JSON.stringify({
        notificationId: "deposit-attacker-notif",
        notificationType: "gateway.deposit.finalized",
        notification: {
          from: "0xattacker_address_0000000000000000000000",
          txHash: "0xvictim_tx_hash",
          domain: "0",
          amount: "100.00",
        },
      });
      const signature = signPayload(body);

      const req = new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
        method: "POST",
        headers: {
          "x-circle-signature": signature,
          "x-circle-key-id": TEST_KEY_ID,
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Gateway Mint Finalized Event (gateway.mint.finalized)
  // ──────────────────────────────────────────────────────────────────────────
  describe("6. Event: gateway.mint.finalized", () => {
    it("should mark transfer as minted with destination txHash when matching transferId is provided", async () => {
      const { supabaseAdmin } = require("@/lib/supabase-admin");
      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabaseAdmin.from.mockImplementation((tableName: string) => {
        if (tableName === "gateway_pending_transfers") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: "transfer-mint-target-123", status: "ready_to_mint" },
              error: null,
            }),
            update: updateMock,
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          insert: jest.fn().mockResolvedValue({ error: null }),
          update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const body = JSON.stringify({
        notificationId: "mint-notif-1",
        notificationType: "gateway.mint.finalized",
        notification: {
          transferId: "transfer-mint-target-123",
          txHash: "0xdest_onchain_tx_hash_999",
          domain: "26",
          walletAddress: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
        },
      });
      const signature = signPayload(body);

      const req = new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
        method: "POST",
        headers: {
          "x-circle-signature": signature,
          "x-circle-key-id": TEST_KEY_ID,
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "minted",
          destination_tx_hash: "0xdest_onchain_tx_hash_999",
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Gateway Mint Forwarded Event (gateway.mint.forwarded)
  // ──────────────────────────────────────────────────────────────────────────
  describe("7. Event: gateway.mint.forwarded", () => {
    it("should update transfer to mint_processing and NOT prematurely complete it as minted", async () => {
      const { supabaseAdmin } = require("@/lib/supabase-admin");
      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabaseAdmin.from.mockImplementation((tableName: string) => {
        if (tableName === "gateway_pending_transfers") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: "forwarded-transfer-456", status: "ready_to_mint" },
              error: null,
            }),
            update: updateMock,
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          insert: jest.fn().mockResolvedValue({ error: null }),
          update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const body = JSON.stringify({
        notificationId: "forwarded-notif-1",
        notificationType: "gateway.mint.forwarded",
        notification: {
          transferId: "forwarded-transfer-456",
          txHash: "0xforwarding_relay_tx",
          wasForwarded: true,
        },
      });
      const signature = signPayload(body);

      const req = new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
        method: "POST",
        headers: {
          "x-circle-signature": signature,
          "x-circle-key-id": TEST_KEY_ID,
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "mint_processing",
        })
      );
      expect(updateMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          status: "minted",
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Error Handling & Retry Trigger
  // ──────────────────────────────────────────────────────────────────────────
  describe("8. Error Handling & Retry Trigger", () => {
    it("should return HTTP 500 when database update fails so Circle can retry delivery", async () => {
      const body = JSON.stringify({
        notificationId: "db-failure-notification-id",
        notificationType: "gateway.deposit.finalized",
        notification: { from: "0x123", txHash: "0xabc", domain: "0" },
      });
      const signature = signPayload(body);

      const req = new Request("https://www.thearcfun.xyz/api/webhooks/circle-gateway", {
        method: "POST",
        headers: {
          "x-circle-signature": signature,
          "x-circle-key-id": TEST_KEY_ID,
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
    });
  });
});
