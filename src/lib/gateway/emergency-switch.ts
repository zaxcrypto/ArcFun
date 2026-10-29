/**
 * Server-Authoritative Emergency Kill Switch for Circle Gateway Relayer
 * 
 * Allows operators to instantly halt Sponsored Mint without redeploying code.
 * When halted, user funds are never trapped: Manual Claim remains 100% active,
 * allowing users to self-mint with their own gas.
 * 
 * Operators can configure via environment variables:
 * - GATEWAY_SPONSORED_MINT_ENABLED: "false" to halt all sponsored mints globally
 * - GATEWAY_DISABLED_DOMAINS: "1,2" to halt sponsored mints on specific domains
 */

let runtimeGlobalHalt = false;
let runtimeHaltReason = "";
const runtimeDisabledDomains = new Set<number>();

export function isSponsoredMintEnabled(domainId?: number): { enabled: boolean; reason?: string } {
  // 1. Check runtime global halt
  if (runtimeGlobalHalt) {
    return {
      enabled: false,
      reason: runtimeHaltReason || "Gateway Sponsored Mint is temporarily halted by ArcFun operators. Please use Manual Claim.",
    };
  }

  // 2. Check environment variable global halt
  const envEnabled = process.env.GATEWAY_SPONSORED_MINT_ENABLED;
  if (envEnabled !== undefined && (envEnabled.toLowerCase() === "false" || envEnabled === "0")) {
    return {
      enabled: false,
      reason: "Gateway Sponsored Mint is currently disabled for scheduled maintenance. Please use Manual Claim to self-mint.",
    };
  }

  // 3. Check domain-specific halt
  if (domainId !== undefined) {
    if (runtimeDisabledDomains.has(domainId)) {
      return {
        enabled: false,
        reason: `Sponsored Mint is temporarily suspended for domain ${domainId}. Please use Manual Claim.`,
      };
    }

    const disabledDomainsEnv = (process.env.GATEWAY_DISABLED_DOMAINS || "").split(",").map((s) => s.trim());
    if (disabledDomainsEnv.includes(domainId.toString())) {
      return {
        enabled: false,
        reason: `Sponsored Mint is temporarily disabled on this destination network. Please use Manual Claim.`,
      };
    }
  }

  return { enabled: true };
}

/**
 * Admin utility to toggle emergency kill switch in runtime memory
 */
export function setEmergencyKillSwitch(halt: boolean, reason: string = ""): void {
  runtimeGlobalHalt = halt;
  runtimeHaltReason = reason;
  console.warn(`[EMERGENCY KILL SWITCH] Global Sponsored Mint halt set to ${halt}. Reason: ${reason}`);
}

export function setDomainKillSwitch(domainId: number, halt: boolean): void {
  if (halt) {
    runtimeDisabledDomains.add(domainId);
    console.warn(`[EMERGENCY KILL SWITCH] Domain ${domainId} Sponsored Mint disabled.`);
  } else {
    runtimeDisabledDomains.delete(domainId);
    console.warn(`[EMERGENCY KILL SWITCH] Domain ${domainId} Sponsored Mint re-enabled.`);
  }
}
