"use client";

import { useEffect } from "react";

/**
 * Weighted scrolling.
 *
 * Default browser scroll is instant and mechanical; a little momentum makes a
 * long narrative page feel deliberate, which matters when it is being scrolled
 * on camera. This is smoothing, NOT scroll-jacking — no section is pinned, no
 * distance is stolen, and the page never decides where the reader stops.
 *
 * Disabled outright under prefers-reduced-motion, where imposed momentum is
 * exactly the wrong thing to do.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    let frame = 0;
    let cancelled = false;

    import("lenis")
      .then(({ default: Lenis }) => {
        if (cancelled) return;
        // `anchors` keeps in-page links working: this page's "Start ↓" and "How it
        // works" both jump to #ids, and a smooth scroller that swallows those would
        // break navigation to save an animation.
        lenis = new Lenis({
          duration: 0.9,
          wheelMultiplier: 1,
          touchMultiplier: 1.6,
          anchors: true,
        }) as unknown as { raf: (t: number) => void; destroy: () => void };
        const loop = (time: number) => {
          lenis?.raf(time);
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      })
      // Smoothing is a nicety. If the chunk fails, native scroll is fine.
      .catch(() => {});

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      lenis?.destroy();
    };
  }, []);

  return null;
}
