# Perjury

**Verification for AI agent claims.** We trust what agents tell us about their own work, but never check the process behind it. Perjury makes that process independently re-derived by a randomly assigned peer agent, privately adjudicated by a Chainlink CRE Confidential Workflow, and settled with real economic and reputational consequences.

Built for **ETHOnline 2026**. Sepolia testnet.

> **Status: working end-to-end off-chain, settling on-chain in progress.** Contracts are deployed on Sepolia, VRF witness assignment is verified live, the CRE confidential workflow adjudicates via the official simulator, and both agents derive findings from live mainnet Graph data — Match and Mismatch both reproduced. See [What works today](#what-works-today).

---

## What works today

Verified on live networks, not mocked:

| | Evidence |
|---|---|
| **Bonded claims + settlement contracts** | Deployed on Sepolia (addresses below), 32 Foundry tests |
| **Randomly assigned witness** | Live Chainlink VRF v2.5 round: claimant `0xDcbe…eA91`, witness drawn `0xc38f…c4AF` — a different address, on-chain |
| **Independent re-derivation** | Claimant and witness each query live Aave v3 data through the Subgraph MCP and a pinned deployment; true claim → **Match** (40.45% vs 40.42%), fabricated claim → **Mismatch** (64.74% vs 40.46%) |
| **Provenance enforcement** | Stale index, unpinned deployment, indexing errors or an empty result set all produce `Unverifiable` — never a silent pass. 16 tests |
| **Private adjudication** | CRE Confidential Workflow with a TEE handler (`cre.handlerInTee`); report delivered on-chain, tx [`0xbd50a73c…`](https://sepolia.etherscan.io/tx/0xbd50a73caf76f55092aa19614def76173a87c81a347f2c719a72a1fa6ac4721d) |
| **Agent identity** | `perjury.eth` registered on the ENSv2 hackathon deployment, direct-to-contract |

**In progress:** `VerdictSink` deployment (deliberately last — its authorized-writer address is immutable), ENSv2 Enhanced Access Control grants, and the ENS reputation write closing the loop.

**Honest scope note:** `cre workflow simulate` executes locally, not inside an enclave. We register a real TEE handler and the workflow runs end to end, but enclave execution requires confidential-DON deploy access, which we have requested. We do not claim adjudication has run inside a TEE.

## Deployed on Sepolia

| Contract | Address |
|---|---|
| `ClaimRegistry` | [`0xa16613689Ff8df7779FDA80b90BB865F0C52F874`](https://sepolia.etherscan.io/address/0xa16613689Ff8df7779FDA80b90BB865F0C52F874) |
| `WitnessRoster` | [`0x84120516A22af6C3557bF80BAbAAd4ff4a86E309`](https://sepolia.etherscan.io/address/0x84120516A22af6C3557bF80BAbAAd4ff4a86E309) |
| `PerjuryStandingWriter` | [`0xBCe0bcFEE2E5b7506d76D76529b1642980B8eE61`](https://sepolia.etherscan.io/address/0xBCe0bcFEE2E5b7506d76D76529b1642980B8eE61) |
| `ENSTextStandingReader` | [`0xdE16F3E3c600240bd1bd752d07Af69A2286C7F9E`](https://sepolia.etherscan.io/address/0xdE16F3E3c600240bd1bd752d07Af69A2286C7F9E) |

Full transaction ledger: [docs/TX_HASHES.md](docs/TX_HASHES.md)

## Running it

```bash
cp .env.example .env          # add SEPOLIA_RPC_URL, GRAPH_STUDIO_KEY, keys
npm install
forge test                    # 32 contract tests
npx vitest run                # 45 TypeScript tests

# both agents against live mainnet Graph data, through the tribunal
npx tsx agents/runner/duel.ts honest   # expect Match
npx tsx agents/runner/duel.ts false    # expect Mismatch

# the confidential workflow
cd cre && cre workflow simulate tribunal --target staging-settings
```

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

Random assignment closes *deliberate* collusion. It does not catch a careless witness, and it can't rule out two independently-honest agents reaching the same wrong conclusion. The demo is required to **show** this limitation, not narrate it — see [docs/design.md §6](docs/design.md#6-the-honest-limitation-demonstrated-not-disclaimed).

## Documentation

| | |
|---|---|
| **[docs/design.md](docs/design.md)** | The whole design: concept, architecture, contracts, CRE tribunal, ENS, Graph, demo script, limitations, prior art |
| **[plan.md](plan.md)** | Task order, deadline gates, cut order, risks |
| **[docs/decisions.md](docs/decisions.md)** | Why VRF, why simulate-first, why LLM agents — with the rejected options |
| **[docs/ai-usage.md](docs/ai-usage.md)** | Per-file provenance and the human decision log |
| **[docs/prompts/](docs/prompts/)** | Every directing prompt, verbatim |
| **[docs/build-log.md](docs/build-log.md)** · **[docs/TX_HASHES.md](docs/TX_HASHES.md)** | Progress notes · deployed addresses and demo tx hashes |

## Sponsor tracks

Three partner-prize slots are selectable at submission; these are ours.

| Track | How it's used |
|---|---|
| **Chainlink** — Best Confidential Workflow | The tribunal. A CRE Confidential Workflow with a TEE handler (`cre.handlerInTee`) compares claim against finding and emits only a verdict. Remove it and the protocol has no adjudicator — see [docs/design.md](docs/design.md) §3.4. **Currently executed via the local simulator**, which runs locally rather than in an enclave; enclave execution needs confidential-DON deploy access. |
| **ENS** — Best Use of ENSv2 | Agents-as-namespaces (`<agent>.perjury.eth`), with Enhanced Access Control restricting reputation writes to the tribunal alone, scoped to one record. |
| **The Graph** — Best AI Tooling/Use Case (From Scratch) | The witness's only source of truth. LLM agents drive the Subgraph MCP against live standardized subgraphs; provenance failures reject rather than degrade. |

## AI usage

This project was designed by a human and implemented with AI assistance (Claude Code). The mechanism, threat model, sponsor strategy, and demo scenarios are human-authored — see [docs/prompts/01-project-brief.md](docs/prompts/01-project-brief.md), which predates any AI involvement. Per-file provenance, the decision log, and an honest account of where human authorship sits are in [docs/ai-usage.md](docs/ai-usage.md). Every directing prompt is committed verbatim in [docs/prompts/](docs/prompts/).

## License

MIT
