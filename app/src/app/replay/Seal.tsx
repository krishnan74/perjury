"use client";

import { useState } from "react";
import { Redacted } from "../claims/Redacted";
import { changedCount, diffTokens } from "@/lib/diff";
import type { Seal as SealData } from "@/lib/replay";

const EXPLORER = "https://sepolia.etherscan.io";

/**
 * The moment the two lanes converge, and the only one where they may.
 *
 * Everything above this point is deliberately unconnected: the claimant and the
 * witness never exchange anything. Here both submissions enter one confidential
 * handler, and a verdict and a commitment come out. Nothing else does.
 *
 * The box stays OPAQUE on purpose. We are not showing what happens inside the
 * enclave, and refusing to is both more honest and better television than a
 * fabricated x-ray of a computation nobody watched. What this shows is the
 * boundary: two full inputs going in, one thin thing coming out.
 *
 * Why the two values are visible at all, when the panel's whole argument is that
 * they were withheld: this is a testnet demo and the runner archives the bundle
 * after settlement so the replay has something to show. That is the exception,
 * not the rule, and the panel labels it as one.
 *
 * Production per docs/design.md §3.5 stores the bundle as an encrypted blob with
 * the key held by the Vault DON, so it stays confidential indefinitely and any
 * later disclosure is a party's own choice, checkable against the commitment.
 * An earlier draft of this file justified the archive by claiming
 * confidentiality "was never meant to be permanent" — which is not the design,
 * and is the kind of convenient principle that gets invented to excuse a demo.
 */
export default function Seal({ seal }: { seal: SealData }) {
  const fmt = (v: number | null) =>
    v === null ? "—" : `${v}${seal.unit === "percent" ? "%" : ` ${seal.unit ?? ""}`}`;

  return (
    <div className="seal">
      <p className="seal-head">Into the enclave</p>

      <dl className="seal-in">
        <dt>claimant said</dt>
        <dd>{fmt(seal.claimantValue)}</dd>
        <dt>witness derived</dt>
        <dd>{fmt(seal.witnessValue)}</dd>
      </dl>

      {/*
        The strongest sentence available, and a comparison rather than an
        interpretation: if both parties' archived rows are identical, the
        disagreement cannot be blamed on the data they were given.
      */}
      {/*
        B2 — the geometry carries what the word has to explain.
        "Mismatch" needs a sentence; two marks and a band need about half a
        second. The band is the EXACT set of values the tribunal accepts, not a
        symmetric approximation of it: its test is
        |a-b| / max(|a|,|b|) <= bps/10000, which lets a claimant below the
        witness pass down to w(1-t) and one above pass up to w/(1-t).
      */}
      {seal.band && seal.claimantValue !== null && seal.witnessValue !== null && (
        <NumberLine
          claimant={seal.claimantValue}
          witness={seal.witnessValue}
          band={seal.band}
          unit={seal.unit}
          identical={seal.identicalEvidence}
          divergence={seal.divergence}
        />
      )}


      {/*
        Empty CSS-sized bars with aria-labels, never invented placeholder text.
        The same treatment as the claim detail page, and non-negotiable: a judge
        opening devtools on a panel captioned "sealed" must not find fabricated
        values in the markup.
      */}
      <div className="seal-box">
        <p className="seal-box-head">Never published</p>
        <dl>
          {seal.withheld.map((w) => (
            <div key={w.label}>
              <dt>{w.label}</dt>
              <dd><Redacted ch={w.ch} label={w.label} /></dd>
            </div>
          ))}
        </dl>
      </div>

      {/*
        B1 — the two documents, side by side, with what differs marked.
        The corroboration claim is that two agents composed their reads
        independently. A queryHash cannot show that to anyone; the documents can.
      */}
      {seal.claimantQuery && seal.witnessQuery && (
        <QueryDiff claimant={seal.claimantQuery} witness={seal.witnessQuery} />
      )}

      <p className="seal-out-head">Out of it &mdash; the entire report</p>
      <dl className="seal-out">
        <dt>verdict</dt>
        <dd className={`verdict v-${seal.verdict}`}>{seal.verdict}</dd>
        <dt>commitment</dt>
        <dd className="mono" title={seal.commitment ?? undefined}>
          {seal.commitment ? `${seal.commitment.slice(0, 22)}…` : "—"}
        </dd>
      </dl>

      {/*
        One line. The heading above already says this is the entire report, and
        the paragraph that used to sit here repeated it at length while costing
        the beat the height it needed to fit a screen.
      */}
      <p className="seal-note">
        The commitment is a hash over both submissions and a salt held in the enclave.{" "}
        <a href={`${EXPLORER}/tx/${seal.tx}`} target="_blank" rel="noreferrer">
          Delivered by a Forwarder
        </a>
        .
      </p>

    </div>
  );
}

/**
 * Both documents, marked where they differ.
 *
 * Collapsed by default: it is the densest thing on the page and a viewer who
 * wants it will open it, while one who does not should not have to scroll past
 * it. On a real pair the marked span is the block pin the guard injects into the
 * witness's read, which is the sentence this section exists to make visible.
 */
function QueryDiff({ claimant, witness }: { claimant: string; witness: string }) {
  const [open, setOpen] = useState(false);
  const { left, right } = diffTokens(claimant, witness);
  const differing = changedCount(left) + changedCount(right);

  return (
    <div className="qdiff">
      <button className="qdiff-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Hide" : "Compare"} the two documents
        <span className="qdiff-count">
          {differing === 0 ? "identical" : `${differing} tokens differ`}
        </span>
      </button>

      {open && (
        <>
          <div className="qdiff-cols">
            <div>
              <p className="qdiff-who">claimant asked</p>
              <pre>
                {left.map((t, i) => (
                  <span key={i} className={t.changed ? "qdiff-hit" : undefined}>{t.text}</span>
                ))}
              </pre>
            </div>
            <div>
              <p className="qdiff-who">witness asked</p>
              <pre>
                {right.map((t, i) => (
                  <span key={i} className={t.changed ? "qdiff-hit" : undefined}>{t.text}</span>
                ))}
              </pre>
            </div>
          </div>
          <p className="qdiff-note">
            {differing === 0
              ? "Both agents composed the same document independently — the same fields, from the same schema, without seeing each other's work."
              : "Marked tokens appear in one document and not the other. The block arguments are injected by the guard, so the witness replays against the block the claimant read rather than whatever is latest."}
          </p>
        </>
      )}
    </div>
  );
}

/** Two decimals at most, and no trailing zeroes pretending to be precision. */
const round = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Both derived values against the band that decides the verdict.
 *
 * The axis is scaled to hold both marks and the band with a little air. Where
 * the two disagree wildly the band collapses to a sliver, which is the honest
 * picture: the passing range really is that narrow next to the gap.
 */
function NumberLine({
  claimant,
  witness,
  band,
  unit,
  identical,
  divergence,
}: {
  claimant: number;
  witness: number;
  band: { lo: number; hi: number; bps: number };
  unit: string | null;
  identical: boolean | null;
  divergence: number | null;
}) {
  const lo = Math.min(claimant, witness, band.lo);
  const hi = Math.max(claimant, witness, band.hi);
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.02 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const at = (v: number) => ((v - min) / (max - min)) * 100;

  const suffix = unit === "percent" ? "%" : "";
  const inside = claimant >= band.lo && claimant <= band.hi;
  // A band narrower than a hairline reads as a missing element rather than a
  // narrow one, so it is floored at something visible and labelled numerically.
  const width = Math.max(at(band.hi) - at(band.lo), 0.6);

  return (
    <div className="numberline" data-inside={inside}>

      <div className="numberline-track" role="img"
           aria-label={`Claimant ${claimant}${suffix}, witness ${witness}${suffix}, agreement band ${round(band.lo)} to ${round(band.hi)}`}>
        <span className="numberline-band" style={{ left: `${at(band.lo)}%`, width: `${width}%` }} />
        <span className="numberline-mark witness" style={{ left: `${at(witness)}%` }} />
        <span className="numberline-mark claimant" style={{ left: `${at(claimant)}%` }} />
      </div>

      <div className="numberline-labels">
        <span className="claimant" style={{ left: `${at(claimant)}%` }}>
          claimant {claimant}{suffix}
        </span>
        <span className="witness" style={{ left: `${at(witness)}%` }}>
          witness {witness}{suffix}
        </span>
      </div>

      {/*
        One line carrying what used to take three blocks: the band, which side of
        it the claim fell on, and — the sentence this page exists to earn — that
        both parties were handed the same rows and still disagreed.
      */}
      <p className="numberline-foot">
        {inside ? "inside" : "outside"} the band {round(band.lo)}
        {suffix}&ndash;{round(band.hi)}{suffix}
        {identical === true && divergence !== null && (
          <>
            {" · "}
            <b>identical rows</b>, {round(divergence)}
            {suffix === "%" ? " points" : ""} apart
          </>
        )}
        {identical === false && " · the two parties' rows differ as well"}
      </p>
    </div>
  );
}
