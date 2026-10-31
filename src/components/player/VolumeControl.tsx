"use client";

import { Volume, Volume1, Volume2, VolumeX } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { cn } from "@/lib/utils";
import { LiquidSlider } from "@/components/ui/LiquidSlider";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";

export function VolumeControl({
  showSlider = true,
  className,
  sliderClassName,
}: {
  showSlider?: boolean;
  className?: string;
  sliderClassName?: string;
}) {
  const volume = usePlayerStore((state) => state.volume);
  const muted = usePlayerStore((state) => state.muted);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const toggleMute = usePlayerStore((state) => state.toggleMute);

  const effective = muted ? 0 : volume;
  const Icon = effective === 0 ? VolumeX : effective < 0.34 ? Volume : effective < 0.7 ? Volume1 : Volume2;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <LiquidTooltip label={muted ? "Unmute" : "Mute"}>
        <button
          type="button"
          onClick={toggleMute}
          className="icon-btn h-8 w-8"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          <Icon size={16} />
        </button>
      </LiquidTooltip>
      {showSlider && (
        <LiquidSlider
          value={effective}
          max={1}
          step={0.01}
          onChange={setVolume}
          ariaLabel="Volume"
          className={cn("w-[84px] xl:w-[110px]", sliderClassName)}
        />
      )}
    </div>
  );
}
