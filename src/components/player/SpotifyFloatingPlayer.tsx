"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  GripVertical,
  Maximize2,
  PictureInPicture2,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";
import { SiriPlayButton } from "./SiriPlayButton";
import { SpotifyVolumeControl } from "./SpotifyVolumeControl";
import { useMediaQuery } from "@/hooks/useEnvironment";
import { paletteStyle, useArtworkPalette } from "@/lib/palette";
import { clamp, cn, formatTime } from "@/lib/utils";

const CARD_WIDTH = 372;

export function SpotifyFloatingPlayer() {
  const {
    current,
    active,
    view,
    isPlaying,
    positionMs,
    durationMs,
    volume,
    muted,
    floatingPosition,
    setFloatingPosition,
    togglePlay,
    next,
    previous,
    openFullPlayer,
    dockPlayer,
  } = useSpotifyPlayback();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const palette = useArtworkPalette(
    current?.imageUrl ?? undefined,
    { a: "#8fb9a3", b: "#14201a", c: "#070d0a" },
  );

  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setDesktopAvailable(Boolean(window.hermesDesktop?.openFloating));
  }, []);

  useEffect(() => {
    if (!isDesktop || view !== "floating" || floatingPosition) return;
    const height = cardRef.current?.offsetHeight ?? 140;
    setFloatingPosition({
      x: Math.max(16, window.innerWidth - CARD_WIDTH - 28),
      y: Math.max(16, window.innerHeight - height - 118),
    });
  }, [isDesktop, floatingPosition, view, setFloatingPosition]);

  useEffect(() => {
    if (!isDesktop || !floatingPosition) return;
    const handleResize = () => {
      const height = cardRef.current?.offsetHeight ?? 140;
      setFloatingPosition({
        x: clamp(floatingPosition.x, 8, Math.max(8, window.innerWidth - CARD_WIDTH - 8)),
        y: clamp(floatingPosition.y, 8, Math.max(8, window.innerHeight - height - 8)),
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isDesktop, floatingPosition, setFloatingPosition]);

  const finishDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
    setDragging(false);
    if (drag.moved) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 380);
    }
  };

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const onClickCapture = (event: MouseEvent) => {
      if (suppressClickRef.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    element.addEventListener("click", onClickCapture, true);
    return () => element.removeEventListener("click", onClickCapture, true);
  }, [view]);

  if (!active || !current || view !== "floating") return null;

  const safeDuration = Math.max(1, durationMs);
  const progress = Math.min(positionMs, safeDuration);
  const positionStyle =
    isDesktop && floatingPosition
      ? { left: floatingPosition.x, top: floatingPosition.y, width: CARD_WIDTH }
      : undefined;

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDesktop || !cardRef.current || event.button !== 0) return;
    const rect = cardRef.current.getBoundingClientRect();
    dragRef.current = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };

    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !cardRef.current) return;
      if (!drag.moved) {
        const distance = Math.hypot(
          moveEvent.clientX - drag.startX,
          moveEvent.clientY - drag.startY,
        );
        if (distance < 4) return;
        drag.moved = true;
        suppressClickRef.current = true;
        setDragging(true);
      }
      const width = cardRef.current.offsetWidth;
      const height = cardRef.current.offsetHeight;
      setFloatingPosition({
        x: clamp(moveEvent.clientX - drag.dx, 8, window.innerWidth - width - 8),
        y: clamp(moveEvent.clientY - drag.dy, 8, window.innerHeight - height - 8),
      });
    };

    const onUp = () => finishDrag();

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    dragCleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  };

  return (
    <div
      ref={cardRef}
      suppressHydrationWarning
      style={{ ...positionStyle, ...paletteStyle(palette) }}
      className={cn(
        "liquid-raised rim grain fixed z-[60] overflow-hidden rounded-[22px] p-3 shadow-[0_36px_90px_-30px_rgba(0,0,0,0.95)] animate-scale-in",
        isDesktop
          ? "cursor-default"
          : "inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] w-auto",
        dragging && "cursor-grabbing transition-none select-none",
      )}
      aria-label="Floating player"
      role="region"
      data-testid="spotify-floating-player"
    >
      <div
        className="pointer-events-none absolute -left-10 -top-14 h-36 w-36 rounded-full opacity-30 blur-3xl"
        style={{ background: palette.a }}
        aria-hidden
      />

      <div className="relative flex items-start gap-2.5">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-start gap-2.5",
            isDesktop && (dragging ? "cursor-grabbing" : "cursor-grab"),
          )}
          onPointerDown={startDrag}
          onDragStart={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={openFullPlayer}
            className="artwork-shell player-artwork h-[52px] w-[52px] shrink-0 rounded-xl"
            aria-label="Open full player"
          >
            <ArtworkImage
              artwork={{
                src: current.imageUrl ?? "",
                alt: current.albumName || current.name,
                palette,
              }}
              alt=""
              loading="eager"
            />
          </button>

          <div className="min-w-0 flex-1 py-0.5">
            <button
              type="button"
              onClick={openFullPlayer}
              className="block min-h-6 max-w-full truncate py-0.5 text-left text-[12.5px] font-semibold tracking-tight text-white hover:underline underline-offset-4 decoration-white/30"
            >
              {current.name}
            </button>
            <p className="mt-0.5 truncate text-[10.5px] text-[var(--text-mute)]">
              {current.artists}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-[9px] tabular-nums text-white/35">
              <span>{formatTime(Math.round(progress / 1000))}</span>
              <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full rounded-full bg-[var(--acid)] transition-[width] duration-200"
                  style={{ width: `${(progress / safeDuration) * 100}%` }}
                />
              </span>
              <span>
                -{formatTime(Math.max(0, Math.round((durationMs - progress) / 1000)))}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <SpotifyVolumeControl
            revealOnHover
            className="mr-0.5"
            sliderClassName="w-[52px] xl:w-[68px]"
          />
          {isDesktop && (
            <span className="mr-0.5 hidden text-white/20 xl:block" aria-hidden>
              <GripVertical size={14} />
            </span>
          )}
          {desktopAvailable && (
            <button
              type="button"
              onClick={() => {
                void window.hermesDesktop?.openFloating?.();
                dockPlayer();
              }}
              className="icon-btn h-7 w-7"
              aria-label="Pop out always on top"
            >
              <PictureInPicture2 size={13} />
            </button>
          )}
          <LiquidTooltip label="Open full player">
            <button
              type="button"
              onClick={openFullPlayer}
              className="icon-btn h-7 w-7"
              aria-label="Open full player"
            >
              <Maximize2 size={13} />
            </button>
          </LiquidTooltip>
          <LiquidTooltip label="Dock player">
            <button
              type="button"
              onClick={dockPlayer}
              className="icon-btn h-7 w-7"
              aria-label="Dock player"
            >
              <ChevronDown size={14} />
            </button>
          </LiquidTooltip>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void previous()}
            className="icon-btn h-8 w-8"
            aria-label="Previous track"
          >
            <SkipBack size={14} fill="currentColor" />
          </button>
          <SiriPlayButton
            size="compact"
            playing={isPlaying}
            level={muted ? 0 : volume}
            trackId={current.id}
            onToggle={() => void togglePlay()}
          />
          <button
            type="button"
            onClick={() => void next()}
            className="icon-btn h-8 w-8"
            aria-label="Next track"
          >
            <SkipForward size={14} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}
