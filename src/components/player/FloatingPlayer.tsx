"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  GripVertical,
  ListMusic,
  Maximize2,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  X,
  Pause,
  Play,
} from "lucide-react";
import { catalog } from "@/lib/catalog";
import { usePlayerStore } from "@/store/player";
import { useMediaQuery } from "@/hooks/useEnvironment";
import { useArtworkPalette, paletteStyle } from "@/lib/palette";
import { clamp, cn, formatTime } from "@/lib/utils";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";
import { SeekBar } from "./SeekBar";

const CARD_WIDTH = 372;

export function FloatingPlayer() {
  const mode = usePlayerStore((state) => state.playerMode);
  const isNowPlayingOpen = usePlayerStore((state) => state.isNowPlayingOpen);
  const trackId = usePlayerStore((state) => state.currentTrackId);
  const queueIds = usePlayerStore((state) => state.queueIds);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const status = usePlayerStore((state) => state.status);
  const repeat = usePlayerStore((state) => state.repeat);
  const miniPos = usePlayerStore((state) => state.miniPos);
  const setMiniPos = usePlayerStore((state) => state.setMiniPos);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const cycleRepeat = usePlayerStore((state) => state.cycleRepeat);
  const openNowPlaying = usePlayerStore((state) => state.openNowPlaying);
  const restoreDock = usePlayerStore((state) => state.restoreDock);
  const toggleQueue = usePlayerStore((state) => state.toggleQueue);

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const track = trackId ? catalog.getTrack(trackId) : undefined;
  const artist = track ? catalog.getArtist(track.artistId) : undefined;
  const palette = useArtworkPalette(
    track?.artwork.src,
    track?.artwork.palette ?? { a: "#7fa8a6", b: "#d7e2d8", c: "#20363c" },
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
    if (!isDesktop || mode !== "floating" || miniPos) return;
    const height = cardRef.current?.offsetHeight ?? 140;
    setMiniPos({
      x: Math.max(16, window.innerWidth - CARD_WIDTH - 28),
      y: Math.max(16, window.innerHeight - height - 118),
    });
  }, [isDesktop, miniPos, mode, setMiniPos]);

  useEffect(() => {
    if (!isDesktop || !miniPos) return;
    const handleResize = () => {
      const height = cardRef.current?.offsetHeight ?? 140;
      setMiniPos({
        x: clamp(miniPos.x, 8, Math.max(8, window.innerWidth - CARD_WIDTH - 8)),
        y: clamp(miniPos.y, 8, Math.max(8, window.innerHeight - height - 8)),
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isDesktop, miniPos, setMiniPos]);

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
  }, [mode]);

  if (mode !== "floating" || !track || isNowPlayingOpen) return null;

  const remaining = Math.max(0, queueIds.length - currentIndex - 1);
  const repeatLabel =
    repeat === "off" ? "Repeat off" : repeat === "all" ? "Repeat all" : "Repeat one";

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
      setMiniPos({
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

    const positionStyle =
    isDesktop && miniPos
      ? { left: miniPos.x, top: miniPos.y, width: CARD_WIDTH }
      : undefined;

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
            onClick={openNowPlaying}
            className="artwork-shell player-artwork h-[52px] w-[52px] shrink-0 rounded-xl"
            aria-label="Expand player"
          >
            <ArtworkImage
              artwork={track.artwork}
              alt=""
              loading="eager"
              sizes="52px"
            />
          </button>

          <div className="min-w-0 flex-1 py-0.5">
            <button
              type="button"
              onClick={openNowPlaying}
              className="block min-h-6 max-w-full truncate py-0.5 text-left text-[12.5px] font-semibold tracking-tight text-white hover:underline underline-offset-4 decoration-white/30"
            >
              {track.title}
            </button>
            <Link
              href={`/artist/${track.artistId}`}
              className="mt-0.5 block min-h-6 truncate py-1 text-[10.5px] text-[var(--text-mute)] hover:text-white"
            >
              {artist?.name ?? "Unknown artist"}
            </Link>
            <div className="mt-1.5 flex items-center gap-2 text-[9px] tabular-nums text-white/35">
              <span>{formatTime(position)}</span>
              <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full rounded-full bg-[var(--acid)] transition-[width] duration-200"
                  style={{
                    width: `${duration ? Math.min(100, (position / duration) * 100) : 0}%`,
                  }}
                />
              </span>
              <span>-{formatTime(Math.max(0, duration - position))}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {isDesktop && (
            <span className="mr-0.5 hidden text-white/20 xl:block" aria-hidden>
              <GripVertical size={14} />
            </span>
          )}
          <LiquidTooltip label="Expand full player">
            <button
              type="button"
              onClick={openNowPlaying}
              className="icon-btn h-7 w-7"
              aria-label="Expand full player"
            >
              <Maximize2 size={13} />
            </button>
          </LiquidTooltip>
          <LiquidTooltip label="Dock the player">
            <button
              type="button"
              onClick={restoreDock}
              className="icon-btn h-7 w-7"
              aria-label="Close floating player and dock it"
            >
              <X size={14} />
            </button>
          </LiquidTooltip>
        </div>
      </div>

      <SeekBar showTimes={false} compact className="mt-2 px-0.5" />

      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={previous}
            className="icon-btn h-8 w-8"
            aria-label="Previous track"
          >
            <SkipBack size={14} fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="play-btn play-btn--sm h-9 w-9"
            aria-label={status === "playing" ? "Pause" : "Play"}
          >
            {status === "playing" ? (
              <Pause size={14} fill="currentColor" />
            ) : (
              <Play size={14} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={next}
            className="icon-btn h-8 w-8"
            aria-label="Next track"
          >
            <SkipForward size={14} fill="currentColor" />
          </button>
        </div>

        <div className="flex items-center gap-0.5">
          <LiquidTooltip label={repeatLabel}>
            <button
              type="button"
              onClick={cycleRepeat}
              data-active={repeat !== "off"}
              aria-label={repeatLabel}
              aria-pressed={repeat !== "off"}
              className="icon-btn relative h-8 w-8"
            >
              {repeat === "one" ? <Repeat1 size={14} /> : <Repeat size={14} />}
              {repeat !== "off" && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[var(--acid)]" />
              )}
            </button>
          </LiquidTooltip>
          <LiquidTooltip label="Open queue">
            <button
              type="button"
              onClick={() => toggleQueue(true)}
              className="icon-btn relative h-8 w-8"
              aria-label={`Open queue, ${remaining} upcoming`}
            >
              <ListMusic size={15} />
              {remaining > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[var(--acid)] px-0.5 text-[8px] font-bold text-[#10140a]">
                  {remaining}
                </span>
              )}
            </button>
          </LiquidTooltip>
        </div>
      </div>
    </div>
  );
}
