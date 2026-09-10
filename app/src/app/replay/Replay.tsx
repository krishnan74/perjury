"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ReplayScript } from "@/lib/replay";
import Lanes from "./Lanes";
import Standing from "./Standing";

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
export default function Replay({ script }: { script: ReplayScript }) {
  const steps = script.beats;
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

  // Standing is written at settlement, not at adjudication, so the bar moves on
  // the Settled beat and not a moment before it.
  const settleAt = steps.findIndex((s) => s.kind === "settle");
  const fmt = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

  /*
   * A6 — a time axis rather than a progress bar.
   *
   * Beats are positioned by the seconds that actually elapsed, so the ninety
   * seconds of challenge window occupies ninety seconds of width. That is the
   * point: the waiting is visible as distance, and you can drag straight to the
   * interesting eight seconds instead of sitting through it. The counter still
   * reports true elapsed time at every speed — a replay of a verification
   * protocol that misrepresents its own timing defeats itself.
   */
  const cumulative = steps.reduce<number[]>((acc, b) => [...acc, (acc[acc.length - 1] ?? 0) + b.gap], []);
  const atFraction = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  /** The beat a point on the axis lands on. */
  const seek = (fraction: number) => {
    const t = Math.max(0, Math.min(1, fraction)) * total;
    let i = 0;
    while (i < cumulative.length && (cumulative[i] ?? 0) <= t) i++;
    clear();
    setPlaying(false);
    setAt(Math.max(0, Math.min(i, steps.length)));
  };

  const fromPointer = (el: HTMLElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    seek((clientX - r.left) / r.width);
  };

  return (
    <>
      <div className="actions" style={{ marginTop: 0, marginBottom: "1.6rem", alignItems: "center" }}>
        <button className="btn" onClick={() => (at >= steps.length ? reset() : setPlaying((p) => !p))}>
          {at >= steps.length ? "Replay" : playing ? "Pause" : at === 0 ? "Play" : "Resume"}
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

      {/*
        Draggable, keyboard-operable, and labelled in seconds rather than steps,
        because "step 6 of 11" tells a viewer nothing about where the protocol
        actually spends its time.
      */}
      <div
        className="scrub"
        role="slider"
        tabIndex={0}
        aria-label="Scrub the replay, in elapsed seconds on chain"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={elapsed}
        aria-valuetext={`${fmt(elapsed)} of ${fmt(total)}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e.currentTarget, e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.currentTarget, e.clientX);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { clear(); setPlaying(false); setAt((i) => Math.min(i + 1, steps.length)); }
          else if (e.key === "ArrowLeft") { clear(); setPlaying(false); setAt((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Home") reset();
          else if (e.key === "End") { clear(); setPlaying(false); setAt(steps.length); }
          else return;
          e.preventDefault();
        }}
      >
        <span className="scrub-track" aria-hidden="true" />
        <span className="scrub-fill" style={{ width: `${atFraction(elapsed)}%` }} aria-hidden="true" />
        {steps.map((b, i) => (
          <span
            key={b.key}
            className="scrub-beat"
            data-done={i < at}
            data-kind={b.kind}
            style={{ left: `${atFraction(cumulative[i] ?? 0)}%` }}
            title={`${fmt(cumulative[i] ?? 0)} — ${b.label}`}
            aria-hidden="true"
          />
        ))}
        <span className="scrub-head" style={{ left: `${atFraction(elapsed)}%` }} aria-hidden="true" />
      </div>

      <Lanes script={script} at={at} playing={playing} />

      {/*
        Rendered whenever the chain recorded a standing write for this claim. A
        Match or Unverifiable verdict leaves the record untouched and the writer
        emits nothing, so there is nothing here to show and nothing is drawn —
        rather than a bar sitting flat at its current value, which would read as
        "the tribunal considered it and left it alone".
      */}
      {script.standing && (
        <Standing move={script.standing} moved={settleAt >= 0 && at > settleAt} />
      )}

      <p className="note" style={{ marginTop: "1.4rem" }}>
        Claim #{script.claimId}, replayed from its own transactions. The gaps are what actually elapsed: about
        a minute for VRF to fulfil, and ninety seconds of challenge window during which the verdict
        could still be appealed. Playback speed compresses the waiting; the elapsed counter does not.
      </p>
    </>
  );
}
