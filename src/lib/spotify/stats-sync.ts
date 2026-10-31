import { normalizeListeningStats, type ListeningStats } from "./stats";

const BROWSER_KEY = "hermes.spotify.stats.browser.v1";
const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export type AccountStatsPhase = "idle" | "syncing" | "ready";

export interface AccountStatsSnapshot {
  stats: ListeningStats | null;
  phase: AccountStatsPhase;
}

let accountSnapshot: AccountStatsSnapshot = { stats: null, phase: "idle" };
const accountListeners = new Set<() => void>();

export function getAccountStatsSnapshot(): AccountStatsSnapshot {
  return accountSnapshot;
}

export function subscribeAccountStats(listener: () => void): () => void {
  accountListeners.add(listener);
  return () => accountListeners.delete(listener);
}

export function publishAccountStats(
  next: Partial<AccountStatsSnapshot>,
): void {
  accountSnapshot = { ...accountSnapshot, ...next };
  for (const listener of accountListeners) listener();
}

export function statsBrowserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(BROWSER_KEY);
    if (existing && ID_PATTERN.test(existing)) return existing;
  } catch {
    // Storage can be unavailable; a session-only id still works.
  }
  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `browser-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 12)}`;
  try {
    window.localStorage.setItem(BROWSER_KEY, generated);
  } catch {
    // The id is still usable for this page session.
  }
  return generated;
}

async function readAccountResponse(
  response: Response,
): Promise<ListeningStats | null> {
  if (!response.ok) return null;
  try {
    const payload = (await response.json()) as {
      connected?: boolean;
      stats?: unknown;
    };
    if (!payload.connected || !payload.stats) return null;
    return normalizeListeningStats(payload.stats);
  } catch {
    return null;
  }
}

export async function pushListeningStats(
  stats: ListeningStats,
  options: { signal?: AbortSignal; keepalive?: boolean } = {},
): Promise<ListeningStats | null> {
  const browserId = statsBrowserId();
  if (!browserId) return null;
  try {
    const response = await fetch("/api/spotify/stats", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browserId, stats }),
      cache: "no-store",
      signal: options.signal,
      keepalive: options.keepalive,
    });
    return readAccountResponse(response);
  } catch {
    return null;
  }
}

export async function fetchAccountListeningStats(
  signal?: AbortSignal,
): Promise<ListeningStats | null> {
  try {
    const response = await fetch("/api/spotify/stats", {
      cache: "no-store",
      signal,
    });
    return readAccountResponse(response);
  } catch {
    return null;
  }
}
