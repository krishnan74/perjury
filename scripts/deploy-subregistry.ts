/**
 * Give `perjury.eth` real children.
 *
 *   npx tsx scripts/deploy-subregistry.ts           # simulate every step, send nothing
 *   npx tsx scripts/deploy-subregistry.ts --write   # do it
 *
 * Until now the agents' names were not ENS names. `perjury.eth` is genuinely
 * registered, and the standing records are genuinely written to a genuine ENSv2
 * Permissioned Resolver under per-key access control — but nothing connected the
 * two. `perjury.eth` had no subregistry, so `witness-a.perjury.eth` did not
 * exist in the hierarchy at all, and the parent pointed at the deployment's
 * default resolver rather than ours. Our own reader worked only because it has
 * the resolver's address compiled into it and calls it directly, which is not
 * resolution; it is knowing where to look.
 *
 * Anyone resolving the name the normal way got a revert. The ENS explorer said
 * the name did not exist, and it was right.
 *
 * Three steps fix it:
 *
 *   1. Deploy a subname registry for `perjury.eth` through the same Verifiable
 *      Factory the resolver came from.
 *   2. Point `perjury.eth` at it, and at our resolver.
 *   3. Register each agent's label in it, with our resolver attached.
 *
 * Every step simulates first. These are one-way registry writes on a name we
 * cannot re-register if we ruin it.
 */
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeFunctionData, http, keccak256, parseAbiParameters, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { namehash } from "viem/ens";
import { sepolia } from "viem/chains";
import { AGENT_SUBNAME_ROLES, ENS_HACKATHON_SEPOLIA as D, dnsEncode } from "@perjury/ens";

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

const PARENT_LABEL = "perjury";
const PARENT = `${PARENT_LABEL}.eth`;
const RESOLVER = need("PERJURY_RESOLVER_ADDRESS") as Address;

/** The five agents, and the address each name belongs to. */
const AGENTS = [
  { label: "operator", env: "OPERATOR_ADDR" },
  { label: "witness-a", env: "AGENT_1_ADDR" },
  { label: "panel-1", env: "AGENT_2_ADDR" },
  { label: "panel-2", env: "AGENT_3_ADDR" },
  { label: "panel-3", env: "AGENT_4_ADDR" },
] as const;

/**
 * Every role, granted to the operator on the registry itself.
 *
 * The docs are explicit that granting a role later needs its _ADMIN variant, so
 * a bitmap that looks tidy now is how you discover in an hour that you cannot
 * add a registrar.
 *
 * This is a ROOT grant on the registry we deployed, and it stays: whoever owns a
 * namespace can repoint its resolvers, and pretending otherwise would be a
 * fiction. What it is NOT is the bitmap an agent gets on its own name.
 */
const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;

/**
 * What an agent gets on its own subname: RENEW, and nothing else.
 *
 * The first version of this script granted ALL_ROLES here too, which handed
 * every agent SET_RESOLVER on its own name — the registry-level bypass
 * design.md §4 calls out as the non-obvious one. An agent holding it repoints
 * its name at a resolver it controls and writes whatever standing it likes, and
 * every per-key grant on our resolver stops meaning anything.
 *
 * packages/ens already had this constant, with a test naming SET_RESOLVER.
 * Having the answer and not reaching for it is worse than never having thought
 * about it. scripts/fix-agent-roles.ts cleaned up the names issued before this.
 */
const AGENT_ROLES = AGENT_SUBNAME_ROLES;

const FACTORY_ABI = [
  { type: "function", name: "deployProxy", stateMutability: "nonpayable",
    inputs: [{ name: "implementation", type: "address" }, { name: "salt", type: "uint256" }, { name: "data", type: "bytes" }],
    outputs: [{ type: "address" }] },
] as const;

const REGISTRY_INIT_ABI = [
  { type: "function", name: "initialize", stateMutability: "nonpayable",
    inputs: [{ name: "grants", type: "tuple[]", components: [
      { name: "account", type: "address" }, { name: "roleBitmap", type: "uint256" }] }],
    outputs: [] },
] as const;

const ETH_REGISTRY_ABI = [
  { type: "function", name: "setSubregistry", stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }, { name: "subregistry", type: "address" }], outputs: [] },
  { type: "function", name: "setResolver", stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }, { name: "resolver", type: "address" }], outputs: [] },
  { type: "function", name: "getSubregistry", stateMutability: "view",
    inputs: [{ name: "label", type: "string" }], outputs: [{ type: "address" }] },
  { type: "function", name: "getResolver", stateMutability: "view",
    inputs: [{ name: "label", type: "string" }], outputs: [{ type: "address" }] },
] as const;

const SUBREGISTRY_ABI = [
  { type: "function", name: "register", stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      { name: "subregistry", type: "address" },
      { name: "resolver", type: "address" },
      { name: "roleBitmap", type: "uint256" },
      { name: "expires", type: "uint64" },
    ],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "getResolver", stateMutability: "view",
    inputs: [{ name: "label", type: "string" }], outputs: [{ type: "address" }] },
] as const;

const parentTokenId = BigInt(keccak256(toHex(PARENT_LABEL)));

/** One registry per name, so the salt is derived from the name rather than random. */
const salt = BigInt(
  keccak256(
    encodeAbiParameters(parseAbiParameters("string, bytes32, uint256"), [
      "UserRegistry",
      namehash(PARENT),
      1n,
    ]),
  ),
);

const step = (n: number, what: string) => console.log(`\n[${n}] ${what}`);

async function main() {
  console.log(`operator   ${account.address}`);
  console.log(`parent     ${PARENT}  (tokenId ${parentTokenId})`);
  console.log(`registry   ${D.ethRegistry}`);
  console.log(`resolver   ${RESOLVER}`);
  console.log(write ? "\nMODE: writing\n" : "\nMODE: simulating only — pass --write to send\n");

  const before = {
    subregistry: await pub.readContract({ address: D.ethRegistry as Address, abi: ETH_REGISTRY_ABI, functionName: "getSubregistry", args: [PARENT_LABEL] }),
    resolver: await pub.readContract({ address: D.ethRegistry as Address, abi: ETH_REGISTRY_ABI, functionName: "getResolver", args: [PARENT_LABEL] }),
  };
  console.log(`current subregistry  ${before.subregistry}`);
  console.log(`current resolver     ${before.resolver}`);

  // ── 1. The subname registry ────────────────────────────────────────────────
  step(1, "deploy a subname registry for perjury.eth");
  const initData = encodeFunctionData({
    abi: REGISTRY_INIT_ABI,
    functionName: "initialize",
    args: [[{ account: account.address, roleBitmap: ALL_ROLES }]],
  });

  let subregistry = before.subregistry as Address;
  if (subregistry !== "0x0000000000000000000000000000000000000000") {
    console.log(`  already attached at ${subregistry} — skipping deploy`);
  } else {
    const { result, request } = await pub.simulateContract({
      account, address: D.verifiableFactory as Address, abi: FACTORY_ABI,
      functionName: "deployProxy", args: [D.userRegistryImpl as Address, salt, initData],
    });
    subregistry = result as Address;
    console.log(`  simulates to ${subregistry}`);
    if (write) {
      const hash = await op.writeContract(request);
      await pub.waitForTransactionReceipt({ hash });
      console.log(`  ${hash}`);
    }
  }

  // ── 2. Attach it, and point the parent at our resolver ─────────────────────
  //
  // The resolver matters as much as the subregistry. A child with no resolver of
  // its own falls back to its parent's, and the parent's was the deployment
  // default, which holds none of our records.
  step(2, "attach the subregistry, and set the parent's resolver");
  for (const [fn, arg, current] of [
    ["setSubregistry", subregistry, before.subregistry],
    ["setResolver", RESOLVER, before.resolver],
  ] as const) {
    if ((current as string).toLowerCase() === (arg as string).toLowerCase()) {
      console.log(`  ${fn}: already set`);
      continue;
    }
    const { request } = await pub.simulateContract({
      account, address: D.ethRegistry as Address, abi: ETH_REGISTRY_ABI,
      functionName: fn, args: [parentTokenId, arg as Address],
    });
    console.log(`  ${fn}(${arg}) simulates OK`);
    if (write) {
      const hash = await op.writeContract(request);
      await pub.waitForTransactionReceipt({ hash });
      console.log(`  ${hash}`);
    }
  }

  // ── 3. The agents' names ───────────────────────────────────────────────────
  //
  // Owned by the agent rather than by us. Standing is written by the tribunal
  // through the resolver's per-key roles, so the name's owner cannot touch it —
  // which is the whole point, and only true if the owner is not us either.
  step(3, "register each agent's name in the subregistry");
  const expires = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
  for (const a of AGENTS) {
    const owner = (a.env === "OPERATOR_ADDR" ? account.address : need(a.env)) as Address;
    const existing = await pub
      .readContract({ address: subregistry, abi: SUBREGISTRY_ABI, functionName: "getResolver", args: [a.label] })
      .catch(() => "0x0000000000000000000000000000000000000000" as Address);
    if (existing !== "0x0000000000000000000000000000000000000000") {
      console.log(`  ${a.label.padEnd(10)} already registered, resolver ${existing}`);
      continue;
    }
    try {
      const { request } = await pub.simulateContract({
        account, address: subregistry, abi: SUBREGISTRY_ABI, functionName: "register",
        args: [a.label, owner, "0x0000000000000000000000000000000000000000", RESOLVER, AGENT_ROLES, expires],
      });
      console.log(`  ${a.label.padEnd(10)} -> ${owner}  simulates OK`);
      if (write) {
        const hash = await op.writeContract(request);
        await pub.waitForTransactionReceipt({ hash });
        console.log(`  ${" ".repeat(10)}    ${hash}`);
      }
    } catch (err) {
      console.log(`  ${a.label.padEnd(10)} SIMULATION FAILED: ${(err as Error).message.split("\n")[0]}`);
      if (write) throw err;
    }
  }

  console.log(
    write
      ? "\ndone — check a name with scripts/prove-name-binding.ts or the ENS explorer"
      : "\nnothing was sent. Re-run with --write when the simulations above look right.",
  );
  void dnsEncode;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
