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
 * As evidence: there is ONE selection set per standardized schema family, and
 * every deployment in that family answers it unmodified — across protocols and
 * across chains. There is no per-protocol or per-chain branch here, in the
 * agents, or in the tribunal's recompute step. That is the whole argument for
 * standardization: adding a protocol, a chain, or an entire schema family is a
 * data change, not a code change.
 *
 * Freshness is expressed in seconds and converted per chain. A block-count
 * window is only meaningful on one chain — 50 blocks is ten minutes on Ethereum
 * and twelve seconds on Arbitrum.
 */
import {
  FRESHNESS_SECONDS,
  PINNED,
  chainHead,
  composeDocument,
  deriveMetric,
  freshnessBlocksFor,
  rootEntityFor,
} from "@perjury/graph-client";

/**
 * One selection per SCHEMA FAMILY — not per protocol, and not per chain.
 * Thirteen deployments across five chains answer these two strings unmodified.
 */
const SELECTION: Record<string, string> = {
  "messari-lending": `lendingProtocols(first: 1) { id name totalDepositBalanceUSD totalBorrowBalanceUSD totalValueLockedUSD }`,
  "messari-dex": `dexAmmProtocols(first: 1) { id name totalValueLockedUSD cumulativeVolumeUSD }`,
};

/**
 * The headline figure per family, derived by the same function the agents use.
 *
 * DEX shows TVL rather than turnover deliberately. Turnover divides a
 * *cumulative* volume by a *current* TVL, and several live deployments carry
 * implausible cumulative figures — Curve on Ethereum reports a cumulative volume
 * that implies a turnover of ~5e14 against a $4.8B TVL. Which is itself the
 * point of corroboration, but in a health check an absurd number reads as a bug
 * in the checker rather than in the data.
 */
const METRIC: Record<string, string> = {
  "messari-lending": "utilizationRatio",
  "messari-dex": "totalValueLockedUSD",
};

/** Per-family formatting, so a percentage and a dollar figure both stay legible. */
const FORMAT: Record<string, (n: number) => string> = {
  "messari-lending": (n) => `${n.toFixed(2)}%`,
  "messari-dex": (n) => `$${Math.round(n).toLocaleString("en-US")}`,
};

const KEY = process.env.GRAPH_STUDIO_KEY ?? "";
if (!KEY) throw new Error("GRAPH_STUDIO_KEY unset — live Gateway access is required");

const c = {
  reset: "\x1b[0m", grey: "\x1b[90m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", bold: "\x1b[1m", cyan: "\x1b[36m", magenta: "\x1b[35m",
};

const chains = [...new Set(PINNED.map((e) => e.chain))];
const heads: Record<string, number> = {};
await Promise.all(chains.map(async (ch) => { heads[ch] = await chainHead(ch); }));

const families = [...new Set(PINNED.map((e) => e.schema))];
console.log(`\n${c.bold}${families.length} query patterns, ${PINNED.length} deployments, ${chains.length} chains, live Gateway${c.reset}`);
console.log(`${c.grey}freshness ${FRESHNESS_SECONDS}s, converted per chain — a block count means different things on different chains${c.reset}\n`);
for (const f of families) {
  console.log(`${c.cyan}${f}${c.reset}`);
  console.log(`${c.grey}${composeDocument(SELECTION[f]!)}${c.reset}\n`);
}

let failures = 0;

for (const entry of PINNED) {
  const label = entry.protocolName.padEnd(24);
  const selection = SELECTION[entry.schema];
  if (!selection) { console.log(`  ${c.red}✗ ${label} unknown schema ${entry.schema}${c.reset}`); failures++; continue; }

  try {
    const res = await fetch(`https://gateway.thegraph.com/api/subgraphs/id/${entry.subgraphId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: composeDocument(selection) }),
    });
    const body = (await res.json()) as {
      data?: Record<string, unknown> & { _meta?: { deployment: string; block: { number: number }; hasIndexingErrors: boolean } };
      errors?: { message: string }[];
    };

    if (body.errors?.length) throw new Error(body.errors[0]!.message);
    const meta = body.data?._meta;
    const rows = body.data?.[rootEntityFor(entry.schema)] as unknown[] | undefined;
    if (!meta) throw new Error("no _meta — cannot establish provenance");
    if (!rows || rows.length === 0) throw new Error("empty result set");

    // The substitution check graph-guard enforces: a subgraph redeployed under
    // the same name serves a different deployment hash.
    if (meta.deployment !== entry.deploymentId) {
      throw new Error(`deployment drift — pinned ${entry.deploymentId}, served ${meta.deployment}`);
    }
    if (meta.hasIndexingErrors) throw new Error("subgraph reports indexing errors");

    // Lag is clamped: an index reporting ahead of our RPC's view of the head is
    // not stale, it just means the two disagree about the tip.
    const lag = Math.max(0, heads[entry.chain]! - meta.block.number);
    const allowed = freshnessBlocksFor(entry.chain);
    const stale = lag > allowed;
    const value = deriveMetric(body.data, METRIC[entry.schema]!);
    const mark = stale ? `${c.yellow}!${c.reset}` : `${c.green}✓${c.reset}`;
    const corrob = (entry.corroborators ?? []).length;

    console.log(`  ${mark} ${c.cyan}${label}${c.reset}${c.grey}${entry.chain.padEnd(9)}${c.reset} ${c.bold}${FORMAT[entry.schema]!(value)}${c.reset}`);
    console.log(`    ${c.grey}${entry.deploymentId}  lag ${lag}/${allowed} blocks${stale ? " — STALE, would fail closed" : ""}${corrob ? `  ${c.magenta}+${corrob} corroborator${c.reset}` : ""}${c.reset}`);
    if (stale) failures++;
  } catch (err) {
    failures++;
    console.log(`  ${c.red}✗ ${label}${c.reset} ${c.red}${(err as Error).message}${c.reset}`);
  }
}

console.log();
if (failures === 0) {
  console.log(`${c.green}All ${PINNED.length} pinned deployments healthy.${c.reset} ${c.grey}${families.length} selection sets and one derivation cover ${PINNED.length} deployments across ${chains.length} chains. Adding a protocol, a chain, or a schema family is a data change.${c.reset}\n`);
} else {
  console.log(`${c.red}${failures} of ${PINNED.length} unusable.${c.reset} ${c.grey}The verifier fails closed on these rather than reading degraded data.${c.reset}\n`);
  process.exitCode = 1;
}
