"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AmbientBackdrop } from "./AmbientBackdrop";
import { HomeCoverBackdrop } from "@/components/home/HomeCoverBackdrop";
import { TopBar } from "./TopBar";
import { Toaster } from "./Toaster";
import { SearchCommand } from "@/components/common/SearchCommand";
import { ImportDialog } from "@/components/import/ImportDialog";
import { AddToPlaylistDialog } from "@/components/playlists/AddToPlaylistDialog";
import { ProgressiveBlur } from "@/components/ui/ProgressiveBlur";
import { PlayerLayer } from "@/components/player/PlayerLayer";
import { AppRuntime } from "@/components/providers/AppRuntime";
import { StatsSyncRuntime } from "@/components/providers/StatsSyncRuntime";
import { LyricsWarmup } from "@/components/providers/LyricsWarmup";
import { SpotifyPlaybackProvider } from "@/components/providers/SpotifyPlaybackProvider";
import { useUiStore } from "@/store/ui";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const homeSection = useUiStore((state) => state.homeSection);
  const hideAtmosphereBlur =
    pathname.startsWith("/library") || homeSection !== null;

  if (pathname === "/desktop-floating") {
    return <div className="desktop-floating-root">{children}</div>;
  }

  return (
    <SpotifyPlaybackProvider>
      <div className="min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-full focus:bg-[var(--acid)] focus:px-4 focus:py-2 focus:text-[12px] focus:font-semibold focus:text-black"
        >
          Skip to content
        </a>

        <AmbientBackdrop />
        <HomeCoverBackdrop />
        <TopBar />

        <main
          id="main-content"
          tabIndex={-1}
          className="page-enter mx-auto w-full max-w-[1640px] px-4 pb-[7rem] pt-20 sm:px-6 sm:pt-24 lg:px-8 lg:pb-[9rem]"
        >
          {children}
        </main>

        {hideAtmosphereBlur ? null : (
          <ProgressiveBlur
            direction="bottom"
            layers={5}
            blurIntensity={0.9}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-40 opacity-70"
          />
        )}
        <PlayerLayer />
        <Toaster />
        <SearchCommand />
        <ImportDialog />
        <AddToPlaylistDialog />
        <AppRuntime />
        <StatsSyncRuntime />
        <LyricsWarmup />
      </div>
    </SpotifyPlaybackProvider>
  );
}
