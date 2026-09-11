/**
 * Put existing agents back on a freshly deployed roster.
 *
 *   npx tsx scripts/rejoin-roster.ts           # simulate
 *   npx tsx scripts/rejoin-roster.ts --write   # do it
 *
 * A cascade deploys a new roster, and `deploy-all.ts` registers the five agents
 * it knows how to name. Everything added afterwards — by scripts/add-agents.ts —
 * has a real ENS subname, a binding record and a key, and none of that is lost
 * when the roster is replaced. Only the registration is.
 *
 * So this is not `add-agents` again. It issues no names and generates no keys:
 * it takes agents that already exist and stakes them onto the new roster from
 * their own keys.
 *
 * The name and the key must already agree, because `registerAgent` reads the
 * binding record and refuses a name that does not point at the caller. If that
 * check fails here it is telling the truth about something being wrong.
 */
import { createPublicClient, createWalletClient, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { namehash } from "viem/ens";
import { sepolia } from "viem/chains";
import { dnsEncode, withHackathonResolver } from "@perjury/ens";

const write = process.argv.includes("--write");

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} unset`);
  return v;
};

const chain = withHackathonResolver(sepolia);
const transport = http(need("SEPOLIA_RPC_URL"));
const pub = createPublicClient({ chain, transport });
const ROSTER = need("WITNESS_ROSTER_ADDRESS") as Address;
const STAKE = parseEther(process.env.REGISTRATION_STAKE_ETH ?? "0.01");

/**
 * Agents added after the original five, with the keys they already hold.
 *
 * AGENT_5 is deliberately absent. It is the agent a bug in add-agents.ts
 * registered under the label "--write"; it withdrew its stake and is ineligible,
 * and there is no reason to carry a mistake onto a new roster just because the
 * old one could not forget it.
 */
const AGENTS = [
  { label: "witness-b", key: "AGENT_6_PK" },
  { label: "witness-c", key: "AGENT_7_PK" },
  { label: "panel-4", key: "AGENT_8_PK" },
  { label: "panel-5", key: "AGENT_9_PK" },
  { label: "panel-6", key: "AGENT_10_PK" },
] as const;

const ROSTER_ABI = [
  { type: "function", name: "registerAgent", stateMutability: "payable",
    inputs: [{ name: "ensNode", type: "bytes32" }, { name: "dnsName", type: "bytes" }], outputs: [] },
  { type: "function", name: "agentCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "agents", stateMutability: "view", inputs: [{ type: "address" }],
    outputs: [
      { name: "ensNode", type: "bytes32" }, { name: "dnsName", type: "bytes" },
      { name: "registered", type: "bool" }, { name: "registeredAt", type: "uint64" },
      { name: "stake", type: "uint256" },
    ] },
] as const;

async function main() {
  const before = await pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "agentCount" });
  console.log(`roster ${ROSTER} (${before} agents)`);
  console.log(write ? "\nMODE: writing\n" : "\nMODE: simulating only\n");

  for (const a of AGENTS) {
    const raw = process.env[a.key];
    if (!raw) {
      console.log(`${a.label.padEnd(11)} no ${a.key} — skipping`);
      continue;
    }
    const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
    const fqdn = `${a.label}.perjury.eth`;

    const record = await pub.readContract({
      address: ROSTER, abi: ROSTER_ABI, functionName: "agents", args: [account.address],
    });
    if (record[2]) {
      console.log(`${a.label.padEnd(11)} already on this roster`);
      continue;
    }

    const balance = await pub.getBalance({ address: account.address });
    if (balance < STAKE) {
      console.log(`${a.label.padEnd(11)} cannot cover the stake (${Number(balance) / 1e18} ETH) — fund it first`);
      continue;
    }

    try {
      const { request } = await pub.simulateContract({
        account, address: ROSTER, abi: ROSTER_ABI, functionName: "registerAgent",
        args: [namehash(fqdn), dnsEncode(fqdn)], value: STAKE,
      });
      console.log(`${a.label.padEnd(11)} ${account.address}  simulates OK`);
      if (write) {
        const w = createWalletClient({ account, chain, transport });
        const hash = await w.writeContract(request);
        await pub.waitForTransactionReceipt({ hash });
        console.log(`${" ".repeat(11)} ${hash}`);
      }
    } catch (err) {
      console.log(`${a.label.padEnd(11)} FAILED: ${(err as Error).message.split("\n")[0]}`);
    }
  }

  const after = await pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "agentCount" });
  console.log(write ? `\nroster is now ${after} agents (was ${before})` : "\nnothing was sent.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
