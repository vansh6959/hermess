import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  emptyListeningStats,
  mergeListeningStats,
  normalizeListeningStats,
  type ListeningStats,
} from "./stats";

const STORE_VERSION = 1;
const MAX_BROWSERS_PER_USER = 10;
const BROWSER_RETENTION_MS = 1000 * 60 * 60 * 24 * 180;

interface BrowserEntry {
  stats: ListeningStats;
  updatedAt: number;
}

interface UserEntry {
  browsers: Record<string, BrowserEntry>;
}

interface StoreFile {
  version: typeof STORE_VERSION;
  users: Record<string, UserEntry>;
}

let writeChain: Promise<unknown> = Promise.resolve();

export function isValidStatsUserId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

export function isValidBrowserId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value);
}

function storePath(): string {
  return (
    process.env.HERMES_STATS_STORE?.trim() ||
    path.join(process.cwd(), ".data", "spotify-stats.json")
  );
}

function emptyStore(): StoreFile {
  return { version: STORE_VERSION, users: {} };
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const source = parsed as Partial<StoreFile>;
    if (source.version !== STORE_VERSION || !source.users) return emptyStore();
    if (typeof source.users !== "object") return emptyStore();
    return { version: STORE_VERSION, users: source.users };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  const target = storePath();
  const directory = path.dirname(target);
  await fs.mkdir(directory, { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(store), "utf8");
  await fs.rename(temporary, target);
}

function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const task = writeChain.then(operation, operation);
  writeChain = task.catch(() => undefined);
  return task;
}

function pruneBrowsers(entry: UserEntry): void {
  const now = Date.now();
  const kept = Object.entries(entry.browsers)
    .filter(([, browser]) => now - browser.updatedAt < BROWSER_RETENTION_MS)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, MAX_BROWSERS_PER_USER);
  entry.browsers = Object.fromEntries(kept);
}

function mergedFor(entry: UserEntry | undefined): ListeningStats {
  if (!entry) return emptyListeningStats();
  return mergeListeningStats(
    Object.values(entry.browsers).map((browser) => browser.stats),
  );
}

export async function readAccountListeningStats(
  userId: string,
): Promise<ListeningStats> {
  if (!isValidStatsUserId(userId)) return emptyListeningStats();
  const store = await readStore();
  return mergedFor(store.users[userId]);
}

export async function upsertBrowserListeningStats(
  userId: string,
  browserId: string,
  stats: unknown,
): Promise<ListeningStats> {
  if (!isValidStatsUserId(userId) || !isValidBrowserId(browserId)) {
    return emptyListeningStats();
  }
  const normalized = normalizeListeningStats(stats);
  return withWriteLock(async () => {
    const store = await readStore();
    const user = store.users[userId] ?? { browsers: {} };
    user.browsers[browserId] = { stats: normalized, updatedAt: Date.now() };
    pruneBrowsers(user);
    store.users[userId] = user;
    await writeStore(store);
    return mergedFor(user);
  });
}
