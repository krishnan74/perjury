"use client";

import { EXPLORER } from "@/lib/perjury";
import type { StandingMove } from "@/lib/replay";

/**
 * The reputation consequence, on the beat it actually happened.
 *
 * The whole project ends here: the punishment for lying is not the money, it is
 * that the roster stops drawing you. That was true from the first deployment and
 * has been invisible on the site, stated as a number in a table.
 *
 * Both values come from `StandingUpdated`, which carries its own before and
 * after — the bar moves between two figures the chain published, never between
 * the current value and a delta inferred from the verdict.
 *
 * Note what this does NOT draw: a threshold line under which an agent becomes
 * ineligible. `WitnessRoster.isEligible` has no such test. It gates on the
 * cooldown flag, the stake floor, and whether the ENS record can be read at all;
 * standing is the permanent public record and does not itself exclude anybody.
 * An earlier draft of the spec asked for the threshold, and drawing one would
 * have described a mechanism the deployed contract does not have.
 */
export default function Standing({ move, moved }: { move: StandingMove; moved: boolean }) {
  const shown = moved ? move.to : move.from;
  const dropped = move.to < move.from;

  // A little air either side, and zero always inside the domain so the sign of
  // the value is legible rather than implied.
  const lo = Math.min(move.from, move.to, 0) - 1;
  const hi = Math.max(move.from, move.to, 0) + 1;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;

  const zero = pct(0);
  const head = pct(shown);
  const left = Math.min(zero, head);
  const width = Math.abs(head - zero);

  return (
    <figure className="standing" data-dropped={dropped}>
      <figcaption>
        <p className="eyebrow">ENS standing</p>
        <p className="note" style={{ marginTop: "0.5rem" }}>
          Written to <span className="mono">{move.name}</span> by the tribunal at settlement, on the
          record key <span className="mono">com.perjury.agent-standing</span>. The operator that
          deployed every contract and owns the name cannot write this value.
        </p>
      </figcaption>

      <div className="standing-row">
        <div
          className="standing-track"
          role="img"
          aria-label={`Standing ${move.from} before settlement, ${move.to} after`}
        >
          <span className="standing-zero" style={{ left: `${zero}%` }} aria-hidden="true" />
          <span className="standing-bar" style={{ left: `${left}%`, width: `${width}%` }} />
        </div>
        <span className="standing-num" aria-hidden="true">
          {shown > 0 ? `+${shown}` : shown}
        </span>
      </div>

      {/*
        The zero label is positioned on the mark, not centred in the row. Laid
        out with space-between it sat at the midpoint while the mark it names sat
        at 87%, which put the axis and its own legend in different places.
      */}
      <p className="standing-scale" aria-hidden="true">
        <span className="lo">{lo}</span>
        <span className="mid" style={{ left: `${zero}%` }}>0</span>
        <span className="hi">{hi > 0 ? `+${hi}` : hi}</span>
      </p>

      {/*
        Stated in full whether or not the playback has reached settlement. The
        bar is the choreography; this line is the record, and a reader with
        scripting off or motion reduced still gets the whole fact.
      */}
      <p className="note standing-record">
        The tribunal wrote <b>{move.from}</b> &rarr; <b>{move.to}</b> in{" "}
        <a href={`${EXPLORER}/tx/${move.tx}`} target="_blank" rel="noreferrer">
          the settlement transaction
        </a>
        .
      </p>

      <dl className="defs standing-consequence">
        {move.stakeRemaining === "0" && (
          <>
            <dt>stake</dt>
            <dd>slashed to zero &mdash; flagged until the agent tops up</dd>
          </>
        )}
        {move.flaggedUntil !== null && (
          <>
            <dt>cooldown</dt>
            <dd>{cooldown(move.flaggedUntil)}</dd>
          </>
        )}
        <dt>drawable now</dt>
        <dd className={move.eligibleNow ? "ok" : "bad"}>
          {move.eligibleNow ? "yes" : `no — ${move.exclusion ?? "not eligible"}`}
        </dd>
      </dl>

      <p className="note" style={{ marginTop: "1rem" }}>
        Read through the same reader contract the VRF callback uses, so this is
        exactly what decides the next draw. <a href="/roster">See the whole roster</a>.
      </p>
    </figure>
  );
}

/**
 * `onMismatch` sets a 24-hour cooldown; slashing below the stake floor sets
 * `type(uint64).max`, which is not a date and must not be rendered as one.
 *
 * Formatted in UTC deliberately. A locale-local timestamp differs between the
 * server render and the browser, which is a hydration mismatch on a page that
 * already had one and fixed it.
 */
function cooldown(until: number): string {
  if (until >= Number.MAX_SAFE_INTEGER || until > 4102444800) return "indefinite, until the stake is restored";
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(until * 1000))} UTC`;
}
