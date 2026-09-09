// Tribunal adjudication. The leak tests are the important ones: whatever else
// changes, evidence and methodology must never appear in the report.
import { describe, expect, it } from "vitest";
import {
  adjudicate, adjudicatePanel, encodeReport, looksDerivative, recompute,
  maxBlockSkewFor, BLOCK_SECONDS, MAX_SKEW_SECONDS, DEFAULT_TOLERANCE, provenanceOk, NO_PROVENANCE_POLICY,
  type PanelFinding, type SealedSubmission,
} from "@perjury/tribunal";
import { Verdict, type Attestation, type TypedAssertion } from "@perjury/shared";

const assertion = (value: number, over: Partial<TypedAssertion> = {}): TypedAssertion => ({
  subject: "aave-v3-eth", chain: "ethereum", metric: "totalBorrowBalanceUSD", comparator: "gt",
  value, unit: "USD", asOfBlock: 1000, ...over,
});

// indexedBlock tracks the assertion's asOfBlock: the tribunal now rejects an
// assertion that does not describe the block its own data came from, so a
// fixture that lets the two drift is testing an invalid submission.
const att = (value: number, queryHash = "qh1", over: Partial<TypedAssertion> = {}): Attestation => {
  const a = assertion(value, over);
  return {
    provenance: {
      deploymentId: "QmPinned", indexedBlock: a.asOfBlock, chainHead: a.asOfBlock + 5,
      queriedAt: 1_700_000_000, queryHash, hasIndexingErrors: false,
    },
    assertion: a,
    digest: `digest-${value}-${queryHash}`,
  };
};

// Evidence must reproduce the asserted value — since ADR 0007 the tribunal
// recomputes from evidence and disregards stated conclusions, so a fixture with
// placeholder evidence is correctly rejected as unverifiable.
/** Accepts the fixtures above. Declared explicitly because the default policy
 *  accepts nothing — a tribunal with no provenance policy must not silently
 *  admit every submission. */
const POLICY = { pinnedDeployments: ["QmPinned"], freshnessSeconds: 600 };

const sub = (a: Attestation | null, over: Partial<SealedSubmission> = {}): SealedSubmission => ({
  attestation: a,
  methodology: "queried messari lending schema, took latest market snapshot",
  evidence: a
    ? { lendingProtocols: [{ totalBorrowBalanceUSD: String(a.assertion.value) }] }
    : null,
  ...over,
});

describe("adjudicate", () => {
  it("Match when both independently derive the same value", () => {
    // Distinct queries and distinct methodology: genuinely independent work.
    const r = adjudicate(
      1n,
      sub(att(100, "qh-claim"), { methodology: "claimant: messari lending, latest snapshot" }),
      sub(att(100, "qh-witness"), { methodology: "witness: messari lending, block-pinned read" }),
      "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Match);
    expect(r.confidence).toBe("high");
  });

  it("Match within tolerance", () => {
    const r = adjudicate(1n, sub(att(1000, "a")), sub(att(1003, "b")), "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Match);
  });

  it("Mismatch outside tolerance", () => {
    const r = adjudicate(1n, sub(att(1000, "a")), sub(att(1500, "b")), "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Mismatch);
  });

  it("Mismatch when comparators disagree", () => {
    const r = adjudicate(1n, sub(att(100, "a")), sub(att(100, "b", { comparator: "lt" })), "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Mismatch);
  });

  // The provenance gate: bad data can never reach a Match.
  it("Unverifiable when the witness could not verify", () => {
    const r = adjudicate(1n, sub(att(100)), sub(null, { unverifiableReason: "stale-index" }), "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("Unverifiable when the claimant's provenance failed", () => {
    const r = adjudicate(1n, sub(null, { unverifiableReason: "deployment-mismatch" }), sub(att(100)), "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("Unverifiable when the two assertions are not about the same thing", () => {
    const r = adjudicate(1n, sub(att(100)), sub(att(100, "b", { metric: "somethingElse" })), "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("never returns Match when either side is unverifiable", () => {
    for (const reason of ["stale-index", "deployment-mismatch", "indexing-errors"]) {
      const r = adjudicate(1n, sub(att(100)), sub(null, { unverifiableReason: reason }), "salt", DEFAULT_TOLERANCE, POLICY);
      expect(r.verdict).not.toBe(Verdict.Match);
    }
  });

  it("downgrades confidence for a derivative witness but keeps the verdict", () => {
    const shared = "identical methodology text";
    const r = adjudicate(
      1n,
      sub(att(100, "same-query"), { methodology: shared }),
      sub(att(100, "same-query"), { methodology: shared }),
      "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Match);
    expect(r.confidence).toBe("low");
  });

  it("looksDerivative catches a copied query, not an independent one", () => {
    expect(looksDerivative(sub(att(1, "same")), sub(att(1, "same")))).toBe(true);
    expect(
      looksDerivative(sub(att(1, "x"), { methodology: "mine" }), sub(att(1, "y"), { methodology: "theirs" })),
    ).toBe(false);
  });
});

describe("enclave boundary", () => {
  const claim = sub(att(100, "qh-claim"), { methodology: "SECRET-CLAIM-METHOD", evidence: { k: "SECRET-CLAIM-EVIDENCE" } });
  const witness = sub(att(500, "qh-wit"), { methodology: "SECRET-WITNESS-METHOD", evidence: { k: "SECRET-WITNESS-EVIDENCE" } });

  it("emits only claimId, verdict, confidence and a commitment", () => {
    const r = adjudicate(42n, claim, witness, "salt", DEFAULT_TOLERANCE, POLICY);
    expect(Object.keys(r).sort()).toEqual(["claimId", "confidence", "evidenceCommitment", "verdict"]);
  });

  // If this ever fails, the confidentiality claim is false.
  it("leaks no evidence or methodology into the serialized report", () => {
    const r = adjudicate(42n, claim, witness, "salt", DEFAULT_TOLERANCE, POLICY);
    const wire = JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    for (const secret of [
      "SECRET-CLAIM-METHOD", "SECRET-CLAIM-EVIDENCE",
      "SECRET-WITNESS-METHOD", "SECRET-WITNESS-EVIDENCE",
      "QmPinned", "qh-claim", "qh-wit", "totalBorrowBalanceUSD",
    ]) {
      expect(wire).not.toContain(secret);
    }
    // Nor the disputed values themselves.
    expect(wire).not.toContain("500");
  });

  it("commitment is deterministic and binds both submissions", () => {
    const a = adjudicate(42n, claim, witness, "salt", DEFAULT_TOLERANCE, POLICY);
    const b = adjudicate(42n, claim, witness, "salt", DEFAULT_TOLERANCE, POLICY);
    const c = adjudicate(42n, claim, sub(att(501, "qh-wit")), "salt", DEFAULT_TOLERANCE, POLICY);
    expect(a.evidenceCommitment).toBe(b.evidenceCommitment);
    expect(a.evidenceCommitment).not.toBe(c.evidenceCommitment);
  });

  it("encodeReport carries nothing beyond the verdict tuple", () => {
    const e = encodeReport(adjudicate(42n, claim, witness, "salt", DEFAULT_TOLERANCE, POLICY));
    expect(Object.keys(e).sort()).toEqual(["claimId", "evidenceCommitment", "verdict"]);
    expect(e.evidenceCommitment).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

// ADR 0007. The witness earns only on Mismatch, so it is the party with a motive
// to misreport. These assert that a stated conclusion carries no weight unless
// the party's own evidence reproduces it.
describe("lying witness", () => {
  const evidence = (borrowed: number, deposited: number) => ({
    lendingProtocols: [{
      totalBorrowBalanceUSD: String(borrowed),
      totalDepositBalanceUSD: String(deposited),
    }],
  });
  const util = (b: number, d: number) => (b / d) * 100;

  const sub = (stated: number, ev: unknown, m = "own method"): SealedSubmission => ({
    attestation: {
      provenance: {
        deploymentId: "QmPinned", indexedBlock: 1000, chainHead: 1005,
        queriedAt: 1, queryHash: m, hasIndexingErrors: false,
      },
      assertion: {
        subject: "aave-v3-eth", chain: "ethereum", metric: "utilizationRatio", comparator: "gt",
        value: stated, unit: "percent", asOfBlock: 1000,
      },
      digest: `d-${stated}-${m}`,
    },
    methodology: m,
    evidence: ev,
  });

  it("Match when both stated values follow from their own evidence", () => {
    const r = adjudicate(
      1n,
      sub(util(40, 100), evidence(40, 100), "claimant-q"),
      sub(util(40, 100), evidence(40, 100), "witness-q"),
      "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Match);
  });

  // The attack: a witness fabricates disagreement to capture the bond.
  it("does NOT return Mismatch when the witness's value contradicts its own evidence", () => {
    const r = adjudicate(
      1n,
      sub(util(40, 100), evidence(40, 100), "claimant-q"),
      sub(85, evidence(40, 100), "witness-q"), // says 85%, evidence says 40%
      "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).not.toBe(Verdict.Mismatch);
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  // Asymmetric on purpose. Returning Unverifiable here would make lying SAFER
  // than telling the truth: a claimant could submit honest evidence under a
  // false conclusion and get its bond back.
  it("a claimant whose evidence contradicts its own claim is a Mismatch, not Unverifiable", () => {
    const r = adjudicate(
      1n,
      sub(85, evidence(40, 100), "claimant-q"),
      sub(util(40, 100), evidence(40, 100), "witness-q"),
      "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Mismatch);
  });

  // A witness willing to fabricate consistent evidence still faces the
  // provenance guard and, on appeal, a panel. This asserts the honest path.
  it("still rules Mismatch when both are internally consistent but disagree", () => {
    const r = adjudicate(
      1n,
      sub(util(85, 100), evidence(85, 100), "claimant-q"),
      sub(util(40, 100), evidence(40, 100), "witness-q"),
      "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Mismatch);
  });

  it("recompute derives a ratio from components rather than trusting a field", () => {
    expect(recompute(evidence(40, 100), "utilizationRatio")).toBeCloseTo(40);
    expect(recompute({ lendingProtocols: [] }, "utilizationRatio")).toBeNull();
    expect(recompute(null, "utilizationRatio")).toBeNull();
  });
});

// The appeal panel. A single witness can fabricate evidence that reproduces its
// own false conclusion; three independent derivations are what catches it.
describe("adjudicatePanel", () => {
  const ev = (b: number, d: number) => ({
    lendingProtocols: [{ totalBorrowBalanceUSD: String(b), totalDepositBalanceUSD: String(d) }],
  });
  const u = (b: number, d: number) => (b / d) * 100;
  const seat = (member: string, stated: number, evidence: unknown): PanelFinding => ({
    member,
    submission: {
      attestation: {
        provenance: {
          deploymentId: "QmPinned", indexedBlock: 1000, chainHead: 1005,
          queriedAt: 1, queryHash: `q-${member}`, hasIndexingErrors: false,
        },
        assertion: {
          subject: "aave-v3-eth", chain: "ethereum", metric: "utilizationRatio", comparator: "gt",
          value: stated, unit: "percent", asOfBlock: 1000,
        },
        digest: `d-${member}`,
      },
      methodology: `seat ${member}`,
      evidence,
    },
  });

  const truthfulClaim = seat("claimant", u(40, 100), ev(40, 100)).submission;
  const lyingClaim = seat("claimant", u(85, 100), ev(85, 100)).submission;

  it("upholds a Mismatch when the panel agrees the claim was false", () => {
    const r = adjudicatePanel(1n, lyingClaim, [
      seat("a", u(40, 100), ev(40, 100)),
      seat("b", u(40, 100), ev(40, 100)),
      seat("c", u(40, 100), ev(40, 100)),
    ], "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Mismatch);
    expect(r.tally.mismatch).toBe(3);
  });

  // The case the appeal layer exists for: one witness lied, the panel does not.
  it("overturns to Match when the panel agrees with an honest claimant", () => {
    const r = adjudicatePanel(1n, truthfulClaim, [
      seat("a", u(40, 100), ev(40, 100)),
      seat("b", u(40, 100), ev(40, 100)),
      seat("c", u(40, 100), ev(40, 100)),
    ], "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Match);
  });

  it("a single dissenting seat does not decide the outcome", () => {
    const r = adjudicatePanel(1n, truthfulClaim, [
      seat("a", u(40, 100), ev(40, 100)),
      seat("b", u(40, 100), ev(40, 100)),
      seat("liar", u(85, 100), ev(85, 100)),
    ], "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Match);
    expect(r.tally).toEqual({ match: 2, mismatch: 1, unverifiable: 0 });
  });

  it("returns Unverifiable when too few seats reached a conclusion", () => {
    const blind = (m: string): PanelFinding => ({
      member: m,
      submission: { attestation: null, methodology: m, evidence: null, unverifiableReason: "stale-index" },
    });
    const r = adjudicatePanel(1n, truthfulClaim, [
      seat("a", u(40, 100), ev(40, 100)), blind("b"), blind("c"),
    ], "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("a tie does not overturn anything", () => {
    const r = adjudicatePanel(1n, truthfulClaim, [
      seat("a", u(40, 100), ev(40, 100)),
      seat("b", u(85, 100), ev(85, 100)),
    ], "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("publishes counts, never who said what", () => {
    const r = adjudicatePanel(1n, truthfulClaim, [
      seat("alice-agent", u(40, 100), ev(40, 100)),
      seat("bob-agent", u(40, 100), ev(40, 100)),
      seat("carol-agent", u(40, 100), ev(40, 100)),
    ], "salt", DEFAULT_TOLERANCE, POLICY);
    const wire = JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    for (const name of ["alice-agent", "bob-agent", "carol-agent", "QmPinned"]) {
      expect(wire).not.toContain(name);
    }
  });
});

// Two honest parties reading different blocks have not disagreed about
// anything, and must not be treated as though they had.
describe("block skew", () => {
  const ev = (b: number) => ({ lendingProtocols: [{ totalBorrowBalanceUSD: String(b) }] });
  const at = (block: number, value: number): SealedSubmission => ({
    attestation: {
      provenance: {
        deploymentId: "QmPinned", indexedBlock: block, chainHead: block + 2,
        queriedAt: 1, queryHash: `q${block}`, hasIndexingErrors: false,
      },
      assertion: {
        subject: "s", chain: "ethereum", metric: "totalBorrowBalanceUSD", comparator: "gt",
        value, unit: "USD", asOfBlock: block,
      },
      digest: `d${block}`,
    },
    methodology: `read at ${block}`,
    evidence: ev(value),
  });

  it("compares readings taken close together", () => {
    expect(adjudicate(1n, at(1000, 100), at(1005, 100), "salt", DEFAULT_TOLERANCE, POLICY).verdict).toBe(Verdict.Match);
  });

  it("refuses to judge readings taken far apart, rather than convicting", () => {
    const r = adjudicate(1n, at(1000, 100), at(2000, 180), "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Unverifiable);
    expect(r.verdict).not.toBe(Verdict.Mismatch);
  });

  it("skew is checked before values, so a wide gap never becomes a Mismatch", () => {
    // Values differ enormously, but the readings are 1000 blocks apart.
    expect(adjudicate(1n, at(1000, 10), at(2000, 900), "salt", DEFAULT_TOLERANCE, POLICY).verdict).toBe(Verdict.Unverifiable);
  });
});

// ── Chain-relative block skew ───────────────────────────────────────────────
// A flat block count is only meaningful on one chain. These pin the property
// that made two honest agents reading Arbitrum return Unverifiable.
describe("block skew is judged in time, not blocks", () => {
  it("tolerates on a fast chain a gap that would fail on Ethereum", () => {
    // ~80 blocks is about 20 seconds on Arbitrum and 16 minutes on Ethereum.
    expect(maxBlockSkewFor("arbitrum")).toBeGreaterThan(80);
    expect(maxBlockSkewFor("ethereum")).toBeLessThan(80);
  });

  it("gives every chain the same window in seconds", () => {
    for (const [chain, secs] of Object.entries(BLOCK_SECONDS)) {
      expect(maxBlockSkewFor(chain) * secs).toBeGreaterThanOrEqual(MAX_SKEW_SECONDS);
    }
  });

  it("falls back to Ethereum's block time for an unknown chain", () => {
    expect(maxBlockSkewFor("some-new-rollup")).toBe(maxBlockSkewFor("ethereum"));
  });

  it("accepts an L2 gap that the old flat 25-block rule rejected", () => {
    const r = adjudicate(
      1n,
      sub(att(100, "qh-claim", { chain: "arbitrum", asOfBlock: 1000 })),
      sub(att(100, "qh-witness", { chain: "arbitrum", asOfBlock: 1080 })),
      "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Match);
  });

  it("refuses to compare readings from different chains", () => {
    // The same metric on two chains is two different facts, not a disagreement.
    const r = adjudicate(
      1n,
      sub(att(100, "qh-claim", { chain: "ethereum" })),
      sub(att(100, "qh-witness", { chain: "arbitrum" })),
      "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });
});

// ── The tribunal re-checks provenance instead of trusting it ────────────────
// Previously the gate proved only that an attestation EXISTED, so a party could
// assert the adequacy of its own evidence and be believed. These pin the fix.
describe("provenance is verified, not asserted", () => {
  it("refuses evidence from a deployment that is not pinned", () => {
    const rogue = att(100, "qh-claim");
    rogue.provenance.deploymentId = "QmSomethingElse";
    const r = adjudicate(1n, sub(rogue), sub(att(100, "qh-witness")), "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("refuses a submission whose subgraph reported indexing errors", () => {
    const broken = att(100, "qh-claim");
    broken.provenance.hasIndexingErrors = true;
    const r = adjudicate(1n, sub(broken), sub(att(100, "qh-witness")), "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("refuses a stale index, measured per chain", () => {
    const stale = att(100, "qh-claim");
    // Ethereum tolerates 50 blocks for a 600s window; 500 is far beyond it.
    stale.provenance.chainHead = stale.provenance.indexedBlock + 500;
    const r = adjudicate(1n, sub(stale), sub(att(100, "qh-witness")), "salt", DEFAULT_TOLERANCE, POLICY);
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("tolerates on Arbitrum a lag that would be stale on Ethereum", () => {
    // 500 blocks is ~2 minutes on Arbitrum and over an hour on Ethereum.
    const a = att(100, "qh-claim", { chain: "arbitrum" });
    const b = att(100, "qh-witness", { chain: "arbitrum" });
    for (const x of [a, b]) x.provenance.chainHead = x.provenance.indexedBlock + 500;
    expect(provenanceOk(a, POLICY)).toBe(true);
  });

  it("refuses an assertion that does not describe the block its data came from", () => {
    // Claiming a reading is 'as of' a block other than the one indexed lets a
    // party dodge the skew check by relabelling when it read.
    const lying = att(100, "qh-claim");
    lying.assertion.asOfBlock = lying.provenance.indexedBlock + 1;
    expect(provenanceOk(lying, POLICY)).toBe(false);
  });

  it("accepts nothing when no policy is supplied", () => {
    // A tribunal with no policy must fail closed. Defaulting to 'accept all' is
    // exactly how provenance came to be self-asserted in the first place.
    expect(provenanceOk(att(100), NO_PROVENANCE_POLICY)).toBe(false);
    const r = adjudicate(1n, sub(att(100, "a")), sub(att(100, "b")), "salt");
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("still reaches Match when both parties' provenance is sound", () => {
    const r = adjudicate(
      1n,
      sub(att(100, "qh-claim"), { methodology: "claimant: latest snapshot" }),
      sub(att(100, "qh-witness"), { methodology: "witness: block-pinned read" }),
      "salt", DEFAULT_TOLERANCE, POLICY,
    );
    expect(r.verdict).toBe(Verdict.Match);
  });
});
