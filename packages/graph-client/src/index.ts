// Live Graph Gateway client. Every read passes through graph-guard before any
// caller sees it — see docs/design.md §5.3.
import { guard, type PinnedDeployment, type RawGraphResponse } from "@perjury/graph-guard";
import { UnverifiableError, type Provenance } from "@perjury/shared";
import pinned from "@perjury/shared/pinned-deployments.json" with { type: "json" };

const GATEWAY = "https://gateway.thegraph.com/api/subgraphs/id";
/** Chain head source. The subgraphs index mainnet, so staleness is measured against it. */
const CHAIN_RPC = "https://ethereum-rpc.publicnode.com";

export interface PinnedEntry {
  subject: string;
  schema: string;
  subgraphId: string;
  deploymentId: string;
  protocolName: string;
  metrics: string[];
}

export const PINNED: PinnedEntry[] = pinned.deployments as PinnedEntry[];

export function pinnedFor(subject: string): PinnedEntry {
  const e = PINNED.find((p) => p.subject === subject);
  if (!e) throw new UnverifiableError("deployment-mismatch", `no pinned deployment for "${subject}"`);
  return e;
}

/** Current mainnet head, used to measure how far the index lags. */
export async function chainHead(): Promise<number> {
  const res = await fetch(CHAIN_RPC, {
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
export function composeDocument(selectionOrDocument: string): string {
  let sel = selectionOrDocument.trim();
  if (sel.startsWith("query")) sel = sel.slice(sel.indexOf("{"));
  if (sel.startsWith("{") && sel.endsWith("}")) sel = sel.slice(1, -1);
  // Remove any _meta block the caller wrote, wherever it landed.
  sel = stripMeta(sel);
  return `{ _meta { deployment block { number } hasIndexingErrors } ${sel.trim()} }`;
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

  const [res, head] = await Promise.all([
    fetch(`${GATEWAY}/${entry.subgraphId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: withMeta, variables }),
    }),
    chainHead(),
  ]);

  const body = (await res.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
  if (body.errors?.length) {
    throw new UnverifiableError("no-data", `gateway error: ${body.errors[0]?.message}`);
  }
  const meta = body.data?._meta as RawGraphResponse["_meta"];

  const raw: RawGraphResponse = {
    _meta: meta,
    chainHead: head,
    queryDocument: withMeta,
    variables,
    data: body.data ?? null,
  };

  const provenance = guard(raw, {
    subject: entry.subject,
    deploymentId: entry.deploymentId,
  } satisfies PinnedDeployment);

  return { data: body.data as T, provenance };
}
