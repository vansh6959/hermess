"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { ArtworkPalette } from "@/lib/catalog/types";
import { isLocalArtwork, localArtworkVariant } from "@/lib/artwork-variants";

const cache = new Map<string, ArtworkPalette>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function tune(
  hue: number,
  saturation: number,
  lightness: number,
): string {
  if (saturation < 0.08) {
    return hslToHex(hue, 0, lightness);
  }
  return hslToHex(
    hue,
    Math.max(0.3, Math.min(0.82, saturation)),
    lightness,
  );
}

type ColorBucket = {
  count: number;
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  l: number;
};

type HueFamily = {
  count: number;
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  l: number;
};

const HUE_BINS = 24;

function tuneGridCell(
  r: number,
  g: number,
  b: number,
  cellLightness: number,
  coverLightness: number,
): string {
  const [h, s] = rgbToHsl(r, g, b);
  const saturation =
    s < 0.08 ? 0 : Math.max(0.3, Math.min(0.88, s * 1.45));
  // Keep the field's brightness anchored to the cover cell, so a neon
  // accent on a mostly black sleeve does not flood the viewport.
  const cellTarget = Math.min(
    0.46,
    Math.max(0.09, 0.08 + cellLightness * 0.8),
  );
  const coverDamping =
    coverLightness < 0.16 ? 0.62 : coverLightness < 0.24 ? 0.8 : 1;
  return hslToHex(h, saturation, cellTarget * coverDamping);
}

function hueDistance(first: number, second: number): number {
  const distance = Math.abs(first - second);
  return Math.min(distance, 1 - distance);
}

function buildFamilies(buckets: ColorBucket[]): HueFamily[] {
  const families: HueFamily[] = Array.from({ length: HUE_BINS }, () => ({
    count: 0,
    r: 0,
    g: 0,
    b: 0,
    h: 0,
    s: 0,
    l: 0,
  }));

  for (const bucket of buckets) {
    if (bucket.s < 0.08) continue;
    const bin = Math.min(
      HUE_BINS - 1,
      Math.floor((bucket.h < 0 ? bucket.h + 1 : bucket.h) * HUE_BINS),
    );
    const family = families[bin];
    family.count += bucket.count;
    family.r += bucket.r * bucket.count;
    family.g += bucket.g * bucket.count;
    family.b += bucket.b * bucket.count;
  }

  for (const family of families) {
    if (family.count === 0) continue;
    family.r /= family.count;
    family.g /= family.count;
    family.b /= family.count;
    const [h, s, l] = rgbToHsl(family.r, family.g, family.b);
    family.h = h;
    family.s = s;
    family.l = l;
  }

  return families;
}

function choosePalette(buckets: ColorBucket[], totalPixels: number) {
  const families = buildFamilies(buckets)
    .filter((family) => family.count > 0)
    .sort((a, b) => b.count * (0.5 + b.s) - a.count * (0.5 + a.s));

  const primaryFamily = families[0];
  const average = buckets
    .filter((bucket) => bucket.count > 0)
    .reduce<{ r: number; g: number; b: number; count: number }>(
      (acc, bucket) => {
        acc.r += bucket.r * bucket.count;
        acc.g += bucket.g * bucket.count;
        acc.b += bucket.b * bucket.count;
        acc.count += bucket.count;
        return acc;
      },
      { r: 0, g: 0, b: 0, count: 0 },
    );

  if (!primaryFamily) {
    const neutral = average.count > 0 ? average : { r: 24, g: 26, b: 30, count: 1 };
    const [h, , l] = rgbToHsl(
      neutral.r / neutral.count,
      neutral.g / neutral.count,
      neutral.b / neutral.count,
    );
    return {
      a: tune(h, 0, Math.min(0.42, Math.max(0.3, l))),
      b: tune(h, 0, 0.62),
      c: hslToHex(h, 0, 0.1),
    };
  }

  const primaryLightness =
    primaryFamily.l > 0.62
      ? 0.5
      : primaryFamily.l < 0.18
        ? 0.44
        : 0.47;
  const primarySaturation = Math.max(
    0.34,
    Math.min(0.86, primaryFamily.s * 1.08),
  );

  const secondaryFamily = families.find(
    (family) =>
      family !== primaryFamily &&
      family.count >= Math.max(8, totalPixels * 0.012) &&
      hueDistance(family.h, primaryFamily.h) > 0.11,
  );

  const secondary = secondaryFamily
    ? {
        h: secondaryFamily.h,
        s: Math.max(0.3, Math.min(0.74, secondaryFamily.s * 1.05)),
        l:
          primaryFamily.l < 0.3
            ? 0.6
            : secondaryFamily.l > 0.62
              ? 0.56
              : 0.54,
      }
    : {
        h: primaryFamily.h,
        s: primarySaturation * 0.92,
        l: Math.min(0.7, primaryLightness + 0.18),
      };

  return {
    a: tune(primaryFamily.h, primarySaturation, primaryLightness),
    b: tune(secondary.h, secondary.s, secondary.l),
    c: tune(
      primaryFamily.h,
      Math.max(0.3, primarySaturation * 0.82),
      primaryFamily.l > 0.6 ? 0.15 : 0.11,
    ),
  };
}

export async function extractArtworkPalette(
  src: string,
  fallback: ArtworkPalette,
): Promise<ArtworkPalette> {
  const cached = cache.get(src);
  if (cached) return cached;

  if (typeof window === "undefined") return fallback;

  try {
    const colors = await new Promise<ArtworkPalette>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.onload = () => {
        // A multiple of three keeps the 3×3 atmosphere cells even.
        const size = 60;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          reject(new Error("Canvas unavailable"));
          return;
        }
        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);

        const buckets = new Map<
          number,
          { r: number; g: number; b: number; count: number }
        >();
        const gridSums = Array.from({ length: 9 }, () => ({
          r: 0,
          g: 0,
          b: 0,
          count: 0,
        }));
        const gridFamilies = Array.from({ length: 9 }, () =>
          Array.from({ length: HUE_BINS }, () => ({
            r: 0,
            g: 0,
            b: 0,
            count: 0,
          })),
        );
        const total = { r: 0, g: 0, b: 0, count: 0 };
        let eligible = 0;

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 200) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const pixel = i / 4;
          const x = pixel % size;
          const y = Math.floor(pixel / size);
          const cell =
            Math.min(2, Math.floor((y * 3) / size)) * 3 +
            Math.min(2, Math.floor((x * 3) / size));
          const gridCell = gridSums[cell];
          gridCell.r += r;
          gridCell.g += g;
          gridCell.b += b;
          gridCell.count += 1;
          total.r += r;
          total.g += g;
          total.b += b;
          total.count += 1;

          const [pixelHue, pixelSaturation, pixelLightness] = rgbToHsl(
            r,
            g,
            b,
          );
          if (
            pixelSaturation >= 0.12 &&
            pixelLightness > 0.08 &&
            pixelLightness < 0.9
          ) {
            const bin = Math.min(
              HUE_BINS - 1,
              Math.floor(pixelHue * HUE_BINS),
            );
            const family = gridFamilies[cell][bin];
            family.r += r;
            family.g += g;
            family.b += b;
            family.count += 1;
          }

          // The spatial grid keeps dark pixels so black sleeves stay dark;
          // the palette buckets skip them so accents still drive the hue.
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (luminance < 16 || luminance > 242) continue;
          eligible += 1;

          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          const existing = buckets.get(key);
          if (existing) {
            existing.r += r;
            existing.g += g;
            existing.b += b;
            existing.count += 1;
          } else {
            buckets.set(key, { r, g, b, count: 1 });
          }
        }

        if (eligible === 0) {
          reject(new Error("No colors"));
          return;
        }

        const colors: ColorBucket[] = [...buckets.values()].map(
          (bucket) => {
            const r = bucket.r / bucket.count;
            const g = bucket.g / bucket.count;
            const b = bucket.b / bucket.count;
            const [h, s, l] = rgbToHsl(r, g, b);
            return { r, g, b, h, s, l, count: bucket.count };
          },
        );

        const palette = choosePalette(colors, eligible);
        const totalLightness =
          total.count > 0
            ? rgbToHsl(
                total.r / total.count,
                total.g / total.count,
                total.b / total.count,
              )[2]
            : 0;
        const fallbackCell =
          total.count > 0
            ? tuneGridCell(
                total.r / total.count,
                total.g / total.count,
                total.b / total.count,
                totalLightness,
                totalLightness,
              )
            : palette.c;
        const grid = gridSums.map((cell, index) => {
          if (cell.count === 0) return fallbackCell;
          const cellR = cell.r / cell.count;
          const cellG = cell.g / cell.count;
          const cellB = cell.b / cell.count;
          const cellLightness = rgbToHsl(cellR, cellG, cellB)[2];
          const dominant = gridFamilies[index].reduce(
            (best, family) => (family.count > best.count ? family : best),
            { r: 0, g: 0, b: 0, count: 0 },
          );
          if (dominant.count >= Math.max(8, cell.count * 0.18)) {
            return tuneGridCell(
              dominant.r / dominant.count,
              dominant.g / dominant.count,
              dominant.b / dominant.count,
              cellLightness,
              totalLightness,
            );
          }
          return tuneGridCell(
            cellR,
            cellG,
            cellB,
            cellLightness,
            totalLightness,
          );
        });

        resolve({ ...palette, grid });
      };
      image.onerror = () => reject(new Error("Artwork failed to load"));
      // Sampling a 56px canvas never needs the full-resolution original.
      image.src = isLocalArtwork(src)
        ? localArtworkVariant(src, 160, "webp")
        : src;
    });

    cache.set(src, colors);
    return colors;
  } catch {
    cache.set(src, fallback);
    return fallback;
  }
}

export function useArtworkPalette(
  src: string | undefined,
  fallback: ArtworkPalette,
): ArtworkPalette {
  const [state, setState] = useState<{
    src: string | undefined;
    palette: ArtworkPalette;
  }>(() => ({
    src,
    palette: src ? (cache.get(src) ?? fallback) : fallback,
  }));

  if (state.src !== src) {
    // Apply a prewarmed palette in the same commit as the new artwork so the
    // player does not repaint its whole stage a frame later.
    setState({
      src,
      palette: src ? (cache.get(src) ?? state.palette) : fallback,
    });
  }

  useEffect(() => {
    if (!src || cache.has(src)) return;
    let cancelled = false;
    extractArtworkPalette(src, fallback)
      .then((next) => {
        if (!cancelled) {
          setState((current) =>
            current.src === src ? { src, palette: next } : current,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState((current) =>
            current.src === src ? { src, palette: fallback } : current,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [src, fallback.a, fallback.b, fallback.c]);

  return state.palette;
}

export function paletteStyle(palette: ArtworkPalette): CSSProperties {
  const grid =
    palette.grid && palette.grid.length === 9
      ? palette.grid
      : [
          palette.c,
          palette.a,
          palette.b,
          palette.a,
          palette.b,
          palette.a,
          palette.c,
          palette.b,
          palette.c,
        ];

  return {
    "--np-a": palette.a,
    "--np-b": palette.b,
    "--np-c": palette.c,
    "--np-g0": grid[0],
    "--np-g1": grid[1],
    "--np-g2": grid[2],
    "--np-g3": grid[3],
    "--np-g4": grid[4],
    "--np-g5": grid[5],
    "--np-g6": grid[6],
    "--np-g7": grid[7],
    "--np-g8": grid[8],
  } as CSSProperties;
}
