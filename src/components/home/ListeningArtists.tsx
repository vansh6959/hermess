"use client";

import { useEffect, useMemo, useState } from "react";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { SectionRow } from "@/components/common/SectionRow";
import { LiquidArtworkCard } from "@/components/ui/LiquidArtworkCard";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";
import { SPOTIFY_ARTISTS_STORAGE_KEY } from "@/lib/spotify/history";
import type { SpotifyArtistResult } from "@/lib/spotify/types";

const MAX_STORED = 12;
const VISIBLE = 6;
const CARD_WIDTH = "w-[164px] shrink-0 snap-start sm:w-[184px]";

function isArtist(value: unknown): value is SpotifyArtistResult {
  if (!value || typeof value !== "object") return false;
  const artist = value as Partial<SpotifyArtistResult>;
  return typeof artist.id === "string" && typeof artist.name === "string";
}

function genreLabel(genres: string[] | undefined): string {
  if (!Array.isArray(genres)) return "Artist";
  const genre = genres.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (!genre) return "Artist";
  return genre.replace(/\b\w/g, (character) => character.toUpperCase());
}

function mergeArtists(
  primary: SpotifyArtistResult[],
  history: SpotifyArtistResult[],
): SpotifyArtistResult[] {
  const seen = new Set<string>();
  const merged: SpotifyArtistResult[] = [];
  for (const artist of [...primary, ...history]) {
    const key = artist.id || artist.name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(artist);
  }
  return merged.slice(0, MAX_STORED);
}

export function ListeningArtists() {
  const { current } = useSpotifyPlayback();
  const currentId = current?.id ?? "";
  const [history, setHistory] = useState<SpotifyArtistResult[]>([]);
  const [remote, setRemote] = useState<SpotifyArtistResult[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SPOTIFY_ARTISTS_STORAGE_KEY) ?? "[]");
      if (Array.isArray(stored)) {
        setHistory(stored.filter(isArtist).slice(0, MAX_STORED));
      }
    } catch {
      // Ignore malformed local history.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/spotify/listening", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          connected?: boolean;
          artists?: unknown;
        };
        if (!payload.connected) {
          setRemote([]);
          return;
        }
        setRemote(
          Array.isArray(payload.artists)
            ? payload.artists.filter(isArtist).slice(0, MAX_STORED)
            : [],
        );
      } catch {
        // Keep the last known listening history when the service is offline.
      }
    })();

    return () => controller.abort();
  }, [ready, currentId]);

  const artists = useMemo(
    () => mergeArtists(remote, history),
    [remote, history],
  );

  useEffect(() => {
    if (!ready || artists.length === 0) return;
    try {
      localStorage.setItem(SPOTIFY_ARTISTS_STORAGE_KEY, JSON.stringify(artists));
    } catch {
      // Storage can be unavailable in private browsing.
    }
  }, [artists, ready]);

  if (!ready || artists.length === 0) return null;

  return (
    <SectionRow title="Artists">
      {artists.slice(0, VISIBLE).map((artist) => (
        <LiquidArtworkCard
          key={artist.id || artist.name}
          className={CARD_WIDTH}
          artwork={toSpotifyArtwork(artist.imageUrl, artist.name)}
          title={artist.name}
          subtitle={genreLabel(artist.genres)}
          round
        />
      ))}
    </SectionRow>
  );
}
