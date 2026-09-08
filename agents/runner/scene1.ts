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
  preflight, publishEvidence, rosterSnapshot, runTribunal, standingOf,
} from "./lib/chain";
import { keccak256, toBytes } from "viem";

const CLAIMANT = "operator.perjury.eth";

p.scene(1, "A true claim, challenged anyway", "Honest claims should cost nothing and earn standing.");

await preflight(CLAIMANT, account.address, 2);

p.step("The roster, before anything happens");
p.agentTable(await rosterSnapshot());
p.note("Any of these could be drawn as the witness. The claimant does not get a say.");

const before = await standingOf(CLAIMANT);
const claimId = await pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "nextClaimId" });

p.step("The claimant posts a claim, and bonds it");
p.line("claimant", `${CLAIMANT}  ${account.address.slice(0, 12)}…`);
p.line("bond", "0.010 ETH   (+ 0.002 witness fee)");
const submitHash = await op.writeContract({
  address: REGISTRY, abi: REGISTRY_ABI, functionName: "submitClaim",
  args: [keccak256(toBytes("aave-v3-ethereum:utilization")), keccak256(toBytes("utilization above threshold"))],
  value: BOND,
});
await pub.waitForTransactionReceipt({ hash: submitHash });
p.tx("submitClaim", submitHash);

p.step("Chainlink VRF assigns the witness");
p.note("The claimant cannot choose, influence, or predict who checks it.");
await p.waitFor("waiting for VRF", async () => (await claim(claimId)).witness !== "0x0000000000000000000000000000000000000000");
const c = await claim(claimId);
const witnessAgent = AGENTS.find((a) => addressOf(a).toLowerCase() === c.witness.toLowerCase());
p.line("witness drawn", `${witnessAgent?.name ?? c.witness}  ${c.witness.slice(0, 12)}…`, p.c.cyan);
p.line("is it the claimant?", c.witness.toLowerCase() === account.address.toLowerCase() ? "YES — BROKEN" : "no", p.c.green);

p.step("Both agents derive an answer from live Graph data, independently");
p.note("Separate processes, separate keys, no channel between them.");
const out = publishEvidence(String(claimId), "honest");
const claimantLine = out.match(/CLAIMANT.*?: "(.*?)"/)?.[1] ?? "";
const claimantVal = out.match(/asserts ([\d.]+)%/)?.[1] ?? "?";
const witnessVal = out.match(/derives ([\d.]+)/)?.[1] ?? "?";
p.assertion("CLAIMANT", claimantLine, `${claimantVal}%`, p.c.blue);
p.assertion("WITNESS", "independently re-derived from Aave v3 via The Graph", `${witnessVal}%`, p.c.magenta);

p.step("The tribunal compares them inside a confidential workflow");
p.note("Both submissions enter the enclave. Only a verdict comes out.");
const v = runTribunal("verdict");
p.verdict(v, "No evidence, no methodology, and neither value appears on-chain — only this.");

p.step("Settlement, once the challenge window closes");
await p.waitFor("challenge window", async () => (await claim(claimId)).status === 3 ? await windowClosed(claimId) : false);
const finHash = await op.writeContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "finalize", args: [claimId] });
await pub.waitForTransactionReceipt({ hash: finHash });
p.tx("finalize", finHash);

const owed = await pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "withdrawable", args: [account.address] });
const after = await standingOf(CLAIMANT);
p.line("bond returned", `${Number(owed) / 1e18} ETH`, p.c.green);
p.change("ENS standing", before, after);

p.finale([
  `${p.c.green}The claim held up.${p.c.reset} The bond came back and the record improved.`,
  `${p.c.grey}That record was written by the tribunal. The claimant cannot touch it,${p.c.reset}`,
  `${p.c.grey}and neither can we — the deployer is refused by ENS access control.${p.c.reset}`,
]);

async function windowClosed(id: bigint) {
  const abi = [{ type: "function", name: "challengeDeadline", stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }], outputs: [{ type: "uint64" }] }] as const;
  const dl = await pub.readContract({ address: REGISTRY, abi, functionName: "challengeDeadline", args: [id] });
  return BigInt(Math.floor(Date.now() / 1000)) > dl;
}
