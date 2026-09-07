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

  // _meta is requested alongside every query so provenance travels with the data.
  const withMeta = document.includes("_meta")
    ? document
    : document.replace(/^\s*\{/, "{ _meta { deployment block { number } hasIndexingErrors }");

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
