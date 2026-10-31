"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useMediaQuery } from "@/hooks/useEnvironment";
import { useSettingsStore } from "@/store/settings";

const PAUSED_RATE = 0.08;
const RAMP_MS = 1_100;

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

/**
 * Slows the ambient field's existing CSS animations while playback is paused
 * without restarting them. A CSS animation cannot interpolate its duration, so
 * the only way to keep the drift continuous is to ramp its playback rate.
 */
export function useAmbientMotion(
  ref: RefObject<HTMLElement | null>,
  isPlaying: boolean,
  enabled: boolean,
): void {
  const motionPreference = useSettingsStore((state) => state.motionPreference);
  const systemReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;
    if (motionPreference === "reduced" || systemReduced) return;

    const animations = root.getAnimations({ subtree: true });
    if (animations.length === 0) return;

    const target = isPlaying ? 1 : PAUSED_RATE;
    const current = animations[0]?.playbackRate ?? 1;
    if (Math.abs(current - target) < 0.001) return;

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / RAMP_MS);
      const rate = current + (target - current) * easeOutCubic(progress);
      for (const animation of animations) {
        animation.playbackRate = rate;
      }
      frameRef.current =
        progress < 1 ? window.requestAnimationFrame(step) : null;
    };
    frameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [enabled, isPlaying, motionPreference, ref, systemReduced]);
}
