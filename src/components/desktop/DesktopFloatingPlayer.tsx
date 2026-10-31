"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  Maximize2,
  PictureInPicture2,
  SkipBack,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { LiquidSlider } from "@/components/ui/LiquidSlider";
import { SiriPlayButton } from "@/components/player/SiriPlayButton";
import { useArtworkPalette, paletteStyle } from "@/lib/palette";
import { spotifyFallbackPalette } from "@/lib/spotify/artwork";
import {
  DESKTOP_FLOATING_STALE_MS,
  createFloatingChannel,
  type DesktopFloatingCommand,
  type DesktopFloatingMessage,
  type DesktopFloatingState,
} from "@/lib/desktop/floating";
import { formatTime } from "@/lib/utils";

// A paused or slow provider still sends a heartbeat every second. Position is
// only allowed to advance while a message arrived recently, so a dead or
// reloaded main window can never leave a track ticking in the float.
const LIVE_WINDOW_MS = 2_000;

function DesktopVolumeControl({
  volume,
  muted,
  onChange,
  onToggle,
}: {
  volume: number;
  muted: boolean;
  onChange: (value: number) => void;
  onToggle: () => void;
}) {
  const effective = muted ? 0 : volume;
  const Icon =
    effective === 0
      ? VolumeX
      : effective < 0.34
        ? Volume
        : effective < 0.7
          ? Volume1
          : Volume2;

  return (
    <div className="group/volume flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="icon-btn h-8 w-8"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        <Icon size={16} />
      </button>
      <span className="grid overflow-hidden transition-[grid-template-columns,opacity] duration-300 ease-spring grid-cols-[0fr] opacity-0 group-hover/volume:grid-cols-[1fr] group-hover/volume:opacity-100 group-focus-within/volume:grid-cols-[1fr] group-focus-within/volume:opacity-100">
        <span className="min-w-0 overflow-hidden">
          <LiquidSlider
            value={effective}
            max={1}
            step={0.01}
            onChange={onChange}
            ariaLabel="Spotify volume"
            className="w-[52px] xl:w-[68px]"
          />
        </span>
      </span>
    </div>
  );
}

function FloatFrame({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  const drag = useCardDrag();
  return (
    <div
      className="liquid-raised grain relative flex w-[372px] cursor-grab select-none flex-col items-center gap-3 rounded-[22px] p-5 text-center shadow-[0_36px_90px_-30px_rgba(0,0,0,0.95)] active:cursor-grabbing"
      style={{ backgroundColor: "#070a0b" }}
      data-testid={testId}
      {...drag}
    >
      {children}
    </div>
  );
}

// The whole card is the drag surface, except controls. Renderer-driven window
// movement means no `-webkit-app-region` exists to swallow button clicks.
function useCardDrag() {
  const draggingRef = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "button, a, input, [role='slider'], [role='button'], [data-no-drag]",
      )
    ) {
      return;
    }
    if (!window.hermesDesktop?.dragFloatingStart) return;
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    window.hermesDesktop.dragFloatingStart(event.screenX, event.screenY);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    window.hermesDesktop?.dragFloatingMove?.(event.screenX, event.screenY);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    window.hermesDesktop?.dragFloatingEnd?.();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released.
    }
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}

export function DesktopFloatingPlayer() {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [state, setState] = useState<DesktopFloatingState | null>(null);
  const [connected, setConnected] = useState(false);
  const [live, setLive] = useState(false);
  const [position, setPosition] = useState(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastMessageAtRef = useRef(0);
  const positionRef = useRef(0);
  const trackIdRef = useRef<string | null>(null);
  const palette = useArtworkPalette(
    state?.current?.imageUrl ?? undefined,
    spotifyFallbackPalette,
  );
  const drag = useCardDrag();

  useEffect(() => {
    setDesktop(Boolean(window.hermesDesktop?.isDesktop));
  }, []);

  useEffect(() => {
    if (!desktop) return;
    const channel = createFloatingChannel();
    if (!channel) return;
    channelRef.current = channel;

    const applyState = (next: DesktopFloatingState) => {
      const trackChanged = (next.current?.id ?? null) !== trackIdRef.current;
      trackIdRef.current = next.current?.id ?? null;

      let nextPosition = next.positionMs;
      if (!trackChanged && next.isPlaying) {
        const drift = positionRef.current - next.positionMs;
        // Let the local ticker run between heartbeats unless it drifted off.
        if (drift <= 1_500 && drift >= -250) nextPosition = positionRef.current;
      }
      positionRef.current = nextPosition;
      setPosition(nextPosition);
      setState(next);
      lastMessageAtRef.current = Date.now();
      setConnected(true);
      setLive(true);
    };

    const onMessage = (event: MessageEvent<DesktopFloatingMessage>) => {
      const message = event.data;
      if (message?.type !== "state") return;
      applyState(message.state);
    };

    channel.addEventListener("message", onMessage);
    channel.postMessage({ type: "command", action: "request-state" });

    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    const timer = window.setInterval(() => {
      const age = Date.now() - lastMessageAtRef.current;
      const isLive = age <= LIVE_WINDOW_MS;
      const isConnected = age <= DESKTOP_FLOATING_STALE_MS;
      setLive(isLive);
      setConnected(isConnected);
      if (!isConnected) {
        channelRef.current?.postMessage({
          type: "command",
          action: "request-state",
        });
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [desktop]);

  useEffect(() => {
    if (!live || !state?.isPlaying) return;
    const timer = window.setInterval(() => {
      setPosition((current) => {
        const next =
          state.durationMs > 0
            ? Math.min(state.durationMs, current + 200)
            : current + 200;
        positionRef.current = next;
        return next;
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, [live, state?.durationMs, state?.isPlaying]);

  const send = (message: DesktopFloatingCommand) => {
    channelRef.current?.postMessage(message);
  };

  const closeFloat = () => {
    if (window.hermesDesktop?.closeFloating) {
      void window.hermesDesktop.closeFloating();
      return;
    }
    window.close();
  };

  const focusMain = () => {
    void window.hermesDesktop?.focusMain?.();
  };

  const expand = () => {
    if (!connected) {
      focusMain();
      return;
    }
    send({ type: "command", action: "expand" });
    closeFloat();
  };

  const dock = () => {
    send({ type: "command", action: "dock" });
    closeFloat();
  };

  if (desktop === null) {
    return <FloatFrame>{null}</FloatFrame>;
  }

  if (!desktop) {
    return (
      <FloatFrame testId="desktop-floating-requires-desktop">
        <p className="text-[13px] font-medium text-white/85">
          This player runs in the Hermes desktop app
        </p>
        <p className="text-[11px] text-[var(--text-mute)]">
          Open Hermes from the desktop launcher to float the player over other
          apps.
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="btn h-8 px-3 text-[11px]"
        >
          Close
        </button>
      </FloatFrame>
    );
  }

  const current = state?.current ?? null;
  const needsReconnect = !connected || !state;
  const safeDuration = Math.max(
    1,
    state?.durationMs || current?.durationMs || 0,
  );
  const progress = Math.min(position, safeDuration);

  return (
    <div
      className="liquid-raised grain relative w-[372px] cursor-grab select-none overflow-hidden rounded-[22px] p-3 shadow-[0_36px_90px_-30px_rgba(0,0,0,0.95)] animate-scale-in active:cursor-grabbing"
      style={{
        ...paletteStyle(palette),
        backgroundColor: "#070a0b",
      }}
      data-testid="desktop-floating-player"
      data-connected={connected ? "true" : "false"}
      data-live={live ? "true" : "false"}
      {...drag}
    >
      <div
        className="desktop-float-grip -mx-3 -mt-3 mb-1 flex h-3.5 items-center justify-center rounded-t-[22px]"
        aria-hidden
      >
        <span className="h-1 w-8 rounded-full bg-white/10" />
      </div>
      <div
        className="pointer-events-none absolute -left-10 -top-14 h-36 w-36 rounded-full opacity-30 blur-3xl"
        style={{ background: palette.a }}
        aria-hidden
      />

      {!current || needsReconnect ? (
        <div
          className="relative flex flex-col items-center gap-2.5 py-1.5 text-center"
          data-testid="desktop-floating-waiting"
        >
          <p className="text-[13px] font-medium text-white/85">
            {needsReconnect ? "Hermes is not connected" : "Waiting for playback"}
          </p>
          <p className="max-w-[280px] text-[11px] leading-relaxed text-[var(--text-mute)]">
            {needsReconnect
              ? "Open the Hermes window and start a song; this player follows it."
              : "Start a song in Hermes and it appears here."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={focusMain}
              className="btn h-8 px-3 text-[11px]"
            >
              Open Hermes
            </button>
            <button
              type="button"
              onClick={closeFloat}
              className="btn h-8 px-3 text-[11px]"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative flex items-start gap-2.5">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <button
                type="button"
                onClick={expand}
                className="artwork-shell player-artwork h-[52px] w-[52px] shrink-0 rounded-xl"
                aria-label="Open full player"
              >
                <ArtworkImage
                  artwork={{
                    src: current.imageUrl ?? "",
                    alt: current.albumName || current.name,
                    palette,
                  }}
                  alt=""
                  loading="eager"
                />
              </button>

              <div className="min-w-0 flex-1 py-0.5">
                <button
                  type="button"
                  onClick={expand}
                  className="block min-h-6 max-w-full truncate py-0.5 text-left text-[12.5px] font-semibold tracking-tight text-white hover:underline underline-offset-4 decoration-white/30"
                >
                  {current.name}
                </button>
                <p className="mt-0.5 truncate text-[10.5px] text-[var(--text-mute)]">
                  {current.artists}
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[9px] tabular-nums text-white/35">
                  <span>{formatTime(Math.round(progress / 1000))}</span>
                  <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-[var(--acid)] transition-[width] duration-200"
                      style={{ width: `${(progress / safeDuration) * 100}%` }}
                    />
                  </span>
                  <span>
                    -
                    {formatTime(
                      Math.max(
                        0,
                        Math.round((safeDuration - progress) / 1000),
                      ),
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="desktop-float-no-drag flex shrink-0 items-center gap-0.5">
              <DesktopVolumeControl
                volume={state?.volume ?? 0.8}
                muted={state?.muted ?? false}
                onChange={(value) =>
                  send({ type: "command", action: "volume", value })
                }
                onToggle={() => send({ type: "command", action: "mute" })}
              />
              <button
                type="button"
                onClick={closeFloat}
                className="icon-btn h-7 w-7"
                aria-label="Close floating window"
              >
                <PictureInPicture2 size={13} />
              </button>
              <button
                type="button"
                onClick={expand}
                className="icon-btn h-7 w-7"
                aria-label="Open full player"
              >
                <Maximize2 size={14} />
              </button>
              <button
                type="button"
                onClick={dock}
                className="icon-btn h-7 w-7"
                aria-label="Dock player"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </div>

          <div className="desktop-float-no-drag mt-1 flex items-center justify-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => send({ type: "command", action: "previous" })}
                className="icon-btn h-8 w-8"
                aria-label="Previous track"
              >
                <SkipBack size={14} fill="currentColor" />
              </button>
              <SiriPlayButton
                size="compact"
                playing={state?.isPlaying ?? false}
                level={state?.muted ? 0 : (state?.volume ?? 0)}
                trackId={current.id}
                onToggle={() => send({ type: "command", action: "toggle" })}
              />
              <button
                type="button"
                onClick={() => send({ type: "command", action: "next" })}
                className="icon-btn h-8 w-8"
                aria-label="Next track"
              >
                <SkipForward size={14} fill="currentColor" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
