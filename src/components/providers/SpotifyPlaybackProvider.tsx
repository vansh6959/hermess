"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { toast } from "@/store/toast";
import { recordSpotifyHistory } from "@/lib/spotify/history";
import {
  addListeningTime,
  flushListeningStats,
  measureListeningDelta,
  recordListeningStart,
} from "@/lib/spotify/stats";
import type { ListeningClock } from "@/lib/spotify/stats";
import {
  advanceScrobbleSession,
  createScrobbleSession,
  type ScrobbleSession,
} from "@/lib/scrobble/engine";
import { recordScrobble } from "@/lib/scrobble/ledger";
import {
  buildDisplayQueue,
  mergeContextTail,
  removeManualOccurrences,
  resolveQueueIndex,
} from "@/lib/spotify/queue-order";
import { nextQueueFromSdk } from "@/lib/spotify/sdk-queue";
import {
  createFloatingChannel,
  isDesktopShell,
  type DesktopFloatingMessage,
  type DesktopFloatingState,
} from "@/lib/desktop/floating";
import {
  currentHistoryEntry,
  emptyPlaybackHistory,
  isSamePlaybackTrack,
  playbackTrackKey,
  recordConfirmedPlayback,
  truncateForwardHistory,
  type PlaybackHistoryState,
} from "@/lib/spotify/playback-history";
import {
  PREVIOUS_RESTART_THRESHOLD_MS,
  buildHistoryFallbackUris,
  mergeForwardHistory,
  planNextNavigation,
  planPreviousNavigation,
} from "@/lib/spotify/playback-navigation";
import { LiquidDialog } from "@/components/ui/LiquidDialog";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { extractArtworkPalette } from "@/lib/palette";
import { blurredArtworkUrl } from "@/lib/spotify/artwork-backdrop";
import { spotifyFallbackPalette } from "@/lib/spotify/artwork";
import type {
  SpotifyNowPlaying,
  SpotifyPlaybackPrompt,
  SpotifyPlayRequest,
  SpotifySession,
} from "@/lib/spotify/playback-types";

type SessionStatus = "loading" | "ready";
type PlayerStatus = "idle" | "connecting" | "ready" | "error";
export type SpotifyPlayerView = "dock" | "full" | "floating";

interface PlaybackState {
  session: SpotifySession | null;
  sessionStatus: SessionStatus;
  playerStatus: PlayerStatus;
  current: SpotifyNowPlaying | null;
  active: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  error: string | null;
  view: SpotifyPlayerView;
  floatingPosition: { x: number; y: number } | null;
  queue: SpotifyNowPlaying[];
  queueIndex: number;
  manualQueue: SpotifyNowPlaying[];
  contextName: string | null;
  shuffle: boolean;
  shuffleAvailable: boolean;
  shuffleBusy: boolean;
  volume: number;
  muted: boolean;
}

interface PlaybackActions {
  requestPlay: (request: SpotifyPlayRequest) => void;
  playFromQueue: (index: number) => void;
  queueTrack: (track: SpotifyNowPlaying) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  openFullPlayer: () => void;
  minimizePlayer: () => void;
  dockPlayer: () => void;
  closeFullPlayer: () => void;
  setFloatingPosition: (position: { x: number; y: number }) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  closePlayer: () => void;
  disconnect: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const StateContext = createContext<PlaybackState | null>(null);
const ActionsContext = createContext<PlaybackActions | null>(null);
const PlaybackActiveContext = createContext<boolean | null>(null);
const NowPlayingMetaContext = createContext<{
  trackId: string | null;
  isPlaying: boolean;
} | null>(null);
const SessionContext = createContext<{
  session: SpotifySession | null;
  sessionStatus: SessionStatus;
} | null>(null);

let sdkPromise: Promise<NonNullable<Window["Spotify"]>> | null = null;

function loadSpotifySdk(): Promise<NonNullable<Window["Spotify"]>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Playback is browser-only."));
  }
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      sdkPromise = null;
      document
        .querySelector('script[data-hermes-spotify-sdk="true"]')
        ?.remove();
      reject(new Error("Player timed out."));
    }, 15_000);

    window.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timer);
      if (window.Spotify) resolve(window.Spotify);
      else {
        sdkPromise = null;
        reject(new Error("Player did not initialise."));
      }
    };

    if (!document.querySelector('script[data-hermes-spotify-sdk="true"]')) {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.dataset.hermesSpotifySdk = "true";
      script.onerror = () => {
        window.clearTimeout(timer);
        sdkPromise = null;
        script.remove();
        reject(new Error("Player could not be loaded."));
      };
      document.body.appendChild(script);
    }
  });

  return sdkPromise;
}

function messageForPlaybackFailure(status: number): string {
  if (status === 401) return "Your session expired. Reconnect your account.";
  if (status === 403) return "A premium account is required for in-app playback.";
  if (status === 404) return "No active player device was found.";
  if (status === 429) return "Playback rate limit reached. Try again shortly.";
  return "Playback could not start.";
}

let drmSupport: Promise<boolean> | null = null;

// Spotify's Web Playback SDK decodes DRM-protected audio through Widevine.
// Stock Electron ships no CDM, so the SDK connects and then plays nothing.
// Check before initialising so the desktop shell reports that instead of
// leaving a silent player at 0:00.
function supportsDrmPlayback(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.requestMediaKeySystemAccess) {
    return Promise.resolve(false);
  }
  if (drmSupport) return drmSupport;
  drmSupport = navigator
    .requestMediaKeySystemAccess("com.widevine.alpha", [
      {
        initDataTypes: ["cenc"],
        audioCapabilities: [
          { contentType: 'audio/mp4; codecs="mp4a.40.2"' },
        ],
      },
    ])
    .then(
      () => true,
      () => false,
    );
  return drmSupport;
}

function resolvePlayStart(request: SpotifyPlayRequest): {
  nextQueue: SpotifyNowPlaying[];
  initialIndex: number;
  startTrack: SpotifyNowPlaying;
} {
  const nextQueue = request.queue?.length ? request.queue : [request.track];
  const requestedIndex = request.queueIndex ?? 0;
  const initialIndex = Math.min(
    Math.max(0, requestedIndex),
    Math.max(0, nextQueue.length - 1),
  );
  return {
    nextQueue,
    initialIndex,
    startTrack: nextQueue[initialIndex] ?? request.track,
  };
}

function nowPlayingFromSdk(
  track: SpotifySdkTrack,
  durationMs: number,
): SpotifyNowPlaying | null {
  if (!track?.id) return null;
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists:
      (track.artists ?? [])
        .map((artist) => artist.name)
        .filter(Boolean)
        .join(", ") || "",
    albumName: track.album?.name ?? track.show?.name ?? "",
    imageUrl:
      track.album?.images?.[0]?.url ??
      track.show?.images?.[0]?.url ??
      null,
    durationMs: durationMs || 0,
    spotifyUrl: track.uri?.includes(":episode:")
      ? `https://open.spotify.com/episode/${track.id}`
      : `https://open.spotify.com/track/${track.id}`,
  };
}

const NAVIGATION_CONFIRM_TIMEOUT_MS = 1_500;
// A fallback play has to fetch a new DRM licence and swap the SDK track. The
// device often reports the new track a little after the native skip window.
const FALLBACK_CONFIRM_TIMEOUT_MS = 3_500;
// Spotify's Widevine license endpoint occasionally answers the first request
// with a 500 (CDM provisioning/latency), which pauses playback at 0:00. These
// backoff delays resume automatically instead of making the listener press
// play repeatedly.
const PLAY_RETRY_DELAYS = [700, 1_500, 2_800, 4_500, 6_500];

export function SpotifyPlaybackProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SpotifySession | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("loading");
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");
  const [current, setCurrent] = useState<SpotifyNowPlaying | null>(null);
  const [active, setActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<SpotifyPlaybackPrompt | null>(null);
  const [view, setView] = useState<SpotifyPlayerView>("dock");
  const viewBeforeFullRef = useRef<SpotifyPlayerView>("dock");
  const [floatingPosition, setFloatingPositionState] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [queue, setQueue] = useState<SpotifyNowPlaying[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [manualQueue, setManualQueue] = useState<SpotifyNowPlaying[]>([]);
  const [contextName, setContextName] = useState<string | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [shuffleAvailable, setShuffleAvailable] = useState(false);
  const [shuffleBusy, setShuffleBusy] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const volumeRef = useRef(0.8);
  const mutedRef = useRef(false);
  const queueRef = useRef<SpotifyNowPlaying[]>([]);
  const queueIndexRef = useRef(0);
  const queueAddChainRef = useRef<Promise<void>>(Promise.resolve());
  const knownTracksRef = useRef(new Map<string, SpotifyNowPlaying>());
  const manualQueueRef = useRef<SpotifyNowPlaying[]>([]);
  const contextQueueRef = useRef<SpotifyNowPlaying[]>([]);
  const contextNameRef = useRef<string | null>(null);
  const currentTrackRef = useRef<SpotifyNowPlaying | null>(null);
  const historyRef = useRef<PlaybackHistoryState>(emptyPlaybackHistory());
  const navigationRef = useRef<{
    token: number;
    targetKey: string;
    targetTrack: SpotifyNowPlaying;
    targetIndex: number | null;
    direction: "back" | "forward";
    previousKey: string | null;
  } | null>(null);
  const navigationWaiterRef = useRef<{
    resolve: (matched: boolean) => void;
    timer: number;
  } | null>(null);
  const pendingSelectionRef = useRef<string | null>(null);
  const selectionWaiterRef = useRef<{
    resolve: (settled: boolean) => void;
    timer: number;
  } | null>(null);
  const navigationTokenRef = useRef(0);
  const navigationBusyRef = useRef(false);
  const shuffleModeRef = useRef(false);
  const shuffleBusyRef = useRef(false);
  const shuffleChangedAtRef = useRef(0);
  const positionRef = useRef(0);
  const positionSampledAtRef = useRef(Date.now());
  const playingRef = useRef(false);
  const playIntentRef = useRef<{
    at: number;
    attempts: number;
    timer: number | null;
  } | null>(null);
  const handleStateRef = useRef<(state: SpotifySdkPlayerState) => void>(
    () => {},
  );
  const floatingChannelRef = useRef<BroadcastChannel | null>(null);
  const floatingStateRef = useRef<DesktopFloatingState>({
    current: null,
    active: false,
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
    volume: 0.8,
    muted: false,
  });
  const floatingCommandsRef = useRef<{
    togglePlay: () => Promise<void>;
    next: () => Promise<void>;
    previous: () => Promise<void>;
    toggleMute: () => void;
    setVolume: (value: number) => void;
    openFullPlayer: () => void;
    dockPlayer: () => void;
  } | null>(null);
  const scrobbleSessionRef = useRef<ScrobbleSession | null>(null);
  const tokenRef = useRef<{ value: string; expiresAt: number } | null>(null);
  const tokenPromiseRef = useRef<Promise<string> | null>(null);

  const sessionRef = useRef<SpotifySession | null>(null);
  const playerRef = useRef<SpotifySdkPlayer | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const pendingRef = useRef<SpotifyPlayRequest | null>(null);
  const playerInitRef = useRef(false);
  const listeningClockRef = useRef<ListeningClock | null>(null);

  const refreshSession = useCallback(async () => {
    setSessionStatus("loading");
    try {
      const response = await fetch("/api/spotify/session", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Session unavailable");
      const payload = (await response.json()) as SpotifySession;
      setSession(payload);
      sessionRef.current = payload;
    } catch {
      const fallback: SpotifySession = {
        configured: false,
        connected: false,
        profile: null,
      };
      setSession(fallback);
      sessionRef.current = fallback;
    } finally {
      setSessionStatus("ready");
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("spotify");
    if (!status) return;

    const notices: Record<string, { message: string; tone?: "success" | "error" }> = {
      connected: { message: "Account connected.", tone: "success" },
      free: {
        message: "Account connected. Premium is required for in-app playback.",
      },
      denied: { message: "Connection cancelled." },
      auth_failed: { message: "Connection failed. Try again.", tone: "error" },
      state_error: { message: "Connection expired. Try again.", tone: "error" },
      missing_code: { message: "Connection failed. Try again.", tone: "error" },
      not_configured: { message: "Playback is not configured on the server.", tone: "error" },
    };

    const notice = notices[status];
    if (notice) toast(notice.message, notice.tone);
    params.delete("spotify");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, []);

  const fetchAccessToken = useCallback(
    async (force = false, silent = false): Promise<string> => {
      if (
        !force &&
        tokenRef.current &&
        tokenRef.current.expiresAt > Date.now() + 30_000
      ) {
        return tokenRef.current.value;
      }
      if (!force && tokenPromiseRef.current) {
        return tokenPromiseRef.current;
      }

      const request = (async () => {
        const response = await fetch(
          `/api/spotify/token${force ? "?refresh=1" : ""}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          if (response.status === 401) {
            tokenRef.current = null;
            if (!silent) {
              setError("Your session expired. Reconnect your account.");
              setPrompt({ kind: "connect" });
            }
            void refreshSession();
          }
          throw new Error("Access token unavailable.");
        }
        const payload = (await response.json()) as {
          accessToken?: string;
          expiresAt?: number;
        };
        if (!payload.accessToken) {
          throw new Error("Access token unavailable.");
        }
        tokenRef.current = {
          value: payload.accessToken,
          expiresAt: payload.expiresAt ?? Date.now() + 5 * 60_000,
        };
        return payload.accessToken;
      })();

      if (!force) tokenPromiseRef.current = request;
      try {
        return await request;
      } finally {
        if (tokenPromiseRef.current === request) {
          tokenPromiseRef.current = null;
        }
      }
    },
    [refreshSession],
  );

  const syncPlayerPreferences = useCallback(async () => {
    try {
      const token = await fetchAccessToken(false, true);
      const response = await fetch("https://api.spotify.com/v1/me/player", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok || response.status === 204) return;
      const body = (await response.json().catch(() => null)) as {
        shuffle_state?: boolean;
      } | null;
      if (!body || typeof body.shuffle_state !== "boolean") return;
      // Do not undo a toggle that is still in flight or just landed.
      if (Date.now() - shuffleChangedAtRef.current < 1_500) return;
      if (body.shuffle_state !== shuffleModeRef.current) {
        shuffleModeRef.current = body.shuffle_state;
        setShuffle(body.shuffle_state);
      }
    } catch {
      // Preferences are best-effort; the SDK queue remains authoritative.
    }
  }, [fetchAccessToken]);

  const queuePosition = useCallback((index: number) => {
    queueIndexRef.current = index;
    setQueueIndex(index);
  }, []);

  const applyDisplayQueue = useCallback(
    (
      current: SpotifyNowPlaying | null,
      manual: readonly SpotifyNowPlaying[],
      contextUpcoming: readonly SpotifyNowPlaying[],
    ) => {
      const previousManual = manualQueueRef.current;
      manualQueueRef.current = [...manual];
      contextQueueRef.current = [...contextUpcoming];
      const display = buildDisplayQueue({
        current,
        manual,
        contextUpcoming,
      });
      const sameQueue =
        queueRef.current.length === display.length &&
        queueRef.current.every(
          (item, index) => item.id === display[index]?.id,
        );
      queueRef.current = display;
      if (!sameQueue) setQueue(display);

      const sameManual =
        previousManual.length === manual.length &&
        manual.every((item, index) => item.id === previousManual[index]?.id);
      if (!sameManual) setManualQueue([...manual]);
      queuePosition(0);
    },
    [queuePosition],
  );

  const clearQueue = useCallback(() => {
    applyDisplayQueue(null, [], []);
    contextNameRef.current = null;
    setContextName(null);
  }, [applyDisplayQueue]);

  const resetShuffleState = useCallback(() => {
    shuffleModeRef.current = false;
    shuffleBusyRef.current = false;
    setShuffle(false);
    setShuffleAvailable(false);
    setShuffleBusy(false);
  }, []);

  const discardNavigationWaiter = useCallback(() => {
    const waiter = navigationWaiterRef.current;
    if (!waiter) return;
    navigationWaiterRef.current = null;
    window.clearTimeout(waiter.timer);
    waiter.resolve(false);
  }, []);

  const settleSelectionWaiter = useCallback((settled: boolean) => {
    const waiter = selectionWaiterRef.current;
    if (!waiter) return;
    selectionWaiterRef.current = null;
    window.clearTimeout(waiter.timer);
    waiter.resolve(settled);
  }, []);

  const waitForSelectionSettled = useCallback(
    (timeout = 1_200) => {
      if (!pendingSelectionRef.current) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => {
          if (selectionWaiterRef.current?.timer !== timer) return;
          selectionWaiterRef.current = null;
          resolve(false);
        }, timeout);
        selectionWaiterRef.current = { resolve, timer };
      });
    },
    [],
  );

  const cancelNavigation = useCallback(() => {
    navigationTokenRef.current += 1;
    navigationRef.current = null;
    navigationBusyRef.current = false;
    pendingSelectionRef.current = null;
    settleSelectionWaiter(false);
    discardNavigationWaiter();
  }, [discardNavigationWaiter, settleSelectionWaiter]);

  const resetPlaybackHistory = useCallback(() => {
    historyRef.current = emptyPlaybackHistory();
    cancelNavigation();
  }, [cancelNavigation]);

  const clearPlayIntent = useCallback(() => {
    const intent = playIntentRef.current;
    if (intent?.timer) window.clearTimeout(intent.timer);
    playIntentRef.current = null;
  }, []);

  const beginPlayIntent = useCallback(() => {
    clearPlayIntent();
    playIntentRef.current = { at: Date.now(), attempts: 0, timer: null };
  }, [clearPlayIntent]);

  const schedulePlayRetry = useCallback(() => {
    const intent = playIntentRef.current;
    if (!intent || intent.timer) return;
    if (intent.attempts >= PLAY_RETRY_DELAYS.length) {
      clearPlayIntent();
      return;
    }
    const delay = PLAY_RETRY_DELAYS[intent.attempts];
    const timer = window.setTimeout(async () => {
      if (playIntentRef.current !== intent || intent.timer !== timer) return;
      intent.timer = null;
      intent.attempts += 1;
      try {
        await playerRef.current?.resume();
      } catch {
        // The next state snapshot decides whether another retry is needed.
      }
      const state = await playerRef.current?.getCurrentState().catch(() => null);
      if (state) handleStateRef.current(state);
    }, delay);
    intent.timer = timer;
  }, [clearPlayIntent]);

  const handleState = useCallback((state: SpotifySdkPlayerState) => {
    if (!activeRef.current) return;
    const track = state.track_window.current_track;
    const nextTrack = nowPlayingFromSdk(track, state.duration);
    if (!nextTrack) return;
    knownTracksRef.current.set(nextTrack.id, nextTrack);

    const trackKey = playbackTrackKey(nextTrack);
    const navigation = navigationRef.current;
    if (navigation) {
      // Snapshots for the pre-navigation track can arrive after the request;
      // they must not be mistaken for a wrong pick or a new transition.
      if (trackKey === navigation.previousKey) return;
      if (
        trackKey !== navigation.targetKey &&
        !isSamePlaybackTrack(nextTrack, navigation.targetTrack)
      ) {
        // The device picked an unrelated track. Keep the confirmed UI and
        // history untouched; the executor replaces playback with the target.
        discardNavigationWaiter();
        return;
      }
      const targetIndex = navigation.targetIndex;
      const targetEntry =
        targetIndex === null ? null : historyRef.current.entries[targetIndex];
      if (
        targetIndex !== null &&
        targetEntry &&
        (targetEntry.key === trackKey ||
          isSamePlaybackTrack(targetEntry.track, nextTrack))
      ) {
        // The library can hold a different Spotify release of the same
        // recording than the device reports. Keep the actual track in history
        // so later Previous/Next runs compare like with like.
        historyRef.current = {
          entries: historyRef.current.entries.map((entry, index) =>
            index === targetIndex
              ? { key: trackKey, track: nextTrack }
              : entry,
          ),
          cursor: targetIndex,
        };
      } else {
        // A user-initiated skip is a forward play even when the target repeats
        // the immediately previous track; never turn it into a step back.
        historyRef.current = recordConfirmedPlayback(
          historyRef.current,
          nextTrack,
          "manual",
        ).state;
      }
      const waiter = navigationWaiterRef.current;
      if (waiter) {
        navigationWaiterRef.current = null;
        window.clearTimeout(waiter.timer);
        waiter.resolve(true);
      }
    } else {
      const manual = pendingSelectionRef.current === trackKey;
      if (manual) {
        pendingSelectionRef.current = null;
        settleSelectionWaiter(true);
      }
      historyRef.current = recordConfirmedPlayback(
        historyRef.current,
        nextTrack,
        manual ? "manual" : "auto",
      ).state;
    }

    playingRef.current = !state.paused;
    positionRef.current = Math.max(0, state.position);
    positionSampledAtRef.current = Date.now();
    setIsPlaying(!state.paused);
    setPositionMs(Math.max(0, state.position));
    setDurationMs(Math.max(0, state.duration));

    if (!state.paused) {
      // A resume can briefly report "playing" before the license failure
      // pauses it again, so only a stable position confirms the intent.
      if (playIntentRef.current && state.position >= 2_000) {
        clearPlayIntent();
      }
    } else if (
      playIntentRef.current &&
      state.position < 1_500 &&
      Date.now() - playIntentRef.current.at < 20_000
    ) {
      schedulePlayRetry();
    }
    currentTrackRef.current = nextTrack;

    const now = Date.now();
    const delta = measureListeningDelta(
      listeningClockRef.current,
      nextTrack.id,
      state.position,
      state.paused,
      now,
    );
    if (delta > 0) addListeningTime(nextTrack, delta, now);
    listeningClockRef.current = {
      trackId: nextTrack.id,
      positionMs: Math.max(0, state.position),
      at: now,
    };

    if (!nextTrack.spotifyUrl.includes("/episode/")) {
      if (!state.paused) {
        const session = scrobbleSessionRef.current;
        if (!session || session.trackId !== nextTrack.id) {
          scrobbleSessionRef.current = createScrobbleSession(
            nextTrack,
            now - Math.max(0, state.position),
          );
        } else if (delta > 0) {
          const advanced = advanceScrobbleSession(session, delta, nextTrack);
          scrobbleSessionRef.current = advanced.session;
          if (advanced.due) recordScrobble(advanced.due);
        }
      } else if (scrobbleSessionRef.current?.trackId !== nextTrack.id) {
        scrobbleSessionRef.current = null;
      }
    }

    setCurrent((previous) => ({
      ...nextTrack,
      albumName:
        track.album?.name ?? track.show?.name ?? previous?.albumName ?? "",
      imageUrl: nextTrack.imageUrl ?? previous?.imageUrl ?? null,
      durationMs: state.duration || previous?.durationMs || 0,
    }));

    // Consume only the head manual entry so an identical context copy later in
    // the list stays. Pass the result to applyDisplayQueue rather than mutating
    // the ref here, so the React state sees the change too.
    const manual =
      manualQueueRef.current[0]?.id === nextTrack.id
        ? manualQueueRef.current.slice(1)
        : manualQueueRef.current;
    const sdkNext = state.track_window.next_tracks;
    if (sdkNext) {
      // Manual additions always sit in front of the context. The SDK's
      // next_tracks already carries both; remove the manual copies, merge the
      // confirmed forward history, and expose the rest as "Next from".
      const syncedQueue = nextQueueFromSdk({
        current: nextTrack,
        sdkNext,
        knownTracks: knownTracksRef.current,
      });
      const sdkContext = removeManualOccurrences(
        syncedQueue.slice(1),
        manual,
      );
      const contextUpcoming = mergeContextTail({
        previousContext: contextQueueRef.current,
        sdkContext,
        current: nextTrack,
        shuffled: shuffleModeRef.current,
      });
      const orderedUpcoming = mergeForwardHistory({
        history: historyRef.current,
        upcoming: contextUpcoming,
      });
      for (const item of orderedUpcoming) {
        knownTracksRef.current.set(item.id, item);
      }
      applyDisplayQueue(nextTrack, manual, orderedUpcoming);
    } else {
      const index = resolveQueueIndex(
        queueRef.current,
        nextTrack.id,
        queueIndexRef.current,
      );
      if (index >= 0) {
        applyDisplayQueue(nextTrack, manual, contextQueueRef.current);
      }
    }
  }, [
    applyDisplayQueue,
    clearPlayIntent,
    discardNavigationWaiter,
    schedulePlayRetry,
    settleSelectionWaiter,
  ]);

  handleStateRef.current = handleState;

  const initializePlayer = useCallback(
    async (warm = false) => {
      if (playerRef.current) return;
      setPlayerStatus("connecting");
      if (!warm) setError(null);

      const failInitialization = (
        message: string,
        failurePrompt: SpotifyPlaybackPrompt,
      ) => {
        const hadPending = pendingRef.current !== null;
        pendingRef.current = null;
        playerInitRef.current = false;
        deviceIdRef.current = null;
        clearPlayIntent();
        resetShuffleState();
        resetPlaybackHistory();
        clearQueue();
        currentTrackRef.current = null;
        scrobbleSessionRef.current = null;
        positionRef.current = 0;
        positionSampledAtRef.current = Date.now();
        playingRef.current = false;
        activeRef.current = false;
        setActive(false);
        setCurrent(null);
        setIsPlaying(false);
        setView("dock");
        try {
          playerRef.current?.disconnect();
        } catch {
          // The failed player is already unusable.
        }
        playerRef.current = null;

        if (warm && !hadPending) {
          setPlayerStatus("idle");
          setError(null);
          return;
        }
        setPlayerStatus("error");
        setError(message);
        setPrompt(failurePrompt);
      };

      try {
        if (isDesktopShell() && !(await supportsDrmPlayback())) {
          failInitialization(
            "Spotify audio needs Widevine, which this desktop build does not include. Play in Chrome or use the Widevine desktop build.",
            {
              kind: "error",
              message:
                "Spotify DRM audio is unavailable in this desktop window.",
            },
          );
          return;
        }

        const sdk = await loadSpotifySdk();
        const player = new sdk.Player({
          name: "Hermes Web Player",
          getOAuthToken: (callback) => {
            fetchAccessToken(false, warm)
              .then(callback)
              .catch(() => {
                tokenRef.current = null;
                failInitialization(
                  "Your session expired. Reconnect your account.",
                  { kind: "connect" },
                );
              });
          },
          volume: mutedRef.current ? 0 : volumeRef.current,
        });
        playerRef.current = player;

        player.addListener("ready", (payload) => {
          const data = payload as { device_id?: string };
          if (!data.device_id) return;
          deviceIdRef.current = data.device_id;
          setPlayerStatus("ready");
          void player
            .setVolume(mutedRef.current ? 0 : volumeRef.current)
            .catch(() => undefined);
          void syncPlayerPreferences();
        });

        player.addListener("not_ready", () => {
          deviceIdRef.current = null;
          clearPlayIntent();
          resetShuffleState();
          resetPlaybackHistory();
          clearQueue();
          currentTrackRef.current = null;
        scrobbleSessionRef.current = null;
          positionRef.current = 0;
          positionSampledAtRef.current = Date.now();
          playingRef.current = false;
          setPlayerStatus("idle");
          activeRef.current = false;
          setActive(false);
          setCurrent(null);
          setIsPlaying(false);
          setView("dock");
        });

        player.addListener("player_state_changed", (payload) => {
          if (payload) handleState(payload as SpotifySdkPlayerState);
        });

        player.addListener("authentication_error", () => {
          tokenRef.current = null;
          failInitialization(
            "Authentication failed. Reconnect your account.",
            { kind: "connect" },
          );
        });

        player.addListener("account_error", () => {
          failInitialization(
            "A premium account is required for in-app playback.",
            { kind: "premium" },
          );
        });

        player.addListener("initialization_error", () => {
          failInitialization("Playback is not supported in this browser.", {
            kind: "error",
            message: "Playback is not supported in this browser.",
          });
        });

        player.addListener("playback_error", () => {
          setError("Playback failed.");
        });

        const connected = await player.connect();
        if (!connected) {
          failInitialization("Player could not connect.", {
            kind: "error",
            message: "Player could not connect.",
          });
        }
      } catch (initError) {
        const message =
          initError instanceof Error
            ? initError.message
            : "Player could not start.";
        failInitialization(message, { kind: "error", message });
      }
    },
    [clearPlayIntent, clearQueue, fetchAccessToken, handleState, resetShuffleState, syncPlayerPreferences],
  );

  useEffect(() => {
    if (sessionStatus !== "ready") return;
    if (!session?.configured || !session.connected || !session.profile?.premium) {
      return;
    }
    if (playerRef.current || playerInitRef.current) return;

    const timer = window.setTimeout(() => {
      if (playerRef.current || playerInitRef.current) return;
      playerInitRef.current = true;
      void initializePlayer(true);
      void fetchAccessToken(false, true).catch(() => undefined);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchAccessToken, initializePlayer, session, sessionStatus]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    volumeRef.current = clamped;
    mutedRef.current = false;
    setVolumeState(clamped);
    setMuted(false);
    void playerRef.current?.setVolume(clamped).catch(() => undefined);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    void playerRef.current
      ?.setVolume(next ? 0 : volumeRef.current)
      .catch(() => undefined);
  }, []);

  const sendPlayRequest = useCallback(
    async (body: Record<string, unknown>, signal?: AbortSignal) => {
      const deviceId = deviceIdRef.current;
      if (!deviceId) throw new Error("No active player device was found.");
      const query = `device_id=${encodeURIComponent(deviceId)}`;
      const send = (token: string) =>
        fetch(`https://api.spotify.com/v1/me/player/play?${query}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal,
        });

      let token = await fetchAccessToken();
      let response = await send(token);
      if (response.status === 401) {
        token = await fetchAccessToken(true);
        response = await send(token);
      }
      if (response.status === 404) {
        await fetch("https://api.spotify.com/v1/me/player", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ device_ids: [deviceId], play: true }),
          signal,
        });
        response = await send(token);
      }
      return response;
    },
    [fetchAccessToken],
  );

  const applyNativeShuffle = useCallback(
    async (enabled: boolean) => {
      const deviceId = deviceIdRef.current;
      if (!deviceId) return false;
      const query = `state=${enabled}&device_id=${encodeURIComponent(deviceId)}`;
      const send = (token: string) =>
        fetch(`https://api.spotify.com/v1/me/player/shuffle?${query}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
        });
      try {
        let token = await fetchAccessToken();
        let response = await send(token);
        if (response.status === 401) {
          token = await fetchAccessToken(true);
          response = await send(token);
        }
        return response.ok;
      } catch {
        return false;
      }
    },
    [fetchAccessToken],
  );

  const beginPlayback = useCallback(
    (request: SpotifyPlayRequest) => {
      cancelNavigation();
      const { nextQueue, initialIndex, startTrack } = resolvePlayStart(request);
      currentTrackRef.current = startTrack;
      positionRef.current = 0;
      positionSampledAtRef.current = Date.now();
      playingRef.current = true;
      beginPlayIntent();
      scrobbleSessionRef.current = null;
      const manualQueue = request.manualQueue ?? [];
      knownTracksRef.current = new Map(
        [...nextQueue, ...manualQueue].map((item) => [item.id, item]),
      );
      contextNameRef.current = request.contextName ?? null;
      setContextName(request.contextName ?? null);
      if (request.shuffle) {
        shuffleModeRef.current = true;
        shuffleChangedAtRef.current = Date.now();
        setShuffle(true);
      }
      setShuffleAvailable(nextQueue.length > 1);
      const contextUpcoming = removeManualOccurrences(
        nextQueue.slice(initialIndex + 1),
        manualQueue,
      );
      applyDisplayQueue(startTrack, manualQueue, contextUpcoming);
      if (!activeRef.current) {
        resetPlaybackHistory();
        setView("dock");
      } else {
        // A new manual context invalidates any forward navigation.
        historyRef.current = truncateForwardHistory(historyRef.current);
      }
      const startKey = playbackTrackKey(startTrack);
      const confirmedKey =
        currentHistoryEntry(historyRef.current)?.key ?? null;
      pendingSelectionRef.current =
        confirmedKey === startKey ? null : startKey;
      setActive(true);
      activeRef.current = true;
      setCurrent(startTrack);
      setIsPlaying(true);
      setPositionMs(0);
      setDurationMs(startTrack.durationMs);
      setError(null);

      const local = usePlayerStore.getState();
      if (local.status === "playing") local.togglePlay();
    },
    [applyDisplayQueue, beginPlayIntent, cancelNavigation, resetPlaybackHistory],
  );

  const playNow = useCallback(
    async (request: SpotifyPlayRequest) => {
      const player = playerRef.current;
      const deviceId = deviceIdRef.current;
      if (!player || !deviceId) {
        setPrompt({
          kind: "error",
          message: "Player is still starting. Try again in a moment.",
        });
        return;
      }

      const body: Record<string, unknown> = {};
      if (request.contextUri) body.context_uri = request.contextUri;
      else {
        body.uris = request.uris ?? [];
        if (request.offset !== undefined) {
          body.offset = { position: request.offset };
        }
      }

      try {
        const response = await sendPlayRequest(body);

        if (!response.ok) {
          const message = messageForPlaybackFailure(response.status);
          if (response.status === 403) setPrompt({ kind: "premium" });
          else if (response.status === 401) setPrompt({ kind: "connect" });
          else setPrompt({ kind: "error", message });
          throw new Error(message);
        }

        // Keep Spotify's own shuffle state aligned with the button. This is
        // background housekeeping; it never blocks or rebuilds playback.
        void applyNativeShuffle(
          Boolean(request.shuffle) || shuffleModeRef.current,
        );

        // Confirm the selection immediately when the device already reflects
        // it. A stale device snapshot must not undo the optimistic UI.
        const pendingKey = pendingSelectionRef.current;
        const confirmed = await player.getCurrentState().catch(() => null);
        if (confirmed) {
          const confirmedTrack = nowPlayingFromSdk(
            confirmed.track_window.current_track,
            confirmed.duration,
          );
          if (
            !pendingKey ||
            (confirmedTrack &&
              playbackTrackKey(confirmedTrack) === pendingKey)
          ) {
            handleState(confirmed);
          }
        }
        window.setTimeout(async () => {
          const state = await player.getCurrentState();
          if (state) handleState(state);
        }, 450);
        window.setTimeout(() => void syncPlayerPreferences(), 900);
      } catch (playbackError) {
        clearPlayIntent();
        resetShuffleState();
        resetPlaybackHistory();
        clearQueue();
        currentTrackRef.current = null;
        scrobbleSessionRef.current = null;
        positionRef.current = 0;
        positionSampledAtRef.current = Date.now();
        playingRef.current = false;
        activeRef.current = false;
        setActive(false);
        setCurrent(null);
        setIsPlaying(false);
        setPositionMs(0);
        setDurationMs(0);
        setView("dock");
        const message =
          playbackError instanceof Error
            ? playbackError.message
            : "Playback failed.";
        setError(message);
        toast(message, "error");
      }
    },
    [
      applyNativeShuffle,
      clearPlayIntent,
      clearQueue,
      handleState,
      resetShuffleState,
      sendPlayRequest,
    ],
  );

  const dispatchPlayback = useCallback(
    (request: SpotifyPlayRequest) => {
      if (sessionStatus === "loading") {
        pendingRef.current = request;
        return;
      }

      const activeSession = session;
      if (!activeSession?.configured) {
        pendingRef.current = null;
        setPrompt({ kind: "not_configured" });
        return;
      }
      if (!activeSession.connected) {
        pendingRef.current = null;
        setPrompt({ kind: "connect" });
        return;
      }
      if (!activeSession.profile?.premium) {
        pendingRef.current = null;
        setPrompt({ kind: "premium" });
        return;
      }
      if (playerStatus === "error") {
        pendingRef.current = null;
        setPrompt({
          kind: "error",
          message: error ?? "Playback is unavailable.",
        });
        return;
      }

      if (request.track?.imageUrl) {
        void extractArtworkPalette(
          request.track.imageUrl,
          spotifyFallbackPalette,
        );
      }

      beginPlayback(request);

      if (playerStatus !== "ready") {
        pendingRef.current = request;
        if (!playerInitRef.current) {
          playerInitRef.current = true;
          void initializePlayer();
        }
        return;
      }

      pendingRef.current = null;
      void playNow(request);
    },
    [
      beginPlayback,
      error,
      initializePlayer,
      playNow,
      playerStatus,
      session,
      sessionStatus,
    ],
  );

  useEffect(() => {
    if (!current) return;
    recordSpotifyHistory(current);
    recordListeningStart(current);
  }, [current?.id]);

  // Warming on every route means opening the full player never shows the
  // neutral fallback before the cover palette resolves.
  useEffect(() => {
    if (!current?.imageUrl) return;
    void extractArtworkPalette(current.imageUrl, spotifyFallbackPalette);
    void blurredArtworkUrl(current.imageUrl);
  }, [current?.imageUrl]);

  // Skip should land on a settled backdrop, so decode the next cover early
  // instead of during the palette crossfade.
  useEffect(() => {
    const upcoming = queue[queueIndex + 1];
    if (!upcoming?.imageUrl || upcoming.imageUrl === current?.imageUrl) return;
    void extractArtworkPalette(upcoming.imageUrl, spotifyFallbackPalette);
    void blurredArtworkUrl(upcoming.imageUrl);
  }, [queue, queueIndex, current?.imageUrl]);

  useEffect(() => {
    if (playerStatus === "ready" && pendingRef.current) {
      const pending = pendingRef.current;
      pendingRef.current = null;
      void playNow(pending);
    }
  }, [playerStatus, playNow]);

  useEffect(() => {
    if (sessionStatus === "ready" && pendingRef.current) {
      dispatchPlayback(pendingRef.current);
    }
  }, [sessionStatus, dispatchPlayback]);

  useEffect(() => {
    if (!active || !isPlaying) return;
    const timer = window.setInterval(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (state) handleState(state);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, isPlaying, handleState]);

  // Keep the shuffle button honest when Spotify is changed from another client
  // or the device restores a previous mode. The queue itself still comes from
  // the SDK; this only reconciles the control state.
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncPlayerPreferences();
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [active, syncPlayerPreferences]);

  const requestPlay = useCallback(
    (request: SpotifyPlayRequest) => {
      dispatchPlayback(request);
    },
    [dispatchPlayback],
  );

  const playFromQueue = useCallback(
    (index: number) => {
      const list = queueRef.current;
      const selected = list[index];
      if (!selected) return;

      const manualStart = queueIndexRef.current + 1;
      const manualEnd = manualStart + manualQueueRef.current.length;
      const manualAfter =
        index >= manualStart && index < manualEnd
          ? manualQueueRef.current.slice(index - manualStart + 1)
          : [];
      const upcoming = list.slice(index);
      requestPlay({
        uris: upcoming.map(
          (item) => item.uri ?? `spotify:track:${item.id}`,
        ),
        offset: 0,
        queue: upcoming,
        queueIndex: 0,
        track: selected,
        manualQueue: manualAfter,
        contextName: contextNameRef.current ?? undefined,
      });
    },
    [requestPlay],
  );

  const queueTrack = useCallback(
    (track: SpotifyNowPlaying) => {
      const player = playerRef.current;
      const deviceId = deviceIdRef.current;
      if (!player || !deviceId) {
        toast("Start playback before adding to the queue.", "error");
        return Promise.resolve();
      }

      const entry = track;
      // Spotify's manual queue sits in front of the context. Show it
      // immediately; the API/SDK only confirm the same order, so the row
      // never jumps to the end and back.
      applyDisplayQueue(
        currentTrackRef.current,
        [...manualQueueRef.current, entry],
        contextQueueRef.current,
      );
      setShuffleAvailable(queueRef.current.length > 1);

      const add = async () => {
        const activePlayer = playerRef.current;
        const activeDevice = deviceIdRef.current;
        if (!activePlayer || !activeDevice) {
          const index = manualQueueRef.current.indexOf(entry);
          if (index >= 0) {
            applyDisplayQueue(
              currentTrackRef.current,
              [
                ...manualQueueRef.current.slice(0, index),
                ...manualQueueRef.current.slice(index + 1),
              ],
              contextQueueRef.current,
            );
          }
          toast("Could not add to queue.", "error");
          return;
        }

        const uri = `spotify:track:${entry.id}`;
        const addToSpotify = (token: string) =>
          fetch(
            `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(
              uri,
            )}&device_id=${encodeURIComponent(activeDevice)}`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            },
          );

        try {
          let token = await fetchAccessToken();
          let response = await addToSpotify(token);
          if (response.status === 401) {
            token = await fetchAccessToken(true);
            response = await addToSpotify(token);
          }
          if (!response.ok) throw new Error("Queue request failed.");

          knownTracksRef.current.set(entry.id, entry);
          toast(`Added “${entry.name}” to queue.`, "success");

          const syncQueue = async () => {
            const currentPlayer = playerRef.current;
            if (!currentPlayer) return;
            try {
              const state = await currentPlayer.getCurrentState();
              if (state) handleState(state);
            } catch {
              // The playback poll retries while a track is playing.
            }
          };
          window.setTimeout(() => void syncQueue(), 150);
          window.setTimeout(() => void syncQueue(), 650);
        } catch {
          const index = manualQueueRef.current.indexOf(entry);
          if (index >= 0) {
            applyDisplayQueue(
              currentTrackRef.current,
              [
                ...manualQueueRef.current.slice(0, index),
                ...manualQueueRef.current.slice(index + 1),
              ],
              contextQueueRef.current,
            );
            setShuffleAvailable(queueRef.current.length > 1);
          }
          toast("Could not add to queue.", "error");
        }
      };

      const pending = queueAddChainRef.current.then(add, add);
      queueAddChainRef.current = pending.catch(() => undefined);
      return pending;
    },
    [applyDisplayQueue, fetchAccessToken, handleState],
  );

  const togglePlay = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    if (playingRef.current) {
      clearPlayIntent();
    } else {
      beginPlayIntent();
    }
    try {
      await player.togglePlay();
      // Reconcile immediately; a missed SDK event used to leave Play showing
      // while audio continued.
      const state = await player.getCurrentState();
      if (state) handleState(state);
    } catch {
      clearPlayIntent();
      setPrompt({ kind: "error", message: "Playback failed." });
    }
  }, [beginPlayIntent, clearPlayIntent, handleState]);

  const currentPositionMs = useCallback(() => {
    const elapsed = playingRef.current
      ? Math.max(0, Date.now() - positionSampledAtRef.current)
      : 0;
    return Math.max(0, positionRef.current + elapsed);
  }, []);

  const readDeviceNavigationState = useCallback(async () => {
    const empty = {
      previousKeys: [] as string[],
      nextKeys: [] as string[],
      upcoming: [] as SpotifyNowPlaying[],
    };
    const player = playerRef.current;
    if (!player) return empty;
    try {
      const state = await player.getCurrentState();
      if (!state) return empty;
      const currentTrack = nowPlayingFromSdk(
        state.track_window.current_track,
        state.duration,
      );
      const upcoming =
        currentTrack && state.track_window.next_tracks
          ? nextQueueFromSdk({
              current: currentTrack,
              sdkNext: state.track_window.next_tracks,
              knownTracks: knownTracksRef.current,
            }).slice(1)
          : [];
      const previousKeys = (state.track_window.previous_tracks ?? [])
        .map((track) => {
          const value = nowPlayingFromSdk(track, 0);
          return value ? playbackTrackKey(value) : null;
        })
        .filter((key): key is string => key !== null);
      return {
        previousKeys,
        nextKeys: upcoming.map(playbackTrackKey),
        upcoming,
      };
    } catch {
      return empty;
    }
  }, []);

  const waitForNavigationMatch = useCallback(
    (timeout = NAVIGATION_CONFIRM_TIMEOUT_MS) =>
      new Promise<boolean>((resolve) => {
        discardNavigationWaiter();
        const timer = window.setTimeout(() => {
          if (navigationWaiterRef.current?.timer !== timer) return;
          navigationWaiterRef.current = null;
          resolve(false);
        }, timeout);
        navigationWaiterRef.current = { resolve, timer };
      }),
    [discardNavigationWaiter],
  );

  const playFallback = useCallback(
    async (
      targetKey: string,
      uris: string[],
      token: number,
    ): Promise<boolean> => {
      const player = playerRef.current;
      if (!player || uris.length === 0) return false;
      const ordered = uris[0] === targetKey ? uris : [targetKey, ...uris];
      const confirmation = waitForNavigationMatch(
        FALLBACK_CONFIRM_TIMEOUT_MS,
      );
      try {
        const response = await sendPlayRequest({
          uris: ordered,
          offset: { position: 0 },
        });
        if (token !== navigationTokenRef.current || !response.ok) {
          discardNavigationWaiter();
          return false;
        }
        void applyNativeShuffle(shuffleModeRef.current);
        const state = await player.getCurrentState().catch(() => null);
        if (state && token === navigationTokenRef.current) {
          handleState(state);
        }
        return await confirmation;
      } catch {
        discardNavigationWaiter();
        return false;
      }
    },
    [
      applyNativeShuffle,
      discardNavigationWaiter,
      handleState,
      sendPlayRequest,
      waitForNavigationMatch,
    ],
  );

  const runPlannedNavigation = useCallback(
    async ({
      targetKey,
      targetTrack,
      targetIndex,
      direction,
      nativeEligible,
      native,
      fallbackUris,
      token,
    }: {
      targetKey: string;
      targetTrack: SpotifyNowPlaying;
      targetIndex: number | null;
      direction: "back" | "forward";
      nativeEligible: boolean;
      native: () => Promise<void>;
      fallbackUris: () => Promise<string[]>;
      token: number;
    }): Promise<boolean> => {
      const player = playerRef.current;
      if (!player || token !== navigationTokenRef.current) return false;

      navigationRef.current = {
        token,
        targetKey,
        targetTrack,
        targetIndex,
        direction,
        previousKey:
          currentHistoryEntry(historyRef.current)?.key ?? null,
      };

      let confirmed = false;
      if (nativeEligible) {
        const waiter = waitForNavigationMatch();
        try {
          await native();
        } catch {
          discardNavigationWaiter();
        }
        confirmed = await waiter;
      }
      if (token !== navigationTokenRef.current) return false;
      if (confirmed) return true;

      const uris = await fallbackUris();
      if (token !== navigationTokenRef.current) return false;
      confirmed = await playFallback(targetKey, uris, token);
      if (token !== navigationTokenRef.current) return false;
      if (confirmed) return true;

      // The fallback can land on the same recording under a different Spotify
      // release ID after the waiter has already expired. Reconcile once more
      // before reporting a failure.
      const reconciled = await player.getCurrentState().catch(() => null);
      if (reconciled && token === navigationTokenRef.current) {
        const reconciledTrack = nowPlayingFromSdk(
          reconciled.track_window.current_track,
          reconciled.duration,
        );
        if (
          reconciledTrack &&
          (playbackTrackKey(reconciledTrack) === targetKey ||
            isSamePlaybackTrack(reconciledTrack, targetTrack))
        ) {
          handleState(reconciled);
          return true;
        }
      }
      if (token !== navigationTokenRef.current) return false;

      // The target never played. Drop the pending pointer and reconcile with
      // whatever Spotify actually confirmed, so no fake history remains. A
      // failed skip does not mean playback itself is dead, so keep this as a
      // non-blocking notice instead of the playback-unavailable dialog.
      navigationRef.current = null;
      discardNavigationWaiter();
      const state = await player.getCurrentState().catch(() => null);
      if (state) handleState(state);
      toast(
        direction === "back"
          ? "Could not skip back."
          : "Could not skip forward.",
        "error",
      );
      return false;
    },
    [
      discardNavigationWaiter,
      handleState,
      playFallback,
      waitForNavigationMatch,
    ],
  );

  const beginNavigation = useCallback((): number | null => {
    if (navigationBusyRef.current) return null;
    navigationBusyRef.current = true;
    return ++navigationTokenRef.current;
  }, []);

  const finishNavigation = useCallback(
    (token: number) => {
      if (navigationTokenRef.current !== token) return;
      navigationRef.current = null;
      navigationBusyRef.current = false;
      discardNavigationWaiter();
    },
    [discardNavigationWaiter],
  );

  const next = useCallback(async () => {
    const player = playerRef.current;
    if (!player || !deviceIdRef.current) return;
    const settled = await waitForSelectionSettled();
    if (!settled) return;
    // A skip while playing should keep playing; if Spotify's license request
    // stalls, the retry intent resumes it.
    if (playingRef.current) beginPlayIntent();
    const token = beginNavigation();
    if (token === null) return;

    try {
      const device = await readDeviceNavigationState();
      if (token !== navigationTokenRef.current) return;
      const displayedUpcoming = queueRef.current.slice(
        queueIndexRef.current + 1,
      );
      const plan = planNextNavigation({
        history: historyRef.current,
        upcoming:
          displayedUpcoming.length > 0
            ? displayedUpcoming
            : device.upcoming,
        deviceNextKeys: device.nextKeys,
        manualCount: manualQueueRef.current.length,
      });

      if (plan.kind === "none") return;

      if (plan.kind === "native") {
        try {
          await player.nextTrack();
        } catch {
          // The device has no forward context left to play.
        }
        return;
      }

      if (plan.kind === "queue") {
        const uris = plan.uris;
        await runPlannedNavigation({
          targetKey: plan.targetKey,
          targetTrack: plan.target,
          targetIndex: null,
          direction: "forward",
          nativeEligible: plan.nativeEligible,
          native: () => player.nextTrack(),
          fallbackUris: async () => uris,
          token,
        });
        return;
      }

      await runPlannedNavigation({
        targetKey: plan.entry.key,
        targetTrack: plan.entry.track,
        targetIndex: plan.targetIndex,
        direction: "forward",
        nativeEligible: plan.nativeEligible,
        native: () => player.nextTrack(),
        fallbackUris: async () =>
          buildHistoryFallbackUris({
            history: historyRef.current,
            targetIndex: plan.targetIndex,
            upcoming: device.upcoming,
          }),
        token,
      });
    } finally {
      finishNavigation(token);
    }
  }, [
    beginNavigation,
    beginPlayIntent,
    finishNavigation,
    readDeviceNavigationState,
    runPlannedNavigation,
    waitForSelectionSettled,
  ]);

  const previous = useCallback(async () => {
    const player = playerRef.current;
    if (!player || !deviceIdRef.current) return;
    if (navigationBusyRef.current) return;
    const settled = await waitForSelectionSettled();
    if (!settled || navigationBusyRef.current) return;

    const positionMs = currentPositionMs();
    // Spotify/Apple Music: past the opening threshold the first press
    // restarts the current song; near the start it goes to the previous one.
    if (positionMs >= PREVIOUS_RESTART_THRESHOLD_MS) {
      positionRef.current = 0;
      positionSampledAtRef.current = Date.now();
      setPositionMs(0);
      try {
        await player.seek(0);
      } catch {
        setPrompt({ kind: "error", message: "Could not skip back." });
      }
      return;
    }

    if (playingRef.current) beginPlayIntent();
    const token = beginNavigation();
    if (token === null) return;

    try {
      const device = await readDeviceNavigationState();
      if (token !== navigationTokenRef.current) return;
      const plan = planPreviousNavigation({
        history: historyRef.current,
        positionMs,
        devicePreviousKeys: device.previousKeys,
      });
      if (plan.kind !== "history") return;

      await runPlannedNavigation({
        targetKey: plan.entry.key,
        targetTrack: plan.entry.track,
        targetIndex: plan.targetIndex,
        direction: "back",
        nativeEligible: plan.nativeEligible,
        native: () => player.previousTrack(),
        fallbackUris: async () =>
          buildHistoryFallbackUris({
            history: historyRef.current,
            targetIndex: plan.targetIndex,
            upcoming: device.upcoming,
          }),
        token,
      });
    } finally {
      finishNavigation(token);
    }
  }, [
    beginNavigation,
    beginPlayIntent,
    currentPositionMs,
    finishNavigation,
    readDeviceNavigationState,
    runPlannedNavigation,
    waitForSelectionSettled,
  ]);

  const toggleShuffle = useCallback(async () => {
    const player = playerRef.current;
    if (!player || !deviceIdRef.current || !currentTrackRef.current) return;
    if (shuffleBusyRef.current) return;

    const target = !shuffleModeRef.current;
    shuffleBusyRef.current = true;
    setShuffleBusy(true);
    try {
      const ok = await applyNativeShuffle(target);
      if (!ok) throw new Error("Could not change shuffle.");
      shuffleModeRef.current = target;
      shuffleChangedAtRef.current = Date.now();
      setShuffle(target);
      const sync = async () => {
        try {
          const state = await player.getCurrentState();
          if (state) handleState(state);
        } catch {
          // The playback poll retries while a track is playing.
        }
      };
      window.setTimeout(() => void sync(), 120);
      window.setTimeout(() => void sync(), 350);
      window.setTimeout(() => void sync(), 800);
      window.setTimeout(() => void syncPlayerPreferences(), 1_000);
    } catch {
      toast("Could not change shuffle.", "error");
      try {
        const state = await player.getCurrentState();
        if (state) handleState(state);
      } catch {
        // Keep the confirmed playback state untouched.
      }
    } finally {
      shuffleBusyRef.current = false;
      setShuffleBusy(false);
    }
  }, [applyNativeShuffle, handleState, syncPlayerPreferences]);

  const seek = useCallback(
    async (nextPositionMs: number) => {
      if (!playerRef.current || !durationMs) return;
      const clamped = Math.max(0, Math.min(nextPositionMs, durationMs));
      positionRef.current = clamped;
      positionSampledAtRef.current = Date.now();
      setPositionMs(clamped);
      try {
        await playerRef.current.seek(clamped);
      } catch {
        setPrompt({ kind: "error", message: "Could not seek." });
      }
    },
    [durationMs],
  );

  const closePlayer = useCallback(() => {
    void playerRef.current?.pause().catch(() => undefined);
    clearPlayIntent();
    flushListeningStats();
    listeningClockRef.current = null;
    activeRef.current = false;
    pendingRef.current = null;
    resetShuffleState();
    resetPlaybackHistory();
    clearQueue();
    currentTrackRef.current = null;
        scrobbleSessionRef.current = null;
    positionRef.current = 0;
    positionSampledAtRef.current = Date.now();
    playingRef.current = false;
    setActive(false);
    setCurrent(null);
    setIsPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
    setView("dock");
    knownTracksRef.current = new Map();
  }, [clearPlayIntent, clearQueue, resetShuffleState]);

  // Snapshotting the full player's first paint during a view transition
  // stalls the opening frame by ~150ms, so the overlay crossfades instead.
  const openFullPlayer = useCallback(() => {
    setView((current) => {
      if (current !== "full") viewBeforeFullRef.current = current;
      return "full";
    });
  }, []);
  const minimizePlayer = useCallback(() => {
    if (isDesktopShell()) {
      void window.hermesDesktop?.openFloating?.();
      setView("dock");
      return;
    }
    setView("floating");
  }, []);
  const dockPlayer = useCallback(() => setView("dock"), []);
  const closeFullPlayer = useCallback(() => {
    setView(viewBeforeFullRef.current === "floating" ? "floating" : "dock");
  }, []);
  const setFloatingPosition = useCallback(
    (position: { x: number; y: number }) => setFloatingPositionState(position),
    [],
  );

  const disconnect = useCallback(async () => {
    try {
      await playerRef.current?.pause();
    } catch {
      // Nothing to pause.
    }
    clearPlayIntent();
    playerRef.current?.disconnect();
    playerRef.current = null;
    deviceIdRef.current = null;
    playerInitRef.current = false;
    flushListeningStats();
    listeningClockRef.current = null;
    activeRef.current = false;
    pendingRef.current = null;
    resetShuffleState();
    resetPlaybackHistory();
    clearQueue();
    currentTrackRef.current = null;
        scrobbleSessionRef.current = null;
    positionRef.current = 0;
    positionSampledAtRef.current = Date.now();
    playingRef.current = false;
    tokenRef.current = null;
    tokenPromiseRef.current = null;
    setActive(false);
    setCurrent(null);
    setIsPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
    setView("dock");
    knownTracksRef.current = new Map();
    setPlayerStatus("idle");
    setError(null);
    setPrompt(null);

    try {
      await fetch("/api/auth/spotify/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Cookie clearing is best-effort; refresh will correct the UI.
    }
    await refreshSession();
    toast("Account disconnected.");
  }, [clearPlayIntent, clearQueue, refreshSession, resetShuffleState]);

  const publishFloatingState = useCallback(() => {
    floatingChannelRef.current?.postMessage({
      type: "state",
      state: floatingStateRef.current,
    });
  }, []);

  floatingCommandsRef.current = {
    togglePlay,
    next,
    previous,
    toggleMute,
    setVolume,
    openFullPlayer,
    dockPlayer,
  };

  useEffect(() => {
    const channel = createFloatingChannel();
    if (!channel) return;
    floatingChannelRef.current = channel;

    const onMessage = (event: MessageEvent<DesktopFloatingMessage>) => {
      const message = event.data;
      if (!message || message.type !== "command") return;
      const commands = floatingCommandsRef.current;
      if (!commands) return;

      if (message.action === "request-state") {
        channel.postMessage({
          type: "state",
          state: floatingStateRef.current,
        });
        return;
      }

      switch (message.action) {
        case "toggle":
          void commands.togglePlay();
          break;
        case "next":
          void commands.next();
          break;
        case "previous":
          void commands.previous();
          break;
        case "mute":
          commands.toggleMute();
          break;
        case "volume":
          if (typeof message.value === "number") {
            commands.setVolume(message.value);
          }
          break;
        case "expand":
          commands.openFullPlayer();
          break;
        case "dock":
          commands.dockPlayer();
          break;
      }
    };

    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
      floatingChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    floatingStateRef.current = {
      current,
      active,
      isPlaying,
      positionMs,
      durationMs,
      volume,
      muted,
    };
    publishFloatingState();
  }, [
    active,
    current,
    durationMs,
    isPlaying,
    muted,
    positionMs,
    publishFloatingState,
    volume,
  ]);

  // The float refuses cached snapshots, so keep a steady heartbeat even while
  // paused; otherwise a paused player would look like a closed Hermes window.
  useEffect(() => {
    const timer = window.setInterval(publishFloatingState, 1_000);
    return () => window.clearInterval(timer);
  }, [publishFloatingState]);

  useEffect(() => () => clearPlayIntent(), [clearPlayIntent]);

  const stateValue = useMemo<PlaybackState>(
    () => ({
      session,
      sessionStatus,
      playerStatus,
      current,
      active,
      isPlaying,
      positionMs,
      durationMs,
      error,
      view,
      floatingPosition,
      queue,
      queueIndex,
      manualQueue,
      contextName,
      shuffle,
      shuffleAvailable,
      shuffleBusy,
      volume,
      muted,
    }),
    [
      active,
      contextName,
      current,
      durationMs,
      error,
      floatingPosition,
      isPlaying,
      manualQueue,
      muted,
      playerStatus,
      positionMs,
      queue,
      queueIndex,
      session,
      sessionStatus,
      shuffle,
      shuffleAvailable,
      shuffleBusy,
      view,
      volume,
    ],
  );

  const actionsValue = useMemo<PlaybackActions>(
    () => ({
      requestPlay,
      playFromQueue,
      queueTrack,
      togglePlay,
      next,
      previous,
      toggleShuffle,
      seek,
      openFullPlayer,
      minimizePlayer,
      dockPlayer,
      closeFullPlayer,
      setFloatingPosition,
      setVolume,
      toggleMute,
      closePlayer,
      disconnect,
      refreshSession,
    }),
    [
      closePlayer,
      closeFullPlayer,
      disconnect,
      dockPlayer,
      minimizePlayer,
      next,
      openFullPlayer,
      playFromQueue,
      previous,
      queueTrack,
      refreshSession,
      requestPlay,
      seek,
      setFloatingPosition,
      setVolume,
      toggleMute,
      togglePlay,
      toggleShuffle,
    ],
  );

  const sessionValue = useMemo(
    () => ({ session, sessionStatus }),
    [session, sessionStatus],
  );

  const nowPlayingMeta = useMemo(
    () => ({
      trackId: current?.id ?? null,
      isPlaying: active && isPlaying,
    }),
    [active, current?.id, isPlaying],
  );

  const returnTo =
    typeof window !== "undefined" &&
    /^\/(?:search|settings|library|stats)?$/.test(window.location.pathname)
      ? window.location.pathname
      : "/search";

  return (
    <NowPlayingMetaContext.Provider value={nowPlayingMeta}>
      <SessionContext.Provider value={sessionValue}>
        <PlaybackActiveContext.Provider value={active}>
          <ActionsContext.Provider value={actionsValue}>
            <StateContext.Provider value={stateValue}>
              {children}
        <LiquidDialog
          open={prompt !== null}
          onClose={() => setPrompt(null)}
          title={
            prompt?.kind === "connect"
              ? "Connect account"
              : prompt?.kind === "premium"
                ? "Premium required"
                : prompt?.kind === "not_configured"
                  ? "Playback unavailable"
                  : "Playback unavailable"
          }
          description={
            prompt?.kind === "connect"
              ? "Sign in once to play full tracks inside Hermes. In-app playback requires a premium account."
              : prompt?.kind === "premium"
                ? "In-app streaming requires a premium account. You can still open tracks externally."
                : prompt?.kind === "not_configured"
                  ? "Playback is not configured on the server."
                  : "Playback could not start."
          }
          size="sm"
          footer={
            prompt?.kind === "connect" ? (
              <>
                <LiquidButton variant="ghost" onClick={() => setPrompt(null)}>
                  Cancel
                </LiquidButton>
                <LiquidButton
                  variant="primary"
                  onClick={() => {
                    window.location.assign(
                      `/api/auth/spotify/login?returnTo=${encodeURIComponent(returnTo)}`,
                    );
                  }}
                >
                  Connect
                </LiquidButton>
              </>
            ) : prompt?.kind === "premium" ? (
              <>
                <LiquidButton variant="ghost" onClick={() => setPrompt(null)}>
                  Close
                </LiquidButton>
                <a
                  href="https://www.spotify.com/account/overview/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="btn h-10 px-4 text-[13px]"
                >
                  Manage account
                  <ExternalLink size={13} />
                </a>
              </>
            ) : (
              <LiquidButton variant="ghost" onClick={() => setPrompt(null)}>
                Close
              </LiquidButton>
            )
          }
        >
          {prompt?.kind === "error" || prompt?.kind === "not_configured" ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-mute)]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#e8b96a]" />
              <span>{prompt.kind === "error" ? prompt.message : "Check the server configuration and try again."}</span>
            </div>
          ) : null}
        </LiquidDialog>
          </StateContext.Provider>
        </ActionsContext.Provider>
      </PlaybackActiveContext.Provider>
    </SessionContext.Provider>
    </NowPlayingMetaContext.Provider>
  );
}

export function useSpotifyPlayback(): PlaybackState & PlaybackActions {
  const state = useContext(StateContext);
  const actions = useContext(ActionsContext);
  if (!state || !actions) {
    throw new Error("useSpotifyPlayback must be used inside SpotifyPlaybackProvider");
  }
  return { ...state, ...actions };
}

export function useSpotifyPlaybackActions(): PlaybackActions {
  const actions = useContext(ActionsContext);
  if (!actions) {
    throw new Error(
      "useSpotifyPlaybackActions must be used inside SpotifyPlaybackProvider",
    );
  }
  return actions;
}

export function useSpotifyPlaybackActive(): boolean {
  const active = useContext(PlaybackActiveContext);
  if (active === null) {
    throw new Error(
      "useSpotifyPlaybackActive must be used inside SpotifyPlaybackProvider",
    );
  }
  return active;
}

export function useSpotifyNowPlayingMeta(): {
  trackId: string | null;
  isPlaying: boolean;
} {
  const value = useContext(NowPlayingMetaContext);
  if (!value) {
    throw new Error(
      "useSpotifyNowPlayingMeta must be used inside SpotifyPlaybackProvider",
    );
  }
  return value;
}

export function useSpotifySession(): {
  session: SpotifySession | null;
  sessionStatus: SessionStatus;
} {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error(
      "useSpotifySession must be used inside SpotifyPlaybackProvider",
    );
  }
  return value;
}
