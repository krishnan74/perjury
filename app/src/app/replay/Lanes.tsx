"use client";

import type { ReplayScript } from "@/lib/replay";

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

  // The witness's actual work — composing a query, reading an indexer — emits no
  // event, so it occupies the rows between its assignment and the verdict.
  const assignedRow = beats.findIndex((b) => b.kind === "draw");
  const verdictRow = beats.findIndex((b) => b.kind === "verdict");
  const showOffChain = assignedRow >= 0 && verdictRow > assignedRow && script.seal;

  return (
    <div className="lanes" role="list" aria-label="Claim timeline, claimant and witness lanes">
      <p className="lane-head claimant" aria-hidden="true">Claimant</p>
      <p className="lane-head spine" aria-hidden="true">On chain</p>
      <p className="lane-head witness" aria-hidden="true">Witness</p>

      {/*
        One continuous rule per lane, drawn as its own element rather than as a
        border on each card, so a lane reads as a lane during the gaps between
        beats instead of as a stack of unrelated boxes.
      */}
      <span className="lane-rule claimant" style={{ gridRow: `2 / ${rows + 2}` }} aria-hidden="true" />
      <span className="lane-rule spine" style={{ gridRow: `2 / ${rows + 2}` }} aria-hidden="true" />
      <span className="lane-rule witness" style={{ gridRow: `2 / ${rows + 2}` }} aria-hidden="true" />

      {/*
        Stated rather than drawn as a beat, and deliberately not given a dot or a
        hash. Everything else on this page traces to a transaction; this is the
        one interval that does not, and dressing it up as one would be the exact
        dishonesty the rest of the page is built to avoid.

        The duration is real: it is the measured gap between the assignment and
        the verdict landing. What it must NOT do is attribute that whole gap to
        the witness. Three things share it — the witness's read, the tribunal's
        run, and the signing and mining of the report — and an earlier draft of
        this box credited all of it to the witness alone.
      */}
      {showOffChain && (
        <div
          className="lane-offchain"
          style={{ gridRow: `${assignedRow + 3} / ${verdictRow + 3}`, order: assignedRow * 2 + 1 }}
          data-state={at > assignedRow ? "done" : "idle"}
        >
          <p>{fmt(script.seal!.adjudicationSeconds)} with nothing on chain.</p>
          <p className="lane-offchain-note">
            The witness composed its own query and read an indexer, the tribunal adjudicated in a
            confidential handler, and the report was signed and delivered. The next transaction is
            the verdict.
          </p>
        </div>
      )}

      {/* `order` is inert while the rows are explicit, and is what puts the
          off-chain interval back in sequence once the lanes stack. */}
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
              {b.label}
            </p>
            {b.detail && <p className="lane-detail">{b.detail}</p>}
            {i < at ? (
              <a className="lane-tx" href={`${EXPLORER}/tx/${b.tx}`} target="_blank" rel="noreferrer">
                +{b.gap}s · {b.tx.slice(0, 10)}…
              </a>
            ) : (
              <span className="lane-tx" aria-hidden="true">&nbsp;</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const fmt = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);
