import type { LyricLine } from "./types";

/**
 * Original demo lyrics (written for this project, not licensed material).
 * Each track gets a deterministic selection from the shared pools so the demo
 * catalog has varied, timestamped lyric lines without shipping real lyrics.
 */

const POOL_A = [
  "Midnight keeps a spare key to my room",
  "You dissolve like sugar in the blue",
  "I trace the window where the light got in",
  "Every echo learns to say your name",
  "The city hums a lower key tonight",
  "We were glass before we learned to break",
  "Hold the quiet like a second skin",
  "Somewhere a door is closing soft",
  "I wear the weather that you left behind",
  "Half a morning in a paper cup",
  "Static blooming on the radio",
  "Love is a room we never finished",
];

const POOL_B = [
  "The tide remembers what the shore forgets",
  "Silver on your shoulders, silver in my hands",
  "Nothing louder than a room that is true",
  "I keep the moon behind my teeth",
  "All the small hours leaning into you",
  "We drift like dust in a projector beam",
  "There is a garden underneath the street",
  "Your voice arrives before the morning does",
  "I let the silence take the wheel",
  "Blue light on the ceiling, blue light in my chest",
  "You are the outline I keep drawing",
  "The night is wide enough to hold us both",
];

const CHORUSES: Record<string, string> = {
  "album-glass-hours": "Glass hours, hold me in the light",
  "album-glass-hours-deluxe": "Glass hours, nothing here can break",
  "album-neon-orchard": "Grow me in the neon, let the green light in",
  "album-neon-nights": "Neon on the water, we are almost gone",
  "album-afterglow": "Stay for the afterglow, stay for the ache",
  "album-static-bloom": "Bloom in the static, bloom in the noise",
  "album-paper-moons": "Paper moons above us, turning slow",
  "album-low-tide": "Meet me where the low tide leaves the light",
};

export function buildLyrics(
  albumId: string,
  seed: number,
  duration: number,
): LyricLine[] | null {
  const chorus = CHORUSES[albumId];
  if (!chorus) return null;

  const offset = seed * 3;
  const verseOne = [POOL_A[offset % POOL_A.length], POOL_A[(offset + 4) % POOL_A.length]];
  const verseTwo = [POOL_B[offset % POOL_B.length], POOL_B[(offset + 5) % POOL_B.length]];
  const bridge = POOL_A[(offset + 8) % POOL_A.length];

  const lines = [
    verseOne[0],
    verseOne[1],
    chorus,
    verseTwo[0],
    verseTwo[1],
    bridge,
    chorus,
    POOL_B[(offset + 9) % POOL_B.length],
  ];

  const intro = 9;
  const outro = 16;
  const span = Math.max(duration - intro - outro, lines.length * 7);
  const step = span / lines.length;

  return lines.map((text, index) => ({
    at: Math.round((intro + index * step) * 10) / 10,
    text,
  }));
}
