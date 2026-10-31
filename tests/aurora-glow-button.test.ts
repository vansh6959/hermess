import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { AuroraGlowButton } from "@/components/ui/AuroraGlowButton";

describe("AuroraGlowButton", () => {
  it("renders a button with default aurora grammar classes", () => {
    const html = renderToString(
      React.createElement(AuroraGlowButton, null, "Click Me"),
    );

    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain("aurora-btn");
    expect(html).toContain("aurora-btn--md");
    expect(html).toContain("aurora-btn--primary");
    expect(html).toContain("aurora-palette--boreal");
    expect(html).toContain("aurora-glow");
    expect(html).toContain("aurora-pill");
    expect(html).toContain("aurora-rim");
    expect(html).toContain("aurora-content");
    expect(html).toContain("Click Me");
  });

  it("renders as anchor when href is provided", () => {
    const html = renderToString(
      React.createElement(AuroraGlowButton, { href: "/discover" }, "Discover"),
    );

    expect(html).toContain("<a");
    expect(html).toContain('href="/discover"');
    expect(html).toContain("Discover");
    expect(html).not.toContain("<button");
  });

  it("supports quiet variant and different sizes and palettes", () => {
    const html = renderToString(
      React.createElement(
        AuroraGlowButton,
        {
          variant: "quiet",
          size: "sm",
          palette: "verdant",
          lit: true,
        },
        "Action",
      ),
    );

    expect(html).toContain("aurora-btn--quiet");
    expect(html).toContain("aurora-btn--sm");
    expect(html).toContain("aurora-palette--verdant");
    expect(html).toContain("aurora-btn--lit");
  });

  it("handles disabled state properly", () => {
    const html = renderToString(
      React.createElement(
        AuroraGlowButton,
        { disabled: true },
        "Disabled Action",
      ),
    );

    expect(html).toContain("disabled");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("aurora-btn--disabled");
  });

  it("renders the static CSS block containing @property --au-a without dynamic string interpolation", () => {
    const html = renderToString(
      React.createElement(AuroraGlowButton, null, "Self-contained"),
    );

    expect(html).toContain("@property --au-a");
    expect(html).toContain('syntax: "<angle>";');
    expect(html).toContain("aurora-rotate");
    expect(html).toContain("aurora-ripple-expand");
    expect(html).toContain("prefers-reduced-motion");
  });
});
