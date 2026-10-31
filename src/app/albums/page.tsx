"use client";

import Link from "next/link";
import { Disc3, Play, Shuffle } from "lucide-react";
import { catalog } from "@/lib/catalog";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { usePageTitle } from "@/hooks/useEnvironment";
import { AlbumCard } from "@/components/common/MediaCards";
import { EmptyState } from "@/components/ui/States";

export default function SavedAlbumsPage() {
  usePageTitle("Saved Albums");
  const savedAlbumIds = useLibraryStore((state) => state.savedAlbumIds);
  const playCollection = usePlayerStore((state) => state.playCollection);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const shuffle = usePlayerStore((state) => state.shuffle);

  const albums = savedAlbumIds
    .map((id) => catalog.getAlbum(id))
    .filter((album): album is NonNullable<typeof album> => Boolean(album));
  const trackIds = albums.flatMap((album) => album.trackIds);

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="flex items-center gap-3 text-[2rem] font-medium leading-none tracking-[-0.045em] text-white/90 sm:text-[2.6rem]">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[var(--acid)] sm:h-12 sm:w-12">
              <Disc3 size={20} />
            </span>
            Saved Albums
            <span className="text-[13px] font-normal text-white/35">{albums.length}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-accent h-10 px-4 text-[12px]"
            disabled={trackIds.length === 0}
            onClick={() => playCollection(trackIds, 0, "Saved albums")}
          >
            <Play size={14} fill="currentColor" />
            Play all
          </button>
          <button
            type="button"
            className="btn h-10 px-4 text-[12px]"
            disabled={trackIds.length === 0}
            onClick={() => {
              if (!shuffle) toggleShuffle();
              playCollection(trackIds, 0, "Saved albums");
            }}
          >
            <Shuffle size={14} />
            Shuffle
          </button>
        </div>
      </header>

      {albums.length === 0 ? (
        <EmptyState
          icon={<Disc3 size={20} />}
          title="No saved albums"
          action={
            <Link href="/discover" className="btn btn-accent">
              Discover
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {albums.map((album, index) => (
            <AlbumCard
              key={album.id}
              album={album}
              className="w-full"
              priority={index < 4}
            />
          ))}
        </div>
      )}
    </div>
  );
}
