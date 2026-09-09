/**
 * Runs ONE query pattern against EVERY pinned deployment, live.
 *
 *   npx tsx scripts/verify-pinned.ts
 *
 * Two jobs, and both matter.
 *
 * As a pre-flight check: a pinned deployment that has gone stale, started
 * erroring, or stopped returning rows makes the verifier fail closed to
 * `Unverifiable` — correct behaviour, but it kills a demo take. Run this
 * immediately before recording.
 *
 * As evidence: the selection set below is written once and every protocol
 * answers it, because they all serve the Messari standardized lending schema.
 * There is no per-protocol branch here, in the agents, or in the tribunal's
 * recompute step. That is the whole argument for standardization — adding
 * Compound and Spark alongside Aave was a data change, not a code change.
 */
import { PINNED, chainHead, composeDocument } from "@perjury/graph-client";

/** Written once. Every protocol below answers it unmodified. */
const SELECTION = `lendingProtocols(first: 1) { id name totalDepositBalanceUSD totalBorrowBalanceUSD totalValueLockedUSD }`;

/** The same derivation the tribunal performs — schema-level, not protocol-level. */
const utilization = (row: Record<string, string>): number =>
  (Number(row.totalBorrowBalanceUSD) / Number(row.totalDepositBalanceUSD)) * 100;

const KEY = process.env.GRAPH_STUDIO_KEY ?? "";
if (!KEY) throw new Error("GRAPH_STUDIO_KEY unset — live Gateway access is required");

/** Anything past this and graph-guard rejects the read as stale. */
const FRESHNESS_BLOCKS = 50;

const c = {
  reset: "\x1b[0m", grey: "\x1b[90m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", bold: "\x1b[1m", cyan: "\x1b[36m",
};

const head = await chainHead();
console.log(`\n${c.bold}One query pattern, ${PINNED.length} protocols, live Gateway${c.reset}`);
console.log(`${c.grey}mainnet head ${head} · schema: messari-lending · no per-protocol code${c.reset}\n`);
console.log(`${c.grey}${composeDocument(SELECTION)}${c.reset}\n`);

let failures = 0;

for (const entry of PINNED) {
  const label = `${entry.protocolName}`.padEnd(14);
  try {
    const res = await fetch(`https://gateway.thegraph.com/api/subgraphs/id/${entry.subgraphId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: composeDocument(SELECTION) }),
    });
    const body = (await res.json()) as {
      data?: { _meta?: { deployment: string; block: { number: number }; hasIndexingErrors: boolean }; lendingProtocols?: Record<string, string>[] };
      errors?: { message: string }[];
    };

    if (body.errors?.length) throw new Error(body.errors[0]!.message);
    const meta = body.data?._meta;
    const row = body.data?.lendingProtocols?.[0];
    if (!meta) throw new Error("no _meta — cannot establish provenance");
    if (!row) throw new Error("empty result set");

    // The substitution check that graph-guard enforces: a subgraph redeployed
    // under the same name serves a different deployment hash.
    if (meta.deployment !== entry.deploymentId) {
      throw new Error(`deployment drift — pinned ${entry.deploymentId}, served ${meta.deployment}`);
    }
    if (meta.hasIndexingErrors) throw new Error("subgraph reports indexing errors");

    const lag = head - meta.block.number;
    const stale = lag > FRESHNESS_BLOCKS;
    const tvl = Math.round(Number(row.totalValueLockedUSD)).toLocaleString("en-US");
    const mark = stale ? `${c.yellow}!${c.reset}` : `${c.green}✓${c.reset}`;

    console.log(`  ${mark} ${c.cyan}${label}${c.reset} utilization ${c.bold}${utilization(row).toFixed(2)}%${c.reset}  ${c.grey}TVL $${tvl}${c.reset}`);
    console.log(`    ${c.grey}${entry.deploymentId}  lag ${lag} blocks${stale ? ` — STALE, would fail closed` : ""}${c.reset}`);
    if (stale) failures++;
  } catch (err) {
    failures++;
    console.log(`  ${c.red}✗ ${label}${c.reset} ${c.red}${(err as Error).message}${c.reset}`);
  }
}

console.log();
if (failures === 0) {
  console.log(`${c.green}All ${PINNED.length} pinned deployments healthy.${c.reset} ${c.grey}One selection set, one derivation, four protocols — the schema is the reason.${c.reset}\n`);
} else {
  console.log(`${c.red}${failures} of ${PINNED.length} unusable.${c.reset} ${c.grey}The verifier fails closed on these rather than reading degraded data.${c.reset}\n`);
  process.exitCode = 1;
}
