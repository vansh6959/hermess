import { describe, expect, it } from "vitest";
import {
  buildShuffleOrder,
  cycleRepeat,
  resolveNext,
  resolvePrevious,
  type QueueState,
} from "@/lib/playback/queue";

function state(overrides: Partial<QueueState> = {}): QueueState {
  return {
    queueIds: ["a", "b", "c", "d"],
    currentIndex: 0,
    repeat: "off",
    shuffle: false,
    shuffleOrder: [],
    shufflePos: 0,
    ...overrides,
  };
}

describe("shuffle order", () => {
  it("starts on the current track and includes every index once", () => {
    const order = buildShuffleOrder(5, 2);
    expect(order[0]).toBe(2);
    expect(order).toHaveLength(5);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("resolveNext", () => {
  it("advances sequentially", () => {
    expect(resolveNext(state())).toEqual({ index: 1, shufflePos: 0 });
  });

  it("stops at the end when repeat is off", () => {
    expect(resolveNext(state({ currentIndex: 3 }))).toBeNull();
  });

  it("wraps with repeat all", () => {
    expect(resolveNext(state({ currentIndex: 3, repeat: "all" }))).toEqual({
      index: 0,
      shufflePos: 0,
    });
  });

  it("repeats the same track on auto-end with repeat one", () => {
    expect(resolveNext(state({ repeat: "one" }), true)).toEqual({
      index: 0,
      shufflePos: 0,
    });
  });

  it("still skips forward manually with repeat one", () => {
    expect(resolveNext(state({ repeat: "one" }), false)).toEqual({
      index: 1,
      shufflePos: 0,
    });
  });

  it("walks the shuffle order and wraps for repeat all", () => {
    const shuffledState = state({
      shuffle: true,
      shuffleOrder: [2, 0, 3, 1],
      shufflePos: 2,
    });
    expect(resolveNext(shuffledState)).toEqual({ index: 1, shufflePos: 3 });
    expect(
      resolveNext({ ...shuffledState, repeat: "all", shufflePos: 3 }),
    ).toEqual({ index: 2, shufflePos: 0 });
  });

  it("returns null when shuffle is exhausted without repeat", () => {
    expect(
      resolveNext(
        state({ shuffle: true, shuffleOrder: [0, 1, 2, 3], shufflePos: 3 }),
      ),
    ).toBeNull();
  });
});

describe("resolvePrevious", () => {
  it("moves back sequentially", () => {
    expect(resolvePrevious(state({ currentIndex: 2 }))).toEqual({
      index: 1,
      shufflePos: 0,
    });
  });

  it("wraps to the end with repeat all", () => {
    expect(resolvePrevious(state({ currentIndex: 0, repeat: "all" }))).toEqual({
      index: 3,
      shufflePos: 0,
    });
  });

  it("returns to the top when at the start without repeat", () => {
    expect(resolvePrevious(state({ currentIndex: 0 }))).toBeNull();
  });

  it("walks backwards through shuffle history", () => {
    expect(
      resolvePrevious(
        state({ shuffle: true, shuffleOrder: [2, 0, 3, 1], shufflePos: 2 }),
      ),
    ).toEqual({ index: 0, shufflePos: 1 });
  });
});

describe("cycleRepeat", () => {
  it("cycles off → all → one → off", () => {
    expect(cycleRepeat("off")).toBe("all");
    expect(cycleRepeat("all")).toBe("one");
    expect(cycleRepeat("one")).toBe("off");
  });
});
