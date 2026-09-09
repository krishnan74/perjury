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
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add("in");
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}
