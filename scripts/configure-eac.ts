/**
 * Configure Enhanced Access Control on the Perjury resolver.
 *
 * Grants PerjuryStandingWriter the right to write reputation records, then
 * revokes the operator's own ability to do so. After this runs, no human key can
 * write an agent's standing — only the contract reachable from the tribunal.
 *
 * The order matters and is the whole point: we hold SET_TEXT_ADMIN at deployment
 * purely so we can hand the role to the writer and then take our own away.
 *
 *   npx tsx scripts/configure-eac.ts
 */
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  PERMISSIONED_RESOLVER_ABI, RECORD_KEYS, ROLE, adminOf, setTextSetter, withHackathonResolver,
} from "@perjury/ens";
import { encodeFunctionData } from "viem";

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} unset`); return v; };
const pkRaw = need("OPERATOR_PRIVATE_KEY");
const pk = (pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`) as Hex;

const RESOLVER = need("PERJURY_RESOLVER_ADDRESS") as Address;
const WRITER = need("STANDING_WRITER_ADDRESS") as Address;


const chain = withHackathonResolver(sepolia);
const transport = http(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com");
const account = privateKeyToAccount(pk);
const pub = createPublicClient({ chain, transport });
const wallet = createWalletClient({ account, chain, transport });

// Root-resource roles use the *RootRoles variants; grantRoles(resource, ...)
// reverts for the root resource.
async function send(label: string, fn: "grantRootRoles" | "revokeRootRoles", role: bigint, who: Address) {
  const hash = await wallet.writeContract({
    address: RESOLVER, abi: PERMISSIONED_RESOLVER_ABI, functionName: fn, args: [role, who],
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${label}\n    ${hash}  ${r.status}`);
}

/**
 * Narrow the writer's permission from "any text record" to two specific keys.
 *
 * Grants at resolver deployment land on the root resource, so the writer would
 * otherwise be able to write every text key on the resolver — and the claim we
 * make is that it can write one field and nothing else. The ENS team's
 * prescribed sequence: hold SET_TEXT_ADMIN at deployment, grant per-key setter
 * roles in one multicall, then give the admin role up.
 */
async function grantPerKey() {
  const calls = [RECORD_KEYS.standing, RECORD_KEYS.flaggedUntil].map((key) =>
    encodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      functionName: "grantSetterRoles",
      args: [setTextSetter(key), WRITER],
    }),
  );
  const hash = await wallet.writeContract({
    address: RESOLVER, abi: PERMISSIONED_RESOLVER_ABI, functionName: "multicall", args: [calls],
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`  grant per-key SET_TEXT -> writer (${calls.length} keys)\n    ${hash}  ${r.status}`);
}

async function main() {
  console.log(`\nresolver: ${RESOLVER}`);
  console.log(`writer:   ${WRITER}`);
  console.log(`operator: ${account.address}\n`);

  // Scoped to exactly the two reputation keys — not the whole resolver.
  await grantPerKey();

  // Remove the resolver-wide grant, so the only permission the writer holds is
  // the per-key one just issued.
  await send("revoke root SET_TEXT <- writer", "revokeRootRoles", ROLE.SET_TEXT, WRITER);

  // The operator loses the ability to write records itself. Reputation stops
  // being something a human key can touch.
  await send("revoke SET_TEXT <- operator", "revokeRootRoles", ROLE.SET_TEXT, account.address);

  // Final step, run with --lock once the writer address is settled: the deployer
  // gives up the admin role, after which nobody can change these permissions —
  // including us. Irreversible, so it waits until no further redeploy is coming.
  if (process.argv.includes("--lock")) {
    await send("revoke SET_TEXT_ADMIN <- operator (irreversible)", "revokeRootRoles", adminOf(ROLE.SET_TEXT), account.address);
  }

  console.log("\nverifying:");
  for (const [label, who, role, expected] of [
    ["writer holds root SET_TEXT (must be false — per-key only)", WRITER, ROLE.SET_TEXT, false],
    ["operator holds SET_TEXT", account.address, ROLE.SET_TEXT, false],
    ["writer holds SET_TEXT_ADMIN", WRITER, adminOf(ROLE.SET_TEXT), false],
    ["writer holds SET_ADDRESS", WRITER, ROLE.SET_ADDRESS, false],
  ] as const) {
    const has = await pub.readContract({
      address: RESOLVER, abi: PERMISSIONED_RESOLVER_ABI, functionName: "hasRootRoles",
      args: [role, who as Address],
    });
    const ok = has === expected;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label} = ${has} (want ${expected})`);
    if (!ok) process.exitCode = 1;
  }
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
