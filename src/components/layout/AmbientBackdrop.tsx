"use client";

import { useEffect, useRef } from "react";

export function AmbientBackdrop() {
  const lightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!lightRef.current) return;
        lightRef.current.style.transform = `translate3d(${event.clientX - 300}px, ${event.clientY - 300}px, 0)`;
      });
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#040506]">
      <div className="liminal-door" />
      <div className="liminal-frame" />
      <div className="liminal-haze" />
      <div className="liminal-grid" />
      <div className="liminal-floor" />

      <div className="absolute inset-0 bg-[radial-gradient(110%_78%_at_50%_-12%,rgba(170,206,186,0.09),transparent_58%),radial-gradient(80%_65%_at_88%_28%,rgba(104,132,140,0.055),transparent_66%),radial-gradient(90%_80%_at_12%_78%,rgba(84,110,100,0.05),transparent_68%)]" />

      <div className="ambient-orb ambient-orb--a" />
      <div className="ambient-orb ambient-orb--b" />
      <div className="ambient-orb ambient-orb--c" />

      <div className="absolute inset-x-0 top-0 h-[34vh] bg-[radial-gradient(58%_100%_at_50%_0%,rgba(198,234,214,0.05),transparent_72%)]" />
      <div className="absolute inset-x-0 top-0 h-[44vh] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent)]" />

      <div
        ref={lightRef}
        className="absolute left-0 top-0 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(191,227,205,0.038),transparent_64%)] blur-3xl"
      />

      <div className="absolute inset-0 opacity-[0.2] [background-image:var(--noise)] [mix-blend-mode:soft-light]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_46%,transparent_32%,rgba(2,3,3,0.55)_76%,rgba(2,3,3,0.88)_100%)]" />
    </div>
  );
}
