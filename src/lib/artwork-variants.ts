export const ARTWORK_WIDTHS = [160, 320, 640, 1024] as const;

export function isLocalArtwork(src: string | null | undefined): boolean {
  return (
    typeof src === "string" &&
    src.startsWith("/artwork/") &&
    src.endsWith(".png")
  );
}

function base(src: string) {
  return src.slice(0, -4);
}

export function localArtworkVariant(
  src: string,
  width: (typeof ARTWORK_WIDTHS)[number],
  format: "avif" | "webp" | "jpg",
) {
  return `${base(src)}-${width}.${format}`;
}

export function localArtworkSrcSet(
  src: string,
  format: "avif" | "webp",
) {
  return ARTWORK_WIDTHS.map(
    (width) => `${localArtworkVariant(src, width, format)} ${width}w`,
  ).join(", ");
}

export function artworkBackground(src: string, width = 640) {
  if (!isLocalArtwork(src)) return `url("${src}")`;
  return `image-set(url("${localArtworkVariant(src, width as (typeof ARTWORK_WIDTHS)[number], "avif")}") type("image/avif"), url("${localArtworkVariant(src, width as (typeof ARTWORK_WIDTHS)[number], "webp")}") type("image/webp"), url("${src}") type("image/png"))`;
}

export function mediaSessionArtwork(src: string) {
  if (!isLocalArtwork(src)) {
    return {
      src,
      sizes: undefined,
      type: src.endsWith(".svg") ? "image/svg+xml" : "image/png",
    };
  }
  return {
    src: localArtworkVariant(src, 640, "jpg"),
    sizes: "640x640",
    type: "image/jpeg",
  };
}
