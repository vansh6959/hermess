"use client";

import { useEffect, useMemo, useRef } from "react";
import { Play } from "lucide-react";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { prefetchAlbumTracks } from "@/lib/spotify/album-tracks";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";
import type { ListeningCover } from "@/hooks/useSpotifyCovers";
import { cn } from "@/lib/utils";

const AUTO_DRIFT_PX_PER_MS = 0.034;
const FLING_FRICTION_PER_MS = 0.003;
const MIN_FLING_VELOCITY = 0.08;
const MAX_FLING_VELOCITY = 2.8;
const STOP_FLING_VELOCITY = 0.012;
const VELOCITY_WINDOW_MS = 100;
const VELOCITY_STALE_MS = 90;

interface DragState {
  startX: number;
  startLeft: number;
  moved: boolean;
  samples: Array<{ x: number; t: number }>;
}

function flickVelocity(
  samples: Array<{ x: number; t: number }>,
  now: number,
): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  if (now - last.t > VELOCITY_STALE_MS) return 0;

  const recent = samples.filter((sample) => last.t - sample.t <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return 0;

  const first = recent[0];
  const elapsed = last.t - first.t;
  if (elapsed <= 0) return 0;
  return -(last.x - first.x) / elapsed;
}

export function CoverMarquee({
  covers,
  onOpen,
  className,
}: {
  covers: ListeningCover[];
  onOpen: (cover: ListeningCover) => void;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const touchHoldRef = useRef(false);
  const suppressClickRef = useRef(false);
  const inertiaVelocityRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);

  const items = useMemo(() => {
    if (covers.length === 0) return [];
    const repeats = Math.max(1, Math.ceil(9 / covers.length));
    const base = Array.from({ length: repeats }, () => covers).flat();
    return [...base, ...base];
  }, [covers]);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element || items.length === 0) return;

    inertiaVelocityRef.current = 0;
    const half = () => element.scrollWidth / 2;
    // Follow the app's motion policy (the Settings toggle) rather than the
    // raw OS query. On phones with OS reduce-motion enabled the app still
    // reports "full" when the user has not enabled Reduce motion in Hermes,
    // and the strip must keep moving like the rest of the UI.
    const reduced = () => document.documentElement.dataset.motion === "reduced";

    element.scrollLeft = half();

    let frame = 0;
    let last = performance.now();
    let pending = 0;
    const tick = (now: number) => {
      const elapsed = now - last;
      const delta = Math.min(64, elapsed);
      last = now;

      if (inertiaVelocityRef.current !== 0) {
        if (reduced() || elapsed > 1_000) {
          inertiaVelocityRef.current = 0;
        } else {
          const halfWidth = half();
          let next = element.scrollLeft + inertiaVelocityRef.current * delta;
          if (halfWidth > 0) {
            next %= halfWidth;
            if (next < 0) next += halfWidth;
          }
          element.scrollLeft = next;
          inertiaVelocityRef.current *= Math.exp(
            -FLING_FRICTION_PER_MS * delta,
          );
          if (Math.abs(inertiaVelocityRef.current) < STOP_FLING_VELOCITY) {
            inertiaVelocityRef.current = 0;
          }
        }
      } else if (!touchHoldRef.current && !dragRef.current && !reduced()) {
        // Accumulate sub-pixel motion: the scroll setter can quantise small
        // per-frame deltas away entirely on some engines, which made the
        // strip look frozen.
        pending += delta * AUTO_DRIFT_PX_PER_MS;
        const step = Math.floor(pending);
        if (step > 0) {
          pending -= step;
          element.scrollLeft -= step;
          if (element.scrollLeft <= 0) element.scrollLeft += half();
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <div
      ref={scrollerRef}
      className={cn(
        "no-scrollbar flex cursor-grab gap-3 overflow-x-auto overscroll-x-contain px-2 py-3 active:cursor-grabbing",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "[mask-image:linear-gradient(90deg,transparent,black_5%,black_95%,transparent)]",
        className,
      )}
      role="region"
      aria-label="Albums from your listening history and Discover"
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        const element = scrollerRef.current;
        if (!element) return;
        inertiaVelocityRef.current = 0;
        const now = performance.now();
        dragRef.current = {
          startX: event.clientX,
          startLeft: element.scrollLeft,
          moved: false,
          samples: [{ x: event.clientX, t: now }],
        };
      }}
      onPointerMove={(event) => {
        const element = scrollerRef.current;
        const drag = dragRef.current;
        if (!element || !drag) return;
        const distance = event.clientX - drag.startX;
        const now = performance.now();
        drag.samples.push({ x: event.clientX, t: now });
        while (drag.samples.length > 2 && now - drag.samples[0].t > 160) {
          drag.samples.shift();
        }
        if (!drag.moved && Math.abs(distance) > 3) {
          drag.moved = true;
          element.setPointerCapture(event.pointerId);
        }
        if (drag.moved) {
          element.scrollLeft = drag.startLeft - distance;
        }
      }}
      onPointerUp={(event) => {
        const element = scrollerRef.current;
        const drag = dragRef.current;
        if (element?.hasPointerCapture(event.pointerId)) {
          element.releasePointerCapture(event.pointerId);
        }
        if (drag?.moved) {
          const velocity = flickVelocity(drag.samples, performance.now());
          const reduced =
            document.documentElement.dataset.motion === "reduced";
          if (!reduced && Math.abs(velocity) >= MIN_FLING_VELOCITY) {
            inertiaVelocityRef.current = Math.max(
              -MAX_FLING_VELOCITY,
              Math.min(MAX_FLING_VELOCITY, velocity),
            );
          }
          // Release the drag without mistaking it for a card click.
          suppressClickRef.current = true;
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 120);
        }
        dragRef.current = null;
      }}
      onPointerCancel={(event) => {
        const element = scrollerRef.current;
        if (element?.hasPointerCapture(event.pointerId)) {
          element.releasePointerCapture(event.pointerId);
        }
        inertiaVelocityRef.current = 0;
        dragRef.current = null;
      }}
      onTouchStart={() => {
        touchHoldRef.current = true;
      }}
      onTouchEnd={() => {
        touchHoldRef.current = false;
      }}
      onTouchCancel={() => {
        touchHoldRef.current = false;
      }}
    >
      {items.map((cover, index) => (
        <button
          key={`${cover.id}-${index}`}
          type="button"
          onClick={() => {
            if (suppressClickRef.current) return;
            onOpen(cover);
          }}
          onPointerEnter={() => prefetchAlbumTracks(cover)}
          onFocus={() => prefetchAlbumTracks(cover)}
          aria-label={`Open ${cover.title}`}
          className="group relative aspect-square w-[7.5rem] shrink-0 cursor-pointer overflow-hidden rounded-[20px] border border-white/[0.12] text-left shadow-[0_18px_45px_-24px_rgba(0,0,0,0.9)] transition-[transform,border-color,box-shadow] duration-300 ease-spring hover:z-10 hover:-translate-y-1.5 hover:scale-[1.055] hover:border-white/[0.4] hover:shadow-[0_30px_70px_-26px_rgba(0,0,0,1)] hover:ring-2 hover:ring-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acid)] sm:w-32 md:w-36"
        >
          <ArtworkImage
            artwork={toSpotifyArtwork(cover.imageUrl, cover.title)}
            alt={cover.title}
            loading="lazy"
            className="artwork-img"
            imgClassName="transition-transform duration-500 ease-spring group-hover:scale-[1.06]"
          />
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),transparent_30%,rgba(0,0,0,0.32))] opacity-100 transition-opacity duration-300 group-hover:opacity-50" />
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span
              data-testid="cover-play-overlay"
              className="grid h-10 w-10 scale-90 place-items-center rounded-full border border-transparent bg-black/0 text-white/90 shadow-[0_6px_18px_-10px_rgba(0,0,0,0.8)] transition-[background-color,border-color,transform,box-shadow] duration-150 ease-out group-hover:scale-100 group-hover:border-white/20 group-hover:bg-black/55 group-hover:shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)] group-focus-visible:scale-100 group-focus-visible:border-white/20 group-focus-visible:bg-black/55"
            >
              <Play
                size={14}
                fill="currentColor"
                className="ml-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
