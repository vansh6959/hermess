import { describe, expect, it } from "vitest";
import { clamp, formatCount, formatTime, shuffled } from "@/lib/utils";

describe("formatTime", () => {
  it("formats seconds as m:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9)).toBe("0:09");
    expect(formatTime(61)).toBe("1:01");
    expect(formatTime(252)).toBe("4:12");
  });

  it("guards invalid input", () => {
    expect(formatTime(-4)).toBe("0:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });
});

describe("clamp", () => {
  it("keeps values inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("formatCount", () => {
  it("abbreviates large numbers", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1_500)).toBe("1.5K");
    expect(formatCount(2_000_000)).toBe("2.0M");
  });
});

describe("shuffled", () => {
  it("keeps every item", () => {
    const source = [1, 2, 3, 4, 5, 6];
    const result = shuffled(source);
    expect(result).toHaveLength(source.length);
    expect([...result].sort()).toEqual([...source].sort());
    expect(source).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
