export interface PlaylistTrack {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  imageUrl: string | null;
  durationMs: number;
  spotifyUrl: string;
}

export interface ManageablePlaylist {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  trackCount: number;
  ownerName: string;
  collaborative: boolean;
  url: string;
}
