"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reveals a section once, as it becomes relevant.
 *
 * IntersectionObserver rather than a scroll listener, so nothing runs on the
 * main thread while scrolling. It unobserves after firing — a section that
 * re-animates every time you scroll past is a distraction, not a reveal. Under
 * prefers-reduced-motion the CSS neutralises the transform entirely, so this
 * still resolves to visible content.
 */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const show = () => el.classList.add("in");

    // Fail open. The reveal is an enhancement, and content must never depend on
    // it firing — if IntersectionObserver is missing, throws, or simply never
    // reports (headless capture, some embedded browsers), the section still has
    // to appear. Without this the page rendered blank below the hero.
    if (typeof IntersectionObserver === "undefined") {
      show();
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          show();
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    io.observe(el);

    // Backstop: whatever happens, nothing stays hidden for more than a moment.
    const failOpen = setTimeout(show, 1600);

    return () => {
      clearTimeout(failOpen);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}
