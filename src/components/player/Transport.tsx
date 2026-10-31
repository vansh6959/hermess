"use client";

import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";

interface TransportProps {
  size?: "sm" | "md" | "lg";
  showShuffle?: boolean;
  showRepeat?: boolean;
  alwaysShowModes?: boolean;
  className?: string;
}

const playSize = {
  sm: "play-btn play-btn--sm",
  md: "play-btn h-12 w-12",
  lg: "play-btn play-btn--lg",
};

const playIcon = {
  sm: 15,
  md: 18,
  lg: 22,
};

const sideButton = {
  sm: "icon-btn h-8 w-8",
  md: "icon-btn h-10 w-10",
  lg: "icon-btn h-11 w-11",
};

const sideIcon = {
  sm: 14,
  md: 17,
  lg: 19,
};

export function Transport({
  size = "md",
  showShuffle = false,
  showRepeat = false,
  alwaysShowModes = false,
  className,
}: TransportProps) {
  const status = usePlayerStore((state) => state.status);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const repeat = usePlayerStore((state) => state.repeat);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const cycleRepeat = usePlayerStore((state) => state.cycleRepeat);

  const repeatLabel =
    repeat === "off" ? "Repeat off" : repeat === "all" ? "Repeat all" : "Repeat one";

  return (
    <div className={cn("flex items-center justify-center gap-1.5 sm:gap-3", className)}>
      {showShuffle && (
        <LiquidTooltip label={shuffle ? "Shuffle on" : "Shuffle"}>
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label={shuffle ? "Turn shuffle off" : "Turn shuffle on"}
            aria-pressed={shuffle}
            data-active={shuffle}
            className={cn(
              sideButton[size],
              !alwaysShowModes && "hidden sm:inline-flex",
            )}
          >
            <Shuffle size={sideIcon[size]} />
          </button>
        </LiquidTooltip>
      )}

      <LiquidTooltip label="Previous">
        <button
          type="button"
          onClick={previous}
          aria-label="Previous track"
          className={sideButton[size]}
        >
          <SkipBack size={sideIcon[size] + 2} fill="currentColor" />
        </button>
      </LiquidTooltip>

      <button
        type="button"
        onClick={togglePlay}
        aria-label={status === "playing" ? "Pause" : "Play"}
        className={cn(playSize[size], "transition-transform")}
      >
        {status === "playing" ? (
          <Pause size={playIcon[size]} fill="currentColor" />
        ) : (
          <Play size={playIcon[size]} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      <LiquidTooltip label="Next">
        <button
          type="button"
          onClick={next}
          aria-label="Next track"
          className={sideButton[size]}
        >
          <SkipForward size={sideIcon[size] + 2} fill="currentColor" />
        </button>
      </LiquidTooltip>

      {showRepeat && (
        <LiquidTooltip label={repeatLabel}>
          <button
            type="button"
            onClick={cycleRepeat}
            aria-label={repeatLabel}
            aria-pressed={repeat !== "off"}
            data-active={repeat !== "off"}
            className={cn(
              sideButton[size],
              "relative",
              !alwaysShowModes && "hidden sm:inline-flex",
            )}
          >
            {repeat === "one" ? (
              <Repeat1 size={sideIcon[size]} />
            ) : (
              <Repeat size={sideIcon[size]} />
            )}
            {repeat !== "off" && (
              <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--acid)]" />
            )}
          </button>
        </LiquidTooltip>
      )}
    </div>
  );
}
