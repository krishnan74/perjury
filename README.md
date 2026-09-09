# Perjury

**Verification for AI agent claims.** We trust what agents tell us about their own work, but never check the process behind it. Perjury makes that process independently re-derived by a randomly assigned peer agent, privately adjudicated by a Chainlink CRE Confidential Workflow, and settled with real economic and reputational consequences.

Built for **ETHOnline 2026**. Sepolia testnet.

> **Reviewing this for a sponsor prize?** [**docs/for-reviewers.md**](docs/for-reviewers.md) is a guided path to the exact lines where each partner technology is used, plus the two commands worth running.

> **Status: running end-to-end on Sepolia.** All three demo scenarios have executed on-chain — a true claim settled, a false claim caught and its appeal rejected by a randomly drawn panel, and a collusion attempt structurally throttled. Bonds settle, ENS standing moves, and a slashed agent is excluded from future assignment with no operator in the loop. See [What works today](#what-works-today).

---

## What works today

Verified on live networks, not mocked:

| | Evidence |
|---|---|
| **Bonded claims + settlement** | Deployed on Sepolia (addresses below). Claim 1 submitted, adjudicated `Match`, bond returned, ENS standing 1 → 2 — [settlement tx](https://sepolia.etherscan.io/tx/0x6e930d965125f67b165cd85369dea61ad4aaa2af0cab0afaeb28a61c039f742c) |
| **Randomly assigned witness** | Live Chainlink VRF v2.5: `submitClaim` takes no witness parameter, so the claimant has no code path to influence assignment. Every scene draws a witness that is not the claimant — [fulfilment tx](https://sepolia.etherscan.io/tx/0x99c8504d74aabae2e6cc2dad3e51a527ac250df3405cc831992ed5a3e2daac2b) |
| **Independent re-derivation** | Claimant and witness each query live Aave v3 data through the Subgraph MCP and a pinned deployment; true claim → **Match** (40.43% vs 40.43%), fabricated claim → **Mismatch** (64.70% vs 40.43%) |
| **Provenance enforcement** | Stale index, unpinned deployment, indexing errors or an empty result set all produce `Unverifiable` — never a silent pass |
| **Private adjudication** | CRE Confidential Workflow with a TEE handler (`cre.handlerInTee`); reports delivered on-chain by a Chainlink Forwarder, evidence never published — [execution log](docs/cre-execution-log.md) |
| **Appeal by random panel** | A losing claimant appealed; a second VRF draw seated three agents excluding both parties, upheld the verdict, and cost the appellant its appeal bond too — [panel seated](https://sepolia.etherscan.io/tx/0x5bfbc2223b97c94fcfc70d3b7afcad8650e27516ce9e6598b23a4aa3c75956a0), [settled](https://sepolia.etherscan.io/tx/0x8e9cd2b36a77606105827cb8ad4aee7b81a2218a1e9882d6b0997a01d43486fe) |
| **Reputation only the tribunal can write** | ENSv2 Enhanced Access Control, scoped to a single record key. The operator that deployed every contract and owns `perjury.eth` gets `EACUnauthorizedAccountRoles` when it tries to write standing |
| **Automatic exclusion** | The roster snapshot in the block after settlement shows the slashed agent at standing −3 and ineligible — no operator, no manual step |
| **Two query patterns, 13 deployments, 5 chains** | Messari lending *and* DEX schema families across Ethereum, Polygon, Arbitrum, Optimism and Gnosis, read with one selection set per family and one derivation — no per-protocol or per-chain code. `npx tsx scripts/verify-pinned.ts` proves it live |
| **Corroborated reads** | Where a protocol has two independent deployments, both must agree or the verdict is `Unverifiable`. Two live Morpho Aave V3 indexes disagree by 488 bps at an identical block — `npx tsx scripts/prove-corroboration.ts` |
| **Test suite** | 55 Foundry tests, 64 TypeScript tests |

**Not built:** the dashboard. Everything above is verifiable from a block explorer and the terminal scenes.

**Honest scope note:** `cre workflow simulate` executes locally, not inside an enclave. We register a real TEE handler and the workflow runs end to end, but enclave execution requires confidential-DON deploy access, which we have requested. We do not claim adjudication has run inside a TEE.

## Deployed on Sepolia

Every contract is immutable: no owner, no pause, no upgrade proxy, no address setters.

| Contract | Address |
|---|---|
| `ClaimRegistry` | [`0xaa064d7E8557c19c785d0A0Ec6FC5ddaBf8C92f0`](https://sepolia.etherscan.io/address/0xaa064d7E8557c19c785d0A0Ec6FC5ddaBf8C92f0) |
| `WitnessRoster` | [`0xe69A78a57aF3461172741D1f6913AFC71f65Ff4E`](https://sepolia.etherscan.io/address/0xe69A78a57aF3461172741D1f6913AFC71f65Ff4E) |
| `VerdictSink` | [`0x4E1c9EccdcF3329CB80CD94A0268925D792AF015`](https://sepolia.etherscan.io/address/0x4E1c9EccdcF3329CB80CD94A0268925D792AF015) |
| `PerjuryStandingWriter` | [`0x0573F58500aF260117B5E4782e1b1832c06Afba1`](https://sepolia.etherscan.io/address/0x0573F58500aF260117B5E4782e1b1832c06Afba1) |
| `ENSTextStandingReader` | [`0xe8c5e05c478414f576558a26616D56b4929671a0`](https://sepolia.etherscan.io/address/0xe8c5e05c478414f576558a26616D56b4929671a0) |
| `PerjuryResolver` (ENSv2 Permissioned) | [`0xcBd795d211Dd40dB392730034B5e68359c9E8534`](https://sepolia.etherscan.io/address/0xcBd795d211Dd40dB392730034B5e68359c9E8534) |

Identity: `perjury.eth` on the ENSv2 hackathon deployment, with five agent subnames.

Full transaction ledger: [docs/TX_HASHES.md](docs/TX_HASHES.md)

## Running it

```bash
cp .env.example .env          # add SEPOLIA_RPC_URL, GRAPH_STUDIO_KEY, keys
npm install
forge test                    # 55 contract tests
npx vitest run                # 64 TypeScript tests

# the three demo scenes, live on Sepolia, with terminal visualisation
npx tsx agents/runner/scene1.ts operator   # true claim  → Match, bond returned
npx tsx agents/runner/scene2.ts panel-1    # false claim → Mismatch, appeal, panel, slash
npx tsx agents/runner/scene3.ts panel-2 4  # collusion attempt, throttled

# both agents against live mainnet Graph data, through the tribunal
npx tsx agents/runner/duel.ts honest   # expect Match
npx tsx agents/runner/duel.ts false    # expect Mismatch

# the confidential workflow
cd cre && cre workflow simulate tribunal --target staging-settings

# the standardized-schema and corroboration proofs
npx tsx scripts/verify-pinned.ts        # one query pattern, every pinned protocol
npx tsx scripts/prove-corroboration.ts  # independent deployments must agree

# rebuild the transaction ledger from chain
npx tsx scripts/collect-evidence.ts
```

The scenes take 3–7 minutes each: VRF fulfilment is ~60s, and settlement waits out a real challenge window.

## How it works

```
claim + bond  →  random witness (VRF)  →  independent re-derivation (The Graph)
                                                      ↓
              ENS standing  ←  bond settled  ←  private adjudication (CRE TEE)
                    ↓                                  emits only: match / mismatch
         determines who can witness next
```

An agent posts a claim with a bond. The protocol assigns a **random** witness — the claimant can never choose or influence it. The witness re-derives its own finding from live on-chain data without seeing the claimant's reasoning. A **confidential workflow** compares the two inside an enclave and publishes only a verdict, never the evidence. On mismatch the claimant forfeits its bond and its ENS reputation drops — which makes it ineligible to witness for anyone else, automatically, with no operator in the loop.

Three constraints drive the whole design, and each rules out a simpler approach:

1. **A claimant who picks its own auditor can buy a pass** → verifiably random assignment.
2. **An adjudicator that publishes evidence hands future claimants a rubric to game** → adjudication in a TEE that emits only a verdict.
3. **Reputation the subject can write is not reputation** → ENS records writable *only* by the tribunal, scoped to a single field.

See [docs/design.md](docs/design.md) for the full mechanism.

## What it doesn't solve

Random assignment closes *deliberate* collusion. It does not catch a careless witness. Two independently-honest agents reaching the same wrong conclusion is partly addressed — where a protocol has a second independent index, both must agree or the verdict is `Unverifiable` — but only one of our five pinned protocols has one, so elsewhere the reading is stamped `single-source` and the limitation stands. The demo is required to **show** this limitation, not narrate it — see [docs/design.md §6](docs/design.md#6-the-honest-limitation-demonstrated-not-disclaimed).

## Documentation

| | |
|---|---|
| **[docs/design.md](docs/design.md)** | The whole design: concept, architecture, contracts, CRE tribunal, ENS, Graph, demo script, limitations, prior art |
| **[plan.md](plan.md)** | Task order, deadline gates, cut order, risks |
| **[docs/decisions.md](docs/decisions.md)** | Why VRF, why simulate-first, why LLM agents — with the rejected options |
| **[docs/ai-usage.md](docs/ai-usage.md)** | Per-file provenance and the human decision log |
| **[docs/prompts/](docs/prompts/)** | Every directing prompt, verbatim |
| **[docs/build-log.md](docs/build-log.md)** · **[docs/TX_HASHES.md](docs/TX_HASHES.md)** | Progress notes · deployed addresses and demo tx hashes |
| **[docs/cre-execution-log.md](docs/cre-execution-log.md)** | Confidential-workflow execution evidence: what runs in the enclave, captured simulator output |

## Sponsor tracks

Three partner-prize slots are selectable at submission; these are ours.

| Track | How it's used |
|---|---|
| **Chainlink** — Best Confidential Workflow | The tribunal. A CRE Confidential Workflow with a TEE handler (`cre.handlerInTee`) compares claim against finding and emits only a verdict. Remove it and the protocol has no adjudicator — see [docs/design.md](docs/design.md) §3.4. **Currently executed via the local simulator**, which runs locally rather than in an enclave; enclave execution needs confidential-DON deploy access. |
| **ENS** — Best Use of ENSv2 | Agents-as-namespaces (`<agent>.perjury.eth`), with Enhanced Access Control restricting reputation writes to the tribunal alone, scoped to one record. |
| **The Graph** | Two ways, both load-bearing. **AI use case:** the witness is an LLM agent that searches the Subgraph MCP, reads the schema and composes its own GraphQL — the finding it derives decides who loses a bond, so the data does real work rather than being printed. **Standardized products:** 13 deployments across two Messari schema families and five chains, read through one query pattern per family with no protocol- or chain-specific code, so adding a protocol, a chain or a whole schema family is a data change. **Corroborated reads** exploit the property only a content-addressed index has — a deployment id hashes the mapping code, so two deployments are two independent derivations, and the protocol refuses to convict when they disagree. Provenance failures reject rather than degrade. |

## AI usage

This project was designed by a human and implemented with AI assistance (Claude Code). The mechanism, threat model, sponsor strategy, and demo scenarios are human-authored — see [docs/prompts/01-project-brief.md](docs/prompts/01-project-brief.md), which predates any AI involvement. Per-file provenance, the decision log, and an honest account of where human authorship sits are in [docs/ai-usage.md](docs/ai-usage.md). Every directing prompt is committed verbatim in [docs/prompts/](docs/prompts/).

## License

MIT
