import { describe, expect, it } from "vitest";
import {
  isSoftwareRenderer,
  shouldUseLiteEffects,
} from "@/lib/performance-quality";

describe("performance quality detection", () => {
  it("keeps full effects for a healthy frame window", () => {
    expect(
      shouldUseLiteEffects({ frames: 120, slowFrames: 0, elapsedMs: 2000 }),
    ).toBe(false);
  });

  it("switches to lite effects for sustained low frame rates", () => {
    expect(
      shouldUseLiteEffects({ frames: 60, slowFrames: 20, elapsedMs: 2000 }),
    ).toBe(true);
  });

  it("switches to lite effects for repeated long frames", () => {
    expect(
      shouldUseLiteEffects({ frames: 96, slowFrames: 24, elapsedMs: 2000 }),
    ).toBe(true);
  });

  it("ignores a tiny sample before judging", () => {
    expect(
      shouldUseLiteEffects({ frames: 4, slowFrames: 4, elapsedMs: 300 }),
    ).toBe(false);
  });

  it("uses a stricter threshold for the first sample", () => {
    const moderate = { frames: 80, slowFrames: 10, elapsedMs: 2000 };
    expect(shouldUseLiteEffects(moderate, false)).toBe(true);
    expect(shouldUseLiteEffects(moderate, true)).toBe(false);
    expect(
      shouldUseLiteEffects(
        { frames: 50, slowFrames: 24, elapsedMs: 2000 },
        true,
      ),
    ).toBe(true);
  });

  it("recognizes software renderer strings", () => {
    expect(
      isSoftwareRenderer(
        "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))",
      ),
    ).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.0, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("Microsoft Basic Render Driver")).toBe(true);
    expect(
      isSoftwareRenderer(
        "ANGLE (Intel, Intel(R) Graphics (0x0000A7AB) Direct3D11 vs_5_0 ps_5_0)",
      ),
    ).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
  });
});
