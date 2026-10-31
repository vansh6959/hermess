"use client";

import { ListMusic, Play } from "lucide-react";
import type { ReactNode } from "react";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";
import { splitUpcoming } from "@/lib/spotify/queue-order";
import { cn, formatTime } from "@/lib/utils";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";

function QueueRow({
  track,
  onPlay,
  current = false,
}: {
  track: SpotifyNowPlaying;
  onPlay?: () => void;
  current?: boolean;
}) {
  const content = (
    <>
      <span className="artwork-shell h-10 w-10 shrink-0 rounded-lg">
        <ArtworkImage
          artwork={toSpotifyArtwork(track.imageUrl, track.albumName || track.name)}
          alt=""
          loading="lazy"
          sizes="40px"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[12.5px] font-medium",
            current ? "text-[var(--acid)]" : "text-white/80 group-hover:text-white",
          )}
        >
          {track.name}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] text-[var(--text-mute)]">
          {track.artists}
        </span>
      </span>
      <span className="hidden text-[10px] tabular-nums text-white/25 sm:block">
        {track.durationMs > 0
          ? formatTime(Math.round(track.durationMs / 1000))
          : null}
      </span>
      {onPlay ? (
        <Play
          size={12}
          fill="currentColor"
          className="shrink-0 text-white/20 opacity-0 transition group-hover:text-[var(--acid)] group-hover:opacity-100"
          aria-hidden
        />
      ) : null}
    </>
  );

  if (!onPlay) {
    return (
      <div className="flex w-full min-w-0 items-center gap-3 rounded-[15px] px-3 py-2.5 text-left">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play ${track.name}`}
      className="group flex w-full min-w-0 items-center gap-3 rounded-[15px] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.045] focus-visible:bg-white/[0.045] focus-visible:outline-none"
    >
      {content}
    </button>
  );
}

function SectionLabel({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3 pb-1.5 pt-4">
      <h3 className="text-[9px] font-medium uppercase tracking-[0.2em] text-white/30">
        {children}
      </h3>
      {action}
    </div>
  );
}

export function SpotifyQueuePanel({
  queue,
  queueIndex,
  manualQueue,
  contextName,
  onPlay,
  className,
}: {
  queue: SpotifyNowPlaying[];
  queueIndex: number;
  manualQueue: SpotifyNowPlaying[];
  contextName: string | null;
  onPlay: (index: number) => void;
  className?: string;
}) {
  const current = queue[queueIndex] ?? null;
  const { upcoming, manual, context } = splitUpcoming(
    queue,
    queueIndex,
    manualQueue.length,
  );
  const manualStart = queueIndex + 1;
  const contextStart = manualStart + manual.length;

  return (
    <section
      className={cn("flex min-h-0 flex-col", className)}
      aria-label="Queue"
    >
      {upcoming.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.025] text-[var(--mint)]">
            <ListMusic size={20} />
          </div>
          <p className="text-[13px] text-white/55">Queue is empty</p>
        </div>
      ) : (
        <div className="mask-fade-y min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
          {current ? (
            <>
              <SectionLabel>Now playing</SectionLabel>
              <QueueRow track={current} current />
            </>
          ) : null}

          {manual.length > 0 ? (
            <>
              <SectionLabel>Next in queue</SectionLabel>
              <ul className="space-y-1">
                {manual.map((item, index) => (
                  <li key={`${item.id}-manual-${index}`}>
                    <QueueRow
                      track={item}
                      onPlay={() => onPlay(manualStart + index)}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {context.length > 0 ? (
            <>
              <SectionLabel>
                Next from: {contextName ?? "this playlist"}
              </SectionLabel>
              <ul className="space-y-1">
                {context.map((item, index) => (
                  <li key={`${item.id}-context-${index}`}>
                    <QueueRow
                      track={item}
                      onPlay={() => onPlay(contextStart + index)}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
