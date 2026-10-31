"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ListMusic,
  ListPlus,
  Pencil,
  Play,
  Plus,
  Shuffle,
  Trash2,
} from "lucide-react";
import { catalog } from "@/lib/catalog";
import type { Artwork } from "@/lib/catalog/types";
import { trackDurationForIds, artworkForUserPlaylist } from "@/lib/catalog/derive";
import { formatDurationLabel } from "@/lib/utils";
import { useArtworkPalette, paletteStyle } from "@/lib/palette";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { toast } from "@/store/toast";
import { usePageTitle } from "@/hooks/useEnvironment";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { artworkBackground } from "@/lib/artwork-variants";
import { LiquidTrackRow } from "@/components/ui/LiquidTrackRow";
import { EmptyState } from "@/components/ui/States";
import { LiquidDialog } from "@/components/ui/LiquidDialog";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";
import { LiquidInput, LiquidSearch } from "@/components/ui/LiquidInput";
import { CreatePlaylistControl } from "@/components/common/CreatePlaylistControl";

const fallbackArtwork: Artwork = {
  src: "",
  alt: "Playlist artwork",
  palette: { a: "#9fc9c0", b: "#e2ece3", c: "#1d3a3e" },
};

export default function PlaylistPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();

  const curated = id ? catalog.getPlaylist(id) : undefined;
  const userPlaylist = useLibraryStore((state) =>
    state.playlists.find((playlist) => playlist.id === id),
  );

  const renamePlaylist = useLibraryStore((state) => state.renamePlaylist);
  const updatePlaylistDescription = useLibraryStore(
    (state) => state.updatePlaylistDescription,
  );
  const deletePlaylist = useLibraryStore((state) => state.deletePlaylist);
  const addTracksToPlaylist = useLibraryStore((state) => state.addTracksToPlaylist);
  const removeTrackFromPlaylist = useLibraryStore(
    (state) => state.removeTrackFromPlaylist,
  );
  const movePlaylistTrack = useLibraryStore((state) => state.movePlaylistTrack);

  const playCollection = usePlayerStore((state) => state.playCollection);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const currentTrackId = usePlayerStore((state) => state.currentTrackId);
  const status = usePlayerStore((state) => state.status);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const addToQueue = usePlayerStore((state) => state.addToQueue);

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const deferredAddQuery = useDeferredValue(addQuery);

  const title = curated?.title ?? userPlaylist?.title;
  const trackIds = curated?.trackIds ?? userPlaylist?.trackIds ?? [];
  const artwork =
    curated?.artwork ?? (userPlaylist ? artworkForUserPlaylist(userPlaylist) : fallbackArtwork);

  usePageTitle(title ?? "Playlist not found");

  const palette = useArtworkPalette(artwork.src, artwork.palette);
  const tracks = catalog.getTracks(trackIds);
  const queueIds = tracks.map((track) => track.id);
  const editable = Boolean(userPlaylist);
  const isPlayingPlaylist =
    Boolean(currentTrackId) &&
    trackIds.includes(currentTrackId ?? "") &&
    status === "playing";

  const addableTracks = useMemo(() => {
    const query = deferredAddQuery.trim().toLowerCase();
    return catalog
      .getAllTracks()
      .filter((track) => {
      if (trackIds.includes(track.id)) return false;
      if (!query) return true;
      const artist = catalog.getArtist(track.artistId)?.name ?? "";
      const album = catalog.getAlbum(track.albumId)?.title ?? "";
      return `${track.title} ${artist} ${album}`.toLowerCase().includes(query);
    }).slice(0, 40);
  }, [deferredAddQuery, trackIds]);

  if (!curated && !userPlaylist) {
    return (
      <EmptyState
        icon={<ListMusic size={20} />}
        title="Playlist not found"
        action={
          <div className="flex gap-2">
            <Link href="/library" className="btn btn-accent">
              Your library
            </Link>
            <CreatePlaylistControl variant="secondary" />
          </div>
        }
      />
    );
  }

  const description = curated?.description ?? userPlaylist?.description ?? "";

  const play = () => {
    if (queueIds.length === 0) return;
    if (isPlayingPlaylist) {
      togglePlay();
      return;
    }
    playCollection(queueIds, 0, title ?? "Playlist");
  };

  const shufflePlay = () => {
    if (queueIds.length === 0) return;
    if (!shuffle) toggleShuffle();
    playCollection(queueIds, 0, title ?? "Playlist");
  };

  const openEdit = () => {
    if (!userPlaylist) return;
    setEditTitle(userPlaylist.title);
    setEditDescription(userPlaylist.description);
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!userPlaylist) return;
    renamePlaylist(userPlaylist.id, editTitle);
    updatePlaylistDescription(userPlaylist.id, editDescription);
    setEditOpen(false);
    toast("Playlist updated", "success");
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
        {artwork.src && (
          <div
            className="absolute inset-0 scale-125 bg-cover bg-center opacity-30 blur-3xl"
            style={{ backgroundImage: artworkBackground(artwork.src, 640) }}
            aria-hidden
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06070a] via-[#06070a]/55 to-transparent" />
        <div className="relative flex flex-col items-start gap-6 p-6 sm:flex-row sm:items-end sm:p-8">
          <div className="artwork-shell aspect-square w-40 shrink-0 rounded-[22px] shadow-[0_40px_90px_-34px_rgba(0,0,0,0.95)] sm:w-56">
            <ArtworkImage
              artwork={artwork}
              alt={artwork.alt}
              loading="eager"
              sizes="(min-width: 640px) 224px, 160px"
              className="artwork-img"
            />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-white/55">
              Playlist
            </p>
            <h1 className="mt-2 text-[2.2rem] font-semibold leading-[0.98] tracking-[-0.05em] text-white sm:text-[3.3rem]">
              {title}
            </h1>
            {description && (
              <p className="mt-2 line-clamp-2 max-w-xl text-[12.5px] leading-relaxed text-white/55">
                {description}
              </p>
            )}
            <p className="mt-3 text-[12px] text-white/50">
              {tracks.length} {tracks.length === 1 ? "song" : "songs"} ·{" "}
              {formatDurationLabel(trackDurationForIds(trackIds))}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={play}
                className="btn btn-accent h-10 px-5 text-[12px]"
                disabled={tracks.length === 0}
              >
                <Play size={14} fill="currentColor" />
                {isPlayingPlaylist ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                onClick={shufflePlay}
                className="btn h-10 px-4 text-[12px]"
                disabled={tracks.length === 0}
              >
                <Shuffle size={14} />
                Shuffle
              </button>
              <LiquidTooltip label="Add playlist to queue">
                <button
                  type="button"
                  onClick={queueAll}
                  className="icon-btn h-10 w-10 border border-white/10 bg-white/[0.05]"
                  disabled={tracks.length === 0}
                  aria-label="Add playlist to queue"
                >
                  <ListPlus size={15} />
                </button>
              </LiquidTooltip>
              {editable && (
                <>
                  <LiquidTooltip label="Add tracks">
                    <button
                      type="button"
                      onClick={() => setAddOpen(true)}
                      className="icon-btn h-10 w-10 border border-white/10 bg-white/[0.05]"
                      aria-label="Add tracks"
                    >
                      <Plus size={15} />
                    </button>
                  </LiquidTooltip>
                  <LiquidTooltip label="Edit playlist">
                    <button
                      type="button"
                      onClick={openEdit}
                      className="icon-btn h-10 w-10 border border-white/10 bg-white/[0.05]"
                      aria-label="Edit playlist"
                    >
                      <Pencil size={15} />
                    </button>
                  </LiquidTooltip>
                  <LiquidTooltip label="Delete playlist">
                    <button
                      type="button"
                      onClick={() => setDeleteOpen(true)}
                      className="icon-btn h-10 w-10 border border-white/10 bg-white/[0.05] hover:!text-[var(--danger)]"
                      aria-label="Delete playlist"
                    >
                      <Trash2 size={15} />
                    </button>
                  </LiquidTooltip>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<ListMusic size={20} />}
          title="Empty playlist"
          action={
            editable ? (
              <LiquidButton variant="primary" onClick={() => setAddOpen(true)}>
                <Plus size={14} />
                Add tracks
              </LiquidButton>
            ) : undefined
          }
        />
      ) : (
        <section>
          <div className="liquid rim rounded-2xl p-2">
            {tracks.map((track, index) => (
              <LiquidTrackRow
                key={`${track.id}-${index}`}
                track={track}
                index={index}
                queueIds={queueIds}
                contextLabel={title ?? "Playlist"}
                onRemove={
                  editable
                    ? () => {
                        removeTrackFromPlaylist(userPlaylist!.id, track.id);
                        toast("Removed from playlist", "success");
                      }
                    : undefined
                }
                onMoveUp={
                  editable && index > 0
                    ? () => movePlaylistTrack(userPlaylist!.id, index, index - 1)
                    : undefined
                }
                onMoveDown={
                  editable && index < tracks.length - 1
                    ? () => movePlaylistTrack(userPlaylist!.id, index, index + 1)
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Edit dialog */}
      <LiquidDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit playlist"
        size="sm"
        footer={
          <>
            <LiquidButton variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </LiquidButton>
            <LiquidButton variant="primary" onClick={saveEdit}>
              Save changes
            </LiquidButton>
          </>
        }
      >
        <div className="space-y-3">
          <LiquidInput
            label="Name"
            value={editTitle}
            maxLength={80}
            onChange={(event) => setEditTitle(event.target.value)}
          />
          <LiquidInput
            label="Description"
            value={editDescription}
            maxLength={280}
            onChange={(event) => setEditDescription(event.target.value)}
          />
        </div>
      </LiquidDialog>

      {/* Add tracks dialog */}
      <LiquidDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add tracks"
        size="lg"
        footer={
          <LiquidButton variant="primary" onClick={() => setAddOpen(false)}>
            Done
          </LiquidButton>
        }
      >
        <div className="space-y-3">
          <LiquidSearch
            value={addQuery}
            onChange={(event) => setAddQuery(event.target.value)}
            onClear={() => setAddQuery("")}
            placeholder="Search tracks or artists"
            aria-label="Search tracks to add"
          />
          <div className="no-scrollbar max-h-[46vh] space-y-0.5 overflow-y-auto">
            {addableTracks.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-[var(--text-mute)]">
                No tracks found.
              </p>
            ) : (
              addableTracks.map((track) => {
                const artist = catalog.getArtist(track.artistId);
                return (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.05]"
                  >
                    <span className="artwork-shell h-9 w-9 shrink-0 rounded-md">
                      <ArtworkImage
                        artwork={track.artwork}
                        alt=""
                        sizes="36px"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-white">
                        {track.title}
                      </p>
                      <p className="truncate text-[10.5px] text-[var(--text-mute)]">
                        {artist?.name} · {catalog.getAlbum(track.albumId)?.title}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        addTracksToPlaylist(userPlaylist!.id, [track.id]);
                        toast(`Added “${track.title}”`, "success");
                      }}
                      className="btn h-7 px-2.5 text-[10.5px]"
                      aria-label={`Add ${track.title}`}
                    >
                      <Plus size={12} />
                      Add
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </LiquidDialog>

      {/* Delete dialog */}
      <LiquidDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this playlist?"
        description="This cannot be undone."
        size="sm"
        footer={
          <>
            <LiquidButton variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep playlist
            </LiquidButton>
            <LiquidButton
              variant="danger"
              onClick={() => {
                if (!userPlaylist) return;
                deletePlaylist(userPlaylist.id);
                setDeleteOpen(false);
                toast("Playlist deleted", "success");
                router.push("/library");
              }}
            >
              Delete
            </LiquidButton>
          </>
        }
      />
    </div>
  );
}
