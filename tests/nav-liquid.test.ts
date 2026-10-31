import { describe, expect, it } from "vitest";
import {
  advanceSpring,
  isItemTinted,
  liquidEnergy,
  liquidStretch,
  NAV_LIQUID_MAX_STRETCH,
  NAV_SPRINGS,
  springSettled,
  type SpringValue,
} from "@/lib/nav-liquid";

function simulate(target: number, frames = 60, dt = 1000 / 60) {
  let state: SpringValue = { value: 0, velocity: 0 };
  let peakVelocity = 0;
  let peakPosition = 0;
  let settledAt: number | null = null;
  for (let index = 1; index <= frames; index += 1) {
    state = advanceSpring(state, target, dt, NAV_SPRINGS.indicator);
    peakVelocity = Math.max(peakVelocity, Math.abs(state.velocity));
    peakPosition = Math.max(peakPosition, state.value);
    if (settledAt === null && springSettled(state, target)) {
      settledAt = (index * dt) / 1000;
    }
  }
  return { state, peakVelocity, peakPosition, settledAt };
}

describe("liquid navigation spring", () => {
  it("reaches a far target quickly with only a subtle overshoot", () => {
    const result = simulate(168);
    expect(result.settledAt).not.toBeNull();
    expect(result.settledAt!).toBeGreaterThan(0.3);
    expect(result.settledAt!).toBeLessThan(0.55);
    expect(result.peakPosition - 168).toBeLessThan(2);
    expect(result.state.value).toBeCloseTo(168, 1);
  });

  it("moves an adjacent target to rest faster than a far jump", () => {
    const near = simulate(42);
    const far = simulate(168);
    expect(near.settledAt!).toBeLessThan(far.settledAt!);
  });

  it("scales stretch with speed and caps it", () => {
    expect(liquidStretch(0, 0)).toBe(0);
    expect(liquidStretch(400, 0)).toBeGreaterThan(6);
    expect(liquidStretch(4000, 400)).toBe(NAV_LIQUID_MAX_STRETCH);
    expect(liquidEnergy(0)).toBe(0);
    expect(liquidEnergy(800)).toBeCloseTo(0.5, 1);
    expect(liquidEnergy(4000)).toBe(1);
  });

  it("tints only items covered by the moving blob", () => {
    expect(isItemTinted(100, 100, 40)).toBe(true);
    expect(isItemTinted(121, 100, 40)).toBe(true);
    expect(isItemTinted(100, 100, 66)).toBe(true);
    expect(isItemTinted(200, 100, 40)).toBe(false);
    expect(isItemTinted(195, 160, 66)).toBe(true);
    expect(isItemTinted(205, 160, 66)).toBe(false);
    expect(isItemTinted(200, 160, 40)).toBe(false);
  });

  it("converges after a mid-flight retarget without losing the spring state", () => {
    let state: SpringValue = { value: 0, velocity: 0 };
    for (let index = 0; index < 8; index += 1) {
      state = advanceSpring(state, 168, 1000 / 60, NAV_SPRINGS.indicator);
    }
    expect(state.velocity).toBeGreaterThan(0);

    for (let index = 0; index < 60; index += 1) {
      state = advanceSpring(state, 42, 1000 / 60, NAV_SPRINGS.indicator);
    }
    expect(state.value).toBeCloseTo(42, 1);
  });
});
