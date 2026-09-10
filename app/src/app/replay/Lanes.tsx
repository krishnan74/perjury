"use client";

import { useEffect, useRef } from "react";

import { cancelSmoothScroll, scrollIntoViewSmooth } from "../SmoothScroll";
import type { ReplayScript } from "@/lib/replay";
import { ROLE_LABEL, ensUrl } from "@/lib/identity";
import { PartnerChip } from "../Partners";
import AgentRead from "./AgentRead";
import Draw from "./Draw";
import Panel from "./Panel";
import Seal from "./Seal";

const EXPLORER = "https://sepolia.etherscan.io";

/**
 * The claim as two lanes and a centre spine.
 *
 * The single column this replaces was accurate and said almost nothing. A viewer
 * read "Tribunal returned a verdict" with no way to see that two agents had
 * worked the same question without ever being able to reach each other, which is
 * the entire thesis.
 *
 * The layout is the argument, so it has one hard rule: NOTHING crosses between
 * the claimant lane and the witness lane. No arrow, no connector, no row that
 * spans both. If a viewer's eye can trace a path from one lane to the other, the
 * page is claiming something the protocol does not do — the two never exchange
 * anything, and the only thing they have in common is the block they were both
 * pinned to.
 *
 * The lanes face the spine — the claimant's rule runs down the right of its
 * column and the witness's down the left of its — so the parallel reads as two
 * parties addressing the chain rather than each other.
 */
export default function Lanes({
  script,
  at,
  playing,
}: {
  script: ReplayScript;
  at: number;
  playing: boolean;
}) {
  const beats = script.beats;
  const rows = beats.length;

  const assignedRow = beats.findIndex((b) => b.kind === "draw");
  const verdictRow = beats.findIndex((b) => b.kind === "verdict");

  /*
   * Follow the playback down the page.
   *
   * The beats are spread over several screens, so during playback the
   * interesting one is usually off-screen and the viewer is scrolling by hand
   * while trying to read. The page follows instead.
   *
   * It follows the beat that JUST landed (`at - 1`) rather than the pending one,
   * because that is where the new content is — the read card, the draw, the
   * seal. Scrolling to the next thing would put the thing you were reading
   * behind you.
   *
   * Two things it must not do. It must not move while paused, because then it is
   * fighting a reader who is studying something. And once the reader scrolls, it
   * stops following for the rest of that run: a page that drags you back after
   * you have deliberately looked away is scroll-jacking, whatever it is called.
   */
  const beatRefs = useRef<(HTMLDivElement | null)[]>([]);
  const following = useRef(true);

  useEffect(() => {
    if (!playing) return;
    // Wheel, touch and keys are unambiguous reader intent. Scroll events are
    // not: our own scrolling fires those too.
    const stop = () => {
      following.current = false;
      // Stopping at the next beat is not enough: the scroll already in flight
      // would finish and haul the reader back to where it was heading.
      cancelSmoothScroll();
    };
    const opts = { passive: true } as const;
    window.addEventListener("wheel", stop, opts);
    window.addEventListener("touchstart", stop, opts);
    window.addEventListener("keydown", stop);
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [playing]);

  // A fresh run re-arms following, so taking over once does not disable it for good.
  useEffect(() => {
    if (at === 0) following.current = true;
  }, [at]);

  useEffect(() => {
    if (!playing || !following.current || at === 0) return;
    const el = beatRefs.current[at - 1];
    if (!el) return;

    /*
     * Headroom is whatever the beat can spare.
     *
     * Every beat is sized to fit a viewport, but the tallest leaves only about
     * 36px on a 1280x800 laptop — and a fixed 64px offset then pushed its last
     * lines off the bottom, which is the one thing this scroll exists to
     * prevent. Short beats still get comfortable headroom; tall ones give it up
     * to stay whole.
     */
    const room = window.innerHeight - el.getBoundingClientRect().height;
    scrollIntoViewSmooth(el, -Math.max(16, Math.min(64, room - 24)));
  }, [at, playing]);

  return (
    <div className="lanes" role="list" aria-label="Claim timeline, claimant and witness lanes">
      <p className="lane-head claimant" aria-hidden="true">
        Claimant
        {script.claimant.name && <em>{script.claimant.name}</em>}
      </p>
      <p className="lane-head spine" aria-hidden="true">On chain</p>
      <p className="lane-head witness" aria-hidden="true">
        Witness
        {script.witness?.name && <em>{script.witness.name}</em>}
      </p>

      {/*
        One continuous rule per lane, drawn as its own element rather than as a
        border on each card, so a lane reads as a lane during the gaps between
        beats instead of as a stack of unrelated boxes.
      */}
      <span className="lane-rule claimant" style={{ gridRow: `2 / ${rows + 2}` }} aria-hidden="true" />
      <span className="lane-rule spine" style={{ gridRow: `2 / ${rows + 2}` }} aria-hidden="true" />
      <span className="lane-rule witness" style={{ gridRow: `2 / ${rows + 2}` }} aria-hidden="true" />

      {/*
        The draw sits on the spine at the row where the assignment landed, even
        though the assignment beat itself is in the witness lane. The moment
        belongs to the witness; the mechanism belongs to the chain.
      */}
      {assignedRow >= 0 && (
        <div
          className="draw-slot"
          style={{
            gridRow: `${assignedRow + 2} / ${Math.max(assignedRow + 3, verdictRow + 2)}`,
            order: assignedRow * 2 + 1,
          }}
          data-state={at > assignedRow ? "done" : "idle"}
        >
          <Draw draw={script.draw} claimantName={script.claimant.name} />
        </div>
      )}

      {/* `order` is inert while the rows are explicit, and is what puts the
          spine panels back in sequence once the lanes stack. */}
      {beats.map((b, i) => {
        const state = i < at ? "done" : i === at ? (playing ? "active" : "idle") : "idle";
        return (
          <div
            role="listitem"
            className={`lane-beat ${b.lane}`}
            data-state={state}
            data-kind={b.kind}
            key={b.key}
            ref={(el) => {
              beatRefs.current[i] = el;
            }}
            style={{ gridRow: i + 2, order: i * 2 }}
          >
            <span className="lane-dot" aria-hidden="true" />
            <p className="lane-label">
              {/* Shown only once the lanes stack into a single column, where the
                  layout can no longer say which side a beat belongs to. */}
              <span className="lane-tag">{b.lane === "spine" ? "on chain" : b.lane}</span>
              {b.who && (
                <span
                  className="lane-who"
                  style={{ ["--agent-hue" as string]: String(b.who.hue) }}
                >
                  <span className="lane-mono" aria-hidden="true">{b.who.monogram}</span>
                  {/* The name is the agent's real identity, so it links where
                      that identity actually lives rather than to its address. */}
                  <a
                    className="lane-who-name"
                    href={ensUrl(b.who.name)}
                    target="_blank"
                    rel="noreferrer"
                    title={`${ROLE_LABEL[b.who.role]} — ${b.who.name} on the ENS explorer`}
                  >
                    {b.who.name}
                  </a>
                </span>
              )}
              {b.label}
            </p>
            {/* The one fact the step delivered, set large. Everything under it
                is support, and a beat with no lead simply has none. */}
            {b.lead && <p className="lane-lead" data-kind={b.kind}>{b.lead}</p>}
            {b.detail && <p className="lane-detail">{b.detail}</p>}
            {b.partner && <PartnerChip id={b.partner} />}
            {/*
              One sentence of plain English per beat, so the page carries itself
              when a judge opens it with nobody narrating. The text was already
              on every beat and had simply never been rendered.
            */}
            {b.note && <p className="lane-note">{b.note}</p>}
            {/*
              The gap before a verdict is the one interval on this page with no
              transaction behind it, so it is named where it happened rather
              than drawn as a beat of its own. The duration is the measured gap;
              it must not be attributed to any single party, because the
              gateway, the enclave and the Forwarder all sit inside it.
            */}
            {b.kind === "verdict" && b.gap > 20 && i < at && (
              <p className="lane-quiet">
                {fmt(b.gap)} with nothing on chain: the gateway, the enclave, and the signing of the
                report.
              </p>
            )}
            {b.read && i < at && <AgentRead read={b.read} who={b.who} />}
            {/* The convergence lives inside the verdict beat rather than in a
                slot of its own: both occupy the spine at this row, and two grid
                items in one cell overlap. */}
            {b.kind === "verdict" && i < at && script.seal && <Seal seal={script.seal} />}
            {/* A4 — the fork, on the beat where the panel was actually seated. */}
            {b.kind === "panel" && b.label.includes("seated") && i < at && script.appeal && (
              <Panel appeal={script.appeal} />
            )}
            {b.tx ? (
              i < at ? (
                <a className="lane-tx" href={`${EXPLORER}/tx/${b.tx}`} target="_blank" rel="noreferrer">
                  +{b.gap}s · {b.tx.slice(0, 10)}…
                </a>
              ) : (
                <span className="lane-tx" aria-hidden="true">&nbsp;</span>
              )
            ) : (
              /* A read is not a transaction and gets no hash, only its elapsed
                 gap once it has happened. */
              <span className="lane-tx">{i < at ? `+${b.gap}s · off chain` : "\u00a0"}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const fmt = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);
