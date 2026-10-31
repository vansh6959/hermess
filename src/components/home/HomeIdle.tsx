"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { SpotifyConnectEmptyState } from "@/components/spotify/SpotifyConnectEmptyState";
import { useSpotifyCovers, type ListeningCover } from "@/hooks/useSpotifyCovers";
import { CoverAlbumDialog } from "@/components/albums/CoverAlbumDialog";
import { cn } from "@/lib/utils";
import { CoverMarquee } from "./CoverMarquee";

function IdleShell({
  compact = false,
  children,
}: {
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center px-4 py-8 sm:px-6 lg:px-8 [@media(max-height:620px)]:items-start [@media(max-height:620px)]:pt-24">
        <section
          className={cn(
            "home-idle-card rim grain relative mx-auto w-full overflow-hidden rounded-[34px] border border-white/[0.16] bg-[rgba(12,18,17,0.38)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-30px_60px_rgba(0,0,0,0.34),0_50px_140px_-60px_rgba(0,0,0,0.95)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-[40px]",
            compact
              ? "max-w-[680px] px-6 py-12 sm:px-10"
              : "max-w-[1120px] px-5 py-10 sm:px-10 sm:py-14",
          )}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_72%_at_22%_0%,rgba(255,255,255,0.15),transparent_58%),radial-gradient(48%_60%_at_82%_100%,rgba(124,143,201,0.12),transparent_70%),linear-gradient(145deg,rgba(255,255,255,0.06),transparent_38%,rgba(255,255,255,0.02)_68%,rgba(0,0,0,0.22))]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[#8fb9a3]/15 blur-[90px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-32 right-[-4rem] h-80 w-80 rounded-full bg-[#7c8fc9]/10 blur-[100px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent"
            aria-hidden
          />

          <div className="relative flex flex-col items-center text-center">
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

function HomeIdleCheck() {
  return (
    <div
      className="w-full max-w-[520px] py-2"
      role="status"
      aria-label="Checking your Spotify connection"
    >
      <div className="skeleton mx-auto h-10 w-64 max-w-full rounded-full" />
      <div className="skeleton mx-auto mt-3 h-4 w-80 max-w-full rounded-full" />
      <div className="skeleton mx-auto mt-8 h-24 w-full rounded-[22px]" />
      <span className="sr-only">Checking your Spotify connection…</span>
    </div>
  );
}

function HomeIdleConnected() {
  const { covers, loading } = useSpotifyCovers();
  const playableCovers = useMemo(
    () => covers.filter((cover) => Boolean(cover.trackId || cover.albumId)),
    [covers],
  );
  const [selected, setSelected] = useState<ListeningCover | null>(null);
  const closeAlbum = useCallback(() => setSelected(null), []);

  return (
    <>
      <IdleShell>
        <h1 className="text-[clamp(2.7rem,7vw,5rem)] font-medium leading-[0.95] tracking-[-0.055em] text-white/95">
          Let&apos;s dive in
        </h1>

        <div className="mt-8 w-full">
          {loading && playableCovers.length === 0 ? (
            <div
              className="flex justify-center gap-3 overflow-hidden px-2 py-2"
              aria-hidden
            >
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="skeleton aspect-square w-[7.5rem] shrink-0 rounded-[20px] sm:w-32 md:w-36"
                />
              ))}
            </div>
          ) : (
            <CoverMarquee covers={playableCovers} onOpen={setSelected} />
          )}
        </div>
      </IdleShell>

      {selected ? (
        <CoverAlbumDialog cover={selected} onClose={closeAlbum} />
      ) : null}
    </>
  );
}

export function HomeIdle() {
  const { session, sessionStatus } = useSpotifyPlayback();

  if (sessionStatus === "loading") {
    return (
      <IdleShell compact>
        <HomeIdleCheck />
      </IdleShell>
    );
  }

  if (!session?.connected) {
    return (
      <IdleShell compact>
        <SpotifyConnectEmptyState
          returnTo="/"
          configured={session?.configured ?? false}
        />
      </IdleShell>
    );
  }

  return <HomeIdleConnected />;
}
