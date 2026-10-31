"use client";

import { Volume, Volume1, Volume2, VolumeX } from "lucide-react";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { LiquidSlider } from "@/components/ui/LiquidSlider";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";
import { cn } from "@/lib/utils";

export function SpotifyVolumeControl({
  showSlider = true,
  revealOnHover = false,
  className,
  sliderClassName,
}: {
  showSlider?: boolean;
  revealOnHover?: boolean;
  className?: string;
  sliderClassName?: string;
}) {
  const { volume, muted, setVolume, toggleMute } = useSpotifyPlayback();
  const effective = muted ? 0 : volume;
  const Icon =
    effective === 0
      ? VolumeX
      : effective < 0.34
        ? Volume
        : effective < 0.7
          ? Volume1
          : Volume2;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        revealOnHover && "group/volume",
        className,
      )}
    >
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
      {showSlider ? (
        <span
          className={cn(
            "grid overflow-hidden transition-[grid-template-columns,opacity] duration-300 ease-spring",
            revealOnHover
              ? "grid-cols-[0fr] opacity-0 group-hover/volume:grid-cols-[1fr] group-hover/volume:opacity-100 group-focus-within/volume:grid-cols-[1fr] group-focus-within/volume:opacity-100"
              : "grid-cols-[1fr] opacity-100",
          )}
        >
          <span className="min-w-0 overflow-hidden">
            <LiquidSlider
              value={effective}
              max={1}
              step={0.01}
              onChange={setVolume}
              ariaLabel="Spotify volume"
              className={cn("w-[84px] xl:w-[110px]", sliderClassName)}
            />
          </span>
        </span>
      ) : null}
    </div>
  );
}
