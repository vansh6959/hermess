"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Play, Shuffle, UserRound, UserRoundCheck } from "lucide-react";
import { catalog } from "@/lib/catalog";
import { artistTrackIds } from "@/lib/catalog/derive";
import { formatCount } from "@/lib/utils";
import { useArtworkPalette, paletteStyle } from "@/lib/palette";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { toast } from "@/store/toast";
import { usePageTitle } from "@/hooks/useEnvironment";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { artworkBackground } from "@/lib/artwork-variants";
import { LiquidTrackRow } from "@/components/ui/LiquidTrackRow";
import { EmptyState } from "@/components/ui/States";
import { SectionRow } from "@/components/common/SectionRow";
import { AlbumCard, ArtistCard } from "@/components/common/MediaCards";

export default function ArtistPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const artist = id ? catalog.getArtist(id) : undefined;

  usePageTitle(artist?.name ?? "Artist not found");

  const followedArtistIds = useLibraryStore((state) => state.followedArtistIds);
  const toggleFollowArtist = useLibraryStore((state) => state.toggleFollowArtist);
  const playCollection = usePlayerStore((state) => state.playCollection);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const currentTrackId = usePlayerStore((state) => state.currentTrackId);
  const status = usePlayerStore((state) => state.status);
  const togglePlay = usePlayerStore((state) => state.togglePlay);

  const palette = useArtworkPalette(
    artist?.artwork.src,
    artist?.artwork.palette ?? { a: "#94b8b2", b: "#d7e2d8", c: "#20363c" },
  );

  if (!artist) {
    return (
      <EmptyState
        icon={<UserRound size={20} />}
        title="Artist not found"
        action={
          <Link href="/artists" className="btn btn-accent">
            Browse artists
          </Link>
        }
      />
    );
  }

  const albums = catalog
    .getAlbums()
    .filter((album) => album.artistId === artist.id);
  const allTrackIds = artistTrackIds(artist.id);
  const allTracks = catalog.getTracks(allTrackIds);
  const topTracks = allTracks.slice(0, 5);
  const followed = followedArtistIds.includes(artist.id);
  const isPlayingArtist =
    Boolean(currentTrackId) &&
    allTrackIds.includes(currentTrackId ?? "") &&
    status === "playing";

  const play = () => {
    if (isPlayingArtist) {
      togglePlay();
      return;
    }
    playCollection(allTrackIds, 0, artist.name);
  };

  const shufflePlay = () => {
    if (!shuffle) toggleShuffle();
    playCollection(allTrackIds, 0, artist.name);
  };

  return (
    <div className="space-y-9">
      <section
        className="liquid rim grain relative overflow-hidden rounded-[30px]"
        suppressHydrationWarning
        style={paletteStyle(palette)}
      >
        <div
          className="absolute inset-0 scale-125 bg-cover bg-center opacity-30 blur-3xl"
          style={{ backgroundImage: artworkBackground(artist.artwork.src, 640) }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06070a] via-[#06070a]/55 to-transparent" />
        <div className="relative flex flex-col items-start gap-6 p-6 sm:flex-row sm:items-end sm:p-8">
          <div className="relative shrink-0">
            <div
              className="absolute -inset-6 rounded-full opacity-40 blur-3xl"
              style={{ background: palette.a }}
              aria-hidden
            />
            <div className="artwork-shell aspect-square w-36 rounded-full shadow-[0_40px_90px_-34px_rgba(0,0,0,0.95)] sm:w-48">
              <ArtworkImage
                artwork={artist.artwork}
                alt={artist.artwork.alt}
                loading="eager"
                sizes="(min-width: 640px) 192px, 144px"
                className="artwork-img"
              />
            </div>
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-[2.2rem] font-semibold leading-[0.98] tracking-[-0.05em] text-white sm:text-[3.3rem]">
              {artist.name}
            </h1>
            <p className="mt-2 text-[12px] text-white/55">
              {formatCount(artist.monthlyListeners)} monthly listeners
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {artist.genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[10px] text-white/65"
                >
                  {genre}
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={play}
                className="btn btn-accent h-10 px-5 text-[12px]"
              >
                <Play size={14} fill="currentColor" />
                {isPlayingArtist ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                onClick={shufflePlay}
                className="btn h-10 px-4 text-[12px]"
              >
                <Shuffle size={14} />
                Shuffle
              </button>
              <button
                type="button"
                onClick={() => {
                  const added = toggleFollowArtist(artist.id);
                  toast(
                    added ? `Following ${artist.name}` : `Unfollowed ${artist.name}`,
                    "success",
                  );
                }}
                className="btn h-10 px-4 text-[12px]"
              >
                {followed ? (
                  <UserRoundCheck size={14} className="text-[var(--acid)]" />
                ) : (
                  <UserRound size={14} />
                )}
                {followed ? "Following" : "Follow"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[16px] font-semibold text-white">Popular</h2>
        <div className="liquid rim rounded-2xl p-2">
          {topTracks.map((track, index) => (
            <LiquidTrackRow
              key={track.id}
              track={track}
              index={index}
              queueIds={allTrackIds}
              contextLabel={artist.name}
              showAlbum={false}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[10px] font-medium uppercase tracking-[0.26em] text-[var(--text-mute)]">
          Releases
        </h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} className="w-full" />
          ))}
        </div>
      </section>

      {artist.relatedArtistIds.length > 0 && (
        <SectionRow
          title="Related artists"
          href="/artists"
        >
          {artist.relatedArtistIds
            .map((relatedId) => catalog.getArtist(relatedId))
            .filter((related): related is NonNullable<typeof related> => Boolean(related))
            .map((related) => (
              <ArtistCard key={related.id} artist={related} />
            ))}
        </SectionRow>
      )}
    </div>
  );
}
