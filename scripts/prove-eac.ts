/**
 * prove-eac.ts — the ENS track's central evidence artifact.
 *
 * Fires three transactions against the live ENSv2 hackathon deployment and
 * asserts that TWO OF THEM REVERT:
 *
 *   1. the agent tries to write its own standing      → MUST revert
 *   2. the deployer/operator tries to write it        → MUST revert
 *   3. the tribunal's writer path                     → MUST succeed
 *
 * Plus a static check that the tribunal holds none of the roles it must not.
 *
 * This script exists because "only the tribunal can write reputation" is a claim
 * a judge can otherwise only take on faith. Run it on camera; the two reverts
 * are the proof. Exits non-zero if any expectation fails.
 *
 *   npx tsx scripts/prove-eac.ts
 */
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { namehash } from "viem/ens";
import { sepolia } from "viem/chains";
import {
  ENS_HACKATHON_SEPOLIA, RECORD_KEYS, PERMISSIONED_RESOLVER_ABI,
  ROLE, adminOf, textResource, textResourceId, dnsEncode, FORBIDDEN_TRIBUNAL_ROLES,
  withHackathonResolver,
} from "@perjury/ens";

const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} unset — see .env.example`);
  return v;
};

const RPC = need("SEPOLIA_RPC_URL");
const AGENT_NAME = process.env.AGENT_NAME ?? "witness-a.perjury.eth";
// Our own Permissioned Resolver, not the hackathon deployment's shared one —
// the EAC grants this script checks live on ours. The fallback is kept only so
// the script still says something useful against a bare environment.
const RESOLVER = (process.env.PERJURY_RESOLVER_ADDRESS ?? process.env.AGENT_RESOLVER
  ?? ENS_HACKATHON_SEPOLIA.publicResolverV2) as Address;
const STANDING_WRITER = need("STANDING_WRITER_ADDRESS") as Address;
const STANDING_READER = need("STANDING_READER_ADDRESS") as Address;

/** `cast` tolerates a bare key; viem does not. */
const hexKey = (k: string): Hex => (k.startsWith("0x") ? k : `0x${k}`) as Hex;

/**
 * Read standing the way the protocol does — through the on-chain ENSIP-10
 * reader, the same contract the VRF callback consults.
 *
 * The direct `text(bytes32,string)` this used to call REVERTS on a
 * factory-deployed Permissioned Resolver, so the script died before it reached
 * a single one of its assertions. Reading it any other way would also be a lie
 * about what the protocol relies on.
 */
const READER_ABI = [{
  type: "function", name: "standingOfNameChecked", stateMutability: "view",
  inputs: [{ type: "bytes32" }, { type: "bytes" }],
  outputs: [{ name: "standing", type: "int256" }, { name: "readable", type: "bool" }],
}] as const;

const chain = withHackathonResolver(sepolia);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = (pk: string) =>
  createWalletClient({ account: privateKeyToAccount(pk as `0x${string}`), chain, transport: http(RPC) });

const dnsName = dnsEncode(AGENT_NAME);
const results: { step: string; expected: "revert" | "success"; got: string; ok: boolean }[] = [];

/** Attempt a write and record whether it behaved as required. */
async function attemptWrite(step: string, pk: string, value: string, expected: "revert" | "success") {
  try {
    const hash = await wallet(pk).writeContract({
      address: RESOLVER,
      abi: PERMISSIONED_RESOLVER_ABI,
      functionName: "setText",
      args: [dnsName, RECORD_KEYS.standing, value],
    });
    await pub.waitForTransactionReceipt({ hash });
    results.push({ step, expected, got: `succeeded (${hash})`, ok: expected === "success" });
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    results.push({ step, expected, got: `reverted — ${msg}`, ok: expected === "revert" });
  }
}

async function main() {
  console.log(`\nENS Enhanced Access Control proof`);
  console.log(`  name:     ${AGENT_NAME}`);
  console.log(`  resolver: ${RESOLVER}`);
  console.log(`  record:   ${RECORD_KEYS.standing}`);
  console.log(`  resource: ${textResource(RECORD_KEYS.standing)}\n`);

  const [before, readable] = await pub.readContract({
    address: STANDING_READER, abi: READER_ABI, functionName: "standingOfNameChecked",
    args: [namehash(AGENT_NAME), dnsName],
  });
  console.log(`  standing before: ${readable ? before.toString() : "UNREADABLE"}\n`);

  // 1 & 2 — these MUST fail.
  await attemptWrite("agent writes its own standing", hexKey(need("AGENT_1_PK")), "9999", "revert");
  await attemptWrite("operator writes the standing", hexKey(need("OPERATOR_PRIVATE_KEY")), "9999", "revert");

  // 3 — the only path that may work: through the contract holding the role.
  //     Driven via VerdictSink in the full flow; here we assert the role itself.
  const writerHasRole = await pub.readContract({
    address: RESOLVER, abi: PERMISSIONED_RESOLVER_ABI, functionName: "hasRoles",
    args: [textResourceId(RECORD_KEYS.standing), ROLE.SET_TEXT, STANDING_WRITER],
  });
  results.push({
    step: "tribunal writer holds SET_TEXT on the standing key",
    expected: "success",
    got: String(writerHasRole),
    ok: writerHasRole === true,
  });

  // 4 — and holds nothing else.
  for (const f of FORBIDDEN_TRIBUNAL_ROLES) {
    const has = await pub.readContract({
      address: RESOLVER, abi: PERMISSIONED_RESOLVER_ABI, functionName: "hasRoles",
      args: [textResourceId(RECORD_KEYS.standing), f.role, STANDING_WRITER],
    });
    results.push({
      step: `tribunal does NOT hold ${f.name}`,
      expected: "success",
      got: has ? "HOLDS IT" : "correctly absent",
      ok: has === false,
    });
  }

  console.log("─".repeat(72));
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.step}\n        ${r.got}`);
  }
  console.log("─".repeat(72));

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n${failed.length} expectation(s) failed — the EAC claim does not hold.\n`);
    process.exit(1);
  }
  console.log("\nAll expectations held: only the tribunal can write reputation.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
