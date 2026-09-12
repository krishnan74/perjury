"use client";

import { useState } from "react";
import type { AgentRead as Read } from "@/lib/replay";
import type { Identity } from "@/lib/identity";

/**
 * What one agent asked, what came back, and what it concluded.
 *
 * This is the part of the mechanism that was invisible. The chain records that
 * evidence existed; it records a hash. Everything on this card is transcribed
 * from the archived bundle the tribunal actually read.
 *
 * Three fields are checks rather than statements, and they are shown as checks:
 * the archived document hashes to the hash the guard recorded at read time, the
 * read is pinned to a block, and the corroboration count is whatever it actually
 * was. Where corroboration did not happen, it says one source and does not dress
 * that up — reading one deployment means the two agents re-derived the query but
 * shared the derivation, and pretending otherwise would undo the point of having
 * measured it.
 */
export default function AgentRead({ read, who }: { read: Read; who?: Identity }) {
  const [showQuery, setShowQuery] = useState(false);

  if (read.unverifiableReason) {
    const split = divergence(read.unverifiableReason);
    return (
      <div className="agent-read" data-role={read.role}>
        <p className="agent-read-bad">
          Could not verify: {read.unverifiableReason}. No value was asserted.
        </p>
        {/*
          The case corroboration was built for, and the one it is hardest to
          believe without seeing: two independently written mappings, the same
          protocol, the same block, and numbers that do not match. Naming both
          deployments and the margin turns a sentence into something a reader
          can go and check.
        */}
        {split && (
          <p className="agent-read-sources mono">
            {split.ids.map((id, i) => (
              <span key={id} title={id}>
                {i > 0 && <span className="muted"> vs </span>}
                {short(id)}
              </span>
            ))}
            <span className="muted"> — {split.bps} bps apart, tolerance {split.max}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="agent-read" data-role={read.role} style={hue(who)}>
      <dl className="agent-read-grid">
        <dt>asked</dt>
        <dd>
          <span className="mono">{short(read.deploymentId)}</span> at block{" "}
          <span className="mono">{read.block.toLocaleString("en")}</span>
          {read.block === read.chainHead && <span className="agent-read-tag">chain head</span>}
        </dd>

        <dt>got</dt>
        <dd>
          {read.rows.length === 0 ? (
            <span className="muted">no rows archived</span>
          ) : (
            <ul className="agent-read-rows">
              {read.rows.map((r) => (
                <li key={r.label}>
                  <span className="muted">{r.label}</span>
                  <b>{r.value}</b>
                </li>
              ))}
            </ul>
          )}
        </dd>

        <dt>concluded</dt>
        <dd>
          <b className="agent-read-value">
            {read.asserted}
            {read.unit === "percent" ? "%" : ` ${read.unit}`}
          </b>
          {read.reasoning && (
            <p className="agent-read-why" title={read.reasoning}>{read.reasoning}</p>
          )}
        </dd>
      </dl>

      <p className="agent-read-meta">
        <span>{read.sources === 1 ? "1 deployment" : `${read.sources} deployments`}</span>
        {/*
          The margin, not just the verdict. Two independently written mappings
          landing within a few basis points of each other at the same block is
          the whole corroboration argument, and a reader cannot weigh it against
          a word. Where no second index exists this says so plainly instead of
          leaving a bare "not corroborated" that reads like a failure.
        */}
        {read.corroborated ? (
          <span className="ok">
            agree within {fmtBps(read.maxDivergenceBps)}
          </span>
        ) : (
          <span className="muted">
            {read.sources === 1 ? "no independent second index exists" : "not corroborated"}
          </span>
        )}
        {read.hasIndexingErrors && <span className="bad">indexing errors</span>}
        {/*
          A check, not a badge. The archived document either reproduces the hash
          the guard took at read time or it does not, and a query nobody can tie
          to its own hash is decoration. Runs archived before the document was
          captured say exactly that rather than showing a reassuring tick.
        */}
        {read.queryOk === true && <span className="ok">query verified</span>}
        {read.queryOk === false && <span className="bad">query does not match its hash</span>}
        {read.queryOk === null && <span className="muted">query not archived</span>}
      </p>

      {read.corroborated && read.deploymentIds && read.deploymentIds.length > 1 && (
        <p className="agent-read-sources mono">
          {read.deploymentIds.map((id, i) => (
            <span key={id} title={id}>
              {i > 0 && <span className="muted"> vs </span>}
              {short(id)}
            </span>
          ))}
        </p>
      )}

      {read.query && (
        <>
          <button className="agent-read-toggle" onClick={() => setShowQuery((v) => !v)} aria-expanded={showQuery}>
            {showQuery ? "Hide" : "Show"} the query it wrote
          </button>
          {showQuery && (
            <>
              <pre className="agent-read-query">{read.query}</pre>
              <p className="agent-read-hash mono">sha256 {read.queryHash.slice(0, 32)}…</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Pull the two deployment ids and the margin back out of a corroboration
 * failure. The guard writes the reason as prose because it also has to travel
 * through the enclave and onto a terminal, so the structure is recovered here
 * rather than duplicating the field on every attestation.
 */
function divergence(reason: string): { bps: string; max: string; ids: string[] } | null {
  const m = /disagree by ([\d.]+) bps \(max (\d+)\): (\S+) vs (\S+)/.exec(reason);
  return m ? { bps: m[1]!, max: m[2]!, ids: [m[3]!, m[4]!] } : null;
}

/**
 * Basis points, at a precision that does not overstate the measurement.
 * Two mappings agreeing exactly is worth saying as "exactly", not "0.0 bps".
 */
const fmtBps = (bps: number | null) =>
  bps === null ? "tolerance" : bps === 0 ? "the last decimal" : `${bps.toFixed(1)} bps`;

const short = (id: string) => (id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id);

const hue = (who?: Identity) =>
  who ? ({ ["--agent-hue" as string]: String(who.hue) } as React.CSSProperties) : undefined;
