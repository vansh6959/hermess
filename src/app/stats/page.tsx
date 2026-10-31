"use client";

import { usePageTitle } from "@/hooks/useEnvironment";
import { ListeningStatsPanel } from "@/components/stats/ListeningStatsPanel";

export default function StatsPage() {
  usePageTitle("Your Stats");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-[2rem] font-medium leading-none tracking-[-0.045em] text-white/90 sm:text-[2.6rem]">
            Your Stats
          </h1>
          <p className="mt-2 max-w-[52ch] text-[11.5px] leading-relaxed text-[var(--text-mute)]">
            What you have listened to most in Hermes.
          </p>
        </div>
      </header>

      <ListeningStatsPanel />
    </div>
  );
}
