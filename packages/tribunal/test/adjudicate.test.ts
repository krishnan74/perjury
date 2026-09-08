// Tribunal adjudication. The leak tests are the important ones: whatever else
// changes, evidence and methodology must never appear in the report.
import { describe, expect, it } from "vitest";
import { adjudicate, encodeReport, looksDerivative, recompute, type SealedSubmission } from "@perjury/tribunal";
import { Verdict, type Attestation, type TypedAssertion } from "@perjury/shared";

const assertion = (value: number, over: Partial<TypedAssertion> = {}): TypedAssertion => ({
  subject: "aave-v3-eth", metric: "totalBorrowBalanceUSD", comparator: "gt",
  value, unit: "USD", asOfBlock: 1000, ...over,
});

const att = (value: number, queryHash = "qh1", over: Partial<TypedAssertion> = {}): Attestation => ({
  provenance: {
    deploymentId: "QmPinned", indexedBlock: 1000, chainHead: 1005,
    queriedAt: 1_700_000_000, queryHash, hasIndexingErrors: false,
  },
  assertion: assertion(value, over),
  digest: `digest-${value}-${queryHash}`,
});

// Evidence must reproduce the asserted value — since ADR 0007 the tribunal
// recomputes from evidence and disregards stated conclusions, so a fixture with
// placeholder evidence is correctly rejected as unverifiable.
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
      "salt",
    );
    expect(r.verdict).toBe(Verdict.Match);
    expect(r.confidence).toBe("high");
  });

  it("Match within tolerance", () => {
    const r = adjudicate(1n, sub(att(1000, "a")), sub(att(1003, "b")), "salt");
    expect(r.verdict).toBe(Verdict.Match);
  });

  it("Mismatch outside tolerance", () => {
    const r = adjudicate(1n, sub(att(1000, "a")), sub(att(1500, "b")), "salt");
    expect(r.verdict).toBe(Verdict.Mismatch);
  });

  it("Mismatch when comparators disagree", () => {
    const r = adjudicate(1n, sub(att(100, "a")), sub(att(100, "b", { comparator: "lt" })), "salt");
    expect(r.verdict).toBe(Verdict.Mismatch);
  });

  // The provenance gate: bad data can never reach a Match.
  it("Unverifiable when the witness could not verify", () => {
    const r = adjudicate(1n, sub(att(100)), sub(null, { unverifiableReason: "stale-index" }), "salt");
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("Unverifiable when the claimant's provenance failed", () => {
    const r = adjudicate(1n, sub(null, { unverifiableReason: "deployment-mismatch" }), sub(att(100)), "salt");
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("Unverifiable when the two assertions are not about the same thing", () => {
    const r = adjudicate(1n, sub(att(100)), sub(att(100, "b", { metric: "somethingElse" })), "salt");
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("never returns Match when either side is unverifiable", () => {
    for (const reason of ["stale-index", "deployment-mismatch", "indexing-errors"]) {
      const r = adjudicate(1n, sub(att(100)), sub(null, { unverifiableReason: reason }), "salt");
      expect(r.verdict).not.toBe(Verdict.Match);
    }
  });

  it("downgrades confidence for a derivative witness but keeps the verdict", () => {
    const shared = "identical methodology text";
    const r = adjudicate(
      1n,
      sub(att(100, "same-query"), { methodology: shared }),
      sub(att(100, "same-query"), { methodology: shared }),
      "salt",
    );
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
    const r = adjudicate(42n, claim, witness, "salt");
    expect(Object.keys(r).sort()).toEqual(["claimId", "confidence", "evidenceCommitment", "verdict"]);
  });

  // If this ever fails, the confidentiality claim is false.
  it("leaks no evidence or methodology into the serialized report", () => {
    const r = adjudicate(42n, claim, witness, "salt");
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
    const a = adjudicate(42n, claim, witness, "salt");
    const b = adjudicate(42n, claim, witness, "salt");
    const c = adjudicate(42n, claim, sub(att(501, "qh-wit")), "salt");
    expect(a.evidenceCommitment).toBe(b.evidenceCommitment);
    expect(a.evidenceCommitment).not.toBe(c.evidenceCommitment);
  });

  it("encodeReport carries nothing beyond the verdict tuple", () => {
    const e = encodeReport(adjudicate(42n, claim, witness, "salt"));
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
        subject: "aave-v3-eth", metric: "utilizationRatio", comparator: "gt",
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
      "salt",
    );
    expect(r.verdict).toBe(Verdict.Match);
  });

  // The attack: a witness fabricates disagreement to capture the bond.
  it("does NOT return Mismatch when the witness's value contradicts its own evidence", () => {
    const r = adjudicate(
      1n,
      sub(util(40, 100), evidence(40, 100), "claimant-q"),
      sub(85, evidence(40, 100), "witness-q"), // says 85%, evidence says 40%
      "salt",
    );
    expect(r.verdict).not.toBe(Verdict.Mismatch);
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  it("catches a lying claimant the same way", () => {
    const r = adjudicate(
      1n,
      sub(85, evidence(40, 100), "claimant-q"),
      sub(util(40, 100), evidence(40, 100), "witness-q"),
      "salt",
    );
    expect(r.verdict).toBe(Verdict.Unverifiable);
  });

  // A witness willing to fabricate consistent evidence still faces the
  // provenance guard and, on appeal, a panel. This asserts the honest path.
  it("still rules Mismatch when both are internally consistent but disagree", () => {
    const r = adjudicate(
      1n,
      sub(util(85, 100), evidence(85, 100), "claimant-q"),
      sub(util(40, 100), evidence(40, 100), "witness-q"),
      "salt",
    );
    expect(r.verdict).toBe(Verdict.Mismatch);
  });

  it("recompute derives a ratio from components rather than trusting a field", () => {
    expect(recompute(evidence(40, 100), "utilizationRatio")).toBeCloseTo(40);
    expect(recompute({ lendingProtocols: [] }, "utilizationRatio")).toBeNull();
    expect(recompute(null, "utilizationRatio")).toBeNull();
  });
});
