/**
 * Rebuilds the demo evidence trail from chain.
 *
 *   npx tsx scripts/collect-evidence.ts [lookbackBlocks] [--write]
 *
 * The scene scripts print truncated hashes for readability, so transcribing
 * docs/TX_HASHES.md from terminal output is both tedious and error-prone. Every
 * hash we need is already on Sepolia; this reads it back instead, grouped by
 * claim id so each scene's rows stay together.
 *
 * `--write` replaces a delimited block inside docs/TX_HASHES.md rather than the
 * whole file. Most of that document is hand-written — what each milestone
 * proves, which deployment superseded which — and regenerating over it would
 * throw away the part a reader actually needs. Only the ledger is generated.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbiItem } from "viem";
import { sepolia } from "viem/chains";

const pub = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });
const REGISTRY = process.env.CLAIM_REGISTRY_ADDRESS as `0x${string}`;
const ROSTER = process.env.WITNESS_ROSTER_ADDRESS as `0x${string}`;

const WRITE = process.argv.includes("--write");
const DOC = "docs/TX_HASHES.md";
const BEGIN = "<!-- BEGIN GENERATED LEDGER — npx tsx scripts/collect-evidence.ts --write -->";
const END = "<!-- END GENERATED LEDGER -->";

const head = await pub.getBlockNumber();
const lookback = BigInt(process.argv.find((a) => /^\d+$/.test(a)) ?? 9000);
const from = head > lookback ? head - lookback : 0n;

/** Providers cap eth_getLogs spans, and a wide window fails whole rather than
 *  partially — so it is split before it is asked for rather than after it errors. */
const CHUNK = 4000n;
const spans: [bigint, bigint][] = [];
for (let f = from; f <= head; f += CHUNK) {
  const t = f + CHUNK - 1n;
  spans.push([f, t > head ? head : t]);
}

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
  const batches = await Promise.all(
    spans.map(([f, t]) => pub.getLogs({ address, event: ev, fromBlock: f, toBlock: t }).catch(() => [])),
  );
  for (const l of batches.flat()) {
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

/*
 * Attribute the roster's claim-less events to a claim by transaction.
 *
 * `AgentSlashed` carries an agent and an amount but no claim id, so it was
 * collecting under a group headed "Claim -" that read as a bug. It is emitted
 * inside the settlement transaction, so the tx hash is the join — the same one
 * the dashboard uses to attach a standing write to its claim.
 */
const claimOfTx = new Map<string, string>();
for (const r of rows) if (r.claimId !== "-") claimOfTx.set(r.tx, r.claimId);
for (const r of rows) if (r.claimId === "-") r.claimId = claimOfTx.get(r.tx) ?? "-";

// Group by claim id: a scene is one claim's worth of rows (scene 3 is several),
// and reading them interleaved by block makes the trail impossible to follow.
const byClaim = new Map<string, Row[]>();
for (const r of rows) byClaim.set(r.claimId, [...(byClaim.get(r.claimId) ?? []), r]);

// Numeric order, with anything still unattributed last rather than wherever it
// first appeared.
const ordered = [...byClaim.entries()].sort(([a], [b]) =>
  a === "-" ? 1 : b === "-" ? -1 : Number(a) - Number(b),
);

const EXPLORER = "https://sepolia.etherscan.io/tx/";

// Claim ids restart on every redeploy, so a ledger without its block range is
// ambiguous about which deployment it describes.
const out: string[] = [
  BEGIN,
  "",
  `*Generated ${new Date().toISOString().slice(0, 10)} from Sepolia blocks ${from}–${head}. ` +
    `${byClaim.size} claims, ${rows.length} events. Rebuild with \`npx tsx scripts/collect-evidence.ts --write\`.*`,
  "",
  "Claim ids restart with each deployment, so these are the claims of the deployment currently in `.env`.",
  "",
];

for (const [claimId, rs] of ordered) {
  const verdict = rs.find((r) => r.event === "Settled")?.detail.match(/verdict=(\d)/)?.[1];
  const name = ["None", "Match", "Mismatch", "Unverifiable"][Number(verdict ?? 0)] ?? "open";
  out.push(`#### Claim ${claimId} — ${verdict ? name : "not settled"}`, "");
  out.push("| Block | Event | Tx | Detail |", "|---|---|---|---|");
  for (const r of rs) {
    out.push(`| ${r.block} | \`${r.event}\` | [\`${r.tx.slice(0, 14)}…\`](${EXPLORER}${r.tx}) | ${r.detail} |`);
  }
  out.push("");
}
out.push(END);

const block = out.join("\n");

if (!WRITE) {
  console.log(block);
  console.log(`\n(dry run — pass --write to replace the ledger in ${DOC})`);
} else {
  const doc = readFileSync(DOC, "utf8");
  const i = doc.indexOf(BEGIN);
  const j = doc.indexOf(END);
  const next =
    i >= 0 && j > i
      ? `${doc.slice(0, i)}${block}${doc.slice(j + END.length)}`
      : `${doc.replace(/\n*$/, "\n")}\n## Full ledger, generated\n\n${block}\n`;
  writeFileSync(DOC, next.replace(/\n*$/, "\n"));
  console.log(`${DOC}: ${byClaim.size} claims, ${rows.length} events, blocks ${from}–${head}`);
}
