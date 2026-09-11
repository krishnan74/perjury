/**
 * Recover the agents' work for claims already settled, and prove it belongs.
 *
 *   npx tsx scripts/archive-evidence.ts [--write]
 *
 * Runs before this existed published each bundle to a fresh gist and kept only
 * the newest URL, so a settled verdict could be shown to exist and never
 * inspected. The gists are still there, but claim ids reset on every redeploy,
 * so several bundles carry the same id and the description alone cannot say
 * which one a given on-chain claim was actually judged against. Guessing would
 * attach one agent's work to another agent's claim, which is the single worst
 * thing this repo could ship.
 *
 * It does not have to be guessed. `VerdictRecorded` carries
 * `evidenceCommitment`, which the tribunal computed as
 *
 *   keccak256(toHex(JSON.stringify({ claim, witness, salt })))
 *
 * over the exact submissions it read, with the enclave-held salt. Recomputing
 * that over a candidate bundle either reproduces the on-chain hash or does not.
 * A match is proof the tribunal judged this bundle and no other; anything else
 * is discarded and the claim stays unarchived.
 *
 * This is the use the commitment was designed for — cre/tribunal/workflow.ts
 * says so at the point it builds it — so the back-fill exercises the scheme
 * rather than working around it.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, http, keccak256, parseAbiItem, toHex, type Address } from "viem";
import { sepolia } from "viem/chains";

const WRITE = process.argv.includes("--write");
const salt = process.env.PERJURY_COMMITMENT_SALT;
if (!salt) throw new Error("PERJURY_COMMITMENT_SALT missing — load cre/.env");

const REGISTRY = process.env.CLAIM_REGISTRY_ADDRESS as Address;
const pub = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });

const VERDICT_RECORDED = parseAbiItem(
  "event VerdictRecorded(uint256 indexed claimId, uint8 verdict, bytes32 evidenceCommitment)",
);

/** Every commitment the chain published, newest deployment only. */
async function onChainCommitments(): Promise<Map<string, string>> {
  const head = await pub.getBlockNumber();
  const logs = await pub.getLogs({
    address: REGISTRY,
    event: VERDICT_RECORDED,
    fromBlock: head - 7200n,
    toBlock: head,
  });
  return new Map(
    logs.map((l) => {
      const a = (l as unknown as { args: { claimId: bigint; evidenceCommitment: string } }).args;
      return [String(a.claimId), a.evidenceCommitment.toLowerCase()];
    }),
  );
}

interface Gist {
  id: string;
  description: string;
}

function listGists(): Gist[] {
  const out = execFileSync("gh", ["gist", "list", "--limit", "100"], { encoding: "utf8" });
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, description] = line.split("\t");
      return { id: id!, description: description ?? "" };
    })
    .filter((g) => g.description.startsWith("Perjury sealed evidence"));
}

const commitments = await onChainCommitments();
console.log(`on-chain commitments: ${commitments.size}`);

const gists = listGists();
console.log(`candidate bundles:    ${gists.length}\n`);

const matched = new Map<string, { gist: string; bundle: Record<string, unknown> }>();

for (const g of gists) {
  let bundle: Record<string, unknown>;
  try {
    const res = await fetch(`https://gist.githubusercontent.com/raw/${g.id}`);
    if (!res.ok) throw new Error(String(res.status));
    bundle = (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.log(`  ${g.id.slice(0, 8)}  unreadable (${(e as Error).message})`);
    continue;
  }

  // Exactly the tribunal's construction: same key order, same serialisation.
  const computed = keccak256(
    toHex(JSON.stringify({ claim: bundle.claim, witness: bundle.witness, salt })),
  ).toLowerCase();

  const hit = [...commitments].find(([, c]) => c === computed);
  if (!hit) {
    console.log(`  ${g.id.slice(0, 8)}  no on-chain match (${g.description})`);
    continue;
  }

  const [claimId] = hit;
  // Two gists cannot both produce one commitment without a keccak collision, so
  // a second match on the same id would be a bug here, not a real ambiguity.
  if (matched.has(claimId)) {
    console.log(`  ${g.id.slice(0, 8)}  DUPLICATE match for claim ${claimId} — skipped`);
    continue;
  }
  matched.set(claimId, { gist: g.id, bundle });
  console.log(`  ${g.id.slice(0, 8)}  ✓ claim ${claimId}  commitment verified`);
}

console.log(`\nverified ${matched.size} of ${commitments.size} settled claims`);

if (!WRITE) {
  console.log("dry run — pass --write to archive");
} else {
  const dir = `evidence-archive/${(process.env.CLAIM_REGISTRY_ADDRESS ?? "unknown").toLowerCase()}`;
  mkdirSync(dir, { recursive: true });
  for (const [claimId, { gist, bundle }] of matched) {
    const path = `${dir}/${claimId}.json`;
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          ...bundle,
          gatewayUrl: `https://gist.githubusercontent.com/raw/${gist}`,
          archivedAt: new Date().toISOString(),
          // Recorded so a reader can re-run the check rather than trust this file.
          commitmentVerified: commitments.get(claimId),
        },
        null,
        2,
      )}\n`,
    );
    console.log(`  wrote ${path}`);
  }
}

for (const id of commitments.keys()) {
  if (!matched.has(id)) console.log(`claim ${id}: no verified bundle — stays unarchived`);
}
