/**
 * Scene 3 — collusion, throttled but not eliminated.
 *
 *   npx tsx agents/runner/scene3.ts [rounds]
 *
 * Two agents agree in advance to cover for each other. The point of the scene is
 * that they cannot act on it: the claimant never chooses its witness, so the
 * accomplice is drawn roughly one time in n. The scene ends by showing the
 * residual risk rather than claiming it away — a colluding pair does get paired
 * eventually, and that is the honest limit of random assignment.
 */
import { keccak256, toBytes } from "viem";
import * as p from "./lib/present";
import {
  AGENTS, BOND, REGISTRY, REGISTRY_ABI, account, addressOf, claim, claimantFor, op, preflight, pub,
  rosterSnapshot, walletFor,
} from "./lib/chain";

// Both arguments are optional and order-independent: a bare number is the round
// count, a bare name is the claimant. Reading argv positionally instead made
// `scene3.ts panel-2` parse the name as the round count, yielding NaN rounds and
// a loop that silently never ran.
const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const rounds = Number(args.find((a) => /^\d+$/.test(a)) ?? 4);
// Which agent makes the claim. Scene 2 slashes its claimant, so pass a different
// one per run rather than redeploying: npx tsx agents/runner/scene3.ts panel-2
const who = claimantFor(args.find((a) => !/^\d+$/.test(a)));
const CLAIMANT = who.name;
const signer = walletFor(who.pk);

p.scene(3, "A collusion attempt, structurally throttled",
  "Two agents agree to cover for each other. They still cannot choose to be paired.");

await preflight(CLAIMANT, who.address, 3, BOND * BigInt(rounds));

const roster = await rosterSnapshot();
const accomplice = roster.find((r) => r.name === "witness-a.perjury.eth");

p.step("The arrangement, stated openly");
p.line("claimant", CLAIMANT, p.c.red);
p.line("accomplice", accomplice?.name ?? "witness-a.perjury.eth", p.c.red);
p.note("They have agreed the accomplice will confirm whatever the claimant says.");
p.note("Nothing in the protocol prevents this agreement. It prevents acting on it.");

p.step(`Submitting ${rounds} claims and recording who is actually drawn`);
p.note("submitClaim has no witness parameter — there is no code path to ask for one.");

const drawn: string[] = [];
for (let i = 0; i < rounds; i++) {
  const id = await pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "nextClaimId" });
  const hash = await signer.writeContract({
    address: REGISTRY, abi: REGISTRY_ABI, functionName: "submitClaim",
    // These claims exist only to exercise the draw and are never adjudicated,
    // so there is no drafted sentence to bind. Distinct per round rather than
    // one constant, so no two probes share a claim hash.
    args: [keccak256(toBytes(`collusion-round-${i}`)), keccak256(toBytes(`collusion-probe-${i}`))],
    value: BOND,
  });
  await pub.waitForTransactionReceipt({ hash });
  const ok = await p.waitFor(`round ${i + 1}: waiting for VRF`, async () =>
    (await claim(id)).witness !== "0x0000000000000000000000000000000000000000");
  if (!ok) break;
  const c = await claim(id);
  const who = AGENTS.find((a) => addressOf(a).toLowerCase() === c.witness.toLowerCase());
  const isAccomplice = accomplice && c.witness.toLowerCase() === accomplice.address.toLowerCase();
  drawn.push(who?.name ?? c.witness);
  p.line(
    `  round ${i + 1} drew`,
    `${who?.name ?? c.witness}${isAccomplice ? "   ← the accomplice" : ""}`,
    isAccomplice ? p.c.red : p.c.green,
  );
}

const hits = drawn.filter((d) => d === accomplice?.name).length;
const eligible = roster.filter((r) => r.eligible).length;

p.step("What that shows");
p.line("rounds", String(drawn.length));
p.line("accomplice drawn", `${hits} of ${drawn.length}`);
p.line("eligible witnesses", String(eligible - 1));
p.line("expected rate", `about 1 in ${eligible - 1}`);

p.finale([
  `${p.c.green}Collusion is throttled: the pair cannot arrange to be matched.${p.c.reset}`,
  ``,
  `${p.c.yellow}But it is not eliminated.${p.c.reset} ${p.c.grey}With ${eligible - 1} eligible witnesses the accomplice is drawn${p.c.reset}`,
  `${p.c.grey}about one time in ${eligible - 1}. Random assignment closes deliberate collusion.${p.c.reset}`,
  `${p.c.grey}It does not close a careless witness, and it cannot rule out two honest${p.c.reset}`,
  `${p.c.grey}agents reaching the same wrong answer. We do not claim otherwise —${p.c.reset}`,
  `${p.c.grey}contracts/test/Assignment.t.sol asserts the residual risk is real.${p.c.reset}`,
]);
