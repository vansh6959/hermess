"use client";

import { useMemo, useState } from "react";
import { catalog } from "@/lib/catalog";
import { usePageTitle } from "@/hooks/useEnvironment";
import { AlbumCard, PlaylistCard } from "@/components/common/MediaCards";
import { EmptyState } from "@/components/ui/States";

type SortKey = "newest" | "oldest" | "az";

export default function DiscoverPage() {
  usePageTitle("Discover");
  const categories = catalog.getAvailableCategories();
  const [genre, setGenre] = useState("All");
  const [sort, setSort] = useState<SortKey>("newest");

  const albums = useMemo(() => {
    const filtered =
      genre === "All"
        ? catalog.getAlbums()
        : catalog
            .getAlbums()
            .filter(
              (album) =>
                album.genre.toLowerCase().includes(genre.toLowerCase()) ||
                album.title.toLowerCase().includes(genre.toLowerCase()),
            );
    return [...filtered].sort((a, b) => {
      if (sort === "az") return a.title.localeCompare(b.title);
      if (sort === "oldest") return a.releaseDate.localeCompare(b.releaseDate);
      return b.releaseDate.localeCompare(a.releaseDate);
    });
  }, [genre, sort]);

  return (
    <div className="space-y-9">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-[2rem] font-medium leading-none tracking-[-0.045em] text-white/90 sm:text-[2.6rem]">
          Discover
        </h1>
        <label className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--text-mute)]">
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-8 rounded-lg border border-white/10 bg-black/30 px-2 text-[11px] text-white outline-none focus:border-[rgba(215,247,106,0.4)]"
            aria-label="Sort albums"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A – Z</option>
          </select>
        </label>
      </header>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          className="chip"
          data-active={genre === "All"}
          onClick={() => setGenre("All")}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className="chip"
            data-active={genre === category.label}
            onClick={() => setGenre(category.label)}
          >
            {category.label}
          </button>
        ))}
      </div>

      <section>
        <div className="mb-4 flex items-baseline gap-2">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.26em] text-[var(--text-mute)]">
            {genre === "All" ? "Albums" : genre}
          </h2>
          <span className="text-[11px] text-[var(--text-mute)]">{albums.length}</span>
        </div>
        {albums.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            action={
              <button type="button" className="btn" onClick={() => setGenre("All")}>
                Show all
              </button>
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
      </section>

      <section>
        <div className="mb-4 flex items-baseline gap-2">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.26em] text-[var(--text-mute)]">
            Playlists
          </h2>
          <span className="text-[11px] text-[var(--text-mute)]">
            {catalog.getPlaylists().length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {catalog.getPlaylists().map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} className="w-full" />
          ))}
        </div>
      </section>
    </div>
  );
}
