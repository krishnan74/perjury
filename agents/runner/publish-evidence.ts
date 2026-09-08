/**
 * Run the agents for real and publish their sealed submissions for the tribunal.
 *
 *   npx tsx agents/runner/publish-evidence.ts <claimId> [honest|false] [--panel]
 *
 * The claimant and witness run as separate derivations that never see each
 * other's work; the gateway is the only place the two meet, and they meet inside
 * the enclave. Prints the gateway URL and writes it into the CRE config, so the
 * tribunal adjudicates these agents rather than a fixture compiled into itself.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { draftClaim } from "@perjury/claimant";
import { witness } from "@perjury/witness";
import { runPanel, seatPanel } from "@perjury/panel";
import { publishBundle, type EvidenceBundle } from "@perjury/gateway";
import { ClaudeCodeClient } from "@perjury/llm";
import type { SealedSubmission } from "@perjury/tribunal";

const claimId = process.argv[2] ?? "1";
const honest = process.argv[3] !== "false";
const withPanel = process.argv.includes("--panel");
const llm = new ClaudeCodeClient();

const seal = (
  a: { attestation: unknown; methodology: string; evidence: unknown; unverifiableReason?: string },
): SealedSubmission => ({
  attestation: a.attestation as never,
  methodology: a.methodology,
  evidence: a.evidence,
  unverifiableReason: a.unverifiableReason,
});

const claim = await draftClaim(
  "aave-v3-ethereum",
  "utilization ratio (total borrowed / total deposited)",
  honest ? { mode: "honest" } : { mode: "false", overstateBy: 0.6 },
  llm,
);
console.log(`\nCLAIMANT ${honest ? "(honest)" : "(lying)"}: "${claim.text}"`);
console.log(`  asserts ${claim.assertion.value}%`);

const asClaim = {
  claimId, subject: claim.subject, text: claim.text,
  metric: claim.assertion.metric, unit: claim.assertion.unit, comparator: claim.assertion.comparator,
};

const w = await witness(asClaim, llm);
console.log(`WITNESS: derives ${w.attestation?.assertion.value ?? w.unverifiableReason}%`);

const bundle: EvidenceBundle = { claimId, claim: seal(claim), witness: seal(w) };

if (withPanel) {
  const members = ["seat-a", "seat-b", "seat-c"];
  const findings = await runPanel(asClaim, seatPanel(members));
  bundle.panel = findings.map((f) => ({ member: f.member, submission: f.submission }));
  console.log("PANEL:");
  for (const f of findings) {
    console.log(`  ${f.member} → ${f.submission.attestation?.assertion.value ?? f.submission.unverifiableReason}`);
  }
}

const url = publishBundle(bundle);
console.log(`\ngateway: ${url}`);

for (const f of ["cre/tribunal/config.staging.json", "cre/tribunal/config.production.json"]) {
  const cfg = JSON.parse(readFileSync(f, "utf8"));
  cfg.evidenceGatewayUrl = url;
  cfg.claimId = claimId;
  writeFileSync(f, `${JSON.stringify(cfg, null, 2)}\n`);
}
console.log("cre config updated — the tribunal will now judge these submissions");
