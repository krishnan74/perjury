# Developer feedback — The Graph

From building Perjury (ETHOnline 2026). The Graph is the only data source in our verification path: an LLM agent independently re-derives a finding from live subgraph data, and that finding is what a TEE tribunal compares against a claim. So we cared unusually much about two things — that an agent can *discover and reason* over subgraphs rather than run a hardcoded query, and that we can prove the data was fresh and came from the deployment we expected.

Written to be useful rather than polite.

---

## What worked well

- **Gateway access was instant.** Studio key created, first query returned live data on the first attempt. Nothing else in this project was that frictionless.
- **Subgraph MCP is the right idea, well executed.** Nine tools, and the split between discovery (`search_subgraphs_by_keyword`, `get_schema_by_*`) and execution (`execute_query_by_*`) maps exactly onto how an agent actually works: find candidates, read the schema, compose a query.
- **`_meta` makes provenance checking practical.** Exposing `deployment`, `block.number` and `hasIndexingErrors` on every subgraph is what allowed us to build a guard that *rejects* untrustworthy data rather than silently degrading. Without `_meta.deployment` we could not have pinned deployments at all.
- **`execute_query_by_ipfs_hash` deserves specific praise.** It resolves a tension we expected to have to live with: the agent roams freely during discovery, then executes against the immutable deployment hash we pin. Agent autonomy and provenance enforcement don't have to be traded off.
- **Messari standardized schemas are identical across protocols in practice.** We pinned Aave v2 and v3 and the same query shape works against both unchanged. That is what lets two parties derive comparable assertions without agreeing a schema in advance, which our adjudication step depends on.

---

## 1. No chain head in `_meta` — staleness needs an external RPC *(highest impact)*

`_meta.block.number` gives the **indexed** block, which tells you where the subgraph is but not how far behind it is. To measure lag you need the chain head, which means a second, non-Graph dependency — we fetch `eth_blockNumber` from a public RPC and compute the delta.

**Why it matters.** For any agent that must decide *whether to trust* data rather than merely consume it, lag is the deciding number. Requiring an external RPC to compute it adds a dependency outside The Graph's guarantees, and different teams will implement it differently and inconsistently.

**Suggestion.** Expose the chain head — or the lag directly — in `_meta`, e.g. `_meta { block { number } chainHeadBlock { number } }`. This would make "is this data fresh enough" answerable from a single query, and would make freshness checks uniform across the ecosystem.

## 2. MCP parameters are snake_case; this isn't obvious

`execute_query_by_ipfs_hash` takes `ipfs_hash`, not `ipfsHash`. We lost a debug cycle to `MCP error -32602: missing field 'ipfs_hash'`, having reasonably guessed camelCase from a JavaScript-facing tool.

**Suggestion.** Show a complete worked call for each tool in the MCP docs, with exact parameter names. The error message is good — it names the missing field — but the convention should be discoverable before the first call.

## 3. `/mcp` 404s, `/sse` works

`https://subgraphs.mcp.thegraph.com/mcp` returns 404 while `/sse` returns 200 `text/event-stream`. Docs and third-party guides reference both shapes. Worth documenting the canonical endpoint, and whether streamable-HTTP transport is planned alongside SSE.

## 4. Messari `Protocol` vs `LendingProtocol` is a discoverability trap

Our first query was `{ protocols { name totalBorrowBalanceUSD } }` — reasonable, since `protocols` exists and is the obvious entry point. It fails with `Type 'Protocol' has no field 'totalBorrowBalanceUSD'`, because the lending fields live on the `LendingProtocol` entity while `Protocol` is the interface. Introspection found it quickly, but an agent reasoning from the entity list alone would hit this too.

**Suggestion.** In the standardized-schema docs, note which entity carries the domain-specific metrics per schema, and that the shared interface deliberately doesn't. This matters more than usual for AI tooling, since an agent picks the entity from names alone.

## 5. Deployment IDs vs subgraph IDs in tooling

Discovery returns IPFS hashes, and some tools take a deployment ID (`0x…`) while others take the IPFS hash (`Qm…`). Both are called "deployment" in different places. We pin IPFS hashes because that is what `_meta.deployment` returns, which makes comparison trivial — but the naming took a moment to disentangle.

**Suggestion.** A short glossary — subgraph ID vs deployment ID vs IPFS hash, which tool takes which, which one `_meta` returns — would remove the ambiguity.

## 6. Search results don't say which standardized schema a subgraph serves

Adding protocols to our pinned set meant finding more Messari-standardized lending subgraphs. `search_subgraphs_by_keyword` returns `displayName`, subgraph id and IPFS hash — but nothing about which schema the subgraph implements. There is no way to ask "which subgraphs serve the Messari lending schema", so we searched by protocol name we already suspected, then queried each candidate with a probe selection to find out whether `lendingProtocols` existed on it. That works, but it is guess-and-check, and it means discovery of standardized subgraphs is driven by already knowing which protocols to look for.

This is the one piece of friction that pushed directly against the standardization story. The value of a shared schema is that you can write one query for many protocols — but finding the set of protocols that answer it is currently manual.

**Suggestion.** Tag subgraphs with the standardized schema they implement and expose it as a filter — `search_subgraphs_by_keyword` returning a `schema` field, or a `list_subgraphs_by_schema("messari-lending")` tool. For AI tooling this matters more than for humans: an agent asked to "compare utilization across lending protocols" currently cannot enumerate the candidate set without being told the protocol names first.

**What worked despite it:** once found, all four subgraphs answered a byte-identical query and returned identical field semantics, with zero indexing lag. The schema delivered exactly what it promises — the gap is discovery, not the standard.

## 7. Deployment plurality per protocol is thin, and it is the thing integrity checks need most

The property we ended up relying on most is one we have not seen discussed: **a deployment id is a content hash of the mapping code**, so two deployments indexing the same protocol are two independent derivations of the same chain state. That makes the derivation itself checkable, which no RPC can offer — an RPC has exactly one derivation, so reading it twice buys nothing.

We use it to close a hole we had previously documented as unfixable: if a claimant and its witness read the same subgraph, they have independently re-derived the *query* while sharing the *derivation*, and a mapping bug yields two honest agents confidently agreeing on a wrong number. Requiring independently-indexed deployments to agree closes that, and disagreement is treated as a contested fact rather than resolved to a majority.

It works, and we found a live case immediately. Two deployments of Morpho Aave V3, both on the Messari lending schema, read at an identical block:

```
QmVpuZKrjhjHx2hCtpGNaW29ZYq4Xt2GyPLpiMDP2YTAHE   utilization 1.6742%   TVL $25,196
Qme9KY9Nm5YaRsew1CjR5rtwZMgQAG3SzxRmqevtVW7R83   utilization 1.5926%   TVL $26,487
```

488 bps apart with block skew eliminated and the schema identical, so the difference is the mapping code. We are not claiming either is wrong — we cannot tell, which is exactly the point.

**The gap.** Of the eighteen Messari-lending subgraphs we could find, only Morpho Aave V3 has a second independent index. Aave v3, Compound III and Spark Lend each have one, so for those our check degrades to recording `single-source`. The most valuable integrity property available in the network is therefore unavailable for the largest protocols.

**Suggestions.** Surface plurality as a first-class attribute — "N independent deployments index this protocol" — so a consumer can discover corroboration is possible without probing. And consider it a curation signal worth encouraging: a second index of a major protocol is low-glamour work with real integrity value, and right now nothing in the network makes that value visible. Divergence between deployments is also useful data in its own right; if the network surfaced it, subgraph bugs would be findable by anyone rather than only by teams that happen to query two.

---

## What we'd highlight to other teams

The combination that made this work: **discover through MCP, execute against a pinned deployment hash, verify with `_meta` before trusting the result.** An LLM agent cannot be relied upon to report honestly on whether its own data was stale, so that check has to sit outside the agent — and The Graph exposes exactly the fields needed to do it. That is a genuinely strong story for AI use cases, and it is not obvious from the docs that it's possible.