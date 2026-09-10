"use client";

import type { ReplayScript } from "@/lib/replay";
import { ROLE_LABEL } from "@/lib/identity";
import AgentRead from "./AgentRead";
import Draw from "./Draw";
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
                  title={`${ROLE_LABEL[b.who.role]} — ${b.who.name}`}
                >
                  <span className="lane-mono" aria-hidden="true">{b.who.monogram}</span>
                  <span className="lane-who-name">{b.who.name}</span>
                </span>
              )}
              {b.label}
            </p>
            {b.detail && <p className="lane-detail">{b.detail}</p>}
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
                {fmt(b.gap)} with nothing on chain. Both submissions went to the gateway, the
                tribunal adjudicated in a confidential handler, and the report was signed and
                delivered by a Forwarder.
              </p>
            )}
            {b.read && i < at && <AgentRead read={b.read} who={b.who} />}
            {/* The convergence lives inside the verdict beat rather than in a
                slot of its own: both occupy the spine at this row, and two grid
                items in one cell overlap. */}
            {b.kind === "verdict" && i < at && script.seal && <Seal seal={script.seal} />}
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
