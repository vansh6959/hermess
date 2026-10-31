import type { ScrobblePayload } from "./engine";

const LEDGER_KEY = "hermes.scrobbles.v1";
const MAX_TEXT = 300;

export interface ScrobbleRecord extends ScrobblePayload {
  id: string;
  recordedAt: number;
}

interface LedgerFile {
  version: 1;
  scrobbles: ScrobbleRecord[];
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeText(value: unknown, maxLength = MAX_TEXT): string {
  if (typeof value !== "string") return "";
  return Array.from(value)
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .trim()
    .slice(0, maxLength);
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeRecord(value: unknown): ScrobbleRecord | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = safeText(source.id, 100);
  const artist = safeText(source.artist);
  const track = safeText(source.track);
  if (!id || !artist || !track) return null;
  if (!validNumber(source.timestamp) || !validNumber(source.recordedAt)) {
    return null;
  }
  const album = safeText(source.album);
  const duration = source.duration;
  return {
    id,
    artist,
    track,
    ...(album ? { album } : {}),
    ...(typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
      ? { duration: Math.round(duration) }
      : {}),
    timestamp: Math.floor(source.timestamp),
    recordedAt: source.recordedAt,
  };
}

function writeScrobbles(records: ScrobbleRecord[]): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const file: LedgerFile = { version: 1, scrobbles: records };
    store.setItem(LEDGER_KEY, JSON.stringify(file));
    return true;
  } catch {
    // A full or unavailable store must not break playback.
    return false;
  }
}

function createId(): string {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readScrobbles(): ScrobbleRecord[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(LEDGER_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const source = parsed as { version?: unknown; scrobbles?: unknown };
    if (source.version !== 1 || !Array.isArray(source.scrobbles)) return [];
    const records: ScrobbleRecord[] = [];
    for (const entry of source.scrobbles) {
      const record = normalizeRecord(entry);
      if (record) records.push(record);
    }
    return records;
  } catch {
    return [];
  }
}

export function recordScrobble(
  payload: ScrobblePayload,
  at = Date.now(),
): ScrobbleRecord | null {
  if (!storage() || !validNumber(at)) return null;
  const artist = safeText(payload.artist);
  const track = safeText(payload.track);
  if (!artist || !track || !validNumber(payload.timestamp)) return null;

  const album = safeText(payload.album);
  const duration = payload.duration;
  const record: ScrobbleRecord = {
    id: createId(),
    artist,
    track,
    ...(album ? { album } : {}),
    ...(typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
      ? { duration: Math.round(duration) }
      : {}),
    timestamp: Math.floor(payload.timestamp),
    recordedAt: at,
  };

  const records = readScrobbles();
  if (
    records.some(
      (item) =>
        item.artist === record.artist &&
        item.track === record.track &&
        item.timestamp === record.timestamp,
    )
  ) {
    return null;
  }
  records.push(record);
  return writeScrobbles(records) ? record : null;
}

export function clearScrobbles(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(LEDGER_KEY);
  } catch {
    // Storage is optional.
  }
}
