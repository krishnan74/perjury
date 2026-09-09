/**
 * Rebuilds the demo evidence trail from chain.
 *
 *   npx tsx scripts/collect-evidence.ts [lookbackBlocks]
 *
 * The scene scripts print truncated hashes for readability, so transcribing
 * docs/TX_HASHES.md from terminal output is both tedious and error-prone. Every
 * hash we need is already on Sepolia; this reads it back instead, grouped by
 * claim id so each scene's rows stay together.
 */
import { createPublicClient, http, parseAbiItem } from "viem";
import { sepolia } from "viem/chains";

const pub = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });
const REGISTRY = process.env.CLAIM_REGISTRY_ADDRESS as `0x${string}`;
const ROSTER = process.env.WITNESS_ROSTER_ADDRESS as `0x${string}`;

const head = await pub.getBlockNumber();
const lookback = BigInt(process.argv[2] ?? 2400);
const from = head - lookback;

const sigs: [string, `0x${string}`][] = [
  ["ClaimSubmitted(uint256 indexed claimId, address indexed claimant, bytes32 subject, uint256 bond)", REGISTRY],
  ["WitnessAssigned(uint256 indexed claimId, address indexed witness)", REGISTRY],
  ["VerdictRecorded(uint256 indexed claimId, uint8 verdict, bytes32 evidenceCommitment)", REGISTRY],
  ["Settled(uint256 indexed claimId, address indexed claimant, uint8 verdict)", REGISTRY],
  ["Appealed(uint256 indexed claimId, address indexed appellant, uint256 bond)", REGISTRY],
  ["PanelSeated(uint256 indexed claimId, address[] panel)", REGISTRY],
  ["PanelUpheld(uint256 indexed claimId, uint8 verdict)", REGISTRY],
  ["ClaimantSlashed(uint256 indexed claimId, address indexed claimant, uint256 bond, uint256 stakeSlashed)", REGISTRY],
  ["WitnessPaid(uint256 indexed claimId, address indexed witness, uint256 fee)", REGISTRY],
  ["WitnessRequested(uint256 indexed claimId, uint256 indexed requestId)", ROSTER],
  ["WitnessDrawn(uint256 indexed claimId, address indexed witness, uint256 seed)", ROSTER],
  ["PanelRequested(uint256 indexed claimId, uint256 indexed requestId)", ROSTER],
  ["PanelDrawn(uint256 indexed claimId, address[] panel)", ROSTER],
  ["AgentSlashed(address indexed agent, uint256 amount, uint256 remainingStake)", ROSTER],
];

type Row = { block: bigint; claimId: string; event: string; tx: string; detail: string };
const rows: Row[] = [];

for (const [sig, address] of sigs) {
  const ev = parseAbiItem(`event ${sig}`) as any;
  const logs = await pub.getLogs({ address, event: ev, fromBlock: from, toBlock: head });
  for (const l of logs) {
    // viem types getLogs by the event arg, but we iterate a heterogeneous list
    // of event ABIs here, so the arg shape differs per iteration.
    const a = (l as unknown as { args: Record<string, unknown> }).args;
    const detail = Object.entries(a)
      .filter(([k]) => k !== "claimId")
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(" ") : String(v)}`)
      .join(" ");
    rows.push({ block: l.blockNumber!, claimId: a.claimId !== undefined ? String(a.claimId) : "-", event: ev.name as string, tx: l.transactionHash!, detail });
  }
}

rows.sort((x, y) => Number(x.block - y.block));

// Group by claim id: a scene is one claim's worth of rows (scene 3 is several),
// and reading them interleaved by block makes the trail impossible to follow.
const byClaim = new Map<string, Row[]>();
for (const r of rows) byClaim.set(r.claimId, [...(byClaim.get(r.claimId) ?? []), r]);

const EXPLORER = "https://sepolia.etherscan.io/tx/";
for (const [claimId, rs] of byClaim) {
  console.log(`\n#### Claim ${claimId}\n`);
  console.log("| Block | Event | Tx | Detail |");
  console.log("|---|---|---|---|");
  for (const r of rs) {
    console.log(`| ${r.block} | \`${r.event}\` | [\`${r.tx.slice(0, 14)}…\`](${EXPLORER}${r.tx}) | ${r.detail} |`);
  }
}
