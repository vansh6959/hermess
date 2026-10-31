"use client";

import { useMemo, type ReactNode } from "react";
import { useListeningStats } from "@/hooks/useListeningStats";
import { useArtistImages } from "@/hooks/useArtistImages";
import {
  computeListeningLeaders,
  formatListeningSince,
  formatListeningTime,
  listeningTotals,
  type ListeningAlbumLeader,
  type ListeningArtistLeader,
  type ListeningTrackStat,
} from "@/lib/spotify/stats";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";
import { cn, formatCount, initials } from "@/lib/utils";

function formatPlays(plays: number): string {
  return `${formatCount(plays)} ${plays === 1 ? "play" : "plays"}`;
}

function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className="liquid-inset min-w-0 rounded-[18px] px-4 py-3.5 transition-transform duration-300 ease-spring hover:-translate-y-0.5">
      <p className="text-[9px] font-medium uppercase tracking-[0.24em] text-[var(--text-mute)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-[clamp(1.2rem,2.1vw,1.55rem)] font-medium leading-none tracking-[-0.035em]",
          accent ? "text-[var(--acid)]" : "text-white/95",
        )}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] text-[var(--text-mute)]">
        {detail}
      </p>
    </div>
  );
}

function LeaderRow({
  rank,
  title,
  subtitle,
  listenedMs,
  plays,
  artwork,
}: {
  rank: number;
  title: string;
  subtitle: string;
  listenedMs: number;
  plays: number;
  artwork: ReactNode;
}) {
  return (
    <li className="group rounded-[13px] px-1 py-2 transition-[transform,background-color] duration-300 ease-spring hover:-translate-y-[3px] hover:bg-white/[0.035]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "w-3.5 shrink-0 text-right text-[9.5px] tabular-nums",
            rank === 1 ? "text-[var(--acid)]" : "text-white/25",
          )}
        >
          {String(rank).padStart(2, "0")}
        </span>
        {artwork}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-white/85 group-hover:text-white">
            {title}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-[var(--text-mute)]">
            {subtitle}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] tabular-nums text-white/50">
            {formatListeningTime(listenedMs)}
          </p>
          <p className="mt-0.5 text-[9px] text-white/25">
            {formatPlays(plays)}
          </p>
        </div>
      </div>
    </li>
  );
}

function LeaderSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="min-w-0 px-4 py-4 sm:px-5">
      <div className="mb-2.5 flex items-center gap-3">
        <h2 className="shrink-0 text-[9.5px] font-medium uppercase tracking-[0.26em] text-[var(--text-mute)]">
          {title}
        </h2>
        <span
          className="h-px flex-1 bg-gradient-to-r from-white/[0.07] to-transparent"
          aria-hidden
        />
      </div>
      {children}
    </section>
  );
}

function ArtistAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  return (
    <span className="artwork-shell h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/[0.09] bg-[linear-gradient(155deg,rgba(191,227,205,0.2),rgba(42,58,51,0.42))]">
      {imageUrl ? (
        <ArtworkImage
          artwork={toSpotifyArtwork(imageUrl, name)}
          alt=""
          loading="lazy"
          sizes="36px"
          className="artwork-img"
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-[10px] font-semibold tracking-wide text-white/75">
          {initials(name)}
        </span>
      )}
    </span>
  );
}

function CoverThumb({
  imageUrl,
  title,
}: {
  imageUrl: string | null;
  title: string;
}) {
  return (
    <span className="artwork-shell h-9 w-9 shrink-0 rounded-lg">
      <ArtworkImage
        artwork={toSpotifyArtwork(imageUrl, title)}
        alt=""
        loading="lazy"
        sizes="36px"
        className="artwork-img"
      />
    </span>
  );
}

function ArtistList({
  artists,
  images,
}: {
  artists: ListeningArtistLeader[];
  images: Record<string, string | null>;
}) {
  if (artists.length === 0) {
    return <p className="px-1 py-3 text-[10.5px] text-[var(--text-mute)]">No artist data yet.</p>;
  }
  return (
    <ol className="space-y-0.5">
      {artists.map((artist, index) => (
        <LeaderRow
          key={artist.key}
          rank={index + 1}
          title={artist.name}
          subtitle="Artist"
          listenedMs={artist.listenedMs}
          plays={artist.plays}
          artwork={
            <ArtistAvatar
              name={artist.name}
              imageUrl={images[artist.name] ?? null}
            />
          }
        />
      ))}
    </ol>
  );
}

function AlbumList({ albums }: { albums: ListeningAlbumLeader[] }) {
  if (albums.length === 0) {
    return <p className="px-1 py-3 text-[10.5px] text-[var(--text-mute)]">No album data yet.</p>;
  }
  return (
    <ol className="space-y-0.5">
      {albums.map((album, index) => (
        <LeaderRow
          key={album.key}
          rank={index + 1}
          title={album.name}
          subtitle={album.artists}
          listenedMs={album.listenedMs}
          plays={album.plays}
          artwork={<CoverThumb imageUrl={album.imageUrl} title={album.name} />}
        />
      ))}
    </ol>
  );
}

function TrackList({ tracks }: { tracks: ListeningTrackStat[] }) {
  if (tracks.length === 0) {
    return <p className="px-1 py-3 text-[10.5px] text-[var(--text-mute)]">No track data yet.</p>;
  }
  return (
    <ol className="space-y-0.5">
      {tracks.map((track, index) => (
        <LeaderRow
          key={track.id}
          rank={index + 1}
          title={track.name}
          subtitle={track.artists || "Unknown artist"}
          listenedMs={track.listenedMs}
          plays={track.plays}
          artwork={<CoverThumb imageUrl={track.imageUrl} title={track.name} />}
        />
      ))}
    </ol>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="grid gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="skeleton h-[76px] rounded-[18px]" />
        ))}
      </div>
      <div className="liquid rim rounded-[26px] p-4">
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, column) => (
            <div key={column} className="space-y-3">
              <div className="skeleton h-3 w-28 rounded-full" />
              {Array.from({ length: 4 }).map((_, row) => (
                <div key={row} className="skeleton h-11 rounded-[13px]" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyStats() {
  return (
    <div className="liquid rim grain rounded-[26px] px-6 py-14 text-center">
      <h2 className="text-[clamp(1.5rem,2.6vw,2rem)] font-medium leading-[1.04] tracking-[-0.04em] text-white/95">
        No listening stats yet
      </h2>
      <p className="mx-auto mt-3 max-w-[42ch] text-[12px] leading-relaxed text-[var(--text-mute)]">
        Play music in Hermes and your top artists, albums, and tracks will
        appear here.
      </p>
    </div>
  );
}

export function ListeningStatsPanel() {
  const { stats, ready } = useListeningStats();
  const leaders = useMemo(() => computeListeningLeaders(stats), [stats]);
  const totals = useMemo(() => listeningTotals(stats), [stats]);
  const since = formatListeningSince(stats.startedAt);
  const artistNames = useMemo(
    () => leaders.artists.map((artist) => artist.name),
    [leaders.artists],
  );
  const artistImages = useArtistImages(artistNames);

  if (!ready) return <StatsSkeleton />;
  if (Object.keys(stats.tracks).length === 0) return <EmptyStats />;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric
          label="Time listened"
          value={formatListeningTime(stats.totalListenedMs)}
          detail={since ? `Since ${since}` : "Across your listening"}
          accent
        />
        <Metric
          label="Tracks played"
          value={formatCount(totals.plays)}
          detail={`${formatCount(totals.tracks)} unique ${
            totals.tracks === 1 ? "track" : "tracks"
          }`}
        />
        <Metric
          label="Artists heard"
          value={formatCount(totals.artists)}
          detail="Across your listening"
        />
      </div>

      <div className="liquid rim grain overflow-hidden rounded-[26px]">
        <div className="grid divide-y divide-white/[0.06] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <LeaderSection title="Top artists">
            <ArtistList artists={leaders.artists} images={artistImages} />
          </LeaderSection>
          <LeaderSection title="Top albums">
            <AlbumList albums={leaders.albums} />
          </LeaderSection>
          <LeaderSection title="Top tracks">
            <TrackList tracks={leaders.tracks} />
          </LeaderSection>
        </div>
      </div>
    </div>
  );
}
