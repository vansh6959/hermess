"use client";

import { useEffect, useRef, useState } from "react";

const CACHE_TTL_MS = 60 * 60 * 1_000;
const STORAGE_KEY = "hermes.artist-images.v1";
const STORAGE_TTL_MS = 24 * 60 * 60 * 1_000;
const RETRY_DELAYS_MS = [4_000, 12_000];
const ARTIST_IMAGE_BATCH_SIZE = 5;
const BATCH_CONCURRENCY = 2;

export function batchArtistNames(
  names: readonly string[],
  size = ARTIST_IMAGE_BATCH_SIZE,
): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < names.length; index += size) {
    batches.push(names.slice(index, index + size));
  }
  return batches;
}

const cache = new Map<string, { imageUrl: string | null; expiresAt: number }>();

interface StoredArtistImage {
  imageUrl: string;
  expiresAt: number;
}

function readStored(): Record<string, StoredArtistImage> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    const stored: Record<string, StoredArtistImage> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as { imageUrl?: unknown; expiresAt?: unknown };
      if (typeof entry.imageUrl !== "string") continue;
      if (typeof entry.expiresAt !== "number" || entry.expiresAt <= now) continue;
      stored[name] = {
        imageUrl: entry.imageUrl,
        expiresAt: entry.expiresAt,
      };
    }
    return stored;
  } catch {
    return {};
  }
}

function persist(name: string, imageUrl: string): void {
  try {
    const stored = readStored();
    stored[name] = {
      imageUrl,
      expiresAt: Date.now() + STORAGE_TTL_MS,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage can be unavailable or full; the in-memory cache still works.
  }
}

function hydrate(current: string[]): void {
  const stored = readStored();
  const now = Date.now();
  for (const name of current) {
    if (cache.has(name)) continue;
    const entry = stored[name];
    if (!entry) continue;
    cache.set(name, {
      imageUrl: entry.imageUrl,
      expiresAt: Math.min(now + CACHE_TTL_MS, entry.expiresAt),
    });
  }
}

function readCached(names: string[]): Record<string, string | null> {
  const now = Date.now();
  const images: Record<string, string | null> = {};
  for (const name of names) {
    const entry = cache.get(name);
    if (entry && entry.expiresAt > now) images[name] = entry.imageUrl;
  }
  return images;
}

export function useArtistImages(names: string[]): Record<string, string | null> {
  const key = names.join("\u0000");
  const [images, setImages] = useState<Record<string, string | null>>(() =>
    readCached(names),
  );
  const [retryTick, setRetryTick] = useState(0);
  const attemptsRef = useRef(0);
  const lastFocusRetryRef = useRef(0);

  useEffect(() => {
    attemptsRef.current = 0;
  }, [key]);

  useEffect(() => {
    const retryOnReturn = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastFocusRetryRef.current < 30_000) return;
      lastFocusRetryRef.current = now;
      attemptsRef.current = 0;
      setRetryTick((tick) => tick + 1);
    };
    window.addEventListener("focus", retryOnReturn);
    document.addEventListener("visibilitychange", retryOnReturn);
    return () => {
      window.removeEventListener("focus", retryOnReturn);
      document.removeEventListener("visibilitychange", retryOnReturn);
    };
  }, []);

  useEffect(() => {
    const current = key ? key.split("\u0000") : [];
    hydrate(current);
    const cached = readCached(current);
    setImages(cached);
    const missing = current.filter((name) => !(name in cached));
    if (missing.length === 0) return;

    const controller = new AbortController();
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRetry = () => {
      const delay = RETRY_DELAYS_MS[attemptsRef.current];
      if (delay === undefined) return;
      attemptsRef.current += 1;
      retryTimer = setTimeout(() => {
        if (active) setRetryTick((tick) => tick + 1);
      }, delay);
    };

    const batches = batchArtistNames(missing);
    const next = { ...cached };
    let failed = false;

    const runBatch = async (batch: string[]) => {
      const params = new URLSearchParams();
      for (const name of batch) params.append("name", name);
      const response = await fetch(`/api/spotify/artists?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        failed = true;
        return;
      }
      const payload = (await response.json()) as {
        artists?: Array<{ name?: unknown; imageUrl?: unknown }>;
      };
      if (!payload || !Array.isArray(payload.artists)) {
        failed = true;
        return;
      }
      for (const artist of payload.artists) {
        if (typeof artist?.name !== "string") continue;
        const imageUrl =
          typeof artist.imageUrl === "string" ? artist.imageUrl : null;
        next[artist.name] = imageUrl;
        cache.set(artist.name, {
          imageUrl,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        if (imageUrl) persist(artist.name, imageUrl);
      }
      if (active) setImages({ ...next });
    };

    const worker = async () => {
      while (active) {
        const batch = batches.shift();
        if (!batch) return;
        try {
          await runBatch(batch);
        } catch {
          if (active) failed = true;
        }
      }
    };

    void Promise.all(
      Array.from(
        { length: Math.min(BATCH_CONCURRENCY, batches.length) },
        worker,
      ),
    ).then(() => {
      if (!active) return;
      const stillMissing = current.filter((name) => !(name in next));
      if (stillMissing.length === 0) attemptsRef.current = 0;
      if (failed || stillMissing.length > 0) scheduleRetry();
    });

    return () => {
      active = false;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [key, retryTick]);

  return images;
}
