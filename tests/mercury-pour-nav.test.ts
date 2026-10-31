import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MercuryPourNav } from "@/components/layout/MercuryPourNav";

describe("MercuryPourNav", () => {
  const sampleLinks = [
    { id: "home", label: "Home", href: "/" },
    { id: "discover", label: "Discover", href: "/discover" },
    { id: "library", label: "Library", href: "/library" },
  ];

  it("renders a 52px floating nav with brand and links", () => {
    const html = renderToString(
      React.createElement(MercuryPourNav, {
        brand: "HERMES",
        links: sampleLinks,
        active: "home",
      }),
    );

    expect(html).toContain("mercury-nav");
    expect(html).toContain("lc-scope");
    expect(html).toContain("mercury-brand");
    expect(html).toContain("HERMES");
    expect(html).toContain("mercury-capsule");
    expect(html).toContain("mercury-capsule-glint");
    expect(html).toContain("mercury-capsule-inset");
    expect(html).toContain("mercury-dark-labels");
    expect(html).toContain("Home");
    expect(html).toContain("Discover");
    expect(html).toContain("Library");
  });

  it("renders static style block without string interpolations", () => {
    const html = renderToString(
      React.createElement(MercuryPourNav, {
        links: sampleLinks,
      }),
    );

    expect(html).toContain(".lc-scope :focus-visible");
    expect(html).toContain("border-radius: revert-layer;");
    expect(html).toContain("prefers-reduced-motion");
  });

  it("renders optional CTA link at the end", () => {
    const html = renderToString(
      React.createElement(MercuryPourNav, {
        links: sampleLinks,
        cta: { label: "Action", href: "#cta" },
      }),
    );

    expect(html).toContain("mercury-cta");
    expect(html).toContain("Action");
    expect(html).toContain('href="#cta"');
  });

  it("computes liquid chrome finish CSS variables", () => {
    const html = renderToString(
      React.createElement(MercuryPourNav, {
        links: sampleLinks,
        finish: "gold",
      }),
    );

    expect(html).toContain("--lc-0");
    expect(html).toContain("--lc-1");
    expect(html).toContain("--lc-2");
    expect(html).toContain("--lc-3");
  });
});
