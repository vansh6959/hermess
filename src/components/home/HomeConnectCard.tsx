"use client";

import { Music2 } from "lucide-react";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { cn } from "@/lib/utils";

export function HomeConnectCard() {
  const { session, sessionStatus, disconnect } = useSpotifyPlayback();
  const profile = session?.connected ? session.profile : null;
  const configured = session?.configured ?? false;

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
      <header>
        <h1 className="text-[1.8rem] font-medium leading-none tracking-[-0.04em] text-white/92">
          Spotify connection
        </h1>
        <p className="mt-2 text-[12px] text-[var(--text-mute)]">
          In-app playback uses your own Spotify account.
        </p>
      </header>

      <div className="liquid-inset rounded-[20px] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {profile?.imageUrl ? (
              <img
                src={profile.imageUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-11 w-11 rounded-full border border-white/10 object-cover"
              />
            ) : (
              <span className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[#9ee7c2]">
                <Music2 size={18} />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-white">
                {profile?.displayName ?? "No account connected"}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-[var(--text-mute)]">
                {sessionStatus === "loading"
                  ? "Checking…"
                  : configured
                    ? profile
                      ? "Spotify"
                      : "Not connected"
                    : "Not configured"}
              </p>
            </div>
          </div>

          {profile ? (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em]",
                  profile.premium
                    ? "border-[rgba(191,227,205,0.22)] bg-[rgba(191,227,205,0.08)] text-[var(--acid)]"
                    : "border-white/[0.08] bg-white/[0.03] text-[var(--text-mute)]",
                )}
              >
                {profile.premium ? "Premium" : "Free"}
              </span>
              <button
                type="button"
                onClick={() => void disconnect()}
                className="btn h-8 px-3 text-[11px]"
              >
                Disconnect
              </button>
            </div>
          ) : configured && sessionStatus !== "loading" ? (
            <a
              href="/api/auth/spotify/login?returnTo=%2F"
              className="btn btn-accent h-9 px-4 text-[11.5px]"
            >
              Connect Spotify
            </a>
          ) : null}
        </div>

        {profile && !profile.premium ? (
          <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-mute)]">
            Premium is required for in-app playback.
          </p>
        ) : null}

        {!configured && sessionStatus !== "loading" ? (
          <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-mute)]">
            Spotify credentials are not configured on the server.
          </p>
        ) : null}
      </div>
    </div>
  );
}
