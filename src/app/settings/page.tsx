"use client";

import { useState } from "react";
import {
  Database,
  Headphones,
  Music2,
  Palette,
  RotateCcw,
  Server,
  Trash2,
} from "lucide-react";
import { useHermesLibraryStore } from "@/store/hermes-library";
import { useSettingsStore } from "@/store/settings";
import { toast } from "@/store/toast";
import { usePageTitle } from "@/hooks/useEnvironment";
import {
  clearSpotifyArtists,
  clearSpotifyHistory,
} from "@/lib/spotify/history";
import { clearListeningStats } from "@/lib/spotify/stats";
import { clearScrobbles } from "@/lib/scrobble/ledger";
import { LiquidPanel } from "@/components/ui/LiquidCard";
import { LiquidToggle } from "@/components/ui/LiquidToggle";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { LiquidDialog } from "@/components/ui/LiquidDialog";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { cn } from "@/lib/utils";

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-[13px] text-[var(--text-dim)]">{label}</span>
      <div className="flex rounded-full border border-white/[0.09] bg-black/25 p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] font-medium transition",
              value === option.value
                ? "bg-white text-[#10140a] shadow-sm"
                : "text-[var(--text-mute)] hover:text-white",
            )}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  usePageTitle("Settings");
  const motionPreference = useSettingsStore((state) => state.motionPreference);
  const lyricsScale = useSettingsStore((state) => state.lyricsScale);
  const setMotionPreference = useSettingsStore((state) => state.setMotionPreference);
  const setLyricsScale = useSettingsStore((state) => state.setLyricsScale);
  const resetSettings = useSettingsStore((state) => state.resetSettings);
  const clearImports = useHermesLibraryStore((state) => state.clearImports);
  const { session, sessionStatus, playerStatus, isPlaying, disconnect } =
    useSpotifyPlayback();

  const [resetOpen, setResetOpen] = useState(false);
  const spotifyProfile = session?.connected ? session.profile : null;
  const spotifyConfigured = session?.configured ?? false;

  const playbackStatus = !spotifyConfigured
    ? "Not configured"
    : sessionStatus === "loading"
      ? "Checking"
      : !session?.connected
        ? "Not connected"
        : !spotifyProfile
          ? "Connected"
          : !spotifyProfile.premium
            ? "Premium required"
            : playerStatus === "connecting"
              ? "Connecting"
              : playerStatus === "error"
                ? "Unavailable"
                : isPlaying
                  ? "Playing"
                  : playerStatus === "ready"
                    ? "Ready"
                    : "Idle";

  const resetEverything = () => {
    clearImports();
    clearSpotifyHistory();
    clearSpotifyArtists();
    clearListeningStats();
    clearScrobbles();
    resetSettings();
    setResetOpen(false);
    toast("Hermes data reset", "success");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-[2rem] font-medium leading-none tracking-[-0.045em] text-white/90 sm:text-[2.6rem]">
          Settings
        </h1>
      </header>

      <LiquidPanel
        title="Appearance"
        action={<Palette size={17} className="text-[var(--text-mute)]" />}
      >
        <div className="divide-y divide-white/[0.06]">
          <LiquidToggle
            label="Reduce motion"
            checked={motionPreference === "reduced"}
            onChange={(checked) =>
              setMotionPreference(checked ? "reduced" : "system")
            }
          />
          <Segmented
            label="Lyrics size"
            value={lyricsScale}
            onChange={setLyricsScale}
            options={[
              { value: "normal", label: "Normal" },
              { value: "large", label: "Large" },
            ]}
          />
        </div>
      </LiquidPanel>

      <LiquidPanel
        title="Playback"
        action={<Headphones size={17} className="text-[var(--text-mute)]" />}
      >
        <div className="divide-y divide-white/[0.06]">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-[13px] text-[var(--text-dim)]">Provider</span>
            <span className="text-[13px] text-white">
              {spotifyConfigured ? "Spotify" : "Not configured"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-[13px] text-[var(--text-dim)]">Player</span>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em]",
                isPlaying
                  ? "border-[rgba(191,227,205,0.22)] bg-[rgba(191,227,205,0.08)] text-[var(--acid)]"
                  : "border-white/[0.08] bg-white/[0.03] text-[var(--text-mute)]",
              )}
            >
              {playbackStatus}
            </span>
          </div>
        </div>
      </LiquidPanel>

      <LiquidPanel
        id="settings-connections"
        tabIndex={-1}
        title="Connections"
        action={<Server size={17} className="text-[var(--text-mute)]" />}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {spotifyProfile?.imageUrl ? (
                <img
                  src={spotifyProfile.imageUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[#9ee7c2]">
                  <Music2 size={16} />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-white">Streaming account</p>
                <p className="truncate text-[11px] text-[var(--text-mute)]">
                  {sessionStatus === "loading"
                    ? "Checking…"
                    : spotifyProfile
                      ? spotifyProfile.displayName
                      : spotifyConfigured
                        ? "Not connected"
                        : "Not configured"}
                </p>
              </div>
            </div>

            {sessionStatus === "loading" ? (
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-mute)]">
                Checking
              </span>
            ) : spotifyProfile ? (
              <div className="flex items-center gap-2">
                <span
                  className={
                    spotifyProfile.premium
                      ? "rounded-full border border-[rgba(191,227,205,0.22)] bg-[rgba(191,227,205,0.08)] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--acid)]"
                      : "rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-mute)]"
                  }
                >
                  {spotifyProfile.premium ? "Premium" : "Free"}
                </span>
                <LiquidButton
                  variant="secondary"
                  size="sm"
                  onClick={() => void disconnect()}
                >
                  Disconnect
                </LiquidButton>
              </div>
            ) : spotifyConfigured ? (
              <a
                href="/api/auth/spotify/login?returnTo=%2Fsettings"
                className="btn h-8 px-3 text-[12px]"
              >
                Connect
              </a>
            ) : (
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-mute)]">
                Not configured
              </span>
            )}
          </div>

          {spotifyProfile && !spotifyProfile.premium && (
            <p className="text-[11px] leading-relaxed text-[var(--text-mute)]">
              A premium account is required for in-app playback.
            </p>
          )}
        </div>
      </LiquidPanel>

      <LiquidPanel
        title="Data"
        action={<Database size={17} className="text-[var(--text-mute)]" />}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn h-10 px-4 text-[12px]"
            onClick={() => {
              clearSpotifyHistory();
              clearSpotifyArtists();
              clearScrobbles();
              toast("Listening history cleared", "success");
            }}
          >
            <Trash2 size={14} />
            Clear history
          </button>
          <button
            type="button"
            className="btn btn-danger h-10 px-4 text-[12px]"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </LiquidPanel>

      <p className="pt-2 text-center text-[10px] uppercase tracking-[0.16em] text-white/20">
        Hermes 0.1.0
      </p>

      <LiquidDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset Hermes data?"
        description="Imported playlists, liked songs, listening history, and preferences will be removed. This cannot be undone."
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost h-10 px-4 text-[12px]"
              onClick={() => setResetOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger h-10 px-4 text-[12px]"
              onClick={resetEverything}
            >
              Reset
            </button>
          </>
        }
      />
    </div>
  );
}
