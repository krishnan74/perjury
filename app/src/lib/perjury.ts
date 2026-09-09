/**
 * Read-only view of the live protocol.
 *
 * Everything here runs on the server. There is no wallet, no signer, and no
 * write path anywhere in this file — the dashboard cannot change protocol state,
 * which is what lets it be public without a gate. `GRAPH_STUDIO_KEY` and the RPC
 * URL are read from the environment here and never reach the client bundle.
 */
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { sepolia } from "viem/chains";

export const EXPLORER = "https://sepolia.etherscan.io";

export const REGISTRY = process.env.CLAIM_REGISTRY_ADDRESS as Address;
export const ROSTER = process.env.WITNESS_ROSTER_ADDRESS as Address;
export const SINK = process.env.VERDICT_SINK_ADDRESS as Address;
export const RESOLVER = process.env.PERJURY_RESOLVER_ADDRESS as Address;
export const WRITER = process.env.STANDING_WRITER_ADDRESS as Address;

export const pub = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

/** Mirrors the on-chain enums so a number never reaches a template. */
export const STATUS = ["None", "Pending", "WitnessAssigned", "Adjudicated", "UnderAppeal", "Settled"] as const;
export const VERDICT = ["None", "Match", "Mismatch", "Unverifiable"] as const;
export type VerdictName = (typeof VERDICT)[number];

const CLAIM_TUPLE = {
  components: [
    { name: "claimant", type: "address" },
    { name: "witness", type: "address" },
    { name: "subject", type: "bytes32" },
    { name: "claimHash", type: "bytes32" },
    { name: "evidenceCommitment", type: "bytes32" },
    { name: "bond", type: "uint256" },
    { name: "submittedAt", type: "uint64" },
    { name: "assignedAt", type: "uint64" },
    { name: "status", type: "uint8" },
    { name: "verdict", type: "uint8" },
  ],
  type: "tuple",
} as const;

export const REGISTRY_ABI = [
  { type: "function", name: "nextClaimId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "claimOf", stateMutability: "view", inputs: [{ name: "claimId", type: "uint256" }], outputs: [CLAIM_TUPLE] },
  {
    type: "function", name: "appealOf", stateMutability: "view", inputs: [{ name: "claimId", type: "uint256" }],
    outputs: [{
      components: [
        { name: "appellant", type: "address" },
        { name: "bond", type: "uint256" },
        { name: "panel", type: "address[]" },
        { name: "original", type: "uint8" },
        { name: "open", type: "bool" },
      ],
      type: "tuple",
    }],
  },
  { type: "function", name: "challengeDeadline", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "forfeited", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MIN_BOND", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "WITNESS_FEE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "APPEAL_BOND", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "CHALLENGE_WINDOW", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
] as const;

export const ROSTER_ABI = [
  { type: "function", name: "agentCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "agentList", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "isEligible", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "stakeOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "flaggedUntil", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "REGISTRATION_STAKE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "PANEL_SIZE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "agents", stateMutability: "view", inputs: [{ type: "address" }],
    outputs: [
      { name: "ensNode", type: "bytes32" },
      { name: "dnsName", type: "bytes" },
      { name: "active", type: "bool" },
      { name: "registeredAt", type: "uint64" },
      { name: "stake", type: "uint256" },
    ],
  },
] as const;

export const READER_ABI = [
  {
    type: "function", name: "standingOfNameChecked", stateMutability: "view",
    inputs: [{ type: "bytes32" }, { type: "bytes" }],
    outputs: [{ name: "standing", type: "int256" }, { name: "readable", type: "bool" }],
  },
] as const;

/** The events that make up a claim's life, in the order they can occur. */
export const CLAIM_EVENTS = [
  parseAbiItem("event ClaimSubmitted(uint256 indexed claimId, address indexed claimant, bytes32 subject, uint256 bond)"),
  parseAbiItem("event WitnessAssigned(uint256 indexed claimId, address indexed witness)"),
  parseAbiItem("event VerdictRecorded(uint256 indexed claimId, uint8 verdict, bytes32 evidenceCommitment)"),
  parseAbiItem("event Appealed(uint256 indexed claimId, address indexed appellant, uint256 bond)"),
  parseAbiItem("event PanelSeated(uint256 indexed claimId, address[] panel)"),
  parseAbiItem("event PanelUpheld(uint256 indexed claimId, uint8 verdict)"),
  parseAbiItem("event PanelOverturned(uint256 indexed claimId, uint8 original, uint8 panel, address contradicted, uint256 slashed)"),
  parseAbiItem("event Settled(uint256 indexed claimId, address indexed claimant, uint8 verdict)"),
  parseAbiItem("event ClaimantSlashed(uint256 indexed claimId, address indexed claimant, uint256 bond, uint256 stakeSlashed)"),
  parseAbiItem("event WitnessPaid(uint256 indexed claimId, address indexed witness, uint256 fee)"),
] as const;

export interface ClaimEvent {
  name: string;
  claimId: string;
  block: bigint;
  timestamp: number;
  tx: `0x${string}`;
  args: Record<string, unknown>;
}

/**
 * Every protocol event in a window, ordered as they happened.
 *
 * The dashboard derives everything from these rather than from a database. It is
 * slower, and it means the page can only show what actually happened on chain —
 * which for a project about verifiable claims is the right constraint to accept.
 */
export async function claimEvents(lookback = 4000n): Promise<ClaimEvent[]> {
  const head = await pub.getBlockNumber();
  const fromBlock = head > lookback ? head - lookback : 0n;

  const batches = await Promise.all(
    CLAIM_EVENTS.map((event) =>
      pub.getLogs({ address: REGISTRY, event, fromBlock, toBlock: head }).catch(() => []),
    ),
  );

  const logs = batches.flat();
  // One timestamp lookup per block rather than per event.
  const blocks = [...new Set(logs.map((l) => l.blockNumber!))];
  const times = new Map<bigint, number>();
  await Promise.all(
    blocks.map(async (b) => {
      const blk = await pub.getBlock({ blockNumber: b });
      times.set(b, Number(blk.timestamp));
    }),
  );

  return logs
    .map((l) => {
      const args = (l as unknown as { args: Record<string, unknown> }).args ?? {};
      return {
        name: (l as unknown as { eventName: string }).eventName,
        claimId: args.claimId !== undefined ? String(args.claimId) : "-",
        block: l.blockNumber!,
        timestamp: times.get(l.blockNumber!) ?? 0,
        tx: l.transactionHash!,
        args,
      };
    })
    .sort((a, b) => Number(a.block - b.block) || a.name.localeCompare(b.name));
}

export const short = (a: string, n = 6) => `${a.slice(0, n)}…${a.slice(-4)}`;

export function eth(wei: bigint, dp = 3): string {
  const s = (Number(wei) / 1e18).toFixed(dp);
  return s.replace(/\.?0+$/, "") || "0";
}

export function ago(ts: number): string {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
