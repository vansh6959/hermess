import { catalog } from "@/lib/catalog";
import type { CatalogService } from "@/lib/catalog/types";
import { playbackEngine } from "@/lib/playback/mockProvider";
import type { PlaybackProvider } from "@/lib/playback/types";

/**
 * Single registration point for catalog + playback providers.
 *
 * A future Spotify/Apple Music adapter registers one of these and the rest of
 * the app keeps consuming the same interfaces. Only this file (and the
 * registration call) needs to know which vendor is active.
 */
export interface ProviderRegistration {
  id: string;
  label: string;
  catalog: CatalogService;
  playback: PlaybackProvider;
  configured: boolean;
}

const registry = new Map<string, ProviderRegistration>();

export function registerProvider(registration: ProviderRegistration): void {
  registry.set(registration.id, registration);
}

export function getRegisteredProvider(id: string): ProviderRegistration | undefined {
  return registry.get(id);
}

export function getActiveProvider(id = "local-demo"): ProviderRegistration {
  const provider = registry.get(id);
  if (!provider) {
    throw new Error(`No music provider registered for "${id}"`);
  }
  return provider;
}

registerProvider({
  id: "local-demo",
  label: "Local demo",
  catalog,
  playback: playbackEngine,
  configured: true,
});

export const activeProvider = getActiveProvider("local-demo");
