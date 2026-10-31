"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface LyricsLine {
  at: number | null;
  text: string;
}

export type LyricsStatus =
  | "idle"
  | "loading"
  | "success"
  | "empty"
  | "error";

interface LyricsState {
  status: LyricsStatus;
  lines: LyricsLine[];
  instrumental: boolean;
  retryable: boolean;
}

export interface LyricsRequest {
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
}

const cache = new Map<string, LyricsState>();
const pending = new Map<string, Promise<LyricsState>>();

const TIMESTAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

function parseLyrics(synced: string | null, plain: string | null): LyricsLine[] {
  if (synced) {
    const lines: LyricsLine[] = [];
    for (const raw of synced.split(/\r?\n/)) {
      const timestamps: number[] = [];
      let match: RegExpExecArray | null;
      TIMESTAMP.lastIndex = 0;
      while ((match = TIMESTAMP.exec(raw)) !== null) {
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const fraction = match[3]
          ? Number(`0.${match[3].padEnd(3, "0").slice(0, 3)}`)
          : 0;
        timestamps.push(minutes * 60 + seconds + fraction);
      }
      if (timestamps.length === 0) continue;
      const text = raw.replace(TIMESTAMP, "").trim();
      if (!text) continue;
      for (const at of timestamps) lines.push({ at, text });
    }
    lines.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    if (lines.length > 0) return lines;
  }

  if (plain) {
    return plain
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ at: null, text }));
  }

  return [];
}

function lyricsKey(request: LyricsRequest): string {
  return `v2|${request.title}|${request.artist}|${request.album}|${Math.round(request.durationSeconds)}`;
}

const IDLE_STATE: LyricsState = {
  status: "idle",
  lines: [],
  instrumental: false,
  retryable: false,
};
const LOADING_STATE: LyricsState = {
  status: "loading",
  lines: [],
  instrumental: false,
  retryable: false,
};
const EMPTY_STATE: LyricsState = {
  status: "empty",
  lines: [],
  instrumental: false,
  retryable: false,
};
const ERROR_STATE: LyricsState = {
  status: "error",
  lines: [],
  instrumental: false,
  retryable: false,
};

async function fetchLyrics(
  request: LyricsRequest,
  refresh = false,
): Promise<LyricsState> {
  const { title, artist, album, durationSeconds } = request;
  if (!title || !artist) return EMPTY_STATE;

  try {
    const params = new URLSearchParams({
      title,
      artist,
      album,
      duration: String(Math.round(durationSeconds)),
    });
    if (refresh) params.set("refresh", "1");
    // The local route budgets its upstream calls; this ceiling guarantees the
    // panel leaves its skeleton even if the route or network stalls.
    const response = await fetch(`/api/lyrics?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error("Lyrics unavailable");
    const payload = (await response.json()) as {
      found?: boolean;
      syncedLyrics?: string | null;
      plainLyrics?: string | null;
      instrumental?: boolean;
      retryable?: boolean;
    };
    if (!payload.found) return EMPTY_STATE;
    const lines = parseLyrics(
      payload.syncedLyrics ?? null,
      payload.plainLyrics ?? null,
    );
    return {
      status: lines.length > 0 ? "success" : "empty",
      lines,
      instrumental: Boolean(payload.instrumental),
      retryable: Boolean(payload.retryable),
    };
  } catch {
    return ERROR_STATE;
  }
}

function ensureLyrics(request: LyricsRequest): Promise<LyricsState> {
  const key = lyricsKey(request);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;

  const promise = fetchLyrics(request)
    .then((state) => {
      if (state.status !== "error") cache.set(key, state);
      return state;
    })
    .finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
  pending.set(key, promise);
  return promise;
}

export function prefetchTrackLyrics(request: LyricsRequest): void {
  if (!request.title || !request.artist) return;
  void ensureLyrics(request);
}

export function useTrackLyrics({
  title,
  artist,
  album,
  durationSeconds,
  enabled = true,
}: LyricsRequest & { enabled?: boolean }) {
  const request: LyricsRequest = { title, artist, album, durationSeconds };
  const key = lyricsKey(request);
  const cached = cache.get(key);

  const [state, setState] = useState<{ key: string; value: LyricsState }>(
    () => ({ key, value: cached ?? IDLE_STATE }),
  );

  const value =
    state.key === key
      ? cache.get(key) ?? state.value
      : cache.get(key) ?? LOADING_STATE;

  useEffect(() => {
    if (!enabled) return;
    const existing = cache.get(key);
    if (existing) {
      setState({ key, value: existing });
      return;
    }

    let active = true;
    let retryTimer: number | null = null;
    setState({ key, value: LOADING_STATE });

    const load = (allowRetry: boolean) => {
      void ensureLyrics({ title, artist, album, durationSeconds }).then(
        (next) => {
          if (!active) return;
          setState({ key, value: next });
          // A busy upstream often clears within a few seconds. Keep the error
          // visible and try once more in the background instead of making the
          // user press Retry immediately.
          if (allowRetry && next.status === "error") {
            retryTimer = window.setTimeout(() => load(false), 2_500);
          }
        },
      );
    };
    load(true);

    return () => {
      active = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [album, artist, durationSeconds, enabled, key, title]);

  const autoRetryRef = useRef<{
    key: string;
    attempts: number;
    timer: number | null;
  }>({ key: "", attempts: 0, timer: null });

  // The lyrics route marks a plain fallback as retryable when its synced
  // provider is temporarily down. Keep the readable text on screen and quietly
  // refresh it once or twice instead of leaving the song permanently unsynced.
  useEffect(() => {
    if (!enabled || state.key !== key) return;
    if (value.status !== "success" || !value.retryable) return;

    const tracker = autoRetryRef.current;
    if (tracker.key !== key) {
      tracker.key = key;
      tracker.attempts = 0;
    }
    if (tracker.attempts >= 2) return;

    const attempt = tracker.attempts;
    const delay = attempt === 0 ? 8_000 : 20_000;
    const timer = window.setTimeout(() => {
      tracker.attempts = attempt + 1;
      cache.delete(key);
      pending.delete(key);
      void fetchLyrics(
        { title, artist, album, durationSeconds },
        true,
      ).then((next) => {
        if (autoRetryRef.current.key !== key) return;
        if (next.status !== "error") cache.set(key, next);
        setState({ key, value: next });
      });
    }, delay);
    tracker.timer = timer;

    return () => {
      window.clearTimeout(timer);
      if (tracker.timer === timer) tracker.timer = null;
    };
  }, [
    album,
    artist,
    durationSeconds,
    enabled,
    key,
    state.key,
    title,
    value.retryable,
    value.status,
  ]);

  const retry = useCallback(() => {
    cache.delete(key);
    pending.delete(key);
    setState({ key, value: LOADING_STATE });
    void fetchLyrics({ title, artist, album, durationSeconds }, true).then(
      (next) => {
        if (next.status !== "error") cache.set(key, next);
        setState({ key, value: next });
      },
    );
  }, [album, artist, durationSeconds, key, title]);

  return { ...value, retry };
}
