/**
 * The write side of the protocol, for the one page that has one.
 *
 * Every other module in `src/lib` is deliberately read-only: the dashboard
 * cannot change protocol state, which is what lets it be public without a gate.
 * This file is the exception, and it is kept separate so that property stays
 * easy to check rather than becoming a claim nobody verifies.
 *
 * It holds agent keys. That is a real cost of letting a visitor cause a claim,
 * and the mitigations are narrow rather than clever: the keys belong to agents
 * that hold only testnet ETH, there is one claim in flight at a time, and the
 * only transactions this file can produce are `submitClaim` and `finalize`.
 */
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const rpc = () => process.env.SEPOLIA_RPC_URL;

export const pub = createPublicClient({
  chain: sepolia,
  transport: http(rpc(), { batch: { wait: 12 } }),
});

export const REGISTRY = process.env.CLAIM_REGISTRY_ADDRESS as Address;

/** Only what this page needs. A narrow binding is easier to audit than a comment. */
export const WRITE_ABI = [
  { type: "function", name: "nextClaimId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "submitClaim", stateMutability: "payable",
    inputs: [{ name: "subject", type: "bytes32" }, { name: "claimHash", type: "bytes32" }],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "finalize", stateMutability: "nonpayable",
    inputs: [{ name: "claimId", type: "uint256" }], outputs: [] },
  { type: "function", name: "claimOf", stateMutability: "view",
    inputs: [{ name: "claimId", type: "uint256" }],
    outputs: [{ components: [
      { name: "claimant", type: "address" }, { name: "witness", type: "address" },
      { name: "subject", type: "bytes32" }, { name: "claimHash", type: "bytes32" },
      { name: "evidenceCommitment", type: "bytes32" }, { name: "bond", type: "uint256" },
      { name: "submittedAt", type: "uint64" }, { name: "assignedAt", type: "uint64" },
      { name: "status", type: "uint8" }, { name: "verdict", type: "uint8" },
    ], type: "tuple" }] },
  { type: "function", name: "CHALLENGE_WINDOW", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
] as const;

/** Bond plus the witness fee, matching the runner. */
export const SUBMIT_VALUE = 12_000_000_000_000_000n;

/**
 * The agents this deployment may act as.
 *
 * Name to env var rather than name to key: the key never appears in a literal,
 * and an agent with no key configured simply is not offered.
 */
const AGENT_KEYS: Record<string, string> = {
  operator: "OPERATOR_PRIVATE_KEY",
  "witness-a": "AGENT_1_PK",
  "panel-1": "AGENT_2_PK",
  "panel-2": "AGENT_3_PK",
  "panel-3": "AGENT_4_PK",
};

export const configuredAgents = (): string[] =>
  Object.entries(AGENT_KEYS)
    .filter(([, env]) => Boolean(process.env[env]))
    .map(([name]) => name);

/**
 * Agents that hold a key here AND can afford a bond.
 *
 * Offering one that cannot is how a demo produces `insufficient funds` in front
 * of a judge, who reasonably reads it as the protocol failing rather than as a
 * wallet that needs topping up. It happened in testing, which is why this exists
 * rather than a comment saying to remember.
 *
 * The margin covers gas on top of the bond and the witness fee.
 */
export async function fundedAgents(): Promise<string[]> {
  const names = configuredAgents();
  const balances = await Promise.all(
    names.map(async (n) => {
      const w = walletFor(n);
      if (!w) return 0n;
      return pub.getBalance({ address: w.account.address }).catch(() => 0n);
    }),
  );
  const floor = SUBMIT_VALUE + 2_000_000_000_000_000n;
  return names.filter((_, i) => balances[i] >= floor);
}

/** A wallet for one agent, or null when this deployment holds no key for it. */
export function walletFor(name: string) {
  const env = AGENT_KEYS[name];
  const raw = env ? process.env[env] : undefined;
  if (!raw) return null;
  // The operator key is stored without an 0x prefix, because `vm.envUint`
  // rejects it and `cast` tolerates it. viem needs it.
  const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
  return {
    account,
    client: createWalletClient({ account, chain: sepolia, transport: http(rpc()) }),
  };
}

export const STATUS = ["None", "Pending", "WitnessAssigned", "Adjudicated", "UnderAppeal", "Settled"] as const;
export const VERDICT = ["None", "Match", "Mismatch", "Unverifiable"] as const;
