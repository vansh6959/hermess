"use client";

import { useCallback, useState, type MouseEvent } from "react";
import { Pause, Play } from "lucide-react";
import { SiriWave } from "./SiriWave";

// A muted silver-green tint keeps the original Siri Wave motion inside the
// dark glass palette without the preview's bright spectral colors.
const HERMES_WAVE_TINT: [number, number, number] = [0.78, 0.85, 0.8];

type SiriPlaySize = "hero" | "panel" | "compact";

const SIZES = {
  hero: {
    width: 200,
    height: 96,
    pause: 28,
    play: 30,
    button:
      "siri-play-button--hero h-[80px] w-[160px] rounded-[24px] sm:h-[96px] sm:w-[200px]",
    wave: { amp: 1.5, spread: 1.1, glow: 1.3 },
  },
  panel: {
    width: 184,
    height: 64,
    pause: 24,
    play: 26,
    button: "siri-play-button--panel",
    wave: { amp: 1.8, spread: 1.4, glow: 1.3 },
  },
  compact: {
    width: 108,
    height: 38,
    pause: 17,
    play: 19,
    button: "siri-play-button--compact",
    wave: { amp: 2.15, spread: 1.3, glow: 1.4 },
  },
} as const;

export function SiriPlayButton({
  playing,
  level,
  trackId,
  onToggle,
  size = "hero",
  labels,
  className = "",
}: {
  playing: boolean;
  level: number;
  trackId: string;
  onToggle: () => void;
  size?: SiriPlaySize;
  labels?: { play: string; pause: string };
  className?: string;
}) {
  const safeLevel = Number.isFinite(level)
    ? Math.max(0, Math.min(1, level))
    : 0;
  // After a pointer click the control settles back to the wave until the
  // pointer leaves, so resuming shows the wave instead of a hover glyph.
  const [settled, setSettled] = useState(false);
  const config = SIZES[size];
  const playLabel = labels?.play ?? "Play";
  const pauseLabel = labels?.pause ?? "Pause";

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (
        event.detail > 0 &&
        window.matchMedia("(hover: hover)").matches
      ) {
        setSettled(true);
      }
      onToggle();
    },
    [onToggle],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerLeave={() => setSettled(false)}
      data-testid="siri-play"
      data-size={size}
      data-playing={playing ? "true" : "false"}
      data-level={safeLevel.toFixed(2)}
      data-track-key={trackId}
      data-settled={settled ? "true" : "false"}
      aria-label={playing ? pauseLabel : playLabel}
      className={`siri-play-button relative grid shrink-0 place-items-center text-white outline-none transition-transform duration-300 ease-spring focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040506] active:scale-[0.985] ${size === "hero" ? "" : "hover:scale-[1.015]"} ${config.button} ${className}`}
    >
      {size === "hero" ? (
        <>
          <span aria-hidden="true" className="siri-play-glass" />
          <span aria-hidden="true" className="siri-play-circle" />
        </>
      ) : null}
      <SiriWave
        variant="wave"
        width={config.width}
        height={config.height}
        renderScale={size === "hero" ? 1 : 2}
        playing={playing}
        resetKey={trackId}
        level={safeLevel}
        tint={HERMES_WAVE_TINT}
        transparent
        amp={config.wave.amp}
        spread={config.wave.spread}
        glow={config.wave.glow}
        className="siri-play-wave pointer-events-none h-full w-full"
        style={{ width: "100%", height: "100%" }}
      />
      <span
        aria-hidden="true"
        data-testid="siri-transport-glyph"
        className="siri-play-glyph pointer-events-none absolute"
      >
        {playing ? (
          <Pause
            size={config.pause}
            fill="currentColor"
            className="drop-shadow-[0_1px_5px_rgba(0,0,0,0.9)]"
          />
        ) : (
          <Play
            size={config.play}
            fill="currentColor"
            className="ml-0.5 drop-shadow-[0_1px_5px_rgba(0,0,0,0.9)]"
          />
        )}
      </span>
    </button>
  );
}
