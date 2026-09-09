/**
 * Demonstrates the correlated-error hole, and the mechanism that closes it.
 *
 *   npx tsx scripts/prove-corroboration.ts
 *
 * Perjury's premise is that a second agent independently re-derives a claim. But
 * if both agents read the same subgraph they have re-derived the *query* while
 * sharing the *derivation* — a mapping bug yields two honest agents confidently
 * agreeing on a wrong number, and the protocol pays out on it. We documented
 * that hole (docs/design.md §6) before we could close it.
 *
 * A Graph deployment id is a content hash of the mapping code, so two
 * deployments of one protocol are two independent derivations of the same chain
 * state. This script reads both, at the same block, and shows the protocol
 * refusing to convict when they disagree.
 */
import { PINNED, chainHead, composeDocument, deriveMetric, pinnedFor } from "@perjury/graph-client";
import { CORROBORATION_BPS, corroborate, type CorroboratingRead } from "@perjury/graph-guard";
import { isUnverifiable } from "@perjury/graph-guard";

const SELECTION = `lendingProtocols(first: 1) { name totalDepositBalanceUSD totalBorrowBalanceUSD totalValueLockedUSD }`;
const METRIC = "utilizationRatio";
const KEY = process.env.GRAPH_STUDIO_KEY ?? "";
if (!KEY) throw new Error("GRAPH_STUDIO_KEY unset — live Gateway access is required");

const c = {
  reset: "\x1b[0m", grey: "\x1b[90m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", bold: "\x1b[1m", cyan: "\x1b[36m", magenta: "\x1b[35m",
};

const doc = composeDocument(SELECTION);
const head = await chainHead();

async function read(subgraphId: string): Promise<{ value: number; block: number; deployment: string; tvl: number }> {
  const res = await fetch(`https://gateway.thegraph.com/api/subgraphs/id/${subgraphId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: doc }),
  });
  const body = (await res.json()) as any;
  if (body.errors?.length) throw new Error(body.errors[0].message);
  const meta = body.data._meta;
  return {
    value: deriveMetric(body.data, METRIC),
    block: meta.block.number,
    deployment: meta.deployment,
    tvl: Number(body.data.lendingProtocols[0].totalValueLockedUSD),
  };
}

console.log(`\n${c.bold}Corroboration across independently-indexed deployments${c.reset}`);
console.log(`${c.grey}mainnet head ${head} · tolerance ${CORROBORATION_BPS} bps${c.reset}\n`);

for (const entry of PINNED) {
  const corroborators = entry.corroborators ?? [];
  process.stdout.write(`${c.cyan}${entry.protocolName}${c.reset} ${c.grey}(${1 + corroborators.length} deployment${corroborators.length ? "s" : ""})${c.reset}\n`);

  if (corroborators.length === 0) {
    // Not a failure. Most protocols have exactly one indexer, and refusing to
    // verify without a second would make the protocol useless rather than
    // rigorous. The read still happens; it is stamped single-source and that
    // travels with the verdict.
    console.log(`  ${c.yellow}single-source${c.reset} ${c.grey}— no independent index exists; recorded, not hidden${c.reset}\n`);
    continue;
  }

  try {
    const primary = await read(entry.subgraphId);
    const others = await Promise.all(corroborators.map((x) => read(x.subgraphId)));

    console.log(`  ${c.grey}${primary.deployment}${c.reset}  ${c.bold}${primary.value.toFixed(4)}%${c.reset} ${c.grey}@ block ${primary.block}  TVL $${Math.round(primary.tvl).toLocaleString("en-US")}${c.reset}`);
    for (const o of others) {
      console.log(`  ${c.grey}${o.deployment}${c.reset}  ${c.bold}${o.value.toFixed(4)}%${c.reset} ${c.grey}@ block ${o.block}  TVL $${Math.round(o.tvl).toLocaleString("en-US")}${c.reset}`);
    }

    const asRead = (r: typeof primary): CorroboratingRead => ({
      provenance: {
        deploymentId: r.deployment, indexedBlock: r.block, chainHead: head,
        queriedAt: Date.now(), queryHash: "", hasIndexingErrors: false,
      },
      value: r.value,
    });

    const result = corroborate(asRead(primary), others.map(asRead));
    console.log(`  ${c.green}corroborated${c.reset} ${c.grey}— ${result.sources} independent derivations agree within ${result.maxDivergenceBps.toFixed(1)} bps${c.reset}\n`);
  } catch (err) {
    if (!isUnverifiable(err)) throw err;
    console.log(`\n  ${c.red}${c.bold}UNVERIFIABLE${c.reset} ${c.red}${err.message}${c.reset}`);
    console.log(`  ${c.grey}Same protocol, same block, same schema — different mapping code.${c.reset}`);
    console.log(`  ${c.grey}The indexers disagree about what the chain says, so the fact is${c.reset}`);
    console.log(`  ${c.grey}contested and nobody is convicted on it. The protocol does not pick${c.reset}`);
    console.log(`  ${c.grey}a winner among disagreeing sources — that would invent a fact the${c.reset}`);
    console.log(`  ${c.grey}data layer does not support.${c.reset}\n`);
  }
}

console.log(`${c.grey}Without this, a claimant and its witness could read one buggy subgraph,${c.reset}`);
console.log(`${c.grey}agree perfectly, and the protocol would slash nobody while calling a${c.reset}`);
console.log(`${c.grey}wrong number verified. Only a content-addressed index makes the${c.reset}`);
console.log(`${c.grey}derivation itself checkable — an RPC has exactly one.${c.reset}\n`);
