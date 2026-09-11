/**
 * Add agents to the live roster, without redeploying anything.
 *
 *   npx tsx scripts/add-agents.ts                 # simulate, send nothing
 *   npx tsx scripts/add-agents.ts --write         # do it
 *   npx tsx scripts/add-agents.ts --names a,b,c   # which labels
 *
 * A five-agent roster makes the collusion argument weaker than it needs to be.
 * Assignment is uniform over the eligible set, so a claimant colluding with one
 * other agent has a 1-in-n chance of drawing it, and n is the whole argument.
 * Nothing about the protocol has to change to raise it — the roster is open to
 * any agent that can be issued a name and post a stake, which is the point.
 *
 * Four steps per agent, in an order that is not arbitrary:
 *
 *   1. Fund it. It pays its own stake, because an agent whose collateral came
 *      from us is collateral we could take back.
 *   2. Issue the binding record. `registerAgent` refuses a name whose binding
 *      does not name the caller, so this is what makes registration possible.
 *   3. Register the subname in perjury.eth's subregistry, with RENEW and nothing
 *      else — an agent holding SET_RESOLVER could repoint its own name at a
 *      resolver it controls and write its own standing.
 *   4. Register on the roster, staking from the agent's own key.
 *
 * Keys are generated here and appended to .env. They are not printed.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { namehash } from "viem/ens";
import { sepolia } from "viem/chains";
import {
  AGENT_SUBNAME_ROLES, PERMISSIONED_RESOLVER_ABI, RECORD_KEYS,
  dnsEncode, withHackathonResolver,
} from "@perjury/ens";

const args = process.argv.slice(2);
const write = args.includes("--write");
/*
 * Read --names only when it is actually present.
 *
 * indexOf returns -1 when the flag is absent, and args[-1 + 1] is args[0], which
 * is whatever the first flag happens to be. Running `--write` with no --names
 * therefore registered an agent called "--write": a real subname, a real stake,
 * on the live roster. Labels are now validated too, because a name that reaches
 * ENS cannot be taken back.
 */
const nameFlag = args.indexOf("--names");
const names = (nameFlag >= 0 ? (args[nameFlag + 1] ?? "") : "witness-b,witness-c,panel-4,panel-5,panel-6")
  .split(",").map((n) => n.trim()).filter(Boolean);

if (names.length === 0) throw new Error("--names was given with no labels");
for (const n of names) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(n)) {
    throw new Error(`refusing to register "${n}": labels are lowercase, start with a letter, and are not flags`);
  }
}

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} unset`);
  return v;
};

const chain = withHackathonResolver(sepolia);
const transport = http(need("SEPOLIA_RPC_URL"));
const pub = createPublicClient({ chain, transport });
const raw = need("OPERATOR_PRIVATE_KEY");
const operator = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
const op = createWalletClient({ account: operator, chain, transport });

const ROSTER = need("WITNESS_ROSTER_ADDRESS") as Address;
const RESOLVER = need("PERJURY_RESOLVER_ADDRESS") as Address;
const SUBREGISTRY = need("PERJURY_SUBREGISTRY_ADDRESS") as Address;

/** Stake, plus enough to post a bond as a claimant and pay gas for a while. */
const STAKE = parseEther(process.env.REGISTRATION_STAKE_ETH ?? "0.01");
const FUNDING = parseEther("0.03");

const ROSTER_ABI = [
  { type: "function", name: "registerAgent", stateMutability: "payable",
    inputs: [{ name: "ensNode", type: "bytes32" }, { name: "dnsName", type: "bytes" }], outputs: [] },
  { type: "function", name: "agentCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "isEligible", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
] as const;

const SUBREGISTRY_ABI = [
  { type: "function", name: "register", stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" }, { name: "owner", type: "address" },
      { name: "subregistry", type: "address" }, { name: "resolver", type: "address" },
      { name: "roleBitmap", type: "uint256" }, { name: "expires", type: "uint64" },
    ], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getResolver", stateMutability: "view",
    inputs: [{ name: "label", type: "string" }], outputs: [{ type: "address" }] },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** Next free AGENT_<n>_PK slot, so existing agents keep their numbers. */
function nextSlot(): number {
  const env = readFileSync(".env", "utf8");
  let n = 1;
  while (env.includes(`AGENT_${n}_PK=`)) n++;
  return n;
}

async function main() {
  const before = await pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "agentCount" });
  console.log(`roster      ${ROSTER}  (${before} agents)`);
  console.log(`subregistry ${SUBREGISTRY}`);
  console.log(`adding      ${names.join(", ")}`);
  console.log(write ? "\nMODE: writing\n" : "\nMODE: simulating only — pass --write to send\n");

  const opBalance = await pub.getBalance({ address: operator.address });
  const cost = BigInt(names.length) * FUNDING;
  console.log(`operator has ${Number(opBalance) / 1e18} ETH, this needs about ${Number(cost) / 1e18}`);
  if (opBalance < cost) throw new Error("operator cannot fund this many agents");

  let slot = nextSlot();

  for (const label of names) {
    const fqdn = `${label}.perjury.eth`;

    const taken = await pub
      .readContract({ address: SUBREGISTRY, abi: SUBREGISTRY_ABI, functionName: "getResolver", args: [label] })
      .catch(() => ZERO as Address);
    if (taken !== ZERO) {
      console.log(`${label.padEnd(11)} already registered — skipping`);
      continue;
    }

    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    console.log(`${label.padEnd(11)} ${account.address}`);

    if (!write) {
      // Every later step depends on the account existing and holding funds, so
      // there is nothing meaningful left to simulate here. Say so rather than
      // printing reassuring output about calls that were never attempted.
      console.log(`${" ".repeat(11)} would fund, issue ${fqdn}, register the subname, then stake`);
      continue;
    }

    const fund = await op.sendTransaction({ to: account.address, value: FUNDING });
    await pub.waitForTransactionReceipt({ hash: fund });

    // Issued before registration, because registerAgent reads this record and an
    // unreadable binding is a refusal rather than a pass.
    const issue = await op.writeContract({
      address: RESOLVER, abi: PERMISSIONED_RESOLVER_ABI, functionName: "setText",
      args: [dnsEncode(fqdn), RECORD_KEYS.binding, account.address.toLowerCase()],
    });
    await pub.waitForTransactionReceipt({ hash: issue });

    const expires = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
    const sub = await op.writeContract({
      address: SUBREGISTRY, abi: SUBREGISTRY_ABI, functionName: "register",
      args: [label, account.address, ZERO, RESOLVER, AGENT_SUBNAME_ROLES, expires],
    });
    await pub.waitForTransactionReceipt({ hash: sub });

    // Staked from the agent's own key. Collateral that came from us is
    // collateral we could take back, which is not collateral.
    const agent = createWalletClient({ account, chain, transport });
    const reg = await agent.writeContract({
      address: ROSTER, abi: ROSTER_ABI, functionName: "registerAgent",
      args: [namehash(fqdn), dnsEncode(fqdn)], value: STAKE,
    });
    await pub.waitForTransactionReceipt({ hash: reg });

    appendFileSync(".env", `AGENT_${slot}_PK=${pk}\nAGENT_${slot}_ADDR=${account.address}\n`);
    console.log(`${" ".repeat(11)} registered, staked, keys saved as AGENT_${slot}_*`);
    slot++;
  }

  if (write) {
    const after = await pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "agentCount" });
    console.log(`\nroster is now ${after} agents (was ${before})`);
    console.log(`a colluding pair now draws each other 1 in ${after}`);
  } else {
    console.log("\nnothing was sent.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
