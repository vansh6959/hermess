"use client";

import { useEffect, useState } from "react";

// Scroll-state pattern adapted from Efferd UI's floating header
// (https://github.com/sshahaider/efferd-ui, MIT License,
// Copyright (c) 2025 sshahaider).
export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return scrolled;
}
