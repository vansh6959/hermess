export interface SpringValue {
  value: number;
  velocity: number;
}

export interface SpringConfig {
  stiffness: number;
  damping: number;
}

export const NAV_SPRINGS = {
  indicator: { stiffness: 420, damping: 34 },
  trail: { stiffness: 180, damping: 24 },
} satisfies Record<string, SpringConfig>;

export const NAV_LIQUID_MAX_STRETCH = 26;
export const NAV_LIQUID_MAX_VELOCITY = 1600;
export const NAV_LIQUID_TINT_MARGIN = 6;

const MAX_FRAME_MS = 34;
const SUBSTEP_SECONDS = 1 / 240;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function advanceSpring(
  state: SpringValue,
  target: number,
  dtMs: number,
  config: SpringConfig,
): SpringValue {
  let value = state.value;
  let velocity = state.velocity;
  let remaining = clamp(dtMs, 0, MAX_FRAME_MS) / 1000;

  while (remaining > 0) {
    const step = Math.min(SUBSTEP_SECONDS, remaining);
    const acceleration =
      -config.stiffness * (value - target) - config.damping * velocity;
    velocity += acceleration * step;
    value += velocity * step;
    remaining -= step;
  }

  return { value, velocity };
}

export function liquidEnergy(velocity: number): number {
  return clamp(Math.abs(velocity) / NAV_LIQUID_MAX_VELOCITY, 0, 1);
}

export function liquidStretch(velocity: number, remaining: number): number {
  return Math.min(
    NAV_LIQUID_MAX_STRETCH,
    Math.abs(velocity) * 0.016 + Math.abs(remaining) * 0.06,
  );
}

export function isItemTinted(
  itemCenter: number,
  blobCenter: number,
  blobWidth: number,
): boolean {
  return (
    Math.abs(itemCenter - blobCenter) <=
    blobWidth / 2 + NAV_LIQUID_TINT_MARGIN
  );
}

export function springSettled(
  state: SpringValue,
  target: number,
  positionTolerance = 0.2,
  velocityTolerance = 4,
): boolean {
  return (
    Math.abs(state.value - target) < positionTolerance &&
    Math.abs(state.velocity) < velocityTolerance
  );
}
