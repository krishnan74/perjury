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
import { PERMISSIONED_RESOLVER_ABI, ROLE, adminOf, withHackathonResolver } from "@perjury/ens";

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

async function main() {
  console.log(`\nresolver: ${RESOLVER}`);
  console.log(`writer:   ${WRITER}`);
  console.log(`operator: ${account.address}\n`);

  await send("grant SET_TEXT -> standing writer", "grantRootRoles", ROLE.SET_TEXT, WRITER);

  // The operator keeps SET_TEXT_ADMIN so roles remain administrable, but loses
  // the ability to write records itself. Reputation stops being something a
  // human key can touch.
  await send("revoke SET_TEXT <- operator", "revokeRootRoles", ROLE.SET_TEXT, account.address);

  console.log("\nverifying:");
  for (const [label, who, role, expected] of [
    ["writer holds SET_TEXT", WRITER, ROLE.SET_TEXT, true],
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
