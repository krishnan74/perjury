/**
 * Scene 2 — a false claim, and the appeal that fails.
 *
 *   npx tsx agents/runner/scene2.ts
 *
 * A claimant states something its own data does not support. A randomly assigned
 * witness disagrees, the tribunal rules against it, and the claimant appeals —
 * so three more agents, drawn independently and running different models,
 * re-derive the answer. They uphold it. The claimant loses its bond, its appeal
 * bond, its stake, its eligibility and its reputation.
 */
import { keccak256, toBytes } from "viem";
import * as p from "./lib/present";
import {
  AGENTS, APPEAL_BOND, BOND, REGISTRY, REGISTRY_ABI, ROSTER, ROSTER_ABI, account, addressOf,
  claim, claimantFor, draftEvidence, op, preflight, pub, rosterSnapshot, runTribunal, standingOf,
  walletFor, witnessEvidence,
} from "./lib/chain";

// Which agent makes the claim. Scene 2 slashes it, so pass a different one
// per run rather than redeploying: npx tsx agents/runner/scene2.ts panel-1
const who = claimantFor(process.argv.find((a) => !a.startsWith("-") && a.includes("perjury") === false && ["operator","witness-a","panel-1","panel-2","panel-3"].includes(a)));
const CLAIMANT = who.name;
const signer = walletFor(who.pk);
p.scene(2, "A false claim, and an appeal that fails",
  "Lying should cost the bond, the stake, the standing, and the right to judge others.");

await preflight(CLAIMANT, who.address, 5);

const beforeStanding = await standingOf(CLAIMANT);
const beforeStake = await pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "stakeOf", args: [who.address] });
const claimId = await pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "nextClaimId" });

p.step("The claimant reads live data, then states something it does not support");
p.note("It reads honestly and overstates deliberately. Nothing is bonded yet.");
const draft = draftEvidence(String(claimId), "false");
p.assertion("CLAIMANT", draft.text, `${round2(draft.out.match(/asserts ([\d.]+)%/)?.[1])}%`, p.c.red);

p.step("The claimant posts that exact claim, and bonds it");
p.line("claimHash", `${draft.claimHash.slice(0, 18)}…  = keccak256 of the sentence above`);
const submitHash = await signer.writeContract({
  address: REGISTRY, abi: REGISTRY_ABI, functionName: "submitClaim",
  args: [keccak256(toBytes("aave-v3-ethereum:utilization")), draft.claimHash],
  value: BOND,
});
await pub.waitForTransactionReceipt({ hash: submitHash });
p.tx("submitClaim", submitHash);
p.line("bond at risk", "0.010 ETH");
p.line("stake at risk", `${Number(beforeStake) / 1e18} ETH`);

p.step("VRF assigns a witness the claimant cannot influence");
await p.waitFor("waiting for VRF", async () => (await claim(claimId)).witness !== "0x0000000000000000000000000000000000000000");
const c = await claim(claimId);
const wa = AGENTS.find((a) => addressOf(a).toLowerCase() === c.witness.toLowerCase());
p.line("witness drawn", `${wa?.name ?? c.witness}  ${c.witness.slice(0, 12)}…`, p.c.cyan);

p.step("The drawn witness derives from the same block. They disagree.");
const out = witnessEvidence(String(claimId), wa?.name ?? "unknown", c.witness);
p.assertion("CLAIMANT", draft.text, `${round2(draft.out.match(/asserts ([\d.]+)%/)?.[1])}%`, p.c.red);
p.assertion("WITNESS", "independently re-derived from Aave v3", `${round2(out.match(/derives ([\d.]+)/)?.[1])}%`, p.c.magenta);

p.step("The tribunal rules");
p.verdict(runTribunal("verdict"), "The claimant's own evidence does not reproduce its stated value.");

p.step("The claimant appeals — three more agents are drawn");
const appealHash = await signer.writeContract({
  address: REGISTRY, abi: REGISTRY_ABI, functionName: "appeal", args: [claimId], value: APPEAL_BOND,
});
await pub.waitForTransactionReceipt({ hash: appealHash });
p.tx("appeal", appealHash);
p.line("appeal bond", "0.020 ETH", p.c.yellow);
await p.waitFor("VRF seating the panel", async () =>
  (await pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "appealOf", args: [claimId] })).panel.length > 0);
const ap = await pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "appealOf", args: [claimId] });
for (const seat of ap.panel) {
  const n = AGENTS.find((a) => addressOf(a).toLowerCase() === seat.toLowerCase());
  p.line("  seat", `${n?.name ?? seat}  ${seat.slice(0, 12)}…`, p.c.cyan);
}
p.note("Neither party is on the panel, and the seats run different models.");

p.step("The panel re-derives, independently of the first witness");
witnessEvidence(String(claimId), wa?.name ?? "unknown", c.witness, true);
p.verdict(runTribunal("panel"), "Three independent derivations, majority stands.");

p.step("Settlement");
const finHash = await op.writeContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "finalize", args: [claimId] });
await pub.waitForTransactionReceipt({ hash: finHash });
p.tx("finalize", finHash);

const [owed, forfeited, stake, eligible, afterStanding] = await Promise.all([
  pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "withdrawable", args: [who.address] }),
  pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "forfeited" }),
  pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "stakeOf", args: [who.address] }),
  pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "isEligible", args: [who.address] }),
  standingOf(CLAIMANT),
]);
p.line("claimant receives", `${Number(owed) / 1e18} ETH`, p.c.red);
p.line("forfeited to nobody", `${Number(forfeited) / 1e18} ETH`, p.c.yellow);
p.change("stake", String(Number(beforeStake) / 1e18), String(Number(stake) / 1e18));
p.change("ENS standing", beforeStanding, afterStanding);
p.line("still allowed to judge?", eligible ? "yes" : "no", eligible ? p.c.green : p.c.red);

p.step("The roster now excludes it");
p.agentTable(await rosterSnapshot());

p.finale([
  `${p.c.red}The claim was false, and appealing made it worse.${p.c.reset}`,
  `${p.c.grey}The forfeited ETH is payable to nobody — not the witness, not us.${p.c.reset}`,
  `${p.c.grey}Paying it to the witness is what would make fabricating disagreement profitable.${p.c.reset}`,
]);

/** Derived values carry full float precision; two decimals is what a viewer can read. */
function round2(v: string | undefined): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "?";
}
