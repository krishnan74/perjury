"use client";

import type { Appeal } from "@/lib/replay";
import { hueOf, monogramOf } from "@/lib/identity";

const EXPLORER = "https://sepolia.etherscan.io";

/**
 * The appeal, forked into three.
 *
 * The best moment in the best scene used to be one line reading "VRF seated a
 * panel of three". A viewer had no way to see that three agents re-derived the
 * answer separately, which is the entire content of an appeal.
 *
 * The fork is the argument, so the three seats are drawn as three columns that
 * do not touch — the same rule the two lanes obey. They share a claim and a
 * block and nothing else: separate processes, separate keys, and deliberately
 * different models, so a correlated failure has to survive three of them.
 *
 * Everything here is chain data except the values, which come from the archive.
 * Where the archive predates seat binding the values are absent and the panel
 * says so, rather than distributing three findings across three addresses in
 * whatever order they happened to be written.
 */
export default function Panel({ appeal }: { appeal: Appeal }) {
  return (
    <div className="panel-fork">
      <p className="panel-head">The appeal</p>
      <p className="panel-note">
        A second draw, excluding the claimant, the original witness and the appellant. A panel
        containing any of them would not be review.
      </p>

      <div className="panel-seats">
        {appeal.seats.map((s) => (
          <div className="panel-seat" key={s.address} data-agrees={s.agrees}>
            <span
              className="panel-mono"
              style={{ ["--agent-hue" as string]: String(hueOf(s.address)) }}
              aria-hidden="true"
            >
              {monogramOf(s.name)}
            </span>
            <span className="panel-seat-name">{s.name}</span>
            {s.unverifiableReason ? (
              <span className="panel-seat-bad">unverifiable</span>
            ) : s.value !== null ? (
              <>
                <span className="panel-seat-value">{s.value}</span>
                <span className="panel-seat-mark">{s.agrees ? "agrees" : "differs"}</span>
              </>
            ) : (
              <span className="panel-seat-muted">finding not archived</span>
            )}
          </div>
        ))}
      </div>

      {/*
        Stated only when the join actually worked. An unbound archive would let
        this page imply an attribution it cannot support.
      */}
      {!appeal.bound && appeal.seats.length > 0 && (
        <p className="panel-note panel-unbound">
          This claim&rsquo;s archive records the panel by model seat rather than by address, so the
          three findings above cannot be attributed to the agents the chain drew. Claims seated after
          that was fixed carry the binding.
        </p>
      )}

      <p className="panel-outcome" data-outcome={appeal.outcome ?? "open"}>
        {appeal.outcome === "upheld" && (
          <>
            The panel <b>upheld</b> {appeal.original}. The appellant loses its appeal bond too.
          </>
        )}
        {appeal.outcome === "overturned" && (
          <>
            The panel <b>overturned</b> {appeal.original}. The contradicted party is slashed instead.
          </>
        )}
        {appeal.outcome === null && <>The panel has not returned a finding yet.</>}
      </p>

      {appeal.seatedTx && (
        <p className="panel-txs">
          <a href={`${EXPLORER}/tx/${appeal.seatedTx}`} target="_blank" rel="noreferrer">
            the seating transaction
          </a>
        </p>
      )}
    </div>
  );
}
