"use client";

import { Redacted } from "../claims/Redacted";
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
      {seal.identicalEvidence === true && seal.divergence !== null && (
        <p className="seal-point">
          Both were handed <b>identical rows</b> and their conclusions differ by{" "}
          <b>{round(seal.divergence)}</b>
          {seal.unit === "percent" ? " points" : ""}. The data did not disagree.
        </p>
      )}
      {seal.identicalEvidence === false && (
        <p className="seal-point">
          The two parties&rsquo; archived rows are not identical, so their readings differ as well as
          their conclusions.
        </p>
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

      <p className="seal-out-head">Out of it</p>
      <dl className="seal-out">
        <dt>verdict</dt>
        <dd className={`verdict v-${seal.verdict}`}>{seal.verdict}</dd>
        <dt>commitment</dt>
        <dd className="mono" title={seal.commitment ?? undefined}>
          {seal.commitment ? `${seal.commitment.slice(0, 22)}…` : "—"}
        </dd>
      </dl>

      <p className="seal-note">
        Two fields. Neither value, neither query and neither party&rsquo;s evidence appears in this or
        any other transaction — the commitment is a hash over both submissions and a salt held in the
        enclave.{" "}
        <a href={`${EXPLORER}/tx/${seal.tx}`} target="_blank" rel="noreferrer">
          The report
        </a>{" "}
        arrived from a Chainlink Forwarder.
      </p>

      {/*
        An earlier version of this paragraph justified the archive by asserting
        that confidentiality "was never meant to be permanent". That is not the
        design. Under docs/design.md §3.5 the bundle is stored encrypted with the
        key held by the Vault DON, so it stays confidential indefinitely and any
        later disclosure is a party's own choice. The demo is the exception, and
        it has to be labelled as one rather than dressed up as a principle.
      */}
      <p className="seal-note seal-why">
        <b>Why you can read the two values above.</b> Only because this is a testnet and the runner
        keeps a local copy of each settled bundle. The evidence the tribunal read never existed in the
        open: it was <b>encrypted</b> to a key whose private half the Chainlink Vault DON releases
        only into the attested enclave, so the gateway that carried it holds ciphertext and nothing
        else. Node operators never see plaintext, and neither party ever sees the other&rsquo;s work
        &mdash; the enclave is the only place the two submissions meet. An agent knows its own
        evidence and may choose to reveal it later; the commitment above is what makes such a reveal
        checkable by anyone.
      </p>
    </div>
  );
}

/** Two decimals at most, and no trailing zeroes pretending to be precision. */
const round = (n: number) => String(Math.round(n * 100) / 100);
