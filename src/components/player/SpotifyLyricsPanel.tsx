"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, Mic2 } from "lucide-react";
import type { LyricsLine, LyricsStatus } from "@/hooks/useTrackLyrics";
import { useSettingsStore } from "@/store/settings";
import { lyricScrollDuration, lyricScrollEase } from "@/lib/lyrics-scroll";
import { cn } from "@/lib/utils";

export function SpotifyLyricsPanel({
  title,
  artist,
  lyrics,
  positionMs,
  isPlaying,
  onSeek,
  className,
}: {
  title: string;
  artist: string;
  lyrics: {
    status: LyricsStatus;
    lines: LyricsLine[];
    instrumental: boolean;
    retry: () => void;
  };
  positionMs: number;
  isPlaying: boolean;
  onSeek: (positionMs: number) => void;
  className?: string;
}) {
  const scale = useSettingsStore((state) => state.lyricsScale);
  const { status, lines, instrumental, retry } = lyrics;

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const manualUntilRef = useRef(0);
  const positionedRef = useRef(false);
  const scrollAnimationRef = useRef<number | null>(null);
  const clockRef = useRef({
    positionMs,
    sampledAt: typeof performance === "undefined" ? 0 : performance.now(),
  });
  const unsynced =
    status === "success" && lines.length > 0 && lines[0]?.at === null;

  const cancelScrollAnimation = useCallback(() => {
    if (scrollAnimationRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
  }, []);

  // Blurred text has to be re-rasterized every time the list moves, which
  // produced >100 ms frames. The radius stays subtle, and manual scrolling is
  // tracked in a ref so wheel/touch events never re-render the whole list.
  const beginManualScroll = useCallback(() => {
    cancelScrollAnimation();
    manualUntilRef.current = Date.now() + 3_200;
  }, [cancelScrollAnimation]);

  const scrollTargetFor = useCallback((element: HTMLButtonElement | null) => {
    const container = containerRef.current;
    if (!container || !element) return null;
    const relativeTop =
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top;
    return container.scrollTop + relativeTop - container.clientHeight * 0.42;
  }, []);

  const animateScrollTo = useCallback(
    (target: number, holdMs = 0) => {
      const container = containerRef.current;
      if (!container) return;
      cancelScrollAnimation();

      const max = Math.max(0, container.scrollHeight - container.clientHeight);
      const destination = Math.min(Math.max(0, target), max);
      const start = container.scrollTop;
      const distance = Math.abs(destination - start);
      if (
        distance < 2 ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        container.scrollTop = destination;
        return;
      }

      // Native smooth scrolling cannot be retargeted mid-flight. Drive the
      // motion ourselves so a new active line blends from the current offset.
      const duration = lyricScrollDuration(distance);
      const startedAt = performance.now();
      if (holdMs > 0) {
        manualUntilRef.current = Date.now() + duration + holdMs;
      }
      container.scrollTo({ top: start, behavior: "auto" });

      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        container.scrollTop =
          start + (destination - start) * lyricScrollEase(progress);
        scrollAnimationRef.current =
          progress < 1 ? window.requestAnimationFrame(step) : null;
      };
      scrollAnimationRef.current = window.requestAnimationFrame(step);
    },
    [cancelScrollAnimation],
  );

  const lyricIndexAt = useCallback(
    (seconds: number) => {
      if (lines.length === 0 || lines[0]?.at === null) return -1;
      let index = 0;
      for (let i = 0; i < lines.length; i += 1) {
        const at = lines[i].at;
        if (at !== null && seconds + 0.04 >= at) index = i;
      }
      return index;
    },
    [lines],
  );

  const [activeIndex, setActiveIndex] = useState(() =>
    lyricIndexAt(positionMs / 1000),
  );

  useEffect(() => {
    // Re-anchor only on a real discontinuity (pause, seek, track change).
    // The playback provider samples position about once a second; blending
    // smaller corrections avoids a visible lyric-line jump on every sample.
    const predicted =
      clockRef.current.positionMs +
      (performance.now() - clockRef.current.sampledAt);
    if (!isPlaying || Math.abs(positionMs - predicted) > 220) {
      clockRef.current = { positionMs, sampledAt: performance.now() };
    }
  }, [isPlaying, positionMs]);

  useEffect(() => {
    if (!isPlaying || lines.length === 0) {
      setActiveIndex(lyricIndexAt(positionMs / 1000));
      return;
    }
    // Run the highlight on a continuous clock between samples so lines change
    // with the audio instead of stepping on each poll.
    let frame = window.requestAnimationFrame(function tick() {
      const anchor = clockRef.current;
      const seconds =
        (anchor.positionMs + (performance.now() - anchor.sampledAt)) / 1000;
      const next = lyricIndexAt(seconds);
      setActiveIndex((current) => (current === next ? current : next));
      frame = window.requestAnimationFrame(tick);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying, lyricIndexAt, lines.length]);

  useEffect(() => {
    cancelScrollAnimation();
    containerRef.current?.scrollTo({ top: 0 });
    lineRefs.current = [];
    positionedRef.current = false;
    manualUntilRef.current = 0;
  }, [title, artist, cancelScrollAnimation]);

  useEffect(() => cancelScrollAnimation, [cancelScrollAnimation]);

  useEffect(() => {
    if (activeIndex < 0 || Date.now() < manualUntilRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const target = scrollTargetFor(lineRefs.current[activeIndex]);
    if (target === null) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = window.requestAnimationFrame(() => {
      if (!positionedRef.current || reduced) {
        container.scrollTop = Math.max(0, target);
        positionedRef.current = true;
        return;
      }
      // Auto-follow and clicks share the same cancellable scroll, so a new
      // line retargets from the current offset instead of snapping.
      animateScrollTo(target);
    });

    let initialObservation = true;
    const observer = new ResizeObserver(() => {
      if (initialObservation) {
        initialObservation = false;
        return;
      }
      if (
        Date.now() < manualUntilRef.current ||
        scrollAnimationRef.current !== null
      )
        return;
      const resizedTarget = scrollTargetFor(lineRefs.current[activeIndex]);
      if (resizedTarget === null) return;
      container.scrollTop = Math.max(0, resizedTarget);
    });
    observer.observe(container);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    activeIndex,
    animateScrollTo,
    lines.length,
    status,
    scrollTargetFor,
  ]);

  return (
    <section
      className={cn("flex min-h-0 flex-col", className)}
      aria-label="Lyrics"
    >
      <span className="sr-only" aria-live="polite">
        {lines[activeIndex]?.text ?? ""}
      </span>
      {status === "error" || unsynced ? (
        <div className="mb-3 flex shrink-0 items-center justify-end">
          {status === "error" ? (
            <button
              type="button"
              onClick={retry}
              className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-mute)] transition hover:text-white/70"
            >
              Retry
            </button>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-mute)]">
              Unsynced
            </span>
          )}
        </div>
      ) : null}

      {status === "loading" || status === "idle" ? (
        <div className="space-y-4 py-8" aria-hidden>
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="skeleton h-7 rounded-md"
              style={{ width: `${92 - index * 7}%` }}
            />
          ))}
        </div>
      ) : lines.length > 0 && activeIndex >= 0 ? (
        <div
          ref={containerRef}
          className="mask-fade-y min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
          onWheel={beginManualScroll}
          onTouchMove={beginManualScroll}
          tabIndex={0}
          aria-label="Synced lyrics — select a line to seek"
        >
          <div className="flex min-h-full flex-col justify-center py-[20vh]">
            {lines.map((line, index) => {
              const isActive = index === activeIndex;
              const isPast = activeIndex >= 0 && index < activeIndex;
              return (
                <button
                  key={`${line.at}-${index}`}
                  ref={(element) => {
                    lineRefs.current[index] = element;
                  }}
                  type="button"
                  className="lyrics-line mb-5 py-1 pr-3"
                  data-active={isActive}
                  data-past={isPast}
                  style={{
                    fontSize:
                      scale === "large"
                        ? "clamp(1.8rem, 3vw, 3.1rem)"
                        : "clamp(1.45rem, 2.5vw, 2.65rem)",
                  }}
                  onClick={() => {
                    if (line.at === null) return;
                    const target = scrollTargetFor(lineRefs.current[index]);
                    onSeek((line.at + 0.15) * 1000);
                    if (target !== null) animateScrollTo(target, 500);
                  }}
                  aria-label={`Seek to lyric: ${line.text}`}
                >
                  {line.text}
                </button>
              );
            })}
            <div className="h-[16vh]" aria-hidden />
          </div>
        </div>
      ) : lines.length > 0 ? (
        <div className="mask-fade-y min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
          <div className="space-y-4 py-8">
            {lines.map((line, index) => (
              <p
                key={`${line.at}-${index}`}
                className="[font-family:var(--font-display)] text-[clamp(1.15rem,1.7vw,1.55rem)] font-semibold leading-snug tracking-[-0.03em] text-white/55"
              >
                {line.text}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.025] text-[var(--mint)]">
            {status === "error" ? <CloudOff size={20} /> : <Mic2 size={20} />}
          </div>
          <p className="display-serif text-2xl text-white/75">
            {status === "error"
              ? "Lyrics unavailable"
              : instrumental
                ? "Instrumental"
                : "No lyrics found"}
          </p>
        </div>
      )}
    </section>
  );
}
