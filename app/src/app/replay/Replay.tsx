"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Step {
  label: string;
  detail: string;
  tx: string;
  /** Seconds between this step and the previous one, as they actually happened. */
  gap: number;
}

const EXPLORER = "https://sepolia.etherscan.io";

/**
 * Replays a claim that already settled.
 *
 * Nothing here is simulated: every step, hash and gap comes from the chain. What
 * is compressed is the waiting — the real run takes minutes because VRF takes
 * about a minute to fulfil and the challenge window is ninety seconds of genuine
 * wall clock. The elapsed counter always shows the REAL elapsed time, so speeding
 * the playback never misrepresents how long the protocol took.
 */
export default function Replay({ steps, claimId }: { steps: Step[]; claimId: string }) {
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    if (!playing || at >= steps.length) return;
    // A step's gap is real seconds; dividing by speed is the only compression.
    // Floors at 350ms so a fast replay is still readable rather than a flicker.
    const wait = Math.max(350, ((steps[at]?.gap ?? 0) * 1000) / speed);
    timer.current = setTimeout(() => setAt((i) => i + 1), wait);
    return clear;
  }, [playing, at, speed, steps]);

  useEffect(() => {
    if (at >= steps.length) setPlaying(false);
  }, [at, steps.length]);

  const reset = useCallback(() => {
    clear();
    setAt(0);
    setPlaying(false);
  }, []);

  const elapsed = steps.slice(0, at).reduce((sum, s) => sum + s.gap, 0);
  const total = steps.reduce((sum, s) => sum + s.gap, 0);
  const fmt = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

  return (
    <>
      <div className="actions" style={{ marginTop: 0, marginBottom: "1.6rem", alignItems: "center" }}>
        <button className="btn" onClick={() => (at >= steps.length ? reset() : setPlaying((p) => !p))}>
          {at >= steps.length ? "Replay" : playing ? "Pause" : at === 0 ? "Play" : "Resume"}
        </button>
        <button
          className="btn ghost"
          onClick={() => { clear(); setPlaying(false); setAt((i) => Math.min(i + 1, steps.length)); }}
          disabled={at >= steps.length}
        >
          Step
        </button>
        <button className="btn ghost" onClick={reset} disabled={at === 0}>Reset</button>
        <span className="chip" role="group" aria-label="Playback speed">
          {[1, 10, 30, 120].map((x) => (
            <button
              key={x}
              onClick={() => setSpeed(x)}
              aria-pressed={speed === x}
              aria-label={`${x} times speed`}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                font: "inherit",
                padding: "0 0.35rem",
                color: speed === x ? "var(--ink)" : "var(--muted)",
                textDecoration: speed === x ? "underline" : "none",
              }}
            >
              {x}&times;
            </button>
          ))}
        </span>
        <span className="chip">
          elapsed on chain {fmt(elapsed)} / {fmt(total)}
        </span>
      </div>

      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length}
           aria-valuenow={at} aria-label="Replay progress">
        <span style={{ transform: `scaleX(${steps.length ? at / steps.length : 0})` }} />
      </div>

      <div className="stages">
        {steps.map((s, i) => {
          const state = i < at ? "done" : i === at ? (playing ? "active" : "idle") : "idle";
          return (
            <div className="stage" data-state={state} key={`${s.label}-${i}`}>
              <span className="dot" aria-hidden="true">{i < at ? "●" : "○"}</span>
              <span>
                {s.label}
                {s.detail && <span className="muted"> &mdash; {s.detail}</span>}
              </span>
              {i < at ? (
                <a className="when" href={`${EXPLORER}/tx/${s.tx}`} target="_blank" rel="noreferrer">
                  +{s.gap}s &middot; {s.tx.slice(0, 10)}&hellip;
                </a>
              ) : (
                <span className="when">&nbsp;</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="note" style={{ marginTop: "1.4rem" }}>
        Claim #{claimId}, replayed from its own transactions. The gaps are what actually elapsed: about
        a minute for VRF to fulfil, and ninety seconds of challenge window during which the verdict
        could still be appealed. Playback speed compresses the waiting; the elapsed counter does not.
      </p>
    </>
  );
}
