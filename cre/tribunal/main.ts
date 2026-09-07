// Perjury tribunal — CRE Confidential Workflow. See docs/design.md §3.
//
// STATUS: written against the documented CRE TS SDK surface but NOT yet run.
// Confidential Workflows is invite-only private beta (ADR 0002); the SDK's exact
// handler-registration API must be confirmed against the installed
// @chainlink/cre-sdk version at T1 before this is trusted.
//
// Boundary (docs/design.md §3.2):
//   IN  — sealed claim + witness blobs, fetched inside the enclave
//   OUT — claimId, verdict, confidence, evidenceCommitment. Nothing else.
import { adjudicate, encodeReport, type SealedSubmission } from "@perjury/tribunal";

interface AdjudicationTrigger {
  claimId: bigint;
  claimPointer: string; // encrypted blob location
  witnessPointer: string;
}

/**
 * Runs INSIDE the TEE. Everything it touches is sensitive.
 *
 * Never log, never emit, and never return anything derived from the fetched
 * blobs except the report — an accidental console.log here would void the
 * confidentiality claim the whole project rests on.
 */
export async function tribunalHandler(
  trigger: AdjudicationTrigger,
  deps: {
    fetchSealed: (pointer: string) => Promise<SealedSubmission>;
    getSecret: (name: string) => Promise<string>;
  },
) {
  // Confidential HTTP + Vault DON: node operators never see plaintext.
  const [claim, witness, salt] = await Promise.all([
    deps.fetchSealed(trigger.claimPointer),
    deps.fetchSealed(trigger.witnessPointer),
    deps.getSecret("PERJURY_COMMITMENT_SALT"),
  ]);

  const report = adjudicate(trigger.claimId, claim, witness, salt);
  return encodeReport(report); // the ONLY value crossing the boundary
}

// ─── CRE registration ────────────────────────────────────────────────────────
// TODO(T1): confirm against the installed SDK, then wire:
//   1. EVM log trigger on ClaimRegistry.ReadyForAdjudication(claimId)
//   2. register tribunalHandler as a confidential (TEE) handler
//   3. encode the return tuple as a report and submit to VerdictSink.onReport
//   4. record the broadcast tx's msg.sender — it settles whether
//      CRE_REPORT_WRITER is the workflow owner or a Forwarder (docs FEEDBACK note)
//
// Run: cre workflow simulate --target staging-settings \
//        --config cre/config.staging.json --broadcast cre/tribunal/main.ts
