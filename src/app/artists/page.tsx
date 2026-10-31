"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { catalog } from "@/lib/catalog";
import { useLibraryStore } from "@/store/library";
import { usePageTitle } from "@/hooks/useEnvironment";
import { ArtistCard } from "@/components/common/MediaCards";
import { EmptyState } from "@/components/ui/States";

export default function FollowedArtistsPage() {
  usePageTitle("Followed Artists");
  const followedArtistIds = useLibraryStore((state) => state.followedArtistIds);

  const followed = followedArtistIds
    .map((id) => catalog.getArtist(id))
    .filter((artist): artist is NonNullable<typeof artist> => Boolean(artist));

  return (
    <div className="space-y-9">
      <header>
        <h1 className="flex items-center gap-3 text-[2rem] font-medium leading-none tracking-[-0.045em] text-white/90 sm:text-[2.6rem]">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[var(--mint)] sm:h-12 sm:w-12">
            <UserRound size={20} />
          </span>
          Followed Artists
          <span className="text-[13px] font-normal text-white/35">{followed.length}</span>
        </h1>
      </header>

      {followed.length === 0 ? (
        <EmptyState
          icon={<UserRound size={20} />}
          title="No followed artists"
          action={
            <Link href="/discover" className="btn btn-accent">
              Discover
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {followed.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} className="w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
