const MIN_DURATION_MS = 360;
const MAX_DURATION_MS = 1300;
const BASE_DURATION_MS = 200;
const MS_PER_SQRT_PIXEL = 14;

export function lyricScrollDuration(distance: number) {
  const travel = Number.isFinite(distance) ? Math.abs(distance) : 0;
  const scaled = BASE_DURATION_MS + Math.sqrt(travel) * MS_PER_SQRT_PIXEL;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, scaled));
}

export function lyricScrollEase(progress: number) {
  const clamped = Math.min(1, Math.max(0, progress));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}
