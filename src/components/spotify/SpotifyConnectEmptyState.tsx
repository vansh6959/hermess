import { Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SpotifyConnectEmptyState({
  returnTo,
  configured,
  className,
}: {
  returnTo: string;
  configured: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        className,
      )}
    >
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.09] bg-white/[0.035] text-[var(--mint)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <Music2 size={22} />
      </span>

      <h2 className="mt-6 max-w-[20ch] text-[clamp(1.7rem,3.4vw,2.5rem)] font-medium leading-[1.04] tracking-[-0.045em] text-white/95">
        {configured
          ? "Connect your Spotify account to get started"
          : "Spotify isn't configured"}
      </h2>

      <p className="mt-3 max-w-[44ch] text-[12.5px] leading-relaxed text-[var(--text-mute)]">
        {configured
          ? "Your library, playlists and listening history will appear here once you connect."
          : "Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to hermes.env next to Hermes.exe (installed app) or .env.local (development), then restart Hermes."}
      </p>

      {configured ? (
        <>
          <a
            href={`/api/auth/spotify/login?returnTo=${encodeURIComponent(returnTo)}`}
            className="btn btn-accent mt-7 h-10 px-5 text-[12px]"
          >
            Connect Spotify
          </a>
          <p className="mt-3 text-[10px] text-white/30">
            In-app playback requires Spotify Premium.
          </p>
        </>
      ) : null}
    </div>
  );
}
