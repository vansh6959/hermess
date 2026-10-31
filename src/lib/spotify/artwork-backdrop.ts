const cache = new Map<string, Promise<string | null>>();
const MAX_CACHE = 48;

// A tiny, pre-blurred copy of the sleeve. Scaling this up gives a seamless
// colour field with the artwork's real colour layout instead of discrete
// palette blobs, and the blob-free result costs one image transform per frame.
const SIZE = 256;
const BLUR_PX = 18;

export function blurredArtworkUrl(src: string): Promise<string | null> {
  const cached = cache.get(src);
  if (cached) return cached;

  const request = new Promise<string | null>((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        if (image.naturalWidth === 0 || image.naturalHeight === 0) {
          resolve(null);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(null);
          return;
        }
        const scale = Math.max(
          SIZE / image.naturalWidth,
          SIZE / image.naturalHeight,
        );
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.filter = `blur(${BLUR_PX}px) saturate(1.65) brightness(1.02)`;
        context.drawImage(
          image,
          (SIZE - width) / 2,
          (SIZE - height) / 2,
          width,
          height,
        );
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });

  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(src, request);
  return request;
}
