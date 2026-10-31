"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowDownAZ,
  Clock3,
  ListMusic,
  Loader2,
  Play,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { usePageTitle } from "@/hooks/useEnvironment";
import { useArtistImages } from "@/hooks/useArtistImages";
import { useHermesLibraryStore } from "@/store/hermes-library";
import { useUiStore } from "@/store/ui";
import {
  useSpotifyPlaybackActions,
  useSpotifySession,
} from "@/components/providers/SpotifyPlaybackProvider";
import { SpotifyConnectEmptyState } from "@/components/spotify/SpotifyConnectEmptyState";
import { LibraryArtwork } from "./LibraryArtwork";
import { LibraryCollectionDialog } from "./LibraryCollectionDialog";
import { LibraryPlaybackPanel } from "./LibraryPlaybackPanel";
import { ArtistDetailDialog } from "@/components/artist/ArtistDetailDialog";
import { syncSpotifyLibrary } from "@/lib/import/sync";
import {
  buildLibraryCollections,
  collectionCounts,
  collectionsForFilter,
  filterCollectionsByQuery,
  sortCollections,
  type LibraryCollection,
  type LibraryFilter,
  type LibrarySort,
} from "@/lib/library/collections";
import type { ImportedTrack } from "@/lib/import/types";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ value: LibraryFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "playlists", label: "Playlists" },
  { value: "albums", label: "Albums" },
  { value: "artists", label: "Artists" },
];

function isPlayable(track: ImportedTrack): boolean {
  return track.source === "spotify" && Boolean(track.id);
}

function collectionMeta(collection: LibraryCollection): string {
  const count = `${collection.trackCount} ${
    collection.trackCount === 1 ? "song" : "songs"
  }`;
  if (collection.kind === "album") return `${collection.subtitle} · ${count}`;
  if (collection.kind === "artist") return count;
  if (collection.kind === "liked") return `Saved tracks · ${count}`;
  return `Playlist · ${count}`;
}

function CollectionRow({
  collection,
  active,
  onOpen,
  onPlay,
}: {
  collection: LibraryCollection;
  active: boolean;
  onOpen: () => void;
  onPlay: () => void;
}) {
  const playable = collection.tracks.some(isPlayable);
  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-1 rounded-[14px] border border-transparent px-1.5 py-1 transition-[background-color,border-color] duration-150 hover:border-white/[0.07] hover:bg-white/[0.035]",
        active && "border-white/[0.1] bg-white/[0.045]",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={collection.name}
        aria-haspopup="dialog"
        className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[11px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acid)]"
      >
        <LibraryArtwork collection={collection} size="row" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium text-white/80 group-hover:text-white">
            {collection.name}
          </span>
          <span className="mt-0.5 block truncate text-[9.5px] text-[var(--text-mute)]">
            {collectionMeta(collection)}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        {playable ? (
          <button
            type="button"
            onClick={onPlay}
            aria-label={`Play ${collection.name}`}
            className="grid h-7 w-7 place-items-center rounded-full text-white/30 transition-colors hover:bg-white/[0.08] hover:text-[var(--acid)]"
          >
            <Play size={12} fill="currentColor" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SyncNotice() {
  const syncStatus = useUiStore((state) => state.librarySyncStatus);
  const syncError = useUiStore((state) => state.librarySyncError);

  if (syncStatus === "loading") {
    return (
      <p
        role="status"
        className="mt-2 flex items-center gap-2 text-[10px] text-[var(--text-mute)]"
      >
        <Loader2 size={11} className="animate-spin" aria-hidden />
        Syncing your Spotify library…
      </p>
    );
  }

  if (syncStatus !== "error") return null;

  return (
    <div
      role="alert"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-[13px] border border-white/[0.06] bg-white/[0.025] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--text-dim)]"
    >
      <AlertTriangle size={12} className="shrink-0 text-[#e8b96a]" aria-hidden />
      <span className="min-w-0 flex-1">
        {syncError?.message ?? "Could not sync your Spotify library."}
      </span>
      {syncError?.kind === "connect" || syncError?.kind === "scope" ? (
        <a
          href="/api/auth/spotify/login?returnTo=%2Flibrary"
          className="btn h-7 shrink-0 px-2.5 text-[10px]"
        >
          Reconnect
        </a>
      ) : (
        <button
          type="button"
          onClick={() => void syncSpotifyLibrary().catch(() => undefined)}
          className="btn h-7 shrink-0 gap-1 px-2.5 text-[10px]"
        >
          <RefreshCw size={11} aria-hidden />
          Retry
        </button>
      )}
    </div>
  );
}

function LibraryListSkeleton() {
  return (
    <div className="space-y-1" aria-hidden>
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="skeleton h-[52px] rounded-[14px]" />
      ))}
    </div>
  );
}

function LibraryWorkspaceSkeleton() {
  return (
    <div className="library-workspace relative overflow-hidden rounded-[26px] border border-white/[0.07] bg-[rgba(5,8,8,0.32)]">
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:border-r lg:border-white/[0.06]">
        <div className="skeleton h-8 w-48 rounded-full" />
        <div className="skeleton h-9 w-full rounded-full" />
        <div className="flex gap-2">
          <div className="skeleton h-7 w-24 rounded-full" />
          <div className="skeleton h-7 w-24 rounded-full" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="skeleton h-[72px] rounded-[16px]" />
          <div className="skeleton h-[72px] rounded-[16px]" />
        </div>
        <LibraryListSkeleton />
      </div>
      <div className="hidden flex-col gap-3 border-l border-white/[0.06] p-4 lg:flex">
        <div className="skeleton h-3 w-24 rounded-full" />
        <div className="skeleton h-20 rounded-[16px]" />
        <div className="skeleton h-9 w-full rounded-full" />
        <div className="skeleton h-16 rounded-[14px]" />
      </div>
    </div>
  );
}

export function LibraryView() {
  usePageTitle("Your Library");
  const playlists = useHermesLibraryStore((state) => state.playlists);
  const likedSongs = useHermesLibraryStore((state) => state.likedSongs);
  const lastImportedAt = useHermesLibraryStore(
    (state) => state.lastImportedAt,
  );
  const setImportOpen = useUiStore((state) => state.setImportOpen);
  const { session, sessionStatus } = useSpotifySession();
  const playback = useSpotifyPlaybackActions();
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [query, setQuery] = useState("");
  const [dialogCollection, setDialogCollection] =
    useState<LibraryCollection | null>(null);
  const [artistDetail, setArtistDetail] =
    useState<LibraryCollection | null>(null);
  const deferredQuery = useDeferredValue(query);

  const connected = Boolean(session?.connected);
  const configured = session?.configured ?? false;
  const checking = sessionStatus === "loading";

  useEffect(() => {
    if (!connected) {
      setDialogCollection(null);
      setArtistDetail(null);
    }
  }, [connected]);

  const openCollection = (collection: LibraryCollection) => {
    if (collection.kind === "artist") {
      setDialogCollection(null);
      setArtistDetail(collection);
      return;
    }
    setArtistDetail(null);
    setDialogCollection(collection);
  };

  const library = useMemo(
    () => buildLibraryCollections(playlists, likedSongs, lastImportedAt),
    [lastImportedAt, likedSongs, playlists],
  );
  const counts = useMemo(() => collectionCounts(library), [library]);

  const baseCollections = useMemo(
    () => collectionsForFilter(library, filter),
    [filter, library],
  );
  const visibleCollections = useMemo(
    () =>
      sortCollections(
        filterCollectionsByQuery(baseCollections, deferredQuery),
        sort,
      ),
    [baseCollections, deferredQuery, sort],
  );
  const artistNames = useMemo(
    () =>
      filter === "artists" ? library.artists.map((artist) => artist.name) : [],
    [filter, library.artists],
  );
  const artistImages = useArtistImages(artistNames);
  const renderedCollections = useMemo(
    () =>
      visibleCollections.map((collection) => {
        if (collection.kind !== "artist") return collection;
        const imageUrl = artistImages[collection.name];
        return imageUrl ? { ...collection, imageUrl } : collection;
      }),
    [artistImages, visibleCollections],
  );

  const totalVisible = renderedCollections.length;
  const listLabel =
    filter === "albums"
      ? "Albums"
      : filter === "artists"
        ? "Artists"
        : "Playlists";
  const itemLabel = `${totalVisible} ${totalVisible === 1 ? "item" : "items"}`;
  const queryText = deferredQuery.trim();
  const hasPlaylistData = library.playlists.length > 0 || Boolean(library.liked);

  const playCollection = (collection: LibraryCollection) => {
    const playable = collection.tracks.filter(isPlayable);
    if (playable.length === 0) return;
    playback.requestPlay({
      uris: playable.map((track) => `spotify:track:${track.id}`),
      offset: 0,
      queue: playable.map((track) => ({
        id: track.id,
        name: track.name,
        artists: track.artists,
        albumName: track.albumName,
        imageUrl: track.imageUrl,
        durationMs: track.durationMs,
        spotifyUrl:
          track.url ?? `https://open.spotify.com/track/${track.id}`,
      })),
      queueIndex: 0,
      contextName: collection.name,
      track: {
        id: playable[0].id,
        name: playable[0].name,
        artists: playable[0].artists,
        albumName: playable[0].albumName,
        imageUrl: playable[0].imageUrl,
        durationMs: playable[0].durationMs,
        spotifyUrl:
          playable[0].url ??
          `https://open.spotify.com/track/${playable[0].id}`,
      },
    });
  };

  if (checking) {
    return <LibraryWorkspaceSkeleton />;
  }

  if (!connected) {
    return (
      <div className="library-workspace library-workspace--empty items-center justify-center rounded-[26px] border border-white/[0.07] bg-[rgba(5,8,8,0.32)]">
        <div className="flex h-full w-full flex-col px-4 pt-4 sm:px-5">
          <h1 className="text-[clamp(1.55rem,2.4vw,2.2rem)] font-medium leading-none tracking-[-0.045em] text-white/90">
            Your Library
          </h1>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <SpotifyConnectEmptyState
              returnTo="/library"
              configured={configured}
              className="min-h-[42vh] justify-center py-8"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="library-workspace">
      <section
        data-testid="library-left"
        className="flex min-h-0 min-w-0 flex-col border-b border-white/[0.06] lg:border-b-0 lg:border-r"
      >
        <header className="shrink-0 border-b border-white/[0.06] px-4 pb-3 pt-4 sm:px-5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-[clamp(1.55rem,2.4vw,2.2rem)] font-medium leading-none tracking-[-0.045em] text-white/90">
                Your Library
              </h1>
              <p className="mt-1.5 truncate text-[10px] text-[var(--text-mute)]">
                {counts.all} {counts.all === 1 ? "collection" : "collections"}
                {library.liked ? " · Liked songs" : ""}
              </p>
            </div>
            <span className="shrink-0 text-[9px] uppercase tracking-[0.18em] text-white/20">
              Imported
            </span>
          </div>

          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-full border border-white/[0.08] bg-black/20 px-3 transition-[border-color,background-color] duration-150 focus-within:border-white/[0.16] focus-within:bg-black/30">
            <Search
              size={13}
              className="shrink-0 text-[var(--mint)]"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your library"
              aria-label="Search your library"
              className="h-9 min-w-0 flex-1 bg-transparent text-[11.5px] text-white/85 outline-none placeholder:text-white/30"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear library search"
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white/30 transition hover:bg-white/[0.08] hover:text-white/75"
              >
                <X size={11} />
              </button>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filter library"
              className="flex flex-wrap items-center gap-0.5 rounded-full border border-white/[0.07] bg-black/15 p-0.5"
            >
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  aria-pressed={filter === item.value}
                  aria-label={`${item.label} (${counts[item.value]})`}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-medium transition-[background-color,color] duration-150",
                    filter === item.value
                      ? "bg-white/[0.11] text-white"
                      : "text-[var(--text-mute)] hover:text-white/80",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setSort((current) =>
                  current === "recent" ? "az" : "recent",
                )
              }
              aria-label={
                sort === "recent"
                  ? "Sort by recently added; switch to alphabetical"
                  : "Sort alphabetically; switch to recently added"
              }
              className="ml-auto flex h-7 items-center gap-1.5 rounded-full border border-white/[0.07] bg-black/15 px-2.5 text-[10px] text-[var(--text-mute)] transition-colors hover:border-white/[0.13] hover:text-white/80"
            >
              {sort === "recent" ? (
                <Clock3 size={11} aria-hidden />
              ) : (
                <ArrowDownAZ size={11} aria-hidden />
              )}
              {sort === "recent" ? "Recent" : "A–Z"}
            </button>
          </div>

          <SyncNotice />
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            data-testid="library-playlist-scroll"
            className="library-song-scroll h-full overflow-y-auto overscroll-contain px-3 pb-4 pt-3 sm:px-4"
          >
            <section aria-label={listLabel}>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <h2 className="text-[9.5px] font-medium uppercase tracking-[0.24em] text-[var(--text-mute)]">
                  {listLabel}
                </h2>
                <span className="h-px flex-1 bg-gradient-to-r from-white/[0.07] to-transparent" aria-hidden />
                <span className="text-[9px] tabular-nums text-white/20">
                  {itemLabel}
                </span>
              </div>

              {renderedCollections.length > 0 ? (
                <ul className="space-y-0.5">
                  {renderedCollections.map((collection) => (
                    <li key={collection.key}>
                      <CollectionRow
                        collection={collection}
                        active={
                          dialogCollection?.key === collection.key ||
                          (collection.kind === "artist" &&
                            artistDetail?.name === collection.name)
                        }
                        onOpen={() => openCollection(collection)}
                        onPlay={() => playCollection(collection)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-3 py-12 text-center">
                  <ListMusic size={17} className="mx-auto text-white/20" />
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-mute)]">
                    {queryText
                      ? `No results for “${queryText.trim()}”.`
                      : filter === "albums" || filter === "artists"
                        ? `No ${listLabel.toLowerCase()} in your imported tracks yet.`
                        : !hasPlaylistData
                          ? lastImportedAt !== null
                            ? "No playlists or liked songs were found in this Spotify account."
                            : "No library imported yet."
                          : "Nothing to show."}
                  </p>
                  {queryText ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="btn mt-3 h-7 px-2.5 text-[10px]"
                    >
                      Clear search
                    </button>
                  ) : !hasPlaylistData && filter === "all" && lastImportedAt === null ? (
                    <button
                      type="button"
                      onClick={() => setImportOpen(true)}
                      className="btn mt-3 h-7 px-2.5 text-[10px]"
                    >
                      Import music
                    </button>
                  ) : filter === "albums" || filter === "artists" ? (
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className="btn mt-3 h-7 px-2.5 text-[10px]"
                    >
                      Show playlists
                    </button>
                  ) : null}
                </div>
              )}
            </section>

            {!hasPlaylistData &&
            (filter === "all" || filter === "playlists") &&
            !queryText ? (
              <p className="mt-3 px-1 text-[9.5px] leading-relaxed text-white/25">
                Imported playlists, liked songs, albums and artists come from
                your connected Spotify account.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <aside
        data-testid="library-right"
        className="flex min-h-0 min-w-0 flex-col bg-black/[0.1]"
      >
        <LibraryPlaybackPanel />
      </aside>

      {dialogCollection ? (
        <LibraryCollectionDialog
          collection={dialogCollection}
          onClose={() => setDialogCollection(null)}
        />
      ) : null}

      {artistDetail ? (
        <ArtistDetailDialog
          artistName={artistDetail.name}
          localTracks={artistDetail.tracks}
          localProfile={{ imageUrl: artistDetail.imageUrl, genres: [] }}
          onClose={() => setArtistDetail(null)}
        />
      ) : null}
    </div>
  );
}
