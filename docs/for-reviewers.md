# For sponsor reviewers

A guided path through the parts of Perjury that use each partner technology, so you don't have to go looking. Every link is line-anchored to a fixed commit.

**What the project does, in one line:** an AI agent posts a claim with a bond, a randomly assigned peer agent independently re-derives the answer, a confidential workflow compares them privately and publishes only a verdict, and a false claim costs the agent its bond and its ENS reputation.

**Run it yourself:** `npx tsx scripts/verify-pinned.ts` (8s, no keys beyond a Graph API key) is the fastest thing to run. `npx tsx agents/runner/scene2.ts panel-1` is the full story but takes ~7 minutes of real chain time.

---

## Chainlink — Confidential Workflows and VRF v2.5

**Start here:** [`cre/tribunal/workflow.ts#L279-L374`](https://github.com/krishnan74/perjury/blob/ab078d1/cre/tribunal/workflow.ts#L279-L374) — the entire confidential handler.

Read it in this order:

| What | Where |
|---|---|
| TEE handler registered — `cre.handlerInTee(..., [{tee:'nitro', regions:['us-west-2']}])` | [workflow.ts#L376-L384](https://github.com/krishnan74/perjury/blob/ab078d1/cre/tribunal/workflow.ts#L376-L384) |
| Vault DON secret fetched **inside** the enclave — binds the evidence commitment | [workflow.ts#L282-L285](https://github.com/krishnan74/perjury/blob/ab078d1/cre/tribunal/workflow.ts#L282-L285) |
| Confidential HTTP — both agents' sealed evidence enters here and never leaves | [workflow.ts#L287-L301](https://github.com/krishnan74/perjury/blob/ab078d1/cre/tribunal/workflow.ts#L287-L301) |
| Provenance re-validated inside the enclave, not taken on the agents' word |  see `provenanceOk` in the same file |
| The boundary — what crosses back out via `usingTheDons()`, and what deliberately doesn't | [workflow.ts#L340-L374](https://github.com/krishnan74/perjury/blob/ab078d1/cre/tribunal/workflow.ts#L340-L374) |
| VRF v2.5 request — struct form, `ExtraArgsV1`, `uint256` subscription id | [WitnessRoster.sol#L233-L256](https://github.com/krishnan74/perjury/blob/ab078d1/contracts/src/WitnessRoster.sol#L233-L256) |
| Report receiver — one immutable authorized sender, no setter | [VerdictSink.sol#L21-L56](https://github.com/krishnan74/perjury/blob/ab078d1/contracts/src/VerdictSink.sol#L21-L56) |

**Three things worth knowing before you judge it:**

- Provenance validation lives **inside** the enclave on purpose: a party's provenance carries its `queryHash`, which fingerprints its methodology, so checking it anywhere public would leak the thing the design exists to protect.
- Only *data* is confidential, and the code says so where it matters. The adjudication rule is in the workflow binary and is therefore public — deliberately, because a tribunal whose procedure is secret is not a tribunal. Sealed inputs, public rule, public verdict.
- The report arrives from a **Forwarder**, not the workflow owner. `CRE_REPORT_WRITER` is immutable, so we measured the address with a throwaway probe rather than guessing it into a contract we could not change. [ADR 0006](decisions.md) records that we declined Chainlink's suggestion to add a setter, and why.
- **Adjudication has never run inside a real enclave.** `cre workflow simulate` executes locally. Captured output and the simulator's own banner saying so: [cre-execution-log.md](cre-execution-log.md).

---

## ENS — ENSv2 and Enhanced Access Control

**Start here:** [`PerjuryStandingWriter.sol#L50-L67`](https://github.com/krishnan74/perjury/blob/ab078d1/contracts/src/PerjuryStandingWriter.sol#L50-L67) — the only function in the system that can write an agent's reputation.

| What | Where |
|---|---|
| The single mutating path — one record key, no reachable `setAddr`/`setOwner`/role call | [PerjuryStandingWriter.sol#L50-L67](https://github.com/krishnan74/perjury/blob/ab078d1/contracts/src/PerjuryStandingWriter.sol#L50-L67) |
| Reads go through ENSIP-10 `resolve()` — `text()` reverts on a Permissioned Resolver | [ENSTextStandingReader.sol#L38-L68](https://github.com/krishnan74/perjury/blob/ab078d1/contracts/src/ens/ENSTextStandingReader.sol#L38-L68) |
| Per-key EAC scoping — `grantSetterRoles`, then revoke root, then revoke the operator | [configure-eac.ts#L54-L105](https://github.com/krishnan74/perjury/blob/ab078d1/scripts/configure-eac.ts#L54-L105) |
| Reputation gates eligibility with no cache and no cron — an unreadable record is ineligible | [WitnessRoster.sol#L213-L232](https://github.com/krishnan74/perjury/blob/ab078d1/contracts/src/WitnessRoster.sol#L213-L232) |

**Two keys, two writers** — the part worth reading closely. `com.perjury.agent-standing` is writable only by the tribunal; `com.perjury.agent-address`, which says whose reputation a record is, is writable only by the namespace operator and explicitly **not** by the tribunal. If one contract held both, a slashed identity could be moved onto a clean name. `npx tsx scripts/prove-name-binding.ts` shows registration refusing a name the caller was not issued — two reverts and one success, on-chain.

**The single thing to check, if you check one thing:** the operator that deployed every contract, owns `perjury.eth`, and held the role admin **cannot write the standing record**. It reverts with `EACUnauthorizedAccountRoles`. The restriction is a permission, not a policy — there is no owner, pause, proxy or address setter anywhere in the protocol to route around it.

The write is scoped to a single key (`com.perjury.agent-standing`). The same contract attempting to write `avatar` on the same name is refused.

---

## The Graph — Subgraph MCP, standardized schemas, and corroboration

**Start here:** [`packages/graph-client/src/index.ts#L264-L302`](https://github.com/krishnan74/perjury/blob/ab078d1/packages/graph-client/src/index.ts#L264-L302) — `queryCorroborated`, the read every agent uses.

| What | Where |
|---|---|
| Corroborated read — every independent deployment of a protocol, then agreement | [graph-client#L264-L302](https://github.com/krishnan74/perjury/blob/ab078d1/packages/graph-client/src/index.ts#L264-L302) |
| The rule: independent indexers disagreeing → `Unverifiable`, never a resolved winner | [graph-guard#L170-L205](https://github.com/krishnan74/perjury/blob/ab078d1/packages/graph-guard/src/index.ts#L170-L205) |
| One schema-level derivation serving every protocol — no per-protocol branch | [graph-client#L168-L204](https://github.com/krishnan74/perjury/blob/ab078d1/packages/graph-client/src/index.ts#L168-L204) |
| Claim and verification pinned to one block — `block: {number: N}` injected into `_meta` and the root field | [graph-client#L95-L133](https://github.com/krishnan74/perjury/blob/ab078d1/packages/graph-client/src/index.ts#L95-L133) |
| Provenance gate — pinning, freshness, indexing errors, empty result sets | [graph-guard#L64-L140](https://github.com/krishnan74/perjury/blob/ab078d1/packages/graph-guard/src/index.ts#L64-L140) |
| Subgraph MCP over SSE — the witness's discovery path | [mcp-client#L10-L45](https://github.com/krishnan74/perjury/blob/ab078d1/packages/mcp-client/src/index.ts#L10-L45) |
| The agent composing its own GraphQL, not running a hardcoded query | [witness#L55-L129](https://github.com/krishnan74/perjury/blob/ab078d1/agents/witness/src/index.ts#L55-L129) |
| Pinned deployments, with corroborators | [pinned-deployments.json](https://github.com/krishnan74/perjury/blob/ab078d1/packages/shared/src/pinned-deployments.json) |

**Two claims, both runnable:**

`npx tsx scripts/verify-pinned.ts` — two selection sets answered by 13 deployments across two Messari schema families (lending and DEX) and five chains. It prints the query documents it used. There is no per-protocol or per-chain branch anywhere in the verification path, so adding a protocol, a chain or a whole schema family is a data change.

`npx tsx scripts/prove-corroboration.ts` — two independent deployments of Morpho Aave V3, same schema, **identical block**, 488 bps apart. A deployment id is a content hash of the mapping code, so those are two independent derivations of the same chain state, and their disagreement means the fact is contested. The protocol returns `Unverifiable` and convicts nobody. An RPC cannot offer this — it has exactly one derivation.

**One block, both sides.** The claimant records the block it read at, and the witness, the tribunal and the appeal panel all replay against that same block. Without it, a metric that legitimately moved between the two reads was indistinguishable from a lie — the same failure a wider tolerance would have papered over. A pinned read skips the staleness check on purpose: the pin *is* the freshness contract.

**Honest limit:** only one of the 13 pinned deployments has a second independent index. Everywhere else the read is stamped `single-source` and the weaker guarantee travels with the verdict.

**What multi-chain cost:** two tolerances here were expressed in blocks, which is only meaningful on one chain — 50 blocks is ten minutes on Ethereum and twelve seconds on Arbitrum. Both are now expressed in seconds and converted per chain, and assertions carry the chain they were read from. See [feedback/the-graph.md](feedback/the-graph.md) items 8 and 9.

---

## If you have five more minutes

| | |
|---|---|
| Every demo transaction, rebuildable from chain | [TX_HASHES.md](TX_HASHES.md) · `npx tsx scripts/collect-evidence.ts` |
| What we got wrong and how it was caught | [build-log.md](build-log.md) |
| Decisions with the options we rejected | [decisions.md](decisions.md) |
| Attack surface, including what is still open | [threat-audit.md](threat-audit.md) |
| What the mechanism does **not** solve | [design.md §6](design.md) |
| How AI was used, and where it wasn't | [ai-usage.md](ai-usage.md) |
| Developer feedback per track, written as we hit it | [feedback/](feedback/) |
