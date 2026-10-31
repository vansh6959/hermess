import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearScrobbles,
  readScrobbles,
  recordScrobble,
} from "@/lib/scrobble/ledger";

const LEDGER_KEY = "hermes.scrobbles.v1";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const storage = new MemoryStorage();
const play = {
  artist: "Artist One",
  track: "Track One",
  album: "Album One",
  duration: 31,
  timestamp: 1_700_000_000,
};

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("scrobble ledger", () => {
  it("records a scrobble with its play-start timestamp", () => {
    const record = recordScrobble(play, 1_700_000_100_000);
    expect(record).toMatchObject({
      artist: "Artist One",
      track: "Track One",
      album: "Album One",
      duration: 31,
      timestamp: 1_700_000_000,
      recordedAt: 1_700_000_100_000,
    });
    expect(typeof record?.id).toBe("string");
    expect(readScrobbles()).toEqual([record]);
  });

  it("does not record the same play twice", () => {
    expect(recordScrobble(play, 1_700_000_100_000)).not.toBeNull();
    expect(recordScrobble(play, 1_700_000_200_000)).toBeNull();
    expect(readScrobbles()).toHaveLength(1);
  });

  it("keeps separate plays of the same track", () => {
    recordScrobble(play);
    recordScrobble({ ...play, timestamp: play.timestamp + 180 });
    expect(readScrobbles()).toHaveLength(2);
  });

  it("omits album and duration when they are unknown", () => {
    const record = recordScrobble(
      { artist: "Artist One", track: "Track One", timestamp: 5 },
      6,
    );
    expect(record).not.toHaveProperty("album");
    expect(record).not.toHaveProperty("duration");
  });

  it("rejects unsafe payloads", () => {
    expect(
      recordScrobble({ artist: " ", track: "Track One", timestamp: 1 }),
    ).toBeNull();
    expect(
      recordScrobble({ artist: "Artist One", track: "  ", timestamp: 1 }),
    ).toBeNull();
    expect(
      recordScrobble({
        artist: "Artist One",
        track: "Track One",
        timestamp: Number.NaN,
      }),
    ).toBeNull();
    expect(
      recordScrobble({ artist: "Artist One", track: "Track One", timestamp: -5 }),
    ).toBeNull();
    expect(readScrobbles()).toEqual([]);
  });

  it("survives malformed storage and skips invalid entries", () => {
    storage.setItem(LEDGER_KEY, "{not json");
    expect(readScrobbles()).toEqual([]);

    storage.setItem(
      LEDGER_KEY,
      JSON.stringify({
        version: 1,
        scrobbles: [
          { id: "one", artist: "Artist One", track: "Track One", timestamp: 10, recordedAt: 20 },
          { id: "bad", artist: "", track: "Track One", timestamp: 10, recordedAt: 20 },
          null,
        ],
      }),
    );
    expect(readScrobbles()).toHaveLength(1);
    expect(readScrobbles()[0]).toMatchObject({ id: "one", artist: "Artist One" });
  });

  it("clears every recorded scrobble", () => {
    recordScrobble(play);
    clearScrobbles();
    expect(readScrobbles()).toEqual([]);
    expect(storage.getItem(LEDGER_KEY)).toBeNull();
  });
});
