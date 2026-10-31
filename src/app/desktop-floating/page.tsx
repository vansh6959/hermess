"use client";

import { useEffect } from "react";
import { DesktopFloatingPlayer } from "@/components/desktop/DesktopFloatingPlayer";

export default function DesktopFloatingPage() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.desktopFloat = "true";
    return () => {
      delete root.dataset.desktopFloat;
    };
  }, []);

  useEffect(() => {
    const content = document.getElementById("desktop-float-content");
    if (!content) return;
    const report = () => {
      window.hermesDesktop?.resizeFloating?.(
        Math.ceil(content.getBoundingClientRect().height),
      );
    };
    report();
    const frame = window.requestAnimationFrame(report);
    const observer = new ResizeObserver(report);
    observer.observe(content);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div id="desktop-float-content" className="w-[372px]">
      <DesktopFloatingPlayer />
    </div>
  );
}
