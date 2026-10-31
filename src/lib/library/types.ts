export interface UserPlaylist {
  id: string;
  title: string;
  description: string;
  ownerName: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface RecentEntry {
  trackId: string;
  at: number;
}

export interface SearchEntry {
  query: string;
  at: number;
}

export interface LibrarySnapshot {
  likedTrackIds: string[];
  savedAlbumIds: string[];
  followedArtistIds: string[];
  recentlyPlayed: RecentEntry[];
  playlists: UserPlaylist[];
  searches: SearchEntry[];
}
