"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Disc3, Loader2, X } from "lucide-react";
import { useHermesLibraryStore } from "@/store/hermes-library";
import { useUiStore } from "@/store/ui";
import { ImportRequestError } from "@/lib/import/errors";
import { syncSpotifyLibrary } from "@/lib/import/sync";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { cn } from "@/lib/utils";

type JobState = {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
  action?: "connect" | "scope";
};

const idle: JobState = { status: "idle" };

export function ImportDialog() {
  const open = useUiStore((state) => state.isImportOpen);
  const setOpen = useUiStore((state) => state.setImportOpen);
  const playlists = useHermesLibraryStore((state) => state.playlists.length);
  const likedSongs = useHermesLibraryStore((state) => state.likedSongs.length);
  const [mounted, setMounted] = useState(false);
  const [spotify, setSpotify] = useState<JobState>(idle);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setSpotify(idle);
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => panelRef.current?.focus(), 40);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  if (!mounted || !open) return null;

  const runSpotify = async () => {
    setSpotify({ status: "loading" });
    try {
      const payload = await syncSpotifyLibrary();
      setSpotify({
        status: "success",
        message: `Imported ${payload.playlists.length} playlists and ${payload.likedSongs.length} liked songs.`,
      });
    } catch (error) {
      if (error instanceof ImportRequestError) {
        setSpotify({
          status: "error",
          message: error.message,
          action:
            error.kind === "scope"
              ? "scope"
              : error.kind === "connect"
                ? "connect"
                : undefined,
        });
        return;
      }
      setSpotify({ status: "error", message: "Spotify import failed." });
    }
  };

  const reconnect = () => {
    window.location.assign("/api/auth/spotify/login?returnTo=/library");
  };

  const spotifyAction = spotify.action;
  const spotifyBusy = spotify.status === "loading";

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 px-4 py-6 backdrop-blur-sm animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        tabIndex={-1}
        className="liquid-raised rim grain relative w-full max-w-[560px] overflow-hidden rounded-[26px] outline-none"
      >
        <header className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <h2
            id="import-title"
            className="text-[15px] font-medium tracking-tight text-white"
          >
            Import to Hermes
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="icon-btn h-8 w-8"
            aria-label="Close import dialog"
          >
            <X size={15} />
          </button>
        </header>

        <div className="space-y-3 p-4">
          <section className="liquid-inset rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[#8df0ad]">
                <Disc3 size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-white">Spotify</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-mute)]">
                  Playlists and liked songs
                </p>
              </div>
              <button
                type="button"
                data-testid="import-spotify"
                onClick={
                  spotifyAction === "connect" || spotifyAction === "scope"
                    ? reconnect
                    : runSpotify
                }
                disabled={spotifyBusy}
                aria-busy={spotifyBusy}
                className="btn h-8 shrink-0 gap-1.5 px-3 text-[11px]"
              >
                {spotifyBusy && <Loader2 size={12} className="animate-spin" />}
                {spotifyAction === "scope"
                  ? "Reconnect"
                  : spotifyAction === "connect"
                    ? "Connect"
                    : spotifyBusy
                      ? "Importing"
                      : "Import"}
              </button>
            </div>
            {spotify.message && (
              <p
                role={spotify.status === "error" ? "alert" : "status"}
                aria-live="polite"
                className={cn(
                  "mt-3 flex items-start gap-2 text-[11px] leading-relaxed",
                  spotify.status === "success"
                    ? "text-[var(--acid)]"
                    : "text-[#e8b96a]",
                )}
              >
                {spotify.status === "success" ? (
                  <Check size={12} className="mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                )}
                {spotify.message}
              </p>
            )}
          </section>

          {(playlists > 0 || likedSongs > 0) && (
            <p className="px-1 pt-1 text-[10.5px] text-[var(--text-mute)]">
              In Hermes: {playlists} playlists · {likedSongs} liked songs
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
