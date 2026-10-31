"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  SpotifyApiErrorBody,
  SpotifyErrorResponse,
  SpotifySearchPayload,
} from "@/lib/spotify/types";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 180;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 40;

const cache = new Map<
  string,
  { at: number; data: SpotifySearchPayload }
>();

function readCache(query: string): SpotifySearchPayload | null {
  const entry = cache.get(query);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(query);
    return null;
  }
  return entry.data;
}

function writeCache(query: string, data: SpotifySearchPayload): void {
  cache.set(query, { at: Date.now(), data });
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = [...cache.entries()].sort(
      (a, b) => a[1].at - b[1].at,
    )[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

export type SpotifySearchStatus = "idle" | "loading" | "success" | "error";

export interface SpotifySearchState {
  status: SpotifySearchStatus;
  data: SpotifySearchPayload | null;
  error: SpotifyApiErrorBody | null;
  retry: () => void;
}

function isSearchPayload(value: unknown): value is SpotifySearchPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<SpotifySearchPayload>;
  return (
    payload.provider === "spotify" &&
    typeof payload.query === "string" &&
    Array.isArray(payload.tracks) &&
    Array.isArray(payload.albums) &&
    Array.isArray(payload.artists)
  );
}

function isErrorResponse(value: unknown): value is SpotifyErrorResponse {
  if (!value || typeof value !== "object") return false;
  const error = (value as Partial<SpotifyErrorResponse>).error;
  return Boolean(
    error &&
      typeof error === "object" &&
      typeof error.code === "string" &&
      typeof error.message === "string",
  );
}

export function useSpotifySearch(query: string): SpotifySearchState {
  const normalized = query.trim();
  const [status, setStatus] = useState<SpotifySearchStatus>("idle");
  const [data, setData] = useState<SpotifySearchPayload | null>(null);
  const [error, setError] = useState<SpotifyApiErrorBody | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (normalized.length < MIN_QUERY_LENGTH) {
      setStatus("idle");
      setData(null);
      setError(null);
      return;
    }

    const cacheKey = normalized.toLowerCase();
    const cached = readCache(cacheKey);
    if (cached) {
      setData(cached);
      setStatus("success");
      setError(null);
      return;
    }

    const controller = new AbortController();
    let settled = false;
    setStatus("loading");
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/spotify/search?q=${encodeURIComponent(normalized)}`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
            cache: "no-store",
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;

        if (!response.ok) {
          if (isErrorResponse(payload)) {
            setError(payload.error);
          } else {
            setError({
              code: "unavailable",
              message: "Spotify search failed. Try again.",
            });
          }
          setStatus("error");
          return;
        }

        if (!isSearchPayload(payload)) {
          setError({
            code: "invalid_response",
            message: "Spotify returned an unexpected response.",
          });
          setStatus("error");
          return;
        }

        settled = true;
        writeCache(cacheKey, payload);
        setData(payload);
        setStatus("success");
      } catch (fetchError) {
        if (controller.signal.aborted || settled) return;
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setError({
          code: "network",
          message: "Could not reach Spotify. Check your connection and try again.",
        });
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, retryToken]);

  const retry = useCallback(() => {
    cache.delete(normalized.toLowerCase());
    setRetryToken((value) => value + 1);
  }, [normalized]);

  return { status, data, error, retry };
}
