/**
 * Deploy and wire the entire protocol in one command.
 *
 *   npx tsx scripts/deploy-all.ts            # full cascade, reuse existing resolver
 *   npx tsx scripts/deploy-all.ts --resolver # also deploy a fresh ENS resolver
 *   npx tsx scripts/deploy-all.ts --agents 5 # how many agents to register
 *
 * Every contract holds the next immutably and the wiring calls are one-time, so
 * changing any one of them forces redeploying everything downstream. That
 * rigidity is the security property — there is no setter for the address that may
 * deliver a verdict — but it means development requires this whole sequence, and
 * doing it by hand is how a half-finished run once left malformed agents on the
 * roster.
 *
 * Writes the resulting addresses back to .env so the next step picks them up.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { namehash } from "viem/ens";
import { sepolia } from "viem/chains";
import { dnsEncode, withHackathonResolver, ENS_HACKATHON_SEPOLIA } from "@perjury/ens";

const args = process.argv.slice(2);
const freshResolver = args.includes("--resolver");
const agentCount = Number(args[args.indexOf("--agents") + 1]) || 5;

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} unset`); return v; };
const raw = need("OPERATOR_PRIVATE_KEY");
const opPk = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
const RPC = need("SEPOLIA_RPC_URL");
const STAKE = parseEther(process.env.REGISTRATION_STAKE_ETH ?? "0.01");

const chain = withHackathonResolver(sepolia);
const transport = http(RPC);
const account = privateKeyToAccount(opPk);
const pub = createPublicClient({ chain, transport });
const op = createWalletClient({ account, chain, transport });

const step = (n: number, msg: string) => console.log(`\n[${n}/7] ${msg}`);

/** Replace a key in .env, appending if absent. Always leaves a trailing newline. */
function setEnv(updates: Record<string, string>) {
  let env = readFileSync(".env", "utf8");
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    env = re.test(env) ? env.replace(re, `${k}=${v}`) : `${env.replace(/\n*$/, "\n")}${k}=${v}\n`;
    process.env[k] = v;
  }
  writeFileSync(".env", env.replace(/\n*$/, "\n"));
}

function forgeScript(path: string): Record<string, Address> {
  const out = execFileSync(
    `${process.env.HOME}/.foundry/bin/forge`,
    ["script", path, "--rpc-url", RPC, "--private-key", opPk, "--broadcast", "--slow"],
    { encoding: "utf8", env: process.env, maxBuffer: 32 * 1024 * 1024 },
  );
  if (!out.includes("ONCHAIN EXECUTION COMPLETE")) throw new Error(`deploy failed:\n${out.slice(-2000)}`);
  const found: Record<string, Address> = {};
  for (const m of out.matchAll(/^\s+(\w+)\s+(0x[a-fA-F0-9]{40})\s*$/gm)) found[m[1]!] = m[2]! as Address;
  return found;
}

const ROSTER_ABI = [
  { type: "function", name: "registerAgent", stateMutability: "payable",
    inputs: [{ name: "ensNode", type: "bytes32" }, { name: "dnsName", type: "bytes" }], outputs: [] },
  { type: "function", name: "eligibleCountExcluding", stateMutability: "view",
    inputs: [{ name: "excluded", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const COORD_ABI = [
  { type: "function", name: "addConsumer", stateMutability: "nonpayable",
    inputs: [{ name: "subId", type: "uint256" }, { name: "consumer", type: "address" }], outputs: [] },
] as const;

async function main() {
  console.log(`operator ${account.address}`);
  console.log(`balance  ${Number(await pub.getBalance({ address: account.address })) / 1e18} ETH`);

  // ── 1. ENS resolver ──────────────────────────────────────────────────────
  if (freshResolver) {
    step(1, "deploying a fresh Permissioned Resolver");
    // Grants at init land on the root resource, so we take SET_TEXT_ADMIN here and
    // narrow to per-key grants afterwards. See docs/design.md §4.2.
    const ADMIN = (1n << 4n) | ((1n << 4n) << 128n);
    const initData = execFileSync(`${process.env.HOME}/.foundry/bin/cast`,
      ["calldata", "initialize((address,uint256)[],bytes[])", `[(${account.address},${ADMIN})]`, "[]"],
      { encoding: "utf8" }).trim() as Hex;
    const salt = BigInt(Math.floor(Date.now() / 1000));
    const factoryAbi = [{ type: "function", name: "deployProxy", stateMutability: "nonpayable",
      inputs: [{ name: "impl", type: "address" }, { name: "salt", type: "uint256" }, { name: "data", type: "bytes" }],
      outputs: [{ type: "address" }] }] as const;
    const predicted = await pub.readContract({
      address: ENS_HACKATHON_SEPOLIA.verifiableFactory as Address, abi: factoryAbi,
      functionName: "deployProxy", args: [ENS_HACKATHON_SEPOLIA.permissionedResolverImpl as Address, salt, initData],
      account,
    });
    const hash = await op.writeContract({
      address: ENS_HACKATHON_SEPOLIA.verifiableFactory as Address, abi: factoryAbi,
      functionName: "deployProxy", args: [ENS_HACKATHON_SEPOLIA.permissionedResolverImpl as Address, salt, initData],
    });
    await pub.waitForTransactionReceipt({ hash });
    setEnv({ ENS_RESOLVER: predicted, PERJURY_RESOLVER_ADDRESS: predicted });
    console.log(`  resolver ${predicted}`);
  } else {
    step(1, `reusing resolver ${process.env.PERJURY_RESOLVER_ADDRESS}`);
  }

  // ── 2. Core contracts ────────────────────────────────────────────────────
  step(2, "deploying reader, roster, registry, writer");
  const core = forgeScript("contracts/script/DeployCore.s.sol:DeployCore");
  setEnv({
    STANDING_READER_ADDRESS: core.ENSTextStandingReader!,
    WITNESS_ROSTER_ADDRESS: core.WitnessRoster!,
    CLAIM_REGISTRY_ADDRESS: core.ClaimRegistry!,
    STANDING_WRITER_ADDRESS: core.PerjuryStandingWriter!,
  });
  for (const [k, v] of Object.entries(core)) console.log(`  ${k.padEnd(22)} ${v}`);

  // ── 3. ENS permissions ───────────────────────────────────────────────────
  step(3, "granting the writer per-key SET_TEXT, revoking our own");
  console.log(execFileSync("npx", ["tsx", "scripts/configure-eac.ts"],
    { encoding: "utf8", env: process.env }).split("\n").filter((l) => /PASS|FAIL|grant|revoke/.test(l)).join("\n"));

  // ── 4. VerdictSink ───────────────────────────────────────────────────────
  step(4, "deploying VerdictSink and wiring registry + writer");
  const sink = forgeScript("contracts/script/DeploySink.s.sol:DeploySink");
  setEnv({ VERDICT_SINK_ADDRESS: sink.VerdictSink! });
  console.log(`  VerdictSink            ${sink.VerdictSink}`);

  // ── 5. VRF consumer ──────────────────────────────────────────────────────
  step(5, "adding the roster as a VRF consumer");
  const addHash = await op.writeContract({
    address: need("VRF_COORDINATOR") as Address, abi: COORD_ABI, functionName: "addConsumer",
    args: [BigInt(need("VRF_SUBSCRIPTION_ID")), core.WitnessRoster! as Address],
  });
  await pub.waitForTransactionReceipt({ hash: addHash });
  console.log(`  ${addHash}`);

  // ── 6. Agents ────────────────────────────────────────────────────────────
  //
  // Reuse keys across deployments and register in parallel. Doing this
  // sequentially — generate, fund, await receipt, register, await receipt, five
  // times — took most of a fifteen-minute cascade, which is too slow to rehearse
  // against. Agents keep their keys and their ETH; only the roster is new, so
  // funding is usually skipped entirely and the five registrations are
  // independent transactions from five different accounts.
  step(6, `registering and staking ${agentCount} agents`);
  const roster = core.WitnessRoster! as Address;
  const names = ["operator", "witness-a", "panel-1", "panel-2", "panel-3", "panel-4", "panel-5"];
  const needed = STAKE + parseEther("0.003");

  const agents = await Promise.all(
    Array.from({ length: agentCount }, async (_, i) => {
      const fqdn = `${names[i] ?? `agent-${i}`}.perjury.eth`;
      if (i === 0) return { i, fqdn, pk: opPk, account };
      const existing = process.env[`AGENT_${i}_PK`] as Hex | undefined;
      const pk = existing ?? generatePrivateKey();
      const acct = privateKeyToAccount(pk);
      if (!existing) setEnv({ [`AGENT_${i}_PK`]: pk, [`AGENT_${i}_ADDR`]: acct.address });
      return { i, fqdn, pk, account: acct };
    }),
  );

  // Fund only what is short, and send those sequentially — they share the
  // operator's nonce.
  for (const a of agents.slice(1)) {
    const bal = await pub.getBalance({ address: a.account.address });
    if (bal >= needed) continue;
    const hash = await op.sendTransaction({ to: a.account.address, value: needed - bal });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`  ${"funded".padEnd(24)} ${a.account.address}`);
  }

  // Registrations are independent accounts, so they can all go at once.
  await Promise.all(
    agents.map(async (a) => {
      const w = createWalletClient({ account: a.account, chain, transport });
      const hash = await w.writeContract({
        address: roster, abi: ROSTER_ABI, functionName: "registerAgent",
        args: [namehash(a.fqdn), dnsEncode(a.fqdn)], value: STAKE,
      });
      await pub.waitForTransactionReceipt({ hash });
      console.log(`  ${a.fqdn.padEnd(24)} ${a.account.address}`);
    }),
  );
  setEnv({ WITNESS_A_PK: process.env.AGENT_1_PK ?? "", WITNESS_A_ADDR: process.env.AGENT_1_ADDR ?? "" });

  // ── 7. Point the CRE workflow at the new sink ────────────────────────────
  step(7, "pointing the CRE workflow at the new sink");
  for (const f of ["cre/tribunal/config.staging.json", "cre/tribunal/config.production.json"]) {
    const cfg = JSON.parse(readFileSync(f, "utf8"));
    cfg.verdictSinkAddress = sink.VerdictSink;
    cfg.reportKind = "verdict";
    writeFileSync(f, `${JSON.stringify(cfg, null, 2)}\n`);
  }
  console.log("  config.staging.json, config.production.json");

  const eligible = await pub.readContract({
    address: roster, abi: ROSTER_ABI, functionName: "eligibleCountExcluding",
    args: ["0x0000000000000000000000000000000000000000"],
  });
  console.log(`\ndone — ${eligible} eligible agents`);
  console.log(`balance ${Number(await pub.getBalance({ address: account.address })) / 1e18} ETH`);
  if (Number(eligible) < agentCount) {
    console.log(`\n⚠ fewer eligible than registered — an ENS record is unreadable, which correctly reads as ineligible.`);
  }
}

main().catch((e) => { console.error(`\n✗ ${e instanceof Error ? e.message : e}`); process.exit(1); });
