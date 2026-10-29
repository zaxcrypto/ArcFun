/**
 * Safely inspects any provider error object or message to determine
 * whether the user explicitly rejected/cancelled a wallet transaction prompt.
 */
export function isUserWalletRejection(e: unknown): boolean {
  if (!e) return false;
  const err = e as any;

  // 1. Numeric / String codes (EIP-1193 code 4001, etc.)
  const codes = [
    err?.code,
    err?.cause?.code,
    err?.error?.code,
    err?.info?.error?.code,
    err?.status,
    err?.data?.code
  ];
  for (const c of codes) {
    if (c === 4001 || c === "4001" || c === "ACTION_REJECTED" || c === "ERR_USER_REJECTED") {
      return true;
    }
  }

  // 2. Provider error names
  const name = String(err?.name || err?.cause?.name || err?.error?.name || "");
  if (
    name === "UserRejectedRequestError" ||
    name === "TransactionRejectedError" ||
    name === "UserRejectedError"
  ) {
    return true;
  }

  // 3. Inspect normalized string fields safely
  const rawStrings = [
    err?.shortMessage,
    err?.message,
    err?.details,
    err?.cause?.message,
    err?.cause?.reason,
    err?.data?.message,
    typeof err === "string" ? err : ""
  ].filter(Boolean);

  const combinedLower = rawStrings.join(" ").toLowerCase();

  const rejectionPhrases = [
    "user rejected",
    "user denied",
    "rejected the request",
    "transaction rejected",
    "rejected transaction",
    "user cancelled",
    "user canceled",
    "cancelled by user",
    "canceled by user",
    "denied transaction",
    "signature rejected",
    "user declined",
    "declined by user",
    "action_rejected",
    "err_user_rejected",
    "user_rejected",
    "rejected by user"
  ];

  return rejectionPhrases.some(phrase => combinedLower.includes(phrase));
}
