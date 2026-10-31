"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic2, Quote } from "lucide-react";
import type { Track } from "@/lib/catalog/types";
import { usePlayerStore } from "@/store/player";
import { useSettingsStore } from "@/store/settings";
import { cn } from "@/lib/utils";

export function LyricsPanel({
  track,
  className,
  compact = false,
}: {
  track: Track;
  className?: string;
  compact?: boolean;
}) {
  const position = usePlayerStore((state) => state.position);
  const seek = usePlayerStore((state) => state.seek);
  const scale = useSettingsStore((state) => state.lyricsScale);

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [manualUntil, setManualUntil] = useState(0);

  const activeIndex = useMemo(() => {
    if (!track.lyrics?.length) return -1;
    // Keep the first line highlighted during the intro so the panel never looks
    // like a wall of inactive text before the first timestamp.
    let index = 0;
    for (let i = 0; i < track.lyrics.length; i += 1) {
      if (position + 0.05 >= track.lyrics[i].at) index = i;
    }
    return index;
  }, [position, track.lyrics]);

  useEffect(() => {
    if (!track.lyrics || activeIndex < 0) return;
    if (Date.now() < manualUntil) return;
    const container = containerRef.current;
    const line = lineRefs.current[activeIndex];
    if (!container || !line) return;
    const target = line.offsetTop - container.clientHeight * 0.34;
    container.scrollTo({
      top: Math.max(0, target),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [activeIndex, manualUntil, track.lyrics]);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 });
    lineRefs.current = [];
  }, [track.id]);

  if (!track.lyrics?.length) {
    return (
      <section
        className={cn("flex min-h-0 flex-col", className)}
        aria-label="Lyrics"
      >
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Quote size={15} className="text-[var(--acid)]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-dim)]">
              Lyrics
            </h2>
          </div>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-[var(--mint)]">
            <Mic2 size={20} />
          </div>
          <p className="display-serif text-2xl text-white/80">Instrumental</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn("flex min-h-0 flex-col", className)}
      aria-label="Lyrics"
      aria-live="polite"
    >
      <header className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Quote size={15} className="text-[var(--acid)]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-dim)]">
            Lyrics
          </h2>
        </div>
      </header>

      <div
        ref={containerRef}
        className="mask-fade-y relative min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
        onWheel={() => setManualUntil(Date.now() + 3200)}
        onTouchMove={() => setManualUntil(Date.now() + 3200)}
        onScroll={(event) => {
          if (event.currentTarget.scrollTop === 0) return;
        }}
        tabIndex={0}
        aria-label="Synced lyrics — select a line to seek"
      >
        <div
          className={cn(
            "flex flex-col justify-center",
            compact ? "py-8" : "min-h-full py-[22vh]",
          )}
        >
          {track.lyrics.map((line, index) => {
            const isActive = index === activeIndex;
            const isPast = activeIndex >= 0 && index < activeIndex;
            return (
              <button
                key={`${line.at}-${index}`}
                ref={(element) => {
                  lineRefs.current[index] = element;
                }}
                type="button"
                className={cn("lyrics-line mb-4 py-1 pr-3")}
                data-active={isActive}
                data-past={isPast}
                style={{
                  fontSize: compact
                    ? "clamp(1.15rem, 2vw, 1.55rem)"
                    : scale === "large"
                      ? "clamp(1.8rem, 3vw, 3.1rem)"
                      : "clamp(1.45rem, 2.5vw, 2.65rem)",
                }}
                onClick={() => seek(line.at + 0.15)}
                aria-label={`Seek to lyric: ${line.text}`}
              >
                {line.text}
              </button>
            );
          })}
          <div className="h-[18vh]" aria-hidden />
        </div>
      </div>
    </section>
  );
}
