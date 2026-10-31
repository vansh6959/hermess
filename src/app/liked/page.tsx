"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Heart, Play, Shuffle } from "lucide-react";
import { catalog } from "@/lib/catalog";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { usePageTitle } from "@/hooks/useEnvironment";
import { useArtworkPalette, paletteStyle } from "@/lib/palette";
import { formatDurationLabel } from "@/lib/utils";
import { LiquidTrackRow } from "@/components/ui/LiquidTrackRow";
import { EmptyState } from "@/components/ui/States";

type SortKey = "recent" | "title" | "artist";

export default function LikedPage() {
  usePageTitle("Liked Songs");
  const likedTrackIds = useLibraryStore((state) => state.likedTrackIds);
  const playCollection = usePlayerStore((state) => state.playCollection);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const [sort, setSort] = useState<SortKey>("recent");

  const likedTracks = catalog.getTracks(likedTrackIds);
  const sorted = useMemo(() => {
    const tracks = [...likedTracks];
    if (sort === "title") return tracks.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "artist") {
      return tracks.sort((a, b) => {
        const aName = catalog.getArtist(a.artistId)?.name ?? "";
        const bName = catalog.getArtist(b.artistId)?.name ?? "";
        return aName.localeCompare(bName);
      });
    }
    return tracks;
  }, [likedTracks, sort]);

  const totalDuration = likedTracks.reduce((sum, track) => sum + track.duration, 0);
  const queueIds = sorted.map((track) => track.id);
  const fallbackArt = catalog.getAlbum("album-glass-hours")?.artwork;
  const heroArt = likedTracks[0]?.artwork ?? fallbackArt;
  const palette = useArtworkPalette(heroArt?.src, heroArt?.palette ?? { a: "#94b8b2", b: "#d7e2d8", c: "#20363c" });

  const play = () => {
    if (queueIds.length) playCollection(queueIds, 0, "Liked Songs");
  };
  const shufflePlay = () => {
    if (!queueIds.length) return;
    if (!shuffle) toggleShuffle();
    playCollection(queueIds, 0, "Liked Songs");
  };

  return (
    <div className="space-y-8">
      <section
        className="liquid rim grain relative overflow-hidden rounded-[30px]"
        suppressHydrationWarning
        style={paletteStyle(palette)}
      >
        {heroArt?.src && (
          <div
            className="absolute inset-0 scale-125 bg-cover bg-center opacity-30 blur-3xl"
            style={{ backgroundImage: `url("${heroArt.src}")` }}
            aria-hidden
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06070a] via-[#06070a]/45 to-transparent" />
        <div className="relative flex flex-col items-start gap-6 p-6 sm:flex-row sm:items-end sm:p-8">
          <div className="relative grid aspect-square w-36 shrink-0 place-items-center overflow-hidden rounded-[22px] bg-[linear-gradient(150deg,#f2ffc4,#c8ef4f_38%,#5f8b3c_72%,#1c3a2e)] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)] sm:w-48">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_18%,rgba(255,255,255,0.75),transparent_55%)]" />
            <Heart size={54} fill="#10140a" className="relative text-[#10140a] sm:h-16 sm:w-16" />
            <span className="absolute inset-x-3 bottom-2 text-[8px] font-semibold uppercase tracking-[0.28em] text-[#10140a]/60">
              Hermes
            </span>
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="mt-2 text-[2.3rem] font-semibold leading-none tracking-[-0.05em] text-white sm:text-[3.4rem]">
              Liked Songs
            </h1>
            <p className="mt-3 text-[12px] text-white/55">
              {likedTracks.length} {likedTracks.length === 1 ? "song" : "songs"} ·{" "}
              {formatDurationLabel(totalDuration)}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={play}
                className="btn btn-accent h-10 px-5 text-[12px]"
                disabled={likedTracks.length === 0}
              >
                <Play size={14} fill="currentColor" />
                Play
              </button>
              <button
                type="button"
                onClick={shufflePlay}
                className="btn h-10 px-4 text-[12px]"
                disabled={likedTracks.length === 0}
              >
                <Shuffle size={14} />
                Shuffle
              </button>
            </div>
          </div>
        </div>
      </section>

      {likedTracks.length === 0 ? (
        <EmptyState
          icon={<Heart size={20} />}
          title="No liked songs yet"
          action={
            <Link href="/discover" className="btn btn-accent">
              Discover
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["recent", "Recently added"],
                ["title", "Title"],
                ["artist", "Artist"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="chip h-7 text-[11px]"
                data-active={sort === key}
                onClick={() => setSort(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="liquid rim rounded-2xl p-2">
            {sorted.map((track, index) => (
              <LiquidTrackRow
                key={track.id}
                track={track}
                index={index}
                queueIds={queueIds}
                contextLabel="Liked Songs"
              />
            ))}
          </div>
        </>
      )}

    </div>
  );
}
