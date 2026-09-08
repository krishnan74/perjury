// Scene 2 with an appeal: a false claim is caught, the liar appeals, and an
// independent panel upholds the verdict.
//
//   npx tsx agents/runner/appeal.ts
//
// Also runnable as the case the appeal layer exists for — pass `honest` to have
// the claimant tell the truth and a lying witness be overturned by the panel.
import { draftClaim } from "@perjury/claimant";
import { witness } from "@perjury/witness";
import { adjudicate, adjudicatePanel, type SealedSubmission } from "@perjury/tribunal";
import { runPanel, seatPanel } from "@perjury/panel";
import { ClaudeCodeClient } from "@perjury/llm";
import { Verdict } from "@perjury/shared";

const honestClaimant = process.argv[2] === "honest";
const name = (v: number) => Object.entries(Verdict).find(([, x]) => x === v)?.[0];
const llm = new ClaudeCodeClient();

const claim = await draftClaim(
  "aave-v3-ethereum",
  "utilization ratio (total borrowed / total deposited)",
  honestClaimant ? { mode: "honest" } : { mode: "false", overstateBy: 0.6 },
  llm,
);
console.log(`\nCLAIMANT ${honestClaimant ? "(honest)" : "(lying)"}`);
console.log(`  "${claim.text}"  → asserts ${claim.assertion.value}%\n`);

const asClaim = {
  claimId: "1", subject: claim.subject, text: claim.text,
  metric: claim.assertion.metric, unit: claim.assertion.unit, comparator: claim.assertion.comparator,
};
const seal = (a: unknown, m: string, ev: unknown, r?: string): SealedSubmission =>
  ({ attestation: a as never, methodology: m, evidence: ev, unverifiableReason: r });

// The original witness. When the claimant is honest we make this one lie, which
// is the scenario the panel exists to catch.
let w = await witness(asClaim, llm);
if (honestClaimant && w.attestation) {
  w = { ...w, attestation: { ...w.attestation, assertion: { ...w.attestation.assertion, value: 85 } } };
  console.log("WITNESS (lying — fabricates disagreement to capture the bond)");
} else {
  console.log("WITNESS (honest)");
}
console.log(`  derives ${w.attestation?.assertion.value ?? "—"}%\n`);

const first = adjudicate(
  1n,
  seal(claim.attestation, claim.methodology, claim.evidence, claim.unverifiableReason),
  seal(w.attestation, w.methodology, w.evidence, w.unverifiableReason),
  "demo-salt",
);
console.log(`TRIBUNAL → ${name(first.verdict)} (confidence ${first.confidence})\n`);

// The losing party appeals. Three seats, drawn on-chain by VRF, none of them a
// party to the claim — and deliberately not all on the same model.
const members = ["0xPanelA", "0xPanelB", "0xPanelC"];
const seats = seatPanel(members);
console.log("APPEAL — panel seated:");
for (const s of seats) console.log(`  ${s.member}  model=${s.model}`);

const findings = await runPanel(asClaim, seats);
for (const f of findings) {
  console.log(`  ${f.member} → ${f.submission.attestation?.assertion.value ?? f.submission.unverifiableReason}`);
}

const panel = adjudicatePanel(
  1n,
  seal(claim.attestation, claim.methodology, claim.evidence, claim.unverifiableReason),
  findings,
  "demo-salt",
);
console.log(`\nPANEL → ${name(panel.verdict)}   tally ${JSON.stringify(panel.tally)}`);
console.log(
  panel.verdict === first.verdict
    ? "  original verdict UPHELD — appellant forfeits its appeal bond"
    : "  original verdict OVERTURNED — the contradicted party is slashed",
);
