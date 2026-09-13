"use client";

import { useEffect, useState } from "react";
import { scrollToTopSmooth } from "./SmoothScroll";

/**
 * A way back, on pages long enough to lose it.
 *
 * The replay's own step pad is fixed mid-screen and steps forward through the
 * beats — nothing on the page steps backward past beat zero. On an eleven-beat
 * claim that can run several screens tall, and the setup above the timeline
 * (the disclaimer, the sealed-evidence note) is exactly what a viewer wants to
 * re-read after watching the verdict land.
 *
 * Hidden until there is somewhere to go back to, so it never sits idle over the
 * hero of a page that has not been scrolled yet.
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="back-to-top"
      onClick={scrollToTopSmooth}
      aria-label="Back to top"
      title="Back to top"
    >
      <span aria-hidden="true">&#9650;</span> Top
    </button>
  );
}
