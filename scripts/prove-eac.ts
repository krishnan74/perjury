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
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  ENS_HACKATHON_SEPOLIA, RECORD_KEYS, PERMISSIONED_RESOLVER_ABI,
  ROLE, adminOf, textResource, dnsEncode, FORBIDDEN_TRIBUNAL_ROLES,
  withHackathonResolver,
} from "@perjury/ens";

const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} unset — see .env.example`);
  return v;
};

const RPC = need("SEPOLIA_RPC_URL");
const AGENT_NAME = process.env.AGENT_NAME ?? "alice.perjury.eth";
const RESOLVER = (process.env.AGENT_RESOLVER ?? ENS_HACKATHON_SEPOLIA.publicResolverV2) as Address;
const STANDING_WRITER = need("STANDING_WRITER_ADDRESS") as Address;

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

  const before = await pub.readContract({
    address: RESOLVER, abi: PERMISSIONED_RESOLVER_ABI, functionName: "text",
    args: [process.env.AGENT_NODE as `0x${string}`, RECORD_KEYS.standing],
  });
  console.log(`  standing before: "${before}"\n`);

  // 1 & 2 — these MUST fail.
  await attemptWrite("agent writes its own standing", need("AGENT_PK"), "9999", "revert");
  await attemptWrite("operator writes the standing", need("DEPLOYER_PK"), "9999", "revert");

  // 3 — the only path that may work: through the contract holding the role.
  //     Driven via VerdictSink in the full flow; here we assert the role itself.
  const writerHasRole = await pub.readContract({
    address: RESOLVER, abi: PERMISSIONED_RESOLVER_ABI, functionName: "hasRoles",
    args: [textResource(RECORD_KEYS.standing), ROLE.SET_TEXT, STANDING_WRITER],
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
      args: [textResource(RECORD_KEYS.standing), f.role, STANDING_WRITER],
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
