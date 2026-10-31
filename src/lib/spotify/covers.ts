export interface HomeCoverShape {
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
  trackId?: string;
  albumId?: string;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function coverKeys(cover: HomeCoverShape): string[] {
  const keys: string[] = [];
  if (cover.albumId) keys.push(`album:${cover.albumId}`);
  const title = normalize(cover.title);
  const artist = normalize(cover.artist);
  if (title && artist) keys.push(`name:${title}|${artist}`);
  if (keys.length === 0 && cover.id) keys.push(`id:${cover.id}`);
  return keys;
}

export function mergeHomeCovers<T extends HomeCoverShape>(
  historyCovers: T[],
  discoverCovers: T[],
): T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const cover of [...historyCovers, ...discoverCovers]) {
    if (!cover?.imageUrl || !cover.title) continue;
    const keys = coverKeys(cover);
    if (keys.length === 0 || keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    output.push(cover);
  }

  return output;
}
