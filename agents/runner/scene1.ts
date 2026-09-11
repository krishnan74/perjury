/**
 * Scene 1 — a true claim, challenged anyway.
 *
 *   npx tsx agents/runner/scene1.ts
 *
 * An honest claim is posted with a bond. A randomly assigned witness re-derives
 * the answer from live data without seeing the claimant's work. They agree, the
 * bond comes back, and the claimant's reputation rises.
 */
import { namehash } from "viem/ens";
import { dnsEncode } from "@perjury/ens";
import * as p from "./lib/present";
import {
  AGENTS, BOND, REGISTRY, REGISTRY_ABI, VERDICT, account, addressOf, claim, op, pub,
  awaitWitness, claimantFor, draftEvidence, preflight, rosterSnapshot, runTribunal, standingOf,
  walletFor,
  witnessEvidence,
} from "./lib/chain";
import { keccak256, toBytes } from "viem";

// Which agent makes the claim. Scene 2 slashes it, so pass a different one
// per run rather than redeploying: npx tsx agents/runner/scene1.ts panel-1
const who = claimantFor(process.argv.find((a) => !a.startsWith("-") && a.includes("perjury") === false && ["operator","witness-a","panel-1","panel-2","panel-3"].includes(a)));
const CLAIMANT = who.name;

// Which pinned deployment the claim is about. Defaults to the one the recorded
// scenes use, so passing nothing reproduces them exactly; the submit page passes
// whatever the visitor picked. Any subject in pinned-deployments.json works —
// the protocol needs no code change per subject, which is the point of a
// standardized query pattern.
const SUBJECT = process.argv.find((a) => a.startsWith("--subject="))?.slice(10) ?? "aave-v3-ethereum";
const signer = walletFor(who.pk);

p.scene(1, "A true claim, challenged anyway", "Honest claims should cost nothing and earn standing.");

await preflight(CLAIMANT, who.address, 2, BOND);

p.step("The roster, before anything happens");
p.agentTable(await rosterSnapshot());
p.note("Any of these could be drawn as the witness. The claimant does not get a say.");

const before = await standingOf(CLAIMANT);
const claimId = await pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "nextClaimId" });

p.step("The claimant reads live Graph data and drafts its claim");
p.note("Nothing is bonded yet. The agent decides what it is willing to stake on before it stakes.");
const draft = draftEvidence(String(claimId), "honest", SUBJECT);
p.assertion("CLAIMANT", draft.text, `${round2(draft.out.match(/asserts ([\d.]+)%/)?.[1])}%`, p.c.cyan);

p.step("The claimant posts that exact claim, and bonds it");
p.line("claimant", `${CLAIMANT}  ${who.address.slice(0, 12)}…`);
p.line("claimHash", `${draft.claimHash.slice(0, 18)}…  = keccak256 of the sentence above`);
p.line("bond", "0.010 ETH   (+ 0.002 witness fee)");
const submitHash = await signer.writeContract({
  address: REGISTRY, abi: REGISTRY_ABI, functionName: "submitClaim",
  args: [keccak256(toBytes(`${SUBJECT}:utilization`)), draft.claimHash],
  value: BOND,
});
await pub.waitForTransactionReceipt({ hash: submitHash });
p.tx("submitClaim", submitHash);

p.step("Chainlink VRF assigns the witness");
p.note("The claimant cannot choose, influence, or predict who checks it.");
await awaitWitness(claimId, p.waitFor);
const c = await claim(claimId);
const witnessAgent = AGENTS.find((a) => addressOf(a).toLowerCase() === c.witness.toLowerCase());
p.line("witness drawn", `${witnessAgent?.name ?? c.witness}  ${c.witness.slice(0, 12)}…`, p.c.cyan);
p.line("is it the claimant?", c.witness.toLowerCase() === who.address.toLowerCase() ? "YES — BROKEN" : "no", p.c.green);

p.step("The drawn witness derives its own answer, independently");
p.note("Separate process, separate key, no channel to the claimant. It reads the block the claimant read.");
const out = witnessEvidence(String(claimId), witnessAgent?.name ?? "unknown", c.witness);
const claimantLine = draft.text;
const claimantVal = draft.out.match(/asserts ([\d.]+)%/)?.[1] ?? "?";
const witnessVal = round2(out.match(/derives ([\d.]+)/)?.[1]);
p.assertion("CLAIMANT", claimantLine, `${claimantVal}%`, p.c.blue);
p.assertion("WITNESS", `independently re-derived from ${SUBJECT} via The Graph`, `${witnessVal}%`, p.c.magenta);

p.step("The tribunal compares them inside a confidential workflow");
p.note("Both submissions enter the enclave. Only a verdict comes out.");
const v = runTribunal("verdict");
p.verdict(v, "No evidence, no methodology, and neither value appears on-chain — only this.");

p.step("Settlement, once the challenge window closes");
await p.waitFor("challenge window", async () => (await claim(claimId)).status === 3 ? await windowClosed(claimId) : false);
const finHash = await op.writeContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "finalize", args: [claimId] });
await pub.waitForTransactionReceipt({ hash: finHash });
p.tx("finalize", finHash);

const owed = await pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "withdrawable", args: [who.address] });
const after = await standingOf(CLAIMANT);
p.line("bond returned", `${Number(owed) / 1e18} ETH`, p.c.green);
p.change("ENS standing", before, after);

p.finale([
  `${p.c.green}The claim held up.${p.c.reset} The bond came back and the record improved.`,
  `${p.c.grey}That record was written by the tribunal. The claimant cannot touch it,${p.c.reset}`,
  `${p.c.grey}and neither can we — the deployer is refused by ENS access control.${p.c.reset}`,
]);

/**
 * The contract compares block.timestamp, not our clock, and blocks lag. Comparing
 * against local time made finalize() revert with WindowOpen even though the
 * deadline had passed by the wall clock.
 */
async function windowClosed(id: bigint) {
  const abi = [{ type: "function", name: "challengeDeadline", stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }], outputs: [{ type: "uint64" }] }] as const;
  const [dl, block] = await Promise.all([
    pub.readContract({ address: REGISTRY, abi, functionName: "challengeDeadline", args: [id] }),
    pub.getBlock(),
  ]);
  return block.timestamp > dl;
}

/** Derived values carry full float precision; two decimals is what a viewer can read. */
function round2(v: string | undefined): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "?";
}
