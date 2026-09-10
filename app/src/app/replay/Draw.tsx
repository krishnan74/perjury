"use client";

import { ensUrl } from "@/lib/identity";
import type { Draw as DrawData } from "@/lib/replay";

const EXPLORER = "https://sepolia.etherscan.io";

/**
 * The draw, shown rather than asserted.
 *
 * "Randomly assigned" was one line of text, which a viewer has to take on faith
 * — and taking the anti-collusion claim on faith is exactly what the project
 * argues nobody should have to do. So this replays the assignment: the roster in
 * the order the contract stores it, the index the VRF word actually landed on,
 * and the walk forward from there.
 *
 * The walk is DERIVED, not illustrated. `_assign` starts at `seed % length` and
 * takes the first candidate that is neither the claimant nor ineligible, so
 * given the seed and the agent the chain recorded, every step between them is
 * determined. Where the reconstruction fails to land on that agent the roster
 * has changed since, and the builder returns null rather than draw a walk that
 * did not happen — this component says so instead.
 *
 * The claimant is marked whether or not the walk reached it, because
 * `cand != claimant` is a structural exclusion rather than an outcome of this
 * particular draw. It is the one line of the mechanism worth pointing at.
 */
export default function Draw({ draw, claimantName }: { draw: DrawData | null; claimantName: string }) {
  if (!draw) {
    return (
      <div className="draw" data-empty="true">
        <p className="draw-head">The draw</p>
        <p className="draw-note">
          The roster has changed since this assignment, so the walk cannot be reconstructed from the
          seed. The transactions below are still the real ones.
        </p>
      </div>
    );
  }

  return (
    <div className="draw">
      <p className="draw-head">The draw</p>
      <p className="draw-note">
        One random word from Chainlink. The roster walks from{" "}
        <span className="mono">seed mod {draw.rosterSize}</span> to the first eligible agent that is
        not the claimant.
      </p>

      <ol className="draw-list">
        {draw.candidates.map((c) => (
          <li key={c.address} data-role={c.role} data-start={c.index === draw.startIndex}>
            <span className="draw-idx">{c.index}</span>
            <a className="draw-name" href={ensUrl(c.name)} target="_blank" rel="noreferrer">
              {c.name}
            </a>
            {/* Kept to one or two words. The long form collided with the name
                in a column this narrow; the rule itself is explained once,
                below the list, rather than repeated on every row. */}
            <span className="draw-mark">
              {c.role === "drawn" && "drawn"}
              {c.role === "claimant" && "claimant"}
              {/* The walk stepped over this agent, and `_assign` has no third
                  reason to do that: it was not eligible at that block. */}
              {c.role === "passed" && "ineligible"}
            </span>
          </li>
        ))}
      </ol>

      <p className="draw-seed" title={draw.seed}>
        <span className="draw-seed-k">seed</span>
        <span className="mono">{draw.seed.slice(0, 22)}…</span>
      </p>

      <p className="draw-txs">
        {draw.requestTx && (
          <a href={`${EXPLORER}/tx/${draw.requestTx}`} target="_blank" rel="noreferrer">
            request
          </a>
        )}
        <a href={`${EXPLORER}/tx/${draw.drawTx}`} target="_blank" rel="noreferrer">
          fulfilment
        </a>
        {draw.waitSeconds !== null && <span>{draw.waitSeconds}s apart</span>}
      </p>

      <p className="draw-note draw-foot">
        The claimant is struck out whatever the seed says. <span className="mono">submitClaim</span>{" "}
        has no witness parameter, so {claimantName} could not bias this.
      </p>
    </div>
  );
}
