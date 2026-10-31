"use client";

import {
  ChevronRight,
  Library,
  Music2,
  PlugZap,
  Settings,
  UserRound,
} from "lucide-react";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { useUiStore } from "@/store/ui";
import { cn } from "@/lib/utils";

export function HomeProfileCard() {
  const { session, sessionStatus } = useSpotifyPlayback();
  const openHomeSection = useUiStore((state) => state.openHomeSection);
  const profile = session?.connected ? session.profile : null;
  const configured = session?.configured ?? false;

  const actions = [
    {
      label: "Library",
      description: "Playlists and saved songs",
      icon: Library,
      onClick: () => openHomeSection("library"),
    },
    {
      label: "Settings",
      description: "Appearance and playback",
      icon: Settings,
      onClick: () => openHomeSection("settings"),
    },
    {
      label: "Connection",
      description: profile ? "Manage your Spotify account" : "Connect Spotify",
      icon: PlugZap,
      onClick: () => openHomeSection("connect"),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <header className="flex items-center gap-4">
        <span className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-[linear-gradient(150deg,#8ea69a,#3a4943_58%,#101512)] text-white shadow-inner">
          {profile?.imageUrl ? (
            <img
              src={profile.imageUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            <UserRound size={24} />
          )}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[1.8rem] font-medium leading-none tracking-[-0.04em] text-white/92">
            {profile?.displayName ?? "Your profile"}
          </h1>
          <p className="mt-2 flex items-center gap-2 text-[11.5px] text-[var(--text-mute)]">
            {sessionStatus === "loading" ? (
              "Checking account…"
            ) : profile ? (
              <>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em]",
                    profile.premium
                      ? "border-[rgba(191,227,205,0.22)] bg-[rgba(191,227,205,0.08)] text-[var(--acid)]"
                      : "border-white/[0.08] bg-white/[0.03]",
                  )}
                >
                  {profile.premium ? "Premium" : "Free"}
                </span>
                Spotify
              </>
            ) : configured ? (
              "No Spotify account connected"
            ) : (
              "Playback not configured"
            )}
          </p>
        </div>
      </header>

      <div className="grid gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="group flex items-center gap-3 rounded-[16px] border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-left transition-[background-color,border-color] duration-200 hover:border-white/[0.14] hover:bg-white/[0.05]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-[var(--mint)]">
              <action.icon size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-white/85 group-hover:text-white">
                {action.label}
              </span>
              <span className="mt-0.5 block truncate text-[10.5px] text-[var(--text-mute)]">
                {action.description}
              </span>
            </span>
            <ChevronRight
              size={13}
              aria-hidden
              className="shrink-0 text-white/25 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white/60"
            />
          </button>
        ))}
      </div>

      {!profile && configured && sessionStatus !== "loading" ? (
        <p className="flex items-center gap-2 text-[10.5px] text-[var(--text-mute)]">
          <Music2 size={12} aria-hidden />
          Connect from the Connection card or the taskbar.
        </p>
      ) : null}
    </div>
  );
}
