"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ListMusic,
  Trash2,
  X,
} from "lucide-react";
import { catalog } from "@/lib/catalog";
import { usePlayerStore } from "@/store/player";
import { useArtworkPalette, paletteStyle } from "@/lib/palette";
import { formatTime } from "@/lib/utils";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { toast } from "@/store/toast";

export function QueuePanel() {
  const open = usePlayerStore((state) => state.isQueueOpen);
  const queueIds = usePlayerStore((state) => state.queueIds);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  const currentTrackId = usePlayerStore((state) => state.currentTrackId);
  const contextLabel = usePlayerStore((state) => state.contextLabel);
  const toggleQueue = usePlayerStore((state) => state.toggleQueue);
  const jumpTo = usePlayerStore((state) => state.jumpTo);
  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const moveInQueue = usePlayerStore((state) => state.moveInQueue);
  const clearQueue = usePlayerStore((state) => state.clearQueue);

  const currentTrack = currentTrackId ? catalog.getTrack(currentTrackId) : undefined;
  const artist = currentTrack ? catalog.getArtist(currentTrack.artistId) : undefined;
  const palette = useArtworkPalette(
    currentTrack?.artwork.src,
    currentTrack?.artwork.palette ?? { a: "#7fa8a6", b: "#d7e2d8", c: "#20363c" },
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") toggleQueue(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, toggleQueue]);

  if (!open) return null;

  const upcomingIndexes = queueIds
    .map((_, index) => index)
    .filter((index) => index > currentIndex);
  const upcoming = upcomingIndexes
    .map((index) => ({ index, track: catalog.getTrack(queueIds[index]) }))
    .filter((entry) => Boolean(entry.track));

  return (
    <>
      <div
        className="fixed inset-0 z-[84] bg-black/45 backdrop-blur-[2px] animate-fade-in"
        onMouseDown={() => toggleQueue(false)}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Playback queue"
        className="sheet-in fixed inset-y-0 right-0 z-[85] flex w-full flex-col border-l border-white/[0.07] bg-[rgba(5,8,8,0.96)] backdrop-blur-2xl sm:w-[400px]"
        suppressHydrationWarning
        style={paletteStyle(palette)}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">Queue</h2>
            <p className="mt-1 text-[11.5px] text-[var(--text-mute)]">
              {contextLabel} · {upcoming.length} upcoming
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                clearQueue();
                toast("Queue cleared — current track kept", "success");
              }}
              className="icon-btn h-8 w-8"
              aria-label="Clear upcoming queue"
              disabled={upcoming.length === 0}
            >
              <Trash2 size={15} />
            </button>
            <button
              type="button"
              onClick={() => toggleQueue(false)}
              className="icon-btn h-8 w-8"
              aria-label="Close queue"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {currentTrack && (
            <section>
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-mute)]">
                Now playing
              </p>
              <div className="liquid-inset relative overflow-hidden rounded-2xl p-3">
                <div
                  className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-30 blur-3xl"
                  style={{ background: palette.a }}
                  aria-hidden
                />
                <div className="relative flex items-center gap-3">
                  <span className="artwork-shell h-12 w-12 shrink-0 rounded-lg">
                    <ArtworkImage
                      artwork={currentTrack.artwork}
                      alt=""
                      loading="eager"
                      sizes="48px"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-white">
                      {currentTrack.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--text-mute)]">
                      {artist?.name ?? "Unknown artist"}
                    </p>
                  </div>
                  <span className="flex h-5 items-end gap-[2px]" aria-hidden>
                    <span className="eq-bar h-2" />
                    <span className="eq-bar h-4" />
                    <span className="eq-bar h-3" />
                  </span>
                </div>
              </div>
            </section>
          )}

          <section className="mt-5">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-mute)]">
              Next up
            </p>

            {upcoming.length === 0 ? (
              <div className="liquid-inset flex flex-col items-center rounded-2xl px-5 py-10 text-center">
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[var(--acid)]">
                  <ListMusic size={17} />
                </div>
                <p className="text-[13px] font-medium text-white">Queue is empty</p>
                <Link
                  href="/discover"
                  onClick={() => toggleQueue(false)}
                  className="btn mt-4 h-8 px-3 text-[11px]"
                >
                  Discover
                </Link>
              </div>
            ) : (
              <div className="space-y-0.5">
                {upcoming.map(({ index, track }, position) => {
                  if (!track) return null;
                  const rowArtist = catalog.getArtist(track.artistId);
                  return (
                    <div
                      key={`${track.id}-${index}`}
                      className="group/q flex items-center gap-2 rounded-xl p-2 transition-colors hover:bg-white/[0.05]"
                    >
                      <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-white/30">
                        {position + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => jumpTo(index)}
                        className="artwork-shell h-9 w-9 shrink-0 rounded-md"
                        aria-label={`Play ${track.title} now`}
                      >
                        <ArtworkImage
                          artwork={track.artwork}
                          alt=""
                          sizes="36px"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => jumpTo(index)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-[12px] font-medium text-white">
                          {track.title}
                        </span>
                        <span className="block truncate text-[10.5px] text-[var(--text-mute)]">
                          {rowArtist?.name ?? "Unknown artist"}
                        </span>
                      </button>
                      <span className="hidden text-[10px] tabular-nums text-white/30 sm:block">
                        {formatTime(track.duration)}
                      </span>
                      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/q:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => moveInQueue(index, index - 1)}
                          disabled={position === 0}
                          className="icon-btn h-6 w-6 disabled:opacity-20"
                          aria-label={`Move ${track.title} up`}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveInQueue(index, index + 1)}
                          disabled={position === upcoming.length - 1}
                          className="icon-btn h-6 w-6 disabled:opacity-20"
                          aria-label={`Move ${track.title} down`}
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromQueue(index)}
                          className="icon-btn h-6 w-6 hover:!text-[var(--danger)]"
                          aria-label={`Remove ${track.title} from queue`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

      </aside>
    </>
  );
}
