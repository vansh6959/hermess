"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { LiquidDialog } from "@/components/ui/LiquidDialog";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { LiquidInput } from "@/components/ui/LiquidInput";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { usePlaylistDialogStore } from "@/store/playlist-dialog";
import { useHermesLibraryStore } from "@/store/hermes-library";
import { toast } from "@/store/toast";
import type {
  ManageablePlaylist,
  PlaylistTrack,
} from "@/lib/spotify/playlist-types";
import type { ImportedTrack } from "@/lib/import/types";
import { cn } from "@/lib/utils";

type ApiErrorPayload = {
  error?: { code?: string; message?: string; retryAfter?: number };
  needsConnect?: boolean;
  needsScope?: boolean;
};

function importedTrack(track: PlaylistTrack): ImportedTrack {
  return {
    id: track.id,
    source: "spotify",
    name: track.name,
    artists: track.artists,
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    durationMs: track.durationMs,
    url: track.spotifyUrl,
  };
}

function reconnectUrl() {
  const returnTo =
    typeof window === "undefined"
      ? "/library"
      : `${window.location.pathname}${window.location.search}`;
  return `/api/auth/spotify/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function AddToPlaylistDialog() {
  const track = usePlaylistDialogStore((state) => state.track);
  const close = usePlaylistDialogStore((state) => state.close);
  const { session } = useSpotifyPlayback();
  const addTrackSnapshot = useHermesLibraryStore(
    (state) => state.addTrackToPlaylist,
  );
  const addPlaylistSnapshot = useHermesLibraryStore(
    (state) => state.addPlaylist,
  );

  const [playlists, setPlaylists] = useState<ManageablePlaylist[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [needsScope, setNeedsScope] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const connected = Boolean(session?.connected);
  const canModify = Boolean(session?.canModifyPlaylists);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/spotify/playlists", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as
        | { playlists?: ManageablePlaylist[] }
        | ApiErrorPayload
        | null;
      if (!response.ok) {
        const failure = payload as ApiErrorPayload | null;
        setNeedsScope(Boolean(failure?.needsScope));
        setError(
          failure?.error?.message ??
            "Spotify could not load your playlists.",
        );
        setStatus("error");
        return;
      }
      setPlaylists((payload as { playlists?: ManageablePlaylist[] })?.playlists ?? []);
      setStatus("ready");
    } catch {
      setError("Could not reach Spotify. Try again.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!track) return;
    setQuery("");
    setMode("existing");
    setName("");
    setDescription("");
    setIsPublic(false);
    setNeedsScope(false);
    setError(null);
    setSubmitting(null);
    setPlaylists([]);
    setStatus("idle");
    if (connected && canModify) void load();
  }, [canModify, connected, load, track]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return playlists;
    return playlists.filter((playlist) =>
      `${playlist.name} ${playlist.ownerName}`
        .toLowerCase()
        .includes(needle),
    );
  }, [playlists, query]);

  const submitExisting = async (playlist: ManageablePlaylist) => {
    if (!track || submitting) return;
    setSubmitting(playlist.id);
    setError(null);
    try {
      const response = await fetch("/api/spotify/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          playlistId: playlist.id,
          trackId: track.id,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { added?: boolean }
        | ApiErrorPayload
        | null;
      if (!response.ok) {
        const failure = payload as ApiErrorPayload | null;
        setNeedsScope(Boolean(failure?.needsScope));
        throw new Error(
          failure?.error?.message ?? "Could not add the song to that playlist.",
        );
      }
      addTrackSnapshot(playlist.id, importedTrack(track));
      toast(`Added “${track.name}” to “${playlist.name}”.`, "success");
      close();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not add the song to that playlist.",
      );
    } finally {
      setSubmitting(null);
    }
  };

  const submitNew = async () => {
    if (!track || submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the playlist a name.");
      return;
    }
    setSubmitting("new");
    setError(null);
    try {
      const response = await fetch("/api/spotify/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: trimmed,
          description: description.trim(),
          isPublic,
          trackId: track.id,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            playlist?: ManageablePlaylist;
            added?: boolean;
            error?: { code?: string; message?: string };
          }
        | ApiErrorPayload
        | null;
      if (!response.ok) {
        const failure = payload as ApiErrorPayload | null;
        setNeedsScope(Boolean(failure?.needsScope));
        throw new Error(
          failure?.error?.message ?? "Could not create the playlist.",
        );
      }

      const result = payload as {
        playlist?: ManageablePlaylist;
        added?: boolean;
        error?: { message?: string };
      };
      if (!result.playlist) {
        throw new Error("Spotify did not return the new playlist.");
      }
      addPlaylistSnapshot({
        id: result.playlist.id,
        source: "spotify",
        name: result.playlist.name,
        description: result.playlist.description,
        imageUrl: result.playlist.imageUrl ?? track.imageUrl,
        trackCount: result.added ? 1 : 0,
        tracks: result.added ? [importedTrack(track)] : [],
        url: result.playlist.url,
        importedAt: Date.now(),
      });

      if (!result.added) {
        toast(
          result.error?.message ??
            "Playlist created, but the song was not added.",
          "error",
        );
        close();
        return;
      }

      toast(`Created “${result.playlist.name}” and added “${track.name}”.`, "success");
      close();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not create the playlist.",
      );
    } finally {
      setSubmitting(null);
    }
  };

  const disabled = !connected || !canModify;
  const title = track ? `Add “${track.name}” to a playlist` : "Add to playlist";

  return (
    <LiquidDialog
      open={Boolean(track)}
      onClose={close}
      title={title}
      description={track ? track.artists : undefined}
      size="md"
    >
      {!connected ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-[12.5px] text-[var(--text-dim)]">
          <p>Connect Spotify to add songs to your playlists.</p>
          <a href={reconnectUrl()} className="mt-3 inline-flex text-[12px] font-medium text-[#8df0ad]">
            Connect Spotify
          </a>
        </div>
      ) : !canModify || needsScope ? (
        <div className="rounded-2xl border border-[#e8b96a]/25 bg-[#e8b96a]/[0.06] p-4 text-[12.5px] text-[var(--text-dim)]">
          <p>
            Spotify needs permission to edit playlists. Reconnect once to grant
            playlist editing; Spotify only allows changes to playlists you own
            or collaborate on.
          </p>
          <a
            href={reconnectUrl()}
            className="btn mt-3 inline-flex h-8 items-center gap-2 px-3 text-[11px]"
          >
            <RefreshCw size={12} />
            Reconnect Spotify
          </a>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-1 rounded-xl bg-white/[0.035] p-1">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition",
                mode === "existing"
                  ? "bg-white/[0.09] text-white"
                  : "text-[var(--text-mute)] hover:text-white",
              )}
            >
              Existing playlist
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition",
                mode === "new"
                  ? "bg-white/[0.09] text-white"
                  : "text-[var(--text-mute)] hover:text-white",
              )}
            >
              New playlist
            </button>
          </div>

          {mode === "existing" ? (
            <>
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                  aria-hidden
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a playlist"
                  aria-label="Find a playlist"
                  className="input h-9 pl-9 text-[12px]"
                />
              </div>
              <div className="mt-3 max-h-[42vh] min-h-[120px] overflow-y-auto overscroll-contain pr-1">
                {status === "loading" ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-[var(--text-mute)]">
                    <Loader2 size={14} className="animate-spin" />
                    Loading playlists
                  </div>
                ) : status === "error" ? (
                  <div className="rounded-xl border border-white/[0.07] p-4 text-[12px] text-[var(--text-dim)]">
                    <p>{error}</p>
                    <button
                      type="button"
                      onClick={() => void load()}
                      className="btn mt-3 h-8 px-3 text-[11px]"
                    >
                      Retry
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="py-10 text-center text-[12px] text-[var(--text-mute)]">
                    {playlists.length === 0
                      ? "No editable playlists found."
                      : "No playlists match that search."}
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {filtered.map((playlist) => (
                      <li key={playlist.id}>
                        <button
                          type="button"
                          onClick={() => void submitExisting(playlist)}
                          disabled={Boolean(submitting)}
                          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.045] disabled:opacity-60"
                        >
                          <span className="artwork-shell h-9 w-9 shrink-0 rounded-lg" style={playlist.imageUrl ? { backgroundImage: `url("${playlist.imageUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium text-white/85">
                              {playlist.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[10.5px] text-[var(--text-mute)]">
                              {playlist.trackCount} songs · {playlist.ownerName}
                              {playlist.collaborative ? " · Collaborative" : ""}
                            </span>
                          </span>
                          {submitting === playlist.id ? (
                            <Loader2 size={14} className="animate-spin text-[#8df0ad]" />
                          ) : (
                            <Plus size={14} className="text-white/35" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {error ? (
                <p role="alert" className="mt-3 text-[11.5px] text-[#e8b96a]">
                  {error}
                </p>
              ) : null}
            </>
          ) : (
            <div className="space-y-3">
              <LiquidInput
                label="Playlist name"
                name="playlist-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My playlist"
                maxLength={100}
                autoFocus
              />
              <label className="block">
                <span className="mb-2 block text-[12px] font-medium text-[var(--text-dim)]">
                  Description
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional"
                  maxLength={300}
                  className="input min-h-[72px] resize-none"
                />
              </label>
              <label className="flex items-center gap-2 text-[12px] text-[var(--text-dim)]">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(event) => setIsPublic(event.target.checked)}
                  className="h-3.5 w-3.5 accent-[#8df0ad]"
                />
                Make this playlist public
              </label>
              {error ? (
                <p role="alert" className="text-[11.5px] text-[#e8b96a]">
                  {error}
                </p>
              ) : null}
              <LiquidButton
                variant="primary"
                size="sm"
                onClick={() => void submitNew()}
                disabled={Boolean(submitting) || !name.trim()}
                icon={
                  submitting === "new" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} />
                  )
                }
              >
                Create and add
              </LiquidButton>
            </div>
          )}
        </>
      )}
      {disabled ? null : (
        <p className="mt-4 text-[10.5px] leading-relaxed text-[var(--text-mute)]">
          Spotify only allows adding to playlists you own or collaborate on.
        </p>
      )}
    </LiquidDialog>
  );
}
