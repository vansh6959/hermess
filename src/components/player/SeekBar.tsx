"use client";

import { usePlayerStore } from "@/store/player";
import { cn, formatTime } from "@/lib/utils";
import { LiquidSlider } from "@/components/ui/LiquidSlider";

export function SeekBar({
  showTimes = true,
  className,
  compact = false,
}: {
  showTimes?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const seek = usePlayerStore((state) => state.seek);

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {showTimes && (
        <span className="w-9 text-right text-[10.5px] tabular-nums text-[var(--text-mute)]">
          {formatTime(position)}
        </span>
      )}
      <LiquidSlider
        value={position}
        max={duration || 1}
        onChange={seek}
        ariaLabel="Seek in track"
        step={compact ? 1 : 0.5}
        className="flex-1"
      />
      {showTimes && (
        <span className="w-9 text-[10.5px] tabular-nums text-[var(--text-mute)]">
          -{formatTime(Math.max(0, duration - position))}
        </span>
      )}
    </div>
  );
}
