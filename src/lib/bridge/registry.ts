/**
 * Provider Registry
 * 
 * Centralized registry for resolving bridge and swap execution providers.
 * UI components must NEVER instantiate providers directly. They must 
 * request the active provider from this registry.
 */

import { BridgeProvider } from "./provider";

export interface ProviderRegistration {
  id: string; // e.g., "ArcFunNativeProvider", "CircleCCTPProvider"
  name: string;
  instance: BridgeProvider;
  enabled: boolean;
  priority: number; // Lower number = higher priority for fallback routing
}

export class ProviderRegistry {
  private static providers: Map<string, ProviderRegistration> = new Map();

  /**
   * Registers a provider within the ecosystem.
   */
  static register(id: string, name: string, instance: BridgeProvider, priority: number = 100): void {
    this.providers.set(id, {
      id,
      name,
      instance,
      enabled: false, // Default to false until explicitly enabled by feature flags
      priority
    });
  }

  /**
   * Enables a registered provider for use.
   */
  static enable(id: string): void {
    const reg = this.providers.get(id);
    if (!reg) throw new Error(`Provider ${id} not found in registry`);
    reg.enabled = true;
  }

  /**
   * Disables a provider, preventing it from being returned by getActiveProvider.
   */
  static disable(id: string): void {
    const reg = this.providers.get(id);
    if (reg) reg.enabled = false;
  }

  /**
   * Selects the active provider based on availability and priority routing.
   * If the primary provider fails validation, the system can fallback to the next available.
   */
  static getActiveProvider(): BridgeProvider {
    const active = Array.from(this.providers.values())
      .filter(p => p.enabled)
      .sort((a, b) => a.priority - b.priority);

    if (active.length === 0) {
      throw new Error("No active bridge providers available in the registry.");
    }

    return active[0].instance;
  }

  /**
   * Retrieve a specific provider directly (used primarily by admin tools or forced routes)
   */
  static getProviderById(id: string): BridgeProvider {
    const reg = this.providers.get(id);
    if (!reg || !reg.enabled) {
      throw new Error(`Provider ${id} is not available or disabled.`);
    }
    return reg.instance;
  }
}
