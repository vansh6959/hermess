import { describe, expect, it } from "vitest";
import { lyricScrollDuration, lyricScrollEase } from "@/lib/lyrics-scroll";

describe("lyric scroll timing", () => {
  it("keeps short hops visibly animated and scales duration sublinearly", () => {
    expect(lyricScrollDuration(0)).toBe(360);
    expect(lyricScrollDuration(100)).toBe(360);
    expect(lyricScrollDuration(400)).toBeCloseTo(480, 5);
    expect(lyricScrollDuration(1200)).toBeGreaterThan(
      lyricScrollDuration(400),
    );
    const near = lyricScrollDuration(400) / 400;
    const far = lyricScrollDuration(3200) / 3200;
    expect(far).toBeLessThan(near);
  });

  it("caps the duration for extreme jumps", () => {
    expect(lyricScrollDuration(9000)).toBe(1300);
    expect(lyricScrollDuration(Number.POSITIVE_INFINITY)).toBe(360);
  });

  it("eases from rest and returns a clamped, monotonic curve", () => {
    expect(lyricScrollEase(0)).toBe(0);
    expect(lyricScrollEase(-1)).toBe(0);
    expect(lyricScrollEase(1)).toBe(1);
    expect(lyricScrollEase(2)).toBe(1);
    expect(lyricScrollEase(0.5)).toBeCloseTo(0.5, 5);

    let previous = 0;
    for (let step = 1; step <= 20; step += 1) {
      const value = lyricScrollEase(step / 20);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});
