import { describe, expect, it } from "vitest";
import {
  advanceScrobbleSession,
  createScrobbleSession,
  scrobbleThresholdSeconds,
  type ScrobbleTrack,
} from "@/lib/scrobble/engine";

const START_MS = 1_700_000_000_000;
const START_SECONDS = 1_700_000_000;

function track(durationMs: number): ScrobbleTrack {
  return {
    id: "track-1",
    name: "Track One",
    artists: "Artist One",
    albumName: "Album One",
    durationMs,
  };
}

describe("scrobble eligibility threshold", () => {
  it("does not scrobble tracks shorter than 30 seconds", () => {
    expect(scrobbleThresholdSeconds(0.5)).toBeNull();
    expect(scrobbleThresholdSeconds(29)).toBeNull();
    expect(scrobbleThresholdSeconds(29.999)).toBeNull();
  });

  it("excludes the exact 30-second boundary", () => {
    expect(scrobbleThresholdSeconds(30)).toBeNull();
    expect(scrobbleThresholdSeconds(30.001)).toBeCloseTo(15.0005, 5);
  });

  it("uses half the duration up to four minutes", () => {
    expect(scrobbleThresholdSeconds(120)).toBe(60);
    expect(scrobbleThresholdSeconds(180)).toBe(90);
    expect(scrobbleThresholdSeconds(300)).toBe(150);
    expect(scrobbleThresholdSeconds(480)).toBe(240);
    expect(scrobbleThresholdSeconds(600)).toBe(240);
  });

  it("uses the safe four-minute fallback when duration is unknown", () => {
    expect(scrobbleThresholdSeconds(undefined)).toBe(240);
    expect(scrobbleThresholdSeconds(null)).toBe(240);
    expect(scrobbleThresholdSeconds(0)).toBe(240);
    expect(scrobbleThresholdSeconds(Number.NaN)).toBe(240);
  });
});

describe("scrobble session", () => {
  it("never scrobbles a short track even after long listening", () => {
    const session = createScrobbleSession(track(20_000), START_MS);
    let current = session;
    for (let index = 0; index < 20; index += 1) {
      const result = advanceScrobbleSession(current, 60_000, track(20_000));
      current = result.session;
      expect(result.due).toBeNull();
    }
  });

  it("scrobbles once when the dynamic threshold is reached", () => {
    const source = track(120_000);
    let session = createScrobbleSession(source, START_MS);
    let due = null as ReturnType<typeof advanceScrobbleSession>["due"];
    for (let index = 0; index < 60; index += 1) {
      const result = advanceScrobbleSession(session, 1_000, source);
      session = result.session;
      due = result.due;
    }
    expect(due).toEqual({
      artist: "Artist One",
      track: "Track One",
      album: "Album One",
      duration: 120,
      timestamp: START_SECONDS,
    });
    expect(session.scrobbled).toBe(true);

    const again = advanceScrobbleSession(session, 60_000, source);
    expect(again.due).toBeNull();
  });

  it("uses the start timestamp, not the threshold-crossing time", () => {
    const source = track(31_000);
    let session = createScrobbleSession(source, START_MS);
    let due = null as ReturnType<typeof advanceScrobbleSession>["due"];
    for (let index = 0; index < 16; index += 1) {
      const result = advanceScrobbleSession(session, 1_000, source);
      session = result.session;
      due = result.due;
    }
    expect(due?.timestamp).toBe(START_SECONDS);
    expect(due?.duration).toBe(31);
  });

  it("waits four minutes and omits duration when it is unknown", () => {
    const source = track(0);
    let session = createScrobbleSession(source, START_MS);
    let due = null as ReturnType<typeof advanceScrobbleSession>["due"];
    for (let index = 0; index < 239; index += 1) {
      const result = advanceScrobbleSession(session, 1_000, source);
      session = result.session;
      due = result.due;
    }
    expect(due).toBeNull();

    const result = advanceScrobbleSession(session, 1_000, source);
    due = result.due;
    expect(due).toEqual({
      artist: "Artist One",
      track: "Track One",
      album: "Album One",
      timestamp: START_SECONDS,
    });
    expect(due).not.toHaveProperty("duration");
  });

  it("ignores non-positive progress", () => {
    const source = track(120_000);
    const session = createScrobbleSession(source, START_MS);
    expect(advanceScrobbleSession(session, 0, source).due).toBeNull();
    expect(advanceScrobbleSession(session, -500, source).due).toBeNull();
    expect(advanceScrobbleSession(session, Number.NaN, source).due).toBeNull();
  });
});
