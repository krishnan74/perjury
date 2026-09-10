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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  a: {
    attestation: unknown;
    methodology: string;
    evidence: unknown;
    unverifiableReason?: string;
    query?: string;
  },
): SealedSubmission => ({
  attestation: a.attestation as never,
  methodology: a.methodology,
  evidence: a.evidence,
  unverifiableReason: a.unverifiableReason,
  query: a.query,
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
  // Witness and panel read the block the claimant read, not whatever is latest
  // when they happen to run — a panel seated minutes later would otherwise be
  // comparing against different chain state.
  atBlock: claim.assertion.asOfBlock || undefined,
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

/*
 * Keep the agents' work.
 *
 * Until now nothing about a run survived it. The gateway gets a fresh gist per
 * run and only the newest URL is kept, in the CRE config; the chain keeps a
 * commitment, which is a hash. So a settled verdict could be proven to exist and
 * never inspected, which is a poor bargain for a project whose subject is
 * verifiable claims.
 *
 * This is a deliberate disclosure and is recorded as one in docs/decisions.md.
 * Note what it does NOT change: the tribunal still publishes a verdict and a
 * commitment and nothing else. The bundle is published here, by the runner,
 * out of band, after the fact. Confidentiality is a property of the adjudication
 * window — it stops node operators reading evidence in flight and stops a
 * claimant tailoring to a witness's method before the verdict lands — and it was
 * never eternal. The gateway gist has been world-readable from the first run.
 */
mkdirSync("evidence-archive", { recursive: true });
const archive = `evidence-archive/${claimId}.json`;
writeFileSync(
  archive,
  `${JSON.stringify({ ...bundle, gatewayUrl: url, archivedAt: new Date().toISOString() }, null, 2)}\n`,
);
console.log(`archived: ${archive}`);

for (const f of ["cre/tribunal/config.staging.json", "cre/tribunal/config.production.json"]) {
  const cfg = JSON.parse(readFileSync(f, "utf8"));
  cfg.evidenceGatewayUrl = url;
  cfg.claimId = claimId;
  writeFileSync(f, `${JSON.stringify(cfg, null, 2)}\n`);
}
console.log("cre config updated — the tribunal will now judge these submissions");
