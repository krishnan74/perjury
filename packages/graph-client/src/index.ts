// Live Graph Gateway client. Every read passes through graph-guard before any
// caller sees it — see docs/design.md §5.3.
import {
  corroborate,
  guard,
  type CorroboratingRead,
  type PinnedDeployment,
  type RawGraphResponse,
} from "@perjury/graph-guard";
import { UnverifiableError, type Provenance } from "@perjury/shared";
import pinned from "@perjury/shared/pinned-deployments.json" with { type: "json" };

const GATEWAY = "https://gateway.thegraph.com/api/subgraphs/id";

/**
 * Freshness expressed in TIME, not blocks.
 *
 * A block-count window is only meaningful on one chain. Ethereum's 50-block
 * window is ten minutes; the same 50 blocks is twelve seconds on Arbitrum, so a
 * perfectly healthy L2 index reads as stale. Measured live: a Uniswap v3
 * Arbitrum deployment sat 149 blocks behind — a hard fail under a 50-block rule,
 * and about 37 seconds in reality.
 *
 * So the window is 600 seconds everywhere and converted per chain. On Ethereum
 * that is exactly the 50 blocks we already used, so mainnet behaviour is
 * unchanged.
 */
export const FRESHNESS_SECONDS = 600;

/** Head source and nominal block time per chain, used to convert the window. */
export const CHAINS: Record<string, { rpc: string; blockTimeSeconds: number }> = {
	ethereum: { rpc: "https://ethereum-rpc.publicnode.com", blockTimeSeconds: 12 },
	polygon: { rpc: "https://polygon-bor-rpc.publicnode.com", blockTimeSeconds: 2 },
	arbitrum: { rpc: "https://arbitrum-one-rpc.publicnode.com", blockTimeSeconds: 0.25 },
	optimism: { rpc: "https://optimism-rpc.publicnode.com", blockTimeSeconds: 2 },
	gnosis: { rpc: "https://gnosis-rpc.publicnode.com", blockTimeSeconds: 5 },
	base: { rpc: "https://base-rpc.publicnode.com", blockTimeSeconds: 2 },
};

/** Blocks of lag tolerated on a given chain for the shared time window. */
export function freshnessBlocksFor(chain: string): number {
	const c = CHAINS[chain];
	if (!c) throw new UnverifiableError("deployment-mismatch", `no RPC configured for chain "${chain}"`);
	return Math.ceil(FRESHNESS_SECONDS / c.blockTimeSeconds);
}

export interface Corroborator {
  subgraphId: string;
  deploymentId: string;
  note?: string;
}

export interface PinnedEntry {
  subject: string;
  /** Chain the subgraph indexes. Determines which head staleness is measured against. */
  chain: string;
  /** Standardized schema family — "messari-lending" or "messari-dex". */
  schema: string;
  subgraphId: string;
  deploymentId: string;
  protocolName: string;
  metrics: string[];
  /** Other deployments independently indexing the same protocol. Often empty. */
  corroborators?: Corroborator[];
}

export const PINNED: PinnedEntry[] = pinned.deployments as PinnedEntry[];

export function pinnedFor(subject: string): PinnedEntry {
  const e = PINNED.find((p) => p.subject === subject);
  if (!e) throw new UnverifiableError("deployment-mismatch", `no pinned deployment for "${subject}"`);
  return e;
}

/** Current head of a given chain, used to measure how far an index lags. */
export async function chainHead(chain = "ethereum"): Promise<number> {
  const rpc = CHAINS[chain]?.rpc;
  if (!rpc) throw new UnverifiableError("deployment-mismatch", `no RPC configured for chain "${chain}"`);
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const json = (await res.json()) as { result?: string };
  if (!json.result) throw new UnverifiableError("missing-meta", "could not read chain head");
  return Number.parseInt(json.result, 16);
}

/**
 * Build a full query document from a selection set, always adding root `_meta`.
 * Accepts either a bare selection ("lendingProtocols { id }") or a full document
 * ("{ lendingProtocols { id } }"), and strips any `_meta` the caller supplied so
 * a nested one cannot break the query.
 */
export function composeDocument(selectionOrDocument: string, atBlock?: number): string {
  let sel = selectionOrDocument.trim();
  if (sel.startsWith("query")) sel = sel.slice(sel.indexOf("{"));
  if (sel.startsWith("{") && sel.endsWith("}")) sel = sel.slice(1, -1);
  // Remove any _meta block the caller wrote, wherever it landed.
  sel = stripMeta(sel);

  if (atBlock === undefined) {
    return `{ _meta { deployment block { number } hasIndexingErrors } ${sel.trim()} }`;
  }

  // Pinned read: both parties must see the chain as it was at one block, so the
  // argument is injected here rather than trusted to the agent's own query. An
  // LLM composed that selection; asking it to remember a block argument would
  // make the guarantee depend on the thing being verified.
  const at = `block: {number: ${atBlock}}`;
  return `{ _meta(${at}) { deployment block { number } hasIndexingErrors } ${withBlockArg(sel.trim(), at)} }`;
}

/**
 * Add a `block:` argument to the root field of a selection set.
 *
 * The selection looks like `entity(first: 1) { ... }` or `entity { ... }`; only
 * the ROOT field takes the argument, so this stops at the first brace or paren
 * and never touches nested selections.
 */
function withBlockArg(selection: string, at: string): string {
  const paren = selection.indexOf("(");
  const brace = selection.indexOf("{");
  if (paren !== -1 && (brace === -1 || paren < brace)) {
    const close = selection.indexOf(")", paren);
    if (close === -1) return selection;
    const args = selection.slice(paren + 1, close).trim();
    return `${selection.slice(0, paren + 1)}${args ? `${args}, ` : ""}${at}${selection.slice(close)}`;
  }
  if (brace === -1) return selection;
  return `${selection.slice(0, brace).trimEnd()}(${at}) ${selection.slice(brace)}`;
}

/** Remove a `_meta { ... }` block by brace matching, not regex. */
function stripMeta(s: string): string {
  const i = s.indexOf("_meta");
  if (i === -1) return s;
  const open = s.indexOf("{", i);
  if (open === -1) return s.slice(0, i) + s.slice(i + 5);
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}") {
      depth--;
      if (depth === 0) return stripMeta(s.slice(0, i) + s.slice(j + 1));
    }
  }
  return s.slice(0, i);
}

export interface GuardedResult<T> {
  data: T;
  provenance: Provenance;
}

/**
 * Reduce a Messari lending response to the single number under dispute.
 *
 * Deliberately deterministic and LLM-free. Corroboration compares independent
 * deployments, so the reduction applied to each must be identical — an LLM
 * interpreting each source separately could paper over a real divergence, or
 * manufacture one. It also has to be schema-level rather than protocol-level,
 * which is what lets one function serve every pinned deployment.
 *
 * Mirrors the tribunal's own recompute in cre/tribunal/workflow.ts; the two are
 * kept in sync deliberately, since the workflow compiles to standalone WASM.
 */
export function deriveMetric(data: unknown, metric: string): number {
  if (data === null || typeof data !== "object") {
    throw new UnverifiableError("no-data", "response was not an object");
  }
  const payload = data as Record<string, unknown>;

  // The entity differs per schema family; everything after this point does not.
  // That is the whole return on a standardized schema — one derivation serves
  // lending and DEX protocols across every chain, with no per-protocol branch.
  const rows = (payload.lendingProtocols ?? payload.dexAmmProtocols) as unknown;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new UnverifiableError("no-data", "no protocol rows to derive from");
  }
  const row = rows[0] as Record<string, string>;
  const num = (k: string): number => {
    const n = Number(row[k]);
    if (!Number.isFinite(n)) {
      throw new UnverifiableError("no-data", `field ${k} missing or non-numeric`);
    }
    return n;
  };

  // Ratios are computed from their components rather than read, so a party
  // cannot assert a ratio its own evidence does not reproduce.
  if (/utilization/i.test(metric)) {
    const deposits = num("totalDepositBalanceUSD");
    if (deposits === 0) throw new UnverifiableError("no-data", "zero deposits — utilization undefined");
    return (num("totalBorrowBalanceUSD") / deposits) * 100;
  }
  if (/turnover/i.test(metric)) {
    const tvl = num("totalValueLockedUSD");
    if (tvl === 0) throw new UnverifiableError("no-data", "zero TVL — turnover undefined");
    return num("cumulativeVolumeUSD") / tvl;
  }
  return num(metric);
}

/** The entity a schema family exposes its protocol-level aggregates on. */
export function rootEntityFor(schema: string): string {
  return schema === "messari-dex" ? "dexAmmProtocols" : "lendingProtocols";
}

/** Execute one guarded read against a specific subgraph/deployment pair. */
async function readOne(
  subject: string,
  subgraphId: string,
  deploymentId: string,
  document: string,
  variables: Record<string, unknown>,
  apiKey: string,
  head: number,
  freshnessBlocks: number,
  atBlock?: number,
): Promise<{ data: Record<string, unknown>; provenance: Provenance }> {
  const res = await fetch(`${GATEWAY}/${subgraphId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: document, variables }),
  });
  const body = (await res.json()) as {
    data?: Record<string, unknown>;
    errors?: { message: string }[];
  };
  if (body.errors?.length) {
    throw new UnverifiableError("no-data", `gateway error: ${body.errors[0]?.message}`);
  }
  const raw: RawGraphResponse = {
    _meta: body.data?._meta as RawGraphResponse["_meta"],
    chainHead: head,
    queryDocument: document,
    variables,
    data: body.data ?? null,
  };
  const provenance = guard(
    raw,
    { subject, deploymentId } satisfies PinnedDeployment,
    Date.now(),
    freshnessBlocks,
    atBlock,
  );
  return { data: body.data as Record<string, unknown>, provenance };
}

/**
 * Read a subject from every deployment that independently indexes it, and
 * return the primary reading only if they agree.
 *
 * `derive` reduces a response to the single number under dispute. It must be the
 * same reduction for every source — that is the whole point: different mapping
 * code, same question, and any disagreement is the indexers', not the caller's.
 *
 * Where no second deployment exists the read still succeeds, stamped
 * single-source. That is deliberate. Plurality is thin across the ecosystem, and
 * refusing to verify anything without it would make the protocol useless rather
 * than rigorous — so the limitation is recorded and travels with the verdict.
 */
export async function queryCorroborated<T>(
  subject: string,
  document: string,
  derive: (data: T) => number,
  variables: Record<string, unknown> = {},
  apiKey: string = process.env.GRAPH_STUDIO_KEY ?? "",
  atBlock?: number,
): Promise<GuardedResult<T>> {
  if (!apiKey) throw new Error("GRAPH_STUDIO_KEY unset — live Gateway access is required");
  const entry = pinnedFor(subject);
  const withMeta = composeDocument(document, atBlock);
  const head = await chainHead(entry.chain);
  const freshness = freshnessBlocksFor(entry.chain);

  const primary = await readOne(
    subject, entry.subgraphId, entry.deploymentId, withMeta, variables, apiKey, head, freshness, atBlock,
  );

  // Read the corroborators in parallel; one that is unreachable or stale must
  // not be silently dropped, so failures propagate.
  const others = await Promise.all(
    (entry.corroborators ?? []).map(async (c): Promise<CorroboratingRead> => {
      const r = await readOne(
        subject, c.subgraphId, c.deploymentId, withMeta, variables, apiKey, head, freshness, atBlock,
      );
      return { provenance: r.provenance, value: derive(r.data as T) };
    }),
  );

  const corroboration = corroborate(
    { provenance: primary.provenance, value: derive(primary.data as T) },
    others,
  );

  return {
    data: primary.data as T,
    provenance: { ...primary.provenance, corroboration },
  };
}

/**
 * Execute a GraphQL query against a pinned subgraph and return it only if
 * provenance and freshness hold. Throws UnverifiableError otherwise — there is
 * no path that returns degraded data.
 */
export async function query<T>(
  subject: string,
  document: string,
  variables: Record<string, unknown> = {},
  apiKey: string = process.env.GRAPH_STUDIO_KEY ?? "",
): Promise<GuardedResult<T>> {
  if (!apiKey) throw new Error("GRAPH_STUDIO_KEY unset — live Gateway access is required");
  const entry = pinnedFor(subject);

  // _meta must be a ROOT field — nesting it inside an entity selection is a
  // GraphQL error, and an LLM composing the whole document gets this wrong. So
  // callers pass a selection set and we compose the document ourselves.
  const withMeta = composeDocument(document);
  const head = await chainHead(entry.chain);

  // Deliberately the same code path as a corroborated read, minus the
  // corroboration. Duplicating it is how the chain-specific head and freshness
  // window would get fixed in one place and stay broken in the other.
  const { data, provenance } = await readOne(
    subject,
    entry.subgraphId,
    entry.deploymentId,
    withMeta,
    variables,
    apiKey,
    head,
    freshnessBlocksFor(entry.chain),
  );

  return { data: data as T, provenance };
}
