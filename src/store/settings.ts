"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import { safeLocalStorage } from "@/lib/storage";

export type MotionPreference = "system" | "reduced";
export type LyricsScale = "normal" | "large";

interface SettingsState {
  motionPreference: MotionPreference;
  lyricsScale: LyricsScale;
  setMotionPreference: (value: MotionPreference) => void;
  setLyricsScale: (value: LyricsScale) => void;
  resetSettings: () => void;
}

const persistedSettingsSchema = z.object({
  motionPreference: z.enum(["system", "reduced"]),
  lyricsScale: z.enum(["normal", "large"]),
});

const defaults = {
  motionPreference: "system" as MotionPreference,
  lyricsScale: "normal" as LyricsScale,
};

export const useSettingsStore = create<SettingsState>()(
  persist<SettingsState, [], [], Partial<SettingsState>>(
    (set) => ({
      ...defaults,
      setMotionPreference: (motionPreference) => set({ motionPreference }),
      setLyricsScale: (lyricsScale) => set({ lyricsScale }),
      resetSettings: () => set({ ...defaults }),
    }),
    {
      name: "hermes.settings.v1",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      skipHydration: true,
      partialize: (state) => ({
        motionPreference: state.motionPreference,
        lyricsScale: state.lyricsScale,
      }),
      merge: (persisted, current) => {
        const parsed = persistedSettingsSchema.safeParse(persisted);
        if (!parsed.success) return current;
        return { ...current, ...parsed.data };
      },
    },
  ),
);
