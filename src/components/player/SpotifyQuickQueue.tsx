"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ListMusic,
  Loader2,
  Play,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useSpotifySearch } from "@/hooks/useSpotifySearch";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";
import { splitUpcoming } from "@/lib/spotify/queue-order";
import type { ArtworkPalette } from "@/lib/catalog/types";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";
import type { SpotifyTrackResult } from "@/lib/spotify/types";
import { cn } from "@/lib/utils";

function toNowPlaying(track: SpotifyTrackResult): SpotifyNowPlaying {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists,
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    durationMs: track.durationMs,
    spotifyUrl: track.spotifyUrl,
  };
}

export function SpotifyQuickQueue({
  palette,
  queue,
  queueIndex,
  manualQueue,
  contextName,
  onAdd,
  onPlay,
}: {
  palette: ArtworkPalette;
  queue: SpotifyNowPlaying[];
  queueIndex: number;
  manualQueue: SpotifyNowPlaying[];
  contextName: string | null;
  onAdd: (track: SpotifyNowPlaying) => Promise<void>;
  onPlay: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useSpotifySearch(query);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const upcoming = queue.slice(queueIndex + 1);
  const { manual, context } = splitUpcoming(
    queue,
    queueIndex,
    manualQueue.length,
  );
  const manualStart = queueIndex + 1;
  const contextStart = manualStart + manual.length;
  const normalized = query.trim();
  const searching = normalized.length >= 2;
  const loading =
    searching && (search.status === "loading" || search.status === "idle");
  const results =
    search.data?.tracks ?? [];
  const countLabel = upcoming.length > 99 ? "99+" : String(upcoming.length);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() =>
      panelRef.current?.focus(),
    );
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [close, open]);

  const addTrack = (track: SpotifyTrackResult) => {
    void onAdd(toNowPlaying(track));
  };

  const renderRow = (
    track: SpotifyNowPlaying,
    playIndex: number,
    first: boolean,
  ) => (
    <li key={`${track.id}-${playIndex}`} data-testid="quick-queue-row">
      <button
        type="button"
        onClick={() => onPlay(playIndex)}
        aria-label={`Play ${track.name}`}
        className="group flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.045] focus-visible:bg-white/[0.045] focus-visible:outline-none"
      >
        <span className="artwork-shell h-8 w-8 shrink-0 rounded-lg">
          <ArtworkImage
            artwork={toSpotifyArtwork(
              track.imageUrl,
              track.albumName || track.name,
            )}
            alt=""
            loading="lazy"
            sizes="32px"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] font-medium text-white/80 transition group-hover:text-white">
            {track.name}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-[var(--text-mute)]">
            {track.artists}
          </span>
        </span>
        <span className="relative grid h-5 w-5 shrink-0 place-items-center text-white/25">
          <span
            className={cn(
              "text-[8px] uppercase tracking-[0.16em] transition-opacity",
              first ? "group-hover:opacity-0 group-focus-visible:opacity-0" : "opacity-0",
            )}
          >
            Next
          </span>
          <Play
            size={11}
            fill="currentColor"
            aria-hidden
            className="absolute text-white/25 opacity-0 transition-opacity group-hover:text-[var(--acid)] group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </span>
      </button>
    </li>
  );

  return (
    <>
      <div
        id="spotify-quick-queue"
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label="Queue"
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
        data-testid="quick-queue-panel"
        data-state={open ? "open" : "closed"}
        style={{
          background: `linear-gradient(155deg, ${palette.a}2b 0%, rgba(9,13,12,0.76) 34%, rgba(4,8,7,0.9) 100%)`,
          borderColor: `${palette.b}33`,
          boxShadow: `0 30px 90px -38px ${palette.c}f2, 0 1px 0 rgba(255,255,255,0.1) inset, 0 0 0 1px rgba(255,255,255,0.045)`,
        }}
        className={cn(
          "fixed right-[4.65rem] top-1/2 z-[76] flex w-[min(322px,calc(100vw-6rem))] max-h-[min(70vh,560px)] -translate-y-1/2 flex-col overflow-hidden rounded-[24px] border backdrop-blur-2xl backdrop-saturate-150 outline-none transition-[transform,opacity] duration-[420ms] ease-spring will-change-transform sm:right-[4.9rem]",
          open
            ? "translate-x-0 scale-100 opacity-100"
            : "pointer-events-none translate-x-[calc(100%+5rem)] scale-[0.985] opacity-0",
        )}
      >
        <span
          className="pointer-events-none absolute inset-x-7 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full opacity-20 blur-[58px]"
          style={{ background: palette.a }}
          aria-hidden
        />

        <header className="relative flex shrink-0 items-start px-4 pb-2.5 pt-4">
          <div>
            <p className="text-[8.5px] font-medium uppercase tracking-[0.3em] text-[var(--text-mute)]">
              Queue
            </p>
            <p className="mt-1 text-[13px] font-medium tracking-[-0.01em] text-white/90">
              {upcoming.length > 0
                ? `${upcoming.length} ${upcoming.length === 1 ? "song" : "songs"} up next`
                : "Up next"}
            </p>
          </div>
        </header>

        <div className="relative shrink-0 px-3 pb-2">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 transition-colors focus-within:border-white/20">
            <Search size={13} className="shrink-0 text-white/35" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
              placeholder="Add a song to the queue"
              aria-label="Search songs to add to the queue"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-white placeholder:text-white/30 focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear queue search"
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white/35 transition hover:bg-white/[0.08] hover:text-white/80"
              >
                <X size={11} aria-hidden />
              </button>
            ) : null}
          </div>
          {query.length === 1 ? (
            <p className="mt-1.5 px-1 text-[9.5px] text-[var(--text-mute)]">
              Type one more character to search.
            </p>
          ) : null}
        </div>

        <div className="library-song-scroll relative min-h-0 max-h-[min(48vh,380px)] overflow-y-auto overscroll-contain px-2 pb-3">
          {searching ? (
            loading ? (
              <div className="space-y-1 py-1" aria-hidden>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2.5 px-2 py-2"
                  >
                    <div className="skeleton h-8 w-8 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div
                        className="skeleton h-3 rounded"
                        style={{ width: `${74 - index * 7}%` }}
                      />
                      <div
                        className="skeleton h-2 rounded"
                        style={{ width: `${48 - index * 4}%` }}
                      />
                    </div>
                    <Loader2
                      size={13}
                      className="animate-spin text-white/25"
                    />
                  </div>
                ))}
              </div>
            ) : search.status === "error" ? (
              <div className="flex flex-col items-center px-5 py-8 text-center">
                <p className="text-[11px] text-white/55">
                  {search.error?.message ?? "Search failed."}
                </p>
                <button
                  type="button"
                  onClick={search.retry}
                  className="mt-3 rounded-full border border-white/10 px-3 py-1 text-[9.5px] uppercase tracking-[0.14em] text-white/55 transition hover:bg-white/[0.06] hover:text-white"
                >
                  Retry
                </button>
              </div>
            ) : results.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Search size={15} className="mx-auto text-white/20" />
                <p className="mt-2 text-[12px] text-white/55">
                  No songs found
                </p>
              </div>
            ) : (
              <ul className="space-y-px">
                {results.map((track) => (
                  <li
                    key={track.id}
                    className="group flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.045]"
                  >
                    <span className="artwork-shell h-8 w-8 shrink-0 rounded-lg">
                      <ArtworkImage
                        artwork={toSpotifyArtwork(track.imageUrl, "")}
                        alt=""
                        loading="lazy"
                        sizes="32px"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-medium text-white/85">
                        {track.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[var(--text-mute)]">
                        {track.artists}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => addTrack(track)}
                      aria-label={`Add ${track.name} by ${track.artists} to queue`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/55 transition hover:bg-white/[0.09] hover:text-[var(--acid)]"
                    >
                      <Plus size={13} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : upcoming.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-8 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-[var(--mint)]">
                <ListMusic size={16} />
              </span>
              <p className="mt-3 text-[12px] font-medium text-white/65">
                Nothing queued
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-mute)]">
                Search above to add a song.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {manual.length > 0 ? (
                <div>
                  <p className="px-2 pb-1 pt-1 text-[8.5px] font-medium uppercase tracking-[0.22em] text-white/30">
                    Next in queue
                  </p>
                  <ul className="space-y-px">
                    {manual.map((track, index) =>
                      renderRow(track, manualStart + index, index === 0),
                    )}
                  </ul>
                </div>
              ) : null}
              {context.length > 0 ? (
                <div>
                  <p className="truncate px-2 pb-1 pt-1 text-[8.5px] font-medium uppercase tracking-[0.22em] text-white/30">
                    Next from: {contextName ?? "this playlist"}
                  </p>
                  <ul className="space-y-px">
                    {context.map((track, index) =>
                      renderRow(
                        track,
                        contextStart + index,
                        manual.length === 0 && index === 0,
                      ),
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) close(true);
          else setOpen(true);
        }}
        aria-label={open ? "Close queue" : "Open queue"}
        aria-expanded={open}
        aria-controls="spotify-quick-queue"
        data-testid="quick-queue-trigger"
        data-state={open ? "open" : "closed"}
        style={{
          background: open
            ? `linear-gradient(150deg, ${palette.a}24, rgba(9,13,12,0.58))`
            : `linear-gradient(150deg, rgba(255,255,255,0.11), ${palette.a}2b 32%, rgba(8,12,11,0.82))`,
          borderColor: open ? `${palette.b}24` : "rgba(255,255,255,0.16)",
          boxShadow: open
            ? `0 10px 30px -18px ${palette.c}aa, 0 1px 0 rgba(255,255,255,0.08) inset`
            : `0 18px 42px -18px ${palette.c}cc, 0 1px 0 rgba(255,255,255,0.18) inset, 0 0 0 1px rgba(255,255,255,0.035)`,
        }}
        className={cn(
          "fixed right-4 top-1/2 z-[77] grid h-[46px] w-[46px] -translate-y-1/2 place-items-center rounded-full border text-white/90 backdrop-blur-xl transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-300 ease-spring hover:border-white/25 hover:text-white sm:right-5",
          open ? "opacity-70 hover:opacity-100" : "opacity-100",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -left-3 top-1/2 h-px w-3 -translate-y-1/2 bg-gradient-to-l from-white/20 to-transparent transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <span className="font-display text-[18px] font-semibold leading-none tracking-[-0.04em] drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
          Q
        </span>
        {upcoming.length > 0 ? (
          <span className="absolute -bottom-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border border-black/40 bg-[var(--acid)] px-1 text-[8.5px] font-semibold tabular-nums text-[#10140a]">
            {countLabel}
          </span>
        ) : null}
      </button>
    </>
  );
}
