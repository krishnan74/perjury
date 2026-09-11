/**
 * Take back the registry roles an agent must never hold on its own subname.
 *
 *   npx tsx scripts/fix-agent-roles.ts           # simulate
 *   npx tsx scripts/fix-agent-roles.ts --write   # do it
 *
 * scripts/deploy-subregistry.ts issued the five names with every role granted to
 * their owners. That is the registry-level bypass design.md §4 flags as the
 * non-obvious one: an agent holding SET_RESOLVER repoints its own name at a
 * resolver it controls and writes whatever standing it likes, and none of the
 * careful per-key scoping on our resolver matters any more.
 *
 * packages/ens already had the right answer — AGENT_SUBNAME_ROLES is RENEW and
 * nothing else, with FORBIDDEN_AGENT_REGISTRY_ROLES and a test naming
 * SET_RESOLVER explicitly. The script did not use either. Having the constant
 * and not reaching for it is worse than not having thought about it.
 */
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { AGENT_SUBNAME_ROLES, FORBIDDEN_AGENT_REGISTRY_ROLES } from "@perjury/ens";

const write = process.argv.includes("--write");
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} unset`);
  return v;
};

const raw = need("OPERATOR_PRIVATE_KEY");
const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
const transport = http(need("SEPOLIA_RPC_URL"));
const pub = createPublicClient({ chain: sepolia, transport });
const op = createWalletClient({ account, chain: sepolia, transport });

const SUBREGISTRY = need("PERJURY_SUBREGISTRY_ADDRESS") as Address;

const AGENTS = [
  { label: "operator", addr: account.address as Address },
  { label: "witness-a", env: "AGENT_1_ADDR" },
  { label: "panel-1", env: "AGENT_2_ADDR" },
  { label: "panel-2", env: "AGENT_3_ADDR" },
  { label: "panel-3", env: "AGENT_4_ADDR" },
] as const;

const ABI = [
  { type: "function", name: "hasRoles", stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "revokeRoles", stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** Everything the register call granted, minus the one role an agent should keep. */
const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;
const TO_REVOKE = ALL_ROLES & ~AGENT_SUBNAME_ROLES;

async function main() {
  console.log(`subregistry ${SUBREGISTRY}`);
  console.log(`keeping     RENEW (${AGENT_SUBNAME_ROLES})`);
  console.log(write ? "\nMODE: writing\n" : "\nMODE: simulating only\n");

  for (const a of AGENTS) {
    const owner = ("addr" in a ? a.addr : need(a.env)) as Address;
    const tokenId = BigInt(keccak256(toHex(a.label)));

    const held = await Promise.all(
      FORBIDDEN_AGENT_REGISTRY_ROLES.map(async (f) => ({
        name: f.name,
        has: await pub.readContract({
          address: SUBREGISTRY, abi: ABI, functionName: "hasRoles", args: [tokenId, f.role, owner],
        }),
      })),
    );
    const bad = held.filter((h) => h.has).map((h) => h.name);
    console.log(`${a.label.padEnd(10)} ${owner}  forbidden held: ${bad.length ? bad.join(", ") : "none"}`);
    if (bad.length === 0) continue;

    try {
      const { request } = await pub.simulateContract({
        account, address: SUBREGISTRY, abi: ABI, functionName: "revokeRoles",
        args: [tokenId, TO_REVOKE, owner],
      });
      console.log(`  ${" ".repeat(10)} revoke simulates OK`);
      if (write) {
        const hash = await op.writeContract(request);
        await pub.waitForTransactionReceipt({ hash });
        console.log(`  ${" ".repeat(10)} ${hash}`);
      }
    } catch (err) {
      console.log(`  ${" ".repeat(10)} REVOKE FAILS: ${(err as Error).message.split("\n")[0]}`);
    }
  }

  console.log(write ? "\ndone" : "\nnothing sent. Re-run with --write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
