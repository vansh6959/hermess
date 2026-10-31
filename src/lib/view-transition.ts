"use client";

import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (
    callback: () => void | Promise<void>,
  ) => { finished: Promise<void> };
};

export function withViewTransition(update: () => void) {
  if (typeof document === "undefined") {
    update();
    return;
  }

  const doc = document as ViewTransitionDocument;
  if (
    !doc.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }

  doc.startViewTransition(() => {
    flushSync(update);
  });
}
