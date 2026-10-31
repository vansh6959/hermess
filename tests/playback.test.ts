import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockPlaybackProvider } from "@/lib/playback/mockProvider";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MockPlaybackProvider", () => {
  it("simulates a timeline and emits ended exactly once", () => {
    const provider = new MockPlaybackProvider();
    const snapshots: Array<{ ended: boolean; position: number }> = [];
    provider.subscribe((snapshot) =>
      snapshots.push({ ended: snapshot.ended, position: snapshot.position }),
    );

    provider.load({ id: "track", duration: 1 });
    provider.play();
    vi.advanceTimersByTime(1000);

    expect(provider.getSnapshot().ended).toBe(true);
    expect(provider.getSnapshot().position).toBe(1);
    expect(snapshots.filter((snapshot) => snapshot.ended)).toHaveLength(1);

    // The timer is stopped at the end; nothing else should fire.
    vi.advanceTimersByTime(4000);
    expect(snapshots.filter((snapshot) => snapshot.ended)).toHaveLength(1);
  });

  it("clamps seeks and restarts when played from the end", () => {
    const provider = new MockPlaybackProvider();
    provider.load({ id: "track", duration: 100 });
    provider.seek(500);
    expect(provider.getSnapshot().position).toBe(100);
    provider.seek(-20);
    expect(provider.getSnapshot().position).toBe(0);

    provider.seek(100);
    provider.play();
    expect(provider.getSnapshot().position).toBeLessThan(1);
    expect(provider.getSnapshot().isPlaying).toBe(true);
  });

  it("pause clears the ended flag and stops the timer", () => {
    const provider = new MockPlaybackProvider();
    provider.load({ id: "track", duration: 1 });
    provider.play();
    vi.advanceTimersByTime(1000);
    expect(provider.getSnapshot().ended).toBe(true);

    provider.pause();
    expect(provider.getSnapshot().ended).toBe(false);
    expect(provider.getSnapshot().isPlaying).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dispose clears timers and listeners", () => {
    const provider = new MockPlaybackProvider();
    const listener = vi.fn();
    provider.subscribe(listener);
    provider.load({ id: "track", duration: 20 });
    provider.play();
    provider.dispose();
    const callsAfterDispose = listener.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
    expect(listener.mock.calls.length).toBe(callsAfterDispose);
  });
});
