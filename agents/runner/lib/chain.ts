// Shared on-chain helpers for the demo scenes.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { namehash } from "viem/ens";
import { sepolia } from "viem/chains";
import { dnsEncode, withHackathonResolver } from "@perjury/ens";

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} unset`); return v; };
const raw = need("OPERATOR_PRIVATE_KEY");
export const opPk = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;

export const REGISTRY = need("CLAIM_REGISTRY_ADDRESS") as Address;
export const ROSTER = need("WITNESS_ROSTER_ADDRESS") as Address;
export const READER = need("STANDING_READER_ADDRESS") as Address;

const chain = withHackathonResolver(sepolia);
const transport = http(need("SEPOLIA_RPC_URL"));
export const account = privateKeyToAccount(opPk);
export const pub = createPublicClient({ chain, transport });
export const op = createWalletClient({ account, chain, transport });

export const REGISTRY_ABI = [
  { type: "function", name: "submitClaim", stateMutability: "payable",
    inputs: [{ name: "subject", type: "bytes32" }, { name: "claimHash", type: "bytes32" }],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "appeal", stateMutability: "payable",
    inputs: [{ name: "claimId", type: "uint256" }], outputs: [] },
  { type: "function", name: "finalize", stateMutability: "nonpayable",
    inputs: [{ name: "claimId", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdrawable", stateMutability: "view",
    inputs: [{ name: "who", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "forfeited", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nextClaimId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "claimOf", stateMutability: "view",
    inputs: [{ name: "claimId", type: "uint256" }],
    outputs: [{ components: [
      { name: "claimant", type: "address" }, { name: "witness", type: "address" },
      { name: "subject", type: "bytes32" }, { name: "claimHash", type: "bytes32" },
      { name: "evidenceCommitment", type: "bytes32" }, { name: "bond", type: "uint256" },
      { name: "submittedAt", type: "uint64" }, { name: "assignedAt", type: "uint64" },
      { name: "status", type: "uint8" }, { name: "verdict", type: "uint8" },
    ], type: "tuple" }] },
  { type: "function", name: "appealOf", stateMutability: "view",
    inputs: [{ name: "claimId", type: "uint256" }],
    outputs: [{ components: [
      { name: "appellant", type: "address" }, { name: "bond", type: "uint256" },
      { name: "panel", type: "address[]" }, { name: "original", type: "uint8" }, { name: "open", type: "bool" },
    ], type: "tuple" }] },
] as const;

export const ROSTER_ABI = [
  { type: "function", name: "isEligible", stateMutability: "view",
    inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "stakeOf", stateMutability: "view",
    inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "agentCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "agentList", stateMutability: "view",
    inputs: [{ name: "i", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

export const READER_ABI = [
  { type: "function", name: "standingOfName", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }, { name: "dnsName", type: "bytes" }],
    outputs: [{ type: "int256" }] },
] as const;

export const STATUS = ["None", "Pending", "WitnessAssigned", "Adjudicated", "UnderAppeal", "Settled"];
export const VERDICT = ["None", "Match", "Mismatch", "Unverifiable"];

export const AGENTS = [
  { name: "operator.perjury.eth", envAddr: "" },
  { name: "witness-a.perjury.eth", envAddr: "AGENT_1_ADDR" },
  { name: "panel-1.perjury.eth", envAddr: "AGENT_2_ADDR" },
  { name: "panel-2.perjury.eth", envAddr: "AGENT_3_ADDR" },
  { name: "panel-3.perjury.eth", envAddr: "AGENT_4_ADDR" },
];

/**
 * Resolve a claimant by agent name, defaulting to the operator.
 *
 * Scene 2 slashes whoever claims, so running scenes back to back against one
 * deployment needs a different claimant each time — otherwise the second run
 * hits NotEligible and the only remedy is a redeploy.
 */
export function claimantFor(name: string | undefined): { name: string; pk: Hex; address: Address } {
  const agent = AGENTS.find((a) => a.name.startsWith(name ?? "operator"));
  if (!agent) throw new Error(`unknown agent "${name}". One of: ${AGENTS.map((a) => a.name).join(", ")}`);
  if (!agent.envAddr) return { name: agent.name, pk: opPk, address: account.address };
  const idx = AGENTS.indexOf(agent);
  const pk = process.env[`AGENT_${idx}_PK`] as Hex | undefined;
  if (!pk) throw new Error(`AGENT_${idx}_PK unset — run scripts/deploy-all.ts`);
  return { name: agent.name, pk, address: process.env[agent.envAddr] as Address };
}

export function walletFor(pk: Hex) {
  return createWalletClient({ account: privateKeyToAccount(pk), chain, transport });
}

export function addressOf(a: { name: string; envAddr: string }): Address {
  return (a.envAddr ? (process.env[a.envAddr] as Address) : account.address) ?? account.address;
}

export async function standingOf(name: string): Promise<string> {
  try {
    const v = await pub.readContract({
      address: READER, abi: READER_ABI, functionName: "standingOfName",
      args: [namehash(name), dnsEncode(name)],
    });
    return String(v);
  } catch { return "?"; }
}

export async function claim(id: bigint) {
  return pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "claimOf", args: [id] });
}

export async function rosterSnapshot() {
  const rows = [];
  for (const a of AGENTS) {
    const addr = addressOf(a);
    if (!addr) continue;
    const [eligible, standing] = await Promise.all([
      pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "isEligible", args: [addr] }),
      standingOf(a.name),
    ]);
    rows.push({ name: a.name, address: addr, eligible: eligible as boolean, standing });
  }
  return rows;
}

/** Run the CRE workflow. Returns the verdict it logged. */
export function runTribunal(kind: "verdict" | "panel" = "verdict"): string {
  for (const f of ["cre/tribunal/config.staging.json", "cre/tribunal/config.production.json"]) {
    const cfg = JSON.parse(readFileSync(f, "utf8"));
    cfg.reportKind = kind;
    writeFileSync(f, `${JSON.stringify(cfg, null, 2)}\n`);
  }
  const out = execFileSync(
    `${process.env.HOME}/.cre/bin/cre`,
    ["workflow", "simulate", "tribunal", "--target", "staging-settings", "--broadcast"],
    { encoding: "utf8", cwd: "cre", env: process.env, maxBuffer: 32 * 1024 * 1024 },
  );
  const m = out.match(/verdict=(\d)/);
  return m ? VERDICT[Number(m[1])] ?? "?" : "?";
}

/** Publish real agent submissions and point the tribunal at them. */
export function publishEvidence(claimId: string, honesty: "honest" | "false", panel = false): string {
  const args = ["tsx", "agents/runner/publish-evidence.ts", claimId, honesty];
  if (panel) args.push("--panel");
  const out = execFileSync("npx", args, { encoding: "utf8", env: process.env, maxBuffer: 32 * 1024 * 1024 });
  return out;
}

/**
 * Refuse to start a scene from a state that cannot produce it.
 *
 * A claimant slashed in an earlier run is correctly ineligible, and submitClaim
 * reverts with NotEligible() — which is the mechanism working, but reads as a
 * crash mid-demo. Better to say so before the camera is rolling.
 */
export async function preflight(claimantName: string, claimantAddr: Address, needEligible = 2) {
  const eligible = (await rosterSnapshot()).filter((r) => r.eligible);
  const claimantOk = await pub.readContract({
    address: ROSTER, abi: ROSTER_ABI, functionName: "isEligible", args: [claimantAddr],
  });
  const problems: string[] = [];
  if (!claimantOk) {
    problems.push(`${claimantName} is not eligible — it was slashed in an earlier run, which is the mechanism working.`);
  }
  if (eligible.length < needEligible) {
    problems.push(`only ${eligible.length} eligible agents; this scene needs ${needEligible}.`);
  }
  if (problems.length) {
    console.log("\n  Cannot run this scene from the current state:");
    for (const x of problems) console.log(`    - ${x}`);
    console.log("\n  Reset with a fresh deployment:");
    console.log("    npx tsx scripts/deploy-all.ts --resolver --agents 5\n");
    process.exit(1);
  }
}

export const BOND = parseEther("0.012");
export const APPEAL_BOND = parseEther("0.02");
