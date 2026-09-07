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
  /** Raw evidence blob. Never emitted. */
  evidence: unknown;
  /** Set when the party could not verify — carries its reason. */
  unverifiableReason?: string;
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

  // 3. Degeneracy check — downgrades confidence, never flips the verdict.
  const confidence = looksDerivative(claim, witness) ? "low" : "high";

  // 4. Consensus check.
  const agrees =
    a.comparator === b.comparator && withinTolerance(a.value, b.value, tolerance);

  return { ...base, verdict: agrees ? Verdict.Match : Verdict.Mismatch, confidence };
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
