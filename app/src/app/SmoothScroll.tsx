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
/**
 * The live instance, so other components can scroll THROUGH Lenis rather than
 * against it. Calling `window.scrollTo({ behavior: "smooth" })` while Lenis is
 * running hands one scroll position to two animators, and Lenis wins.
 *
 * Kept on `window`, which looks like the lazy option and is the correct one
 * here. This component is mounted from the root layout while its callers live
 * on a route, and Next code-splits those into separate client chunks — so a
 * module-level `let` gives each chunk its OWN copy. The first version did
 * exactly that: the handle was set in the layout's copy, stayed null in the
 * replay's, every scroll silently took the fallback path, and Lenis swallowed
 * it. Nothing appeared broken; the page simply never moved.
 */
declare global {
  interface Window {
    __perjuryLenis?: LenisHandle | null;
  }
}

interface LenisHandle {
  raf: (t: number) => void;
  destroy: () => void;
  scrollTo: (
    target: HTMLElement | number,
    opts?: { offset?: number; duration?: number; immediate?: boolean; force?: boolean },
  ) => void;
}

/**
 * Bring an element into view, once, without hijacking the reader.
 *
 * `offset` is negative to leave room above the target — a beat pinned to the top
 * edge of the viewport is technically visible and unreadable, because the thing
 * it follows from has just scrolled off.
 *
 * Under prefers-reduced-motion it jumps instead of animating. Not scrolling at
 * all would be worse: the reader would lose the beat entirely, which is the
 * opposite of an accommodation.
 */
export function scrollIntoViewSmooth(el: HTMLElement, offset = -140) {
  if (typeof window === "undefined") return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const y = el.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top: y, behavior: "auto" });
    return;
  }

  const lenis = window.__perjuryLenis;
  if (lenis) {
    lenis.scrollTo(el, { offset, duration: 1.1, force: true });
    return;
  }
  // Lenis failed to load or is disabled; native smooth scroll is a fine floor.
  const y = el.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top: y, behavior: "smooth" });
}

/**
 * Abandon a scroll that is still animating.
 *
 * Needed the moment anything follows playback down the page. A reader who
 * scrolls away mid-animation would otherwise be dragged back to wherever the
 * previous call was heading — the in-flight animation does not care that the
 * reader has taken over, and stopping *issuing* scrolls is not the same as
 * stopping the one already running. Retargeting to the current position
 * immediately is how Lenis cancels.
 */
export function cancelSmoothScroll() {
  if (typeof window === "undefined") return;
  window.__perjuryLenis?.scrollTo(window.scrollY, { immediate: true, force: true });
}

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let lenis: LenisHandle | null = null;
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
        }) as unknown as LenisHandle;
        window.__perjuryLenis = lenis;
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
      window.__perjuryLenis = null;
    };
  }, []);

  return null;
}
