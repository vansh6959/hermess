"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BookmarkCheck,
  BookmarkPlus,
  Disc3,
  ListPlus,
  Play,
  Shuffle,
} from "lucide-react";
import { catalog } from "@/lib/catalog";
import { albumDuration, artistName } from "@/lib/catalog/derive";
import { formatDurationLabel } from "@/lib/utils";
import { useArtworkPalette, paletteStyle } from "@/lib/palette";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { toast } from "@/store/toast";
import { usePageTitle } from "@/hooks/useEnvironment";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { artworkBackground } from "@/lib/artwork-variants";
import { LiquidTrackRow } from "@/components/ui/LiquidTrackRow";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";
import { EmptyState } from "@/components/ui/States";
import { SectionRow } from "@/components/common/SectionRow";
import { AlbumCard } from "@/components/common/MediaCards";

export default function AlbumPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const album = id ? catalog.getAlbum(id) : undefined;

  usePageTitle(album?.title ?? "Album not found");

  const savedAlbumIds = useLibraryStore((state) => state.savedAlbumIds);
  const toggleSavedAlbum = useLibraryStore((state) => state.toggleSavedAlbum);
  const playCollection = usePlayerStore((state) => state.playCollection);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const currentTrackId = usePlayerStore((state) => state.currentTrackId);
  const status = usePlayerStore((state) => state.status);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const addToQueue = usePlayerStore((state) => state.addToQueue);

  const palette = useArtworkPalette(
    album?.artwork.src,
    album?.artwork.palette ?? { a: "#94b8b2", b: "#d7e2d8", c: "#20363c" },
  );

  if (!album) {
    return (
      <EmptyState
        icon={<Disc3 size={20} />}
        title="Album not found"
        action={
          <Link href="/discover" className="btn btn-accent">
            Browse albums
          </Link>
        }
      />
    );
  }

  const artist = catalog.getArtist(album.artistId);
  const tracks = catalog.getTracks(album.trackIds);
  const saved = savedAlbumIds.includes(album.id);
  const isPlayingAlbum =
    Boolean(currentTrackId) &&
    album.trackIds.includes(currentTrackId ?? "") &&
    status === "playing";
  const queueIds = tracks.map((track) => track.id);
  const moreByArtist = catalog
    .getAlbums()
    .filter((item) => item.artistId === album.artistId && item.id !== album.id);
  const recommendations = catalog
    .getRecommendations(tracks[0]?.id)
    .filter((item) => item.id !== album.id)
    .slice(0, 5);

  const play = () => {
    if (isPlayingAlbum) {
      togglePlay();
      return;
    }
    playCollection(queueIds, 0, album.title);
  };

  const shufflePlay = () => {
    if (!shuffle) toggleShuffle();
    playCollection(queueIds, 0, album.title);
  };

  const queueAll = () => {
    queueIds.forEach((trackId) => addToQueue(trackId));
    toast(`Added ${queueIds.length} tracks to the queue`, "success");
  };

  return (
    <div className="space-y-9">
      <section
        className="liquid rim grain relative overflow-hidden rounded-[30px]"
        suppressHydrationWarning
        style={paletteStyle(palette)}
      >
        <div
          className="absolute inset-0 scale-125 bg-cover bg-center opacity-35 blur-3xl"
          style={{ backgroundImage: artworkBackground(album.artwork.src, 640) }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06070a] via-[#06070a]/55 to-transparent" />
        <div className="relative flex flex-col items-start gap-6 p-6 sm:flex-row sm:items-end sm:p-8">
          <div className="artwork-shell aspect-square w-40 shrink-0 rounded-[22px] shadow-[0_40px_90px_-34px_rgba(0,0,0,0.95)] sm:w-56">
            <ArtworkImage
              artwork={album.artwork}
              alt={album.artwork.alt}
              loading="eager"
              sizes="(min-width: 640px) 224px, 160px"
              className="artwork-img"
            />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-white/55">
              {album.type === "ep" ? "EP" : "Album"} · {album.genre}
            </p>
            <h1 className="mt-2 text-[2.2rem] font-semibold leading-[0.98] tracking-[-0.05em] text-white sm:text-[3.3rem]">
              {album.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-white/60">
              <Link
                href={`/artist/${artist?.id ?? album.artistId}`}
                className="font-medium text-white/85 transition hover:text-white hover:underline underline-offset-4"
              >
                {artist?.name ?? artistName(album.artistId)}
              </Link>
              <span className="h-1 w-1 rounded-full bg-white/25" />
              <span>{album.year}</span>
              <span className="h-1 w-1 rounded-full bg-white/25" />
              <span>{tracks.length} tracks</span>
              <span className="h-1 w-1 rounded-full bg-white/25" />
              <span>{formatDurationLabel(albumDuration(album))}</span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={play}
                className="btn btn-accent h-10 px-5 text-[12px]"
              >
                <Play size={14} fill="currentColor" />
                {isPlayingAlbum ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                onClick={shufflePlay}
                className="btn h-10 px-4 text-[12px]"
              >
                <Shuffle size={14} />
                Shuffle
              </button>
              <LiquidTooltip label={saved ? "Remove from library" : "Save album"}>
                <button
                  type="button"
                  onClick={() => {
                    const next = toggleSavedAlbum(album.id);
                    toast(next ? "Album saved" : "Album removed", "success");
                  }}
                  className="icon-btn h-10 w-10 border border-white/10 bg-white/[0.05]"
                  aria-label={saved ? "Remove album from library" : "Save album"}
                  aria-pressed={saved}
                >
                  {saved ? (
                    <BookmarkCheck size={15} className="text-[var(--acid)]" />
                  ) : (
                    <BookmarkPlus size={15} />
                  )}
                </button>
              </LiquidTooltip>
              <LiquidTooltip label="Add album to queue">
                <button
                  type="button"
                  onClick={queueAll}
                  className="icon-btn h-10 w-10 border border-white/10 bg-white/[0.05]"
                  aria-label="Add album to queue"
                >
                  <ListPlus size={15} />
                </button>
              </LiquidTooltip>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="liquid rim rounded-2xl p-2">
          {tracks.map((track, index) => (
            <LiquidTrackRow
              key={track.id}
              track={track}
              index={index}
              queueIds={queueIds}
              contextLabel={album.title}
              showAlbum={false}
            />
          ))}
        </div>
      </section>

      {moreByArtist.length > 0 && (
        <SectionRow
          title={`More by ${artist?.name ?? artistName(album.artistId)}`}
          href={`/artist/${album.artistId}`}
        >
          {moreByArtist.map((item) => (
            <AlbumCard key={item.id} album={item} />
          ))}
        </SectionRow>
      )}

      <SectionRow
        title="You might also like"
        href="/discover"
      >
        {recommendations.map((item) => (
          <AlbumCard key={item.id} album={item} />
        ))}
      </SectionRow>
    </div>
  );
}
