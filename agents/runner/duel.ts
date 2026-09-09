// End-to-end scene runner: claimant → witness → tribunal, on live Graph data.
//
//   npx tsx agents/runner/duel.ts honest   — a true claim, expect Match
//   npx tsx agents/runner/duel.ts false    — a fabricated claim, expect Mismatch
//   npx tsx agents/runner/duel.ts honest compound-v3-ethereum
//
// The optional second argument is any pinned subject. Nothing below is
// protocol-specific and neither are the agents: they resolve the subject to a
// pinned deployment and read the Messari standardized lending schema, so
// verifying a protocol the code has never seen is an argument, not a patch.
// `npx tsx scripts/verify-pinned.ts` lists what is available.
//
// The two agents run in the same process here for convenience. In the demo they
// are separate processes with separate keys — see docs/design.md §5.2. What is
// already structural: the witness receives only the claim, never the claimant's
// evidence, methodology, or query.
import { draftClaim } from "@perjury/claimant";
import { witness } from "@perjury/witness";
import { adjudicate, type SealedSubmission } from "@perjury/tribunal";
import { ClaudeCodeClient } from "@perjury/llm";
import { Verdict } from "@perjury/shared";
import { pinnedFor } from "@perjury/graph-client";

const mode = process.argv[2] === "false" ? "false" : "honest";
const subject = process.argv[3] ?? "aave-v3-ethereum";
const llm = new ClaudeCodeClient();

console.log(`SUBJECT: ${subject}  ${pinnedFor(subject).protocolName} · ${pinnedFor(subject).chain} · ${pinnedFor(subject).schema}\n`);

// The metric follows the schema family, not the protocol. Asking a DEX subgraph
// for a borrow/deposit ratio correctly fails closed rather than inventing a
// number, which is right behaviour and a useless demo.
const METRIC: Record<string, string> = {
  "messari-lending": "utilization ratio (total borrowed / total deposited)",
  "messari-dex": "totalValueLockedUSD",
};
const entry = pinnedFor(subject);
const metric = METRIC[entry.schema] ?? METRIC["messari-lending"]!;

const claim = await draftClaim(
  subject,
  metric,
  mode === "false" ? { mode: "false", overstateBy: 0.6 } : { mode: "honest" },
  llm,
);
console.log(`CLAIMANT (${mode}):`);
console.log(`  "${claim.text}"`);
console.log(`  asserts ${claim.assertion.value} ${claim.assertion.unit}  fabricated=${claim.fabricated}\n`);

// The witness answers the claimant's question — same metric identity, its own value.
const f = await witness(
  {
    claimId: "1",
    subject: claim.subject,
    text: claim.text,
    metric: claim.assertion.metric,
    unit: claim.assertion.unit,
    comparator: claim.assertion.comparator,
  },
  llm,
);
console.log("WITNESS (independent):");
if (f.attestation) {
  console.log(`  derives ${f.attestation.assertion.value} ${f.attestation.assertion.unit} @ block ${f.attestation.assertion.asOfBlock}\n`);
} else {
  console.log(`  UNVERIFIABLE: ${f.unverifiableReason}\n`);
}

const seal = (a: typeof claim.attestation, m: string, ev: unknown, r?: string): SealedSubmission => ({
  attestation: a, methodology: m, evidence: ev, unverifiableReason: r,
});
const report = adjudicate(
  1n,
  seal(claim.attestation, claim.methodology, claim.evidence, claim.unverifiableReason),
  seal(f.attestation, f.methodology, f.evidence, f.unverifiableReason),
  "demo-salt",
);
const name = Object.entries(Verdict).find(([, v]) => v === report.verdict)?.[0];
console.log("TRIBUNAL:");
console.log(`  verdict: ${name}  confidence: ${report.confidence}`);
console.log(`  commitment: ${report.evidenceCommitment.slice(0, 24)}…`);
