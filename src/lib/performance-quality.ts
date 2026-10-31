export interface FrameWindow {
  frames: number;
  slowFrames: number;
  elapsedMs: number;
}

export function shouldUseLiteEffects(
  window: FrameWindow,
  severe = false,
): boolean {
  if (window.frames < 12 || window.elapsedMs < 750) return false;
  const fps = window.frames / (window.elapsedMs / 1000);
  const slowRatio = window.slowFrames / window.frames;
  if (severe) return fps < 35 || slowRatio > 0.4;
  return fps < 48 || slowRatio > 0.2;
}

export function isSoftwareRenderer(renderer: string | null): boolean {
  if (!renderer) return false;
  return /swiftshader|llvmpipe|software rasterizer|microsoft basic render|software/i.test(
    renderer,
  );
}
