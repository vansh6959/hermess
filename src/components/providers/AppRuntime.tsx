"use client";

import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/store/settings";
import { useHermesLibraryStore } from "@/store/hermes-library";
import { useUiStore } from "@/store/ui";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { syncSpotifyLibrary } from "@/lib/import/sync";
import {
  isSoftwareRenderer,
  shouldUseLiteEffects,
} from "@/lib/performance-quality";

const LITE_STORAGE_KEY = "hermes.perf.lite";
const FRAME_WINDOW_MS = 2_000;
const MAX_WINDOWS = 5;

function readStoredLite(): boolean {
  try {
    return window.sessionStorage.getItem(LITE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredLite(enabled: boolean): void {
  try {
    if (enabled) window.sessionStorage.setItem(LITE_STORAGE_KEY, "1");
    else window.sessionStorage.removeItem(LITE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened browser modes.
  }
}

function detectRenderer(): string | null {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : null;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return typeof renderer === "string" ? renderer : null;
  } catch {
    return null;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'a, button, input, select, textarea, [contenteditable="true"], [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="switch"], [role="slider"]',
    ),
  );
}

export function AppRuntime() {
  const motionPreference = useSettingsStore((state) => state.motionPreference);
  const playlists = useHermesLibraryStore((state) => state.playlists);
  const likedSongs = useHermesLibraryStore((state) => state.likedSongs);
  const lastImportedAt = useHermesLibraryStore(
    (state) => state.lastImportedAt,
  );
  const spotify = useSpotifyPlayback();
  const spotifyRef = useRef(spotify);
  const [libraryReady, setLibraryReady] = useState(false);

  useEffect(() => {
    spotifyRef.current = spotify;
  });

  useEffect(() => {
    void Promise.all([
      useSettingsStore.persist.rehydrate(),
      useHermesLibraryStore.persist.rehydrate(),
    ])
      .catch(() => undefined)
      .finally(() => setLibraryReady(true));
  }, []);

  useEffect(() => {
    if (spotify.sessionStatus === "ready" && !spotify.session?.connected) {
      useUiStore.getState().resetLibrarySync();
    }
  }, [spotify.session, spotify.sessionStatus]);

  useEffect(() => {
    if (!libraryReady) return;
    if (spotify.sessionStatus !== "ready" || !spotify.session?.connected) {
      return;
    }
    if (
      lastImportedAt !== null ||
      playlists.length > 0 ||
      likedSongs.length > 0
    ) {
      return;
    }

    const ui = useUiStore.getState();
    if (ui.librarySyncStatus !== "idle" || ui.libraryAutoAttempted) return;
    ui.markLibraryAutoAttempted();
    void syncSpotifyLibrary().catch(() => undefined);
  }, [
    lastImportedAt,
    libraryReady,
    likedSongs.length,
    playlists.length,
    spotify.session,
    spotify.sessionStatus,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion =
      motionPreference === "reduced" ? "reduced" : "full";
  }, [motionPreference]);

  useEffect(() => {
    const root = document.documentElement;
    const forced = new URLSearchParams(window.location.search).get("perf");

    const enableLite = () => {
      root.dataset.quality = "lite";
      writeStoredLite(true);
    };

    if (forced === "full") {
      root.dataset.quality = "full";
      writeStoredLite(false);
      return;
    }
    if (forced === "lite") {
      enableLite();
      return;
    }
    if (readStoredLite()) {
      root.dataset.quality = "lite";
      return;
    }

    root.dataset.quality = "full";

    let cancelled = false;
    let probeId: number | null = null;
    let probeTimer = 0;
    let raf = 0;
    let timer = 0;
    let interactionTimer = 0;
    let sampling = false;
    let severe = true;
    let windows = 0;
    let lastInteractionSample = 0;

    const startWindow = (followUp = true) => {
      if (cancelled || sampling) return;
      if (document.visibilityState !== "visible") {
        timer = window.setTimeout(() => startWindow(followUp), 1_500);
        return;
      }

      sampling = true;
      let frames = 0;
      let slowFrames = 0;
      let last = performance.now();
      const started = last;

      const tick = (now: number) => {
        if (cancelled) return;
        const delta = now - last;
        last = now;
        if (document.visibilityState !== "visible" || delta > 1_000) {
          sampling = false;
          timer = window.setTimeout(() => startWindow(followUp), 1_000);
          return;
        }

        frames += 1;
        if (delta > 32) slowFrames += 1;
        const elapsed = now - started;

        if (elapsed < FRAME_WINDOW_MS) {
          raf = window.requestAnimationFrame(tick);
          return;
        }

        sampling = false;
        windows += 1;
        if (
          shouldUseLiteEffects(
            { frames, slowFrames, elapsedMs: elapsed },
            severe,
          )
        ) {
          enableLite();
          return;
        }

        severe = false;
        if (followUp && windows < MAX_WINDOWS) {
          timer = window.setTimeout(() => startWindow(true), 5_000);
        }
      };

      raf = window.requestAnimationFrame(tick);
    };

    const sampleInteraction = () => {
      if (sampling) return;
      const now = Date.now();
      if (now - lastInteractionSample < 8_000) return;
      lastInteractionSample = now;
      window.clearTimeout(interactionTimer);
      interactionTimer = window.setTimeout(() => {
        severe = false;
        startWindow(false);
      }, 120);
    };

    window.addEventListener("pointerup", sampleInteraction, true);
    window.addEventListener("keydown", sampleInteraction, true);
    window.addEventListener("wheel", sampleInteraction, {
      passive: true,
      capture: true,
    });
    timer = window.setTimeout(() => startWindow(true), 1_200);

    // Creating a WebGL context only to read the renderer can block first paint
    // for most of a second on software rasterizers (SwiftShader/llvmpipe).
    // Probe after the first frame so content is never held behind it.
    const probeRenderer = () => {
      probeId = null;
      if (cancelled || readStoredLite()) return;
      if (isSoftwareRenderer(detectRenderer())) enableLite();
    };
    if (typeof window.requestIdleCallback === "function") {
      probeId = window.requestIdleCallback(probeRenderer, { timeout: 2_000 });
    } else {
      probeTimer = window.setTimeout(probeRenderer, 350);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(probeTimer);
      window.clearTimeout(interactionTimer);
      window.cancelAnimationFrame(raf);
      if (probeId !== null) window.cancelIdleCallback(probeId);
      window.removeEventListener("pointerup", sampleInteraction, true);
      window.removeEventListener("keydown", sampleInteraction, true);
      window.removeEventListener("wheel", sampleInteraction, true);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const ui = useUiStore.getState();
      const current = spotifyRef.current;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ui.setSearchOpen(!ui.isSearchOpen);
        return;
      }

      if (event.key === "Escape") {
        if (ui.isSearchOpen) {
          ui.setSearchOpen(false);
        } else if (current.active && current.view === "full") {
          current.closeFullPlayer();
        }
        return;
      }

      if (isTypingTarget(event.target) || isInteractiveTarget(event.target)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!current.active) return;

      if (event.key === " " && !event.repeat) {
        event.preventDefault();
        void current.togglePlay();
      } else if (event.key.toLowerCase() === "m" && !event.repeat) {
        current.minimizePlayer();
      } else if (current.view === "full" && event.key === "ArrowRight") {
        event.preventDefault();
        void current.seek(
          Math.min(current.durationMs, current.positionMs + 5000),
        );
      } else if (current.view === "full" && event.key === "ArrowLeft") {
        event.preventDefault();
        void current.seek(Math.max(0, current.positionMs - 5000));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
