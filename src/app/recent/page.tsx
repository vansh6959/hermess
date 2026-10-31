"use client";

import Link from "next/link";
import { useState } from "react";
import { Clock3, Play, Trash2 } from "lucide-react";
import { catalog } from "@/lib/catalog";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { usePageTitle } from "@/hooks/useEnvironment";
import { LiquidTrackRow } from "@/components/ui/LiquidTrackRow";
import { EmptyState } from "@/components/ui/States";
import { LiquidDialog } from "@/components/ui/LiquidDialog";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { toast } from "@/store/toast";

export default function RecentPage() {
  usePageTitle("Recently Played");
  const recentEntries = useLibraryStore((state) => state.recentlyPlayed);
  const clearRecentlyPlayed = useLibraryStore((state) => state.clearRecentlyPlayed);
  const playCollection = usePlayerStore((state) => state.playCollection);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const tracks = recentEntries
    .map((entry) => catalog.getTrack(entry.trackId))
    .filter((track): track is NonNullable<typeof track> => Boolean(track));
  const queueIds = tracks.map((track) => track.id);

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="flex items-center gap-3 text-[2rem] font-medium leading-none tracking-[-0.045em] text-white/90 sm:text-[2.6rem]">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[var(--mint)] sm:h-12 sm:w-12">
              <Clock3 size={20} />
            </span>
            Recently Played
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-accent h-10 px-4 text-[12px]"
            onClick={() => tracks.length && playCollection(queueIds, 0, "Recently played")}
            disabled={tracks.length === 0}
          >
            <Play size={14} fill="currentColor" />
            Play all
          </button>
          <button
            type="button"
            className="btn h-10 px-4 text-[12px]"
            onClick={() => setConfirmOpen(true)}
            disabled={tracks.length === 0}
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </header>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<Clock3 size={20} />}
          title="Nothing played yet"
          action={
            <Link href="/discover" className="btn btn-accent">
              Discover
            </Link>
          }
        />
      ) : (
        <div className="liquid rim rounded-2xl p-2">
          {tracks.map((track, index) => (
            <LiquidTrackRow
              key={`${track.id}-${index}`}
              track={track}
              index={index}
              queueIds={queueIds}
              contextLabel="Recently played"
            />
          ))}
        </div>
      )}

      <LiquidDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Clear listening history?"
        description="This clears the local listening history."
        size="sm"
        footer={
          <>
            <LiquidButton variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </LiquidButton>
            <LiquidButton
              variant="danger"
              onClick={() => {
                clearRecentlyPlayed();
                setConfirmOpen(false);
                toast("Listening history cleared", "success");
              }}
            >
              Clear
            </LiquidButton>
          </>
        }
      />
    </div>
  );
}
