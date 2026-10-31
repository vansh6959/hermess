import type {
  Album,
  Artist,
  Artwork,
  CatalogService,
  Category,
  Playlist,
  SearchResults,
  Track,
} from "./types";
import { buildLyrics } from "./lyrics";

/* -------------------------------------------------------------------------- */
/* Artwork                                                                     */
/* -------------------------------------------------------------------------- */

const ART = {
  glassHours: {
    src: "/artwork/glass-hours.png",
    alt: "Translucent glass panels catching a cloudy sky in a dark studio",
    palette: { a: "#94b8b2", b: "#d7e2d8", c: "#20363c" },
  },
  neonOrchard: {
    src: "/artwork/neon-orchard.png",
    alt: "Chartreuse glass petals growing from wet black stone",
    palette: { a: "#c8e75a", b: "#9fce3e", c: "#13230f" },
  },
  afterglow: {
    src: "/artwork/afterglow.png",
    alt: "Amber sunset light bending through curved smoked glass",
    palette: { a: "#e7954e", b: "#f6dfc0", c: "#3a1c12" },
  },
  staticBloom: {
    src: "/artwork/static-bloom.png",
    alt: "Chrome and glass flower blooming against black",
    palette: { a: "#c3cbd2", b: "#eef2f4", c: "#161a20" },
  },
  paperMoons: {
    src: "/artwork/paper-moons.png",
    alt: "Paper moon discs and frosted glass rings in lavender light",
    palette: { a: "#cabadd", b: "#efe6dc", c: "#5c4c68" },
  },
  lowTide: {
    src: "/artwork/low-tide.png",
    alt: "Emerald wave folding through liquid glass underwater",
    palette: { a: "#2f8a6a", b: "#9fe0c4", c: "#04201d" },
  },
  plLiquidHours: {
    src: "/artwork/pl-liquid-hours.svg",
    alt: "Liquid Hours playlist artwork",
    palette: { a: "#9fc9c0", b: "#e2ece3", c: "#1d3a3e" },
  },
  plNeonCommute: {
    src: "/artwork/pl-neon-commute.svg",
    alt: "Neon Commute playlist artwork",
    palette: { a: "#c8ef4f", b: "#86b23c", c: "#14220f" },
  },
  plAfterHours: {
    src: "/artwork/pl-after-hours.svg",
    alt: "After Hours Bloom playlist artwork",
    palette: { a: "#e6a15c", b: "#b06b8a", c: "#2c1524" },
  },
  plFloat: {
    src: "/artwork/pl-float.svg",
    alt: "Float playlist artwork",
    palette: { a: "#b4bde8", b: "#e8e3f2", c: "#2a2f4a" },
  },
  plDeepEnd: {
    src: "/artwork/pl-deep-end.svg",
    alt: "The Deep End playlist artwork",
    palette: { a: "#3f8f78", b: "#8ed3b8", c: "#071c24" },
  },
  plFirstLight: {
    src: "/artwork/pl-first-light.svg",
    alt: "First Light playlist artwork",
    palette: { a: "#f2c9a8", b: "#f7ead9", c: "#4a3a34" },
  },
} satisfies Record<string, Artwork>;

/* -------------------------------------------------------------------------- */
/* Artists                                                                     */
/* -------------------------------------------------------------------------- */

const ARTISTS: Artist[] = [
  {
    id: "artist-mira-vale",
    name: "Mira Vale",
    bio: "Dream-pop songwriter working in slow motion. Mira builds songs from field recordings, close-mic'd breath and glassy synth lines recorded in a converted greenhouse outside Lisbon.",
    genres: ["Dream Pop", "Ambient Pop"],
    artwork: ART.glassHours,
    monthlyListeners: 1_284_000,
    relatedArtistIds: ["artist-noor-halcyon", "artist-silverline"],
    providerId: "local-demo",
  },
  {
    id: "artist-orchid-static",
    name: "Orchid Static",
    bio: "Producer and sound designer turning botanical textures into club music. Orchid Static's live sets are built around hybrid glass instruments and a single green lamp.",
    genres: ["Electronic", "Experimental"],
    artwork: ART.neonOrchard,
    monthlyListeners: 842_000,
    relatedArtistIds: ["artist-silverline", "artist-tidal-youth"],
    providerId: "local-demo",
  },
  {
    id: "artist-june-ardor",
    name: "June Ardor",
    bio: "Alt-R&B from the hour after sunset. June writes about warm rooms, long drives and the things people almost say.",
    genres: ["Alt R&B", "Soul"],
    artwork: ART.afterglow,
    monthlyListeners: 2_105_000,
    relatedArtistIds: ["artist-mira-vale", "artist-noor-halcyon"],
    providerId: "local-demo",
  },
  {
    id: "artist-silverline",
    name: "Silverline",
    bio: "Ambient techno duo fascinated by metal, motion blur and empty rooms. Every release is recorded in one take with no overdubs.",
    genres: ["Ambient Techno", "Electronic"],
    artwork: ART.staticBloom,
    monthlyListeners: 618_000,
    relatedArtistIds: ["artist-orchid-static", "artist-tidal-youth"],
    providerId: "local-demo",
  },
  {
    id: "artist-noor-halcyon",
    name: "Noor Halcyon",
    bio: "Chamber-pop arranger writing small songs for strings, felt piano and a room with very tall windows.",
    genres: ["Chamber Pop", "Indie Folk"],
    artwork: ART.paperMoons,
    monthlyListeners: 934_000,
    relatedArtistIds: ["artist-mira-vale", "artist-june-ardor"],
    providerId: "local-demo",
  },
  {
    id: "artist-tidal-youth",
    name: "Tidal Youth",
    bio: "Post-rock quartet from the coast. Guitars through salt air, tape delay and a practiced tolerance for weather.",
    genres: ["Post-Rock", "Shoegaze"],
    artwork: ART.lowTide,
    monthlyListeners: 466_000,
    relatedArtistIds: ["artist-silverline", "artist-orchid-static"],
    providerId: "local-demo",
  },
];

/* -------------------------------------------------------------------------- */
/* Albums & tracks                                                             */
/* -------------------------------------------------------------------------- */

type TrackDef = {
  id: string;
  title: string;
  duration: number;
  explicit?: boolean;
  instrumental?: boolean;
  tags?: string[];
};

type AlbumDef = {
  id: string;
  title: string;
  artistId: string;
  year: number;
  releaseDate: string;
  genre: string;
  description: string;
  artwork: Artwork;
  type: "album" | "ep";
  tracks: TrackDef[];
};

const ALBUM_DEFS: AlbumDef[] = [
  {
    id: "album-glass-hours",
    title: "Glass Hours",
    artistId: "artist-mira-vale",
    year: 2026,
    releaseDate: "2026-04-17",
    genre: "Dream Pop",
    description:
      "Eight months of dusk recordings, reduced to four songs about waiting. Recorded through a single plate of antique glass.",
    artwork: ART.glassHours,
    type: "album",
    tracks: [
      { id: "track-glass-hours", title: "Glass Hours", duration: 252 },
      { id: "track-doorway-weather", title: "Doorway Weather", duration: 218 },
      { id: "track-pale-static", title: "Pale Static", duration: 196 },
      { id: "track-held-in-amber", title: "Held in Amber", duration: 241, tags: ["late night"] },
    ],
  },
  {
    id: "album-glass-hours-deluxe",
    title: "Glass Hours (Deluxe)",
    artistId: "artist-mira-vale",
    year: 2026,
    releaseDate: "2026-09-12",
    genre: "Dream Pop",
    description:
      "Two extra rooms from the same house: a slower night version and a song written on the last morning of the sessions.",
    artwork: ART.glassHours,
    type: "ep",
    tracks: [
      { id: "track-glass-hours-night", title: "Glass Hours (Night Version)", duration: 268 },
      { id: "track-cloud-room", title: "Cloud Room", duration: 205 },
    ],
  },
  {
    id: "album-neon-orchard",
    title: "Neon Orchard",
    artistId: "artist-orchid-static",
    year: 2025,
    releaseDate: "2025-06-06",
    genre: "Electronic",
    description:
      "Club music grown under lamps. Every kick is a stem hitting a wet leaf.",
    artwork: ART.neonOrchard,
    type: "album",
    tracks: [
      { id: "track-neon-orchard", title: "Neon Orchard", duration: 224 },
      { id: "track-petalwire", title: "Petalwire", duration: 201 },
      {
        id: "track-chlorophyll-kiss",
        title: "Chlorophyll Kiss",
        duration: 232,
        explicit: true,
        tags: ["club"],
      },
    ],
  },
  {
    id: "album-neon-nights",
    title: "Neon Nights",
    artistId: "artist-orchid-static",
    year: 2025,
    releaseDate: "2025-11-21",
    genre: "Electronic",
    description: "A two-track nightcap: one greenhouse, one violet signal.",
    artwork: ART.neonOrchard,
    type: "ep",
    tracks: [
      { id: "track-greenhouse-ghost", title: "Greenhouse Ghost", duration: 198 },
      { id: "track-violet-signal", title: "Violet Signal", duration: 213 },
    ],
  },
  {
    id: "album-afterglow",
    title: "Afterglow",
    artistId: "artist-june-ardor",
    year: 2026,
    releaseDate: "2026-02-13",
    genre: "Alt R&B",
    description:
      "Songs for the drive home, recorded mostly after midnight with the windows down.",
    artwork: ART.afterglow,
    type: "album",
    tracks: [
      { id: "track-afterglow", title: "Afterglow", duration: 236 },
      { id: "track-dust-on-the-lens", title: "Dust on the Lens", duration: 209 },
      { id: "track-slow-burn", title: "Slow Burn", duration: 247, explicit: true },
      { id: "track-last-light", title: "Last Light", duration: 228, tags: ["quiet"] },
    ],
  },
  {
    id: "album-static-bloom",
    title: "Static Bloom",
    artistId: "artist-silverline",
    year: 2024,
    releaseDate: "2024-10-04",
    genre: "Ambient Techno",
    description:
      "A single automated patch, three rooms, no overdubs. The bloom is a metal ribbon reflecting a strobe.",
    artwork: ART.staticBloom,
    type: "album",
    tracks: [
      {
        id: "track-static-bloom",
        title: "Static Bloom",
        duration: 284,
        instrumental: true,
      },
      {
        id: "track-chrome-petals",
        title: "Chrome Petals",
        duration: 219,
        instrumental: true,
      },
      { id: "track-signal-fade", title: "Signal Fade", duration: 256 },
    ],
  },
  {
    id: "album-paper-moons",
    title: "Paper Moons",
    artistId: "artist-noor-halcyon",
    year: 2025,
    releaseDate: "2025-03-28",
    genre: "Chamber Pop",
    description:
      "String arrangements written for a room with very tall windows, performed by six people sitting very close together.",
    artwork: ART.paperMoons,
    type: "album",
    tracks: [
      { id: "track-paper-moons", title: "Paper Moons", duration: 231 },
      { id: "track-orbit-of-us", title: "Orbit of Us", duration: 244 },
      {
        id: "track-bone-china-sky",
        title: "Bone China Sky",
        duration: 217,
        instrumental: true,
      },
    ],
  },
  {
    id: "album-low-tide",
    title: "Low Tide",
    artistId: "artist-tidal-youth",
    year: 2026,
    releaseDate: "2026-08-21",
    genre: "Post-Rock",
    description:
      "Four long exposures of the same coastline at different hours. Guitars tuned to the weather.",
    artwork: ART.lowTide,
    type: "album",
    tracks: [
      { id: "track-low-tide", title: "Low Tide", duration: 262 },
      { id: "track-undertow", title: "Undertow", duration: 234 },
      { id: "track-salt-and-silver", title: "Salt and Silver", duration: 248 },
      {
        id: "track-moonpull",
        title: "Moonpull",
        duration: 279,
        instrumental: true,
      },
    ],
  },
];

const TRACKS: Track[] = [];
const ALBUMS: Album[] = ALBUM_DEFS.map((def) => {
  const album: Album = {
    id: def.id,
    title: def.title,
    artistId: def.artistId,
    year: def.year,
    releaseDate: def.releaseDate,
    genre: def.genre,
    description: def.description,
    artwork: def.artwork,
    trackIds: def.tracks.map((track) => track.id),
    providerId: "local-demo",
    type: def.type,
  };

  def.tracks.forEach((track, index) => {
    TRACKS.push({
      id: track.id,
      title: track.title,
      artistId: def.artistId,
      albumId: def.id,
      duration: track.duration,
      trackNumber: index + 1,
      explicit: Boolean(track.explicit),
      genres: [def.genre],
      tags: track.tags ?? [],
      artwork: def.artwork,
      releaseDate: def.releaseDate,
      providerId: "local-demo",
      playbackEligibility: "demo",
      previewAvailable: false,
      metadataSource: "local-demo",
      lyrics: track.instrumental
        ? null
        : buildLyrics(def.id, TRACKS.length + index, track.duration),
    });
  });

  return album;
});

const ALBUM_BY_ID = new Map(ALBUMS.map((album) => [album.id, album]));
const ARTIST_BY_ID = new Map(ARTISTS.map((artist) => [artist.id, artist]));
const TRACK_BY_ID = new Map(TRACKS.map((track) => [track.id, track]));

/* -------------------------------------------------------------------------- */
/* Playlists                                                                   */
/* -------------------------------------------------------------------------- */

const PLAYLISTS: Playlist[] = [
  {
    id: "pl-liquid-hours",
    title: "Liquid Hours",
    description:
      "Glass, water and slow light. Best after 11pm with the lights off.",
    ownerName: "Hermes",
    artwork: ART.plLiquidHours,
    curated: true,
    providerId: "local-demo",
    trackIds: [
      "track-glass-hours",
      "track-doorway-weather",
      "track-afterglow",
      "track-paper-moons",
      "track-low-tide",
      "track-orbit-of-us",
      "track-pale-static",
      "track-held-in-amber",
    ],
  },
  {
    id: "pl-neon-commute",
    title: "Neon Commute",
    description: "Green light for the train, the walk and the last block home.",
    ownerName: "Hermes",
    artwork: ART.plNeonCommute,
    curated: true,
    providerId: "local-demo",
    trackIds: [
      "track-neon-orchard",
      "track-petalwire",
      "track-chlorophyll-kiss",
      "track-greenhouse-ghost",
      "track-violet-signal",
      "track-static-bloom",
    ],
  },
  {
    id: "pl-after-hours",
    title: "After Hours Bloom",
    description: "Warm rooms, long drives, and the things people almost say.",
    ownerName: "Hermes",
    artwork: ART.plAfterHours,
    curated: true,
    providerId: "local-demo",
    trackIds: [
      "track-afterglow",
      "track-slow-burn",
      "track-last-light",
      "track-dust-on-the-lens",
      "track-undertow",
      "track-salt-and-silver",
      "track-moonpull",
    ],
  },
  {
    id: "pl-float",
    title: "Float",
    description: "No words, no deadlines. Just air moving through the room.",
    ownerName: "Hermes",
    artwork: ART.plFloat,
    curated: true,
    providerId: "local-demo",
    trackIds: [
      "track-static-bloom",
      "track-chrome-petals",
      "track-signal-fade",
      "track-bone-china-sky",
      "track-moonpull",
      "track-cloud-room",
    ],
  },
  {
    id: "pl-deep-end",
    title: "The Deep End",
    description: "Low tide, undertow, and one long exhale.",
    ownerName: "Hermes",
    artwork: ART.plDeepEnd,
    curated: true,
    providerId: "local-demo",
    trackIds: [
      "track-low-tide",
      "track-undertow",
      "track-salt-and-silver",
      "track-moonpull",
      "track-glass-hours-night",
    ],
  },
  {
    id: "pl-first-light",
    title: "First Light",
    description: "For the hour when the room turns from grey to cream.",
    ownerName: "Hermes",
    artwork: ART.plFirstLight,
    curated: true,
    providerId: "local-demo",
    trackIds: [
      "track-cloud-room",
      "track-paper-moons",
      "track-bone-china-sky",
      "track-last-light",
      "track-orbit-of-us",
    ],
  },
];

const PLAYLIST_BY_ID = new Map(PLAYLISTS.map((playlist) => [playlist.id, playlist]));

const CATEGORIES: Category[] = [
  {
    id: "cat-dream-pop",
    label: "Dream Pop",
    blurb: "Reverb, breath, glass",
    artwork: ART.glassHours,
  },
  {
    id: "cat-electronic",
    label: "Electronic",
    blurb: "Green light, heavy bass",
    artwork: ART.neonOrchard,
  },
  {
    id: "cat-rnb",
    label: "Alt R&B",
    blurb: "Warm rooms after dark",
    artwork: ART.afterglow,
  },
  {
    id: "cat-ambient",
    label: "Ambient",
    blurb: "Air without words",
    artwork: ART.staticBloom,
  },
  {
    id: "cat-chamber",
    label: "Chamber Pop",
    blurb: "Strings in tall rooms",
    artwork: ART.paperMoons,
  },
  {
    id: "cat-post-rock",
    label: "Post-Rock",
    blurb: "Long coastlines",
    artwork: ART.lowTide,
  },
];

const RECENT_IDS = [
  "track-glass-hours",
  "track-neon-orchard",
  "track-afterglow",
  "track-paper-moons",
  "track-low-tide",
];

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

function relevance(text: string, query: string): number {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  if (haystack === query) return 4;
  if (haystack.startsWith(query)) return 3;
  if (haystack.split(/[\s-]+/).some((word) => word.startsWith(query))) return 2;
  if (haystack.includes(query)) return 1;
  return 0;
}

function rank<T>(items: T[], query: string, text: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, score: relevance(text(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

export const catalog: CatalogService = {
  searchCatalog(query: string): SearchResults {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return { tracks: [], artists: [], albums: [], playlists: [] };
    }

    const artistName = (artistId: string) =>
      ARTIST_BY_ID.get(artistId)?.name ?? "";

    return {
      tracks: rank(
        TRACKS,
        normalized,
        (track) => `${track.title} ${artistName(track.artistId)}`,
      ).slice(0, 8),
      artists: rank(ARTISTS, normalized, (artist) => artist.name).slice(0, 4),
      albums: rank(
        ALBUMS,
        normalized,
        (album) => `${album.title} ${artistName(album.artistId)}`,
      ).slice(0, 6),
      playlists: rank(
        PLAYLISTS,
        normalized,
        (playlist) => `${playlist.title} ${playlist.description}`,
      ).slice(0, 4),
    };
  },

  getTrack(id) {
    return TRACK_BY_ID.get(id);
  },

  getTracks(ids) {
    return ids
      .map((id) => TRACK_BY_ID.get(id))
      .filter((track): track is Track => Boolean(track));
  },

  getAlbum(id) {
    return ALBUM_BY_ID.get(id);
  },

  getArtist(id) {
    return ARTIST_BY_ID.get(id);
  },

  getPlaylist(id) {
    return PLAYLIST_BY_ID.get(id);
  },

  getAlbums() {
    return ALBUMS;
  },

  getArtists() {
    return ARTISTS;
  },

  getPlaylists() {
    return PLAYLISTS;
  },

  getAllTracks() {
    return TRACKS;
  },

  getRecommendations(seedTrackId) {
    const seed = seedTrackId ? TRACK_BY_ID.get(seedTrackId) : undefined;
    if (!seed) return ALBUMS.slice(0, 6);
    const seedGenres = new Set(seed.genres);
    return [...ALBUMS]
      .filter((album) => album.id !== seed.albumId)
      .sort((a, b) => {
        const aScore = seedGenres.has(a.genre) ? 1 : 0;
        const bScore = seedGenres.has(b.genre) ? 1 : 0;
        return bScore - aScore;
      })
      .slice(0, 6);
  },

  getRecentlyPlayed() {
    return RECENT_IDS.map((id) => TRACK_BY_ID.get(id)).filter(
      (track): track is Track => Boolean(track),
    );
  },

  getAvailableCategories() {
    return CATEGORIES;
  },

  getNewReleases() {
    return [...ALBUMS].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  },
};

export { ARTISTS, ALBUMS, TRACKS, PLAYLISTS, TRACK_BY_ID, ALBUM_BY_ID };
export { ART as ARTWORK };
