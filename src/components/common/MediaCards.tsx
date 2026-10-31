"use client";

import type { Album, Artist, Playlist, Track } from "@/lib/catalog/types";
import type { UserPlaylist } from "@/lib/library/types";
import { catalog } from "@/lib/catalog";
import { artistName, artistTrackIds, artworkForUserPlaylist } from "@/lib/catalog/derive";
import { formatCount } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { LiquidArtworkCard } from "@/components/ui/LiquidArtworkCard";

const cardWidth = "w-[164px] shrink-0 snap-start sm:w-[184px]";

function useCollectionPlayback(trackIds: string[], label: string) {
  const currentTrackId = usePlayerStore((state) => state.currentTrackId);
  const status = usePlayerStore((state) => state.status);
  const playCollection = usePlayerStore((state) => state.playCollection);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const isCurrent = Boolean(currentTrackId && trackIds.includes(currentTrackId));
  const isPlaying = isCurrent && status === "playing";
  const onPlay = () => {
    if (isPlaying) {
      togglePlay();
      return;
    }
    playCollection(trackIds, 0, label);
  };
  return { isPlaying, onPlay };
}

export function AlbumCard({
  album,
  className,
  priority = false,
}: {
  album: Album;
  className?: string;
  priority?: boolean;
}) {
  const { isPlaying, onPlay } = useCollectionPlayback(album.trackIds, album.title);
  return (
    <LiquidArtworkCard
      className={className ?? cardWidth}
      artwork={album.artwork}
      title={album.title}
      subtitle={`${artistName(album.artistId)} · ${album.year}`}
      href={`/album/${album.id}`}
      onPlay={onPlay}
      isPlaying={isPlaying}
      priority={priority}
    />
  );
}

export function PlaylistCard({
  playlist,
  className,
}: {
  playlist: Playlist | UserPlaylist;
  className?: string;
}) {
  const artwork =
    "artwork" in playlist ? playlist.artwork : artworkForUserPlaylist(playlist);
  const { isPlaying, onPlay } = useCollectionPlayback(playlist.trackIds, playlist.title);
  return (
    <LiquidArtworkCard
      className={className ?? cardWidth}
      artwork={artwork}
      title={playlist.title}
      subtitle={`${playlist.trackIds.length} songs`}
      href={`/playlist/${playlist.id}`}
      onPlay={onPlay}
      isPlaying={isPlaying}
    />
  );
}

export function ArtistCard({
  artist,
  className,
}: {
  artist: Artist;
  className?: string;
}) {
  const trackIds = artistTrackIds(artist.id);
  const { isPlaying, onPlay } = useCollectionPlayback(trackIds, artist.name);
  return (
    <LiquidArtworkCard
      className={className ?? cardWidth}
      artwork={artist.artwork}
      title={artist.name}
      subtitle={`${formatCount(artist.monthlyListeners)} listeners`}
      href={`/artist/${artist.id}`}
      onPlay={onPlay}
      isPlaying={isPlaying}
      round
    />
  );
}

export function TrackCard({
  track,
  queueIds,
  contextLabel,
  className,
}: {
  track: Track;
  queueIds?: string[];
  contextLabel?: string;
  className?: string;
}) {
  const playTrack = usePlayerStore((state) => state.playTrack);
  const currentTrackId = usePlayerStore((state) => state.currentTrackId);
  const status = usePlayerStore((state) => state.status);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const artist = catalog.getArtist(track.artistId);
  const isCurrent = currentTrackId === track.id;
  const isPlaying = isCurrent && status === "playing";

  return (
    <LiquidArtworkCard
      className={className ?? cardWidth}
      artwork={track.artwork}
      title={track.title}
      subtitle={artist?.name ?? "Unknown artist"}
      href={`/album/${track.albumId}`}
      isPlaying={isPlaying}
      onPlay={() =>
        isCurrent ? togglePlay() : playTrack(track.id, queueIds, contextLabel)
      }
    />
  );
}
