// Adjudication logic for the confidential tribunal. See docs/design.md §3.3.
//
// Kept as a pure function, separate from the CRE wrapper, so it is testable
// without an enclave. Everything it touches is sensitive: this module's inputs
// never leave the TEE, and its return value is the ONLY thing that does.
import {
  type Attestation,
  type TypedAssertion,
  Verdict,
  type VerdictValue,
  canonicalize,
  sha256,
} from "@perjury/shared";

/** What each party submits. Sealed; fetched inside the enclave. */
export interface SealedSubmission {
  attestation: Attestation | null;
  /** Free-form methodology. Never emitted, never logged, never hashed alone. */
  methodology: string;
  /**
   * Raw query result the assertion was derived from. Never emitted — but no
   * longer merely stored: the tribunal recomputes the value from this rather
   * than trusting the stated assertion (ADR 0007).
   */
  evidence: unknown;
  /** Set when the party could not verify — carries its reason. */
  unverifiableReason?: string;
}

/**
 * Recompute a metric from raw evidence, ignoring what the party said it was.
 *
 * The witness is the party with a financial motive to misreport, so its stated
 * conclusion cannot be the input to adjudication. Deriving from the evidence
 * means a liar must fabricate an internally consistent query result that still
 * carries a pinned deployment id and a fresh block — a much higher bar than
 * changing a number.
 *
 * Returns null when the metric cannot be recomputed from the evidence, which is
 * itself disqualifying: a submission whose conclusion cannot be reproduced from
 * its own evidence is not evidence.
 */
export function recompute(evidence: unknown, metric: string): number | null {
  if (evidence === null || typeof evidence !== "object") return null;
  const rows = (evidence as Record<string, unknown>)["lendingProtocols"];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0] as Record<string, string>;

  const num = (k: string): number | null => {
    const v = row[k];
    if (v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // A ratio metric is recomputed from its components, never taken on trust.
  if (/utilization/i.test(metric)) {
    const borrowed = num("totalBorrowBalanceUSD");
    const deposited = num("totalDepositBalanceUSD");
    if (borrowed === null || deposited === null || deposited === 0) return null;
    return (borrowed / deposited) * 100;
  }
  return num(metric);
}

/** The complete public output. Nothing else may cross the enclave boundary. */
export interface TribunalReport {
  claimId: bigint;
  verdict: VerdictValue;
  confidence: "high" | "low";
  evidenceCommitment: string;
}

/** Per-metric tolerance. Two honest agents may differ in the last decimal. */
export const DEFAULT_TOLERANCE = 0.005; // 0.5%

/**
 * How far apart the two readings may be, in blocks.
 *
 * The claimant and witness query at different moments and therefore different
 * blocks. On a metric that moves faster than the tolerance band, two perfectly
 * honest parties reading blocks apart disagree — and the claimant is slashed for
 * telling the truth about a different moment. A protocol that punishes honesty
 * under normal operation is worse than one that occasionally misses a lie.
 */
export const MAX_BLOCK_SKEW = 25;

function withinTolerance(a: number, b: number, tolerance: number): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return true;
  return Math.abs(a - b) / scale <= tolerance;
}

function comparableShape(x: TypedAssertion, y: TypedAssertion): boolean {
  return x.subject === y.subject && x.metric === y.metric && x.unit === y.unit;
}

/**
 * Detect a witness that copied rather than derived. Partial by construction:
 * it catches the crude case, not a careless-but-original witness. See
 * docs/design.md §6 — we do not claim this closes the verifier's dilemma.
 */
export function looksDerivative(claim: SealedSubmission, witness: SealedSubmission): boolean {
  if (!claim.attestation || !witness.attestation) return false;
  const sameQuery = claim.attestation.provenance.queryHash === witness.attestation.provenance.queryHash;
  const sameMethodology =
    claim.methodology.trim().length > 0 && claim.methodology.trim() === witness.methodology.trim();
  return sameQuery || sameMethodology;
}

/**
 * Compare a claim against an independently-derived finding.
 *
 * Order matters: provenance is gated BEFORE comparison, so bad data can never
 * reach a Match. The commitment is over both sealed blobs, letting anyone later
 * verify the tribunal judged these exact inputs — without publishing them.
 */
export function adjudicate(
  claimId: bigint,
  claim: SealedSubmission,
  witness: SealedSubmission,
  salt: string,
  tolerance: number = DEFAULT_TOLERANCE,
): TribunalReport {
  const evidenceCommitment = sha256(
    canonicalize({ claim, witness, salt }),
  );
  const base = { claimId, evidenceCommitment };

  // 1. Provenance gate. Never Match on untrustworthy data.
  if (claim.unverifiableReason || witness.unverifiableReason) {
    return { ...base, verdict: Verdict.Unverifiable, confidence: "high" };
  }
  if (!claim.attestation || !witness.attestation) {
    return { ...base, verdict: Verdict.Unverifiable, confidence: "high" };
  }

  const a = claim.attestation.assertion;
  const b = witness.attestation.assertion;

  // 2. Normalize. Assertions about different things are not evidence of anything.
  if (!comparableShape(a, b)) {
    return { ...base, verdict: Verdict.Unverifiable, confidence: "high" };
  }

  // 2a. Readings too far apart are not comparable. Neither party has done
  //     anything wrong; they simply looked at different states of the world.
  if (Math.abs(a.asOfBlock - b.asOfBlock) > MAX_BLOCK_SKEW) {
    return { ...base, verdict: Verdict.Unverifiable, confidence: "high" };
  }

  // 2b. Recompute both values from raw evidence and use those, not the stated
  //     conclusions. A party whose own evidence does not reproduce its claimed
  //     value has submitted something that is not evidence (ADR 0007).
  const claimValue = recompute(claim.evidence, a.metric);
  const witnessValue = recompute(witness.evidence, b.metric);
  if (claimValue === null || witnessValue === null) {
    return { ...base, verdict: Verdict.Unverifiable, confidence: "high" };
  }
  // The two roles are not symmetric, and treating them as such made lying safe.
  //
  // The claimant is asserting something. If its own evidence does not reproduce
  // its stated value, the claim is provably misrepresented — that is a Mismatch,
  // not an absence of information. Returning Unverifiable here would let a
  // claimant escape penalty by submitting truthful evidence under a false
  // conclusion, which is easier than lying convincingly.
  if (!withinTolerance(claimValue, a.value, tolerance)) {
    return { ...base, verdict: Verdict.Mismatch, confidence: "high" };
  }
  // The witness is checking. If its conclusion does not follow from its evidence
  // it has not performed a check, so there is nothing to compare against — and
  // an unreliable check must not convict the claimant.
  if (!withinTolerance(witnessValue, b.value, tolerance)) {
    return { ...base, verdict: Verdict.Unverifiable, confidence: "low" };
  }

  // 3. Degeneracy check — downgrades confidence, never flips the verdict.
  const confidence = looksDerivative(claim, witness) ? "low" : "high";

  // 4. Consensus check — on the recomputed values, not the stated ones.
  const agrees =
    a.comparator === b.comparator && withinTolerance(claimValue, witnessValue, tolerance);

  return { ...base, verdict: agrees ? Verdict.Match : Verdict.Mismatch, confidence };
}

/** One panel member's independent finding on an appealed claim. */
export interface PanelFinding {
  member: string;
  submission: SealedSubmission;
}

export interface PanelReport {
  claimId: bigint;
  verdict: VerdictValue;
  /** How the seats split, for the record. Counts only — never who said what. */
  tally: { match: number; mismatch: number; unverifiable: number };
  evidenceCommitment: string;
}

/**
 * Adjudicate an appeal.
 *
 * Each seat is judged against the original claim independently, using the same
 * rules as a single witness — including recomputation from raw evidence, so a
 * bought seat cannot simply assert a number. The majority of seats that reached
 * a conclusion stands.
 *
 * Unverifiable seats are excluded rather than counted as dissent: a member that
 * could not read the data has not disagreed with anything. If fewer than half
 * the seats reached a conclusion, or the conclusive seats tie, the panel returns
 * Unverifiable — a panel that cannot form a majority has not overturned
 * anything, and the original verdict should stand.
 */
export function adjudicatePanel(
  claimId: bigint,
  claim: SealedSubmission,
  panel: PanelFinding[],
  salt: string,
  tolerance: number = DEFAULT_TOLERANCE,
): PanelReport {
  const evidenceCommitment = sha256(canonicalize({ claim, panel, salt }));
  const tally = { match: 0, mismatch: 0, unverifiable: 0 };

  for (const seat of panel) {
    const r = adjudicate(claimId, claim, seat.submission, salt, tolerance);
    if (r.verdict === Verdict.Match) tally.match++;
    else if (r.verdict === Verdict.Mismatch) tally.mismatch++;
    else tally.unverifiable++;
  }

  const conclusive = tally.match + tally.mismatch;
  if (conclusive === 0 || conclusive <= panel.length / 2 || tally.match === tally.mismatch) {
    return { claimId, verdict: Verdict.Unverifiable, tally, evidenceCommitment };
  }
  return {
    claimId,
    verdict: tally.match > tally.mismatch ? Verdict.Match : Verdict.Mismatch,
    tally,
    evidenceCommitment,
  };
}

/** ABI-encodable tuple handed to VerdictSink.onReport. Verdict + commitment only. */
export function encodeReport(r: TribunalReport): {
  claimId: bigint;
  verdict: number;
  evidenceCommitment: string;
} {
  return {
    claimId: r.claimId,
    verdict: r.verdict,
    evidenceCommitment: `0x${r.evidenceCommitment}`,
  };
}
