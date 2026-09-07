# Perjury

**Verification for AI agent claims.** We trust what agents tell us about their own work, but never
check the process behind it. Perjury makes that process independently re-derived by a randomly
assigned peer agent, privately adjudicated inside a TEE, and settled with real economic and
reputational consequences.

Built for **ETHOnline 2026**. Sepolia testnet.

> **Status: planning.** No application code yet — design and build plan are complete, T0 is next.
> Submission deadline **Sun Sep 13 2026, 12:00 EDT**. This README grows a quickstart, deployed
> addresses, and demo tx hashes as they land.

---

## How it works

```
claim + bond  →  random witness (VRF)  →  independent re-derivation (The Graph)
                                                      ↓
              ENS standing  ←  bond settled  ←  private adjudication (CRE TEE)
                    ↓                                  emits only: match / mismatch
         determines who can witness next
```

An agent posts a claim with a bond. The protocol assigns a **random** witness — the claimant can
never choose or influence it. The witness re-derives its own finding from live on-chain data without
seeing the claimant's reasoning. A **confidential workflow** compares the two inside an enclave and
publishes only a verdict, never the evidence. On mismatch the claimant forfeits its bond and its ENS
reputation drops — which makes it ineligible to witness for anyone else, automatically, with no
operator in the loop.

Three constraints drive the whole design, and each rules out a simpler approach:

1. **A claimant who picks its own auditor can buy a pass** → verifiably random assignment.
2. **An adjudicator that publishes evidence hands future claimants a rubric to game** → adjudication
   in a TEE that emits only a verdict.
3. **Reputation the subject can write is not reputation** → ENS records writable *only* by the
   tribunal, scoped to a single field.

See [docs/design.md](docs/design.md) for the full mechanism.

## What it doesn't solve

Random assignment closes *deliberate* collusion. It does not catch a careless witness, and it can't
rule out two independently-honest agents reaching the same wrong conclusion. The demo is required to
**show** this limitation, not narrate it — see [docs/design.md §6](docs/design.md#6-the-honest-limitation-demonstrated-not-disclaimed).

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
| **Chainlink** — Best Confidential Workflow | The tribunal. A CRE Confidential Workflow compares claim against finding inside a TEE. Remove it and the protocol has no adjudicator — see [docs/design.md](docs/design.md) §3.4. |
| **ENS** — Best Use of ENSv2 | Agents-as-namespaces (`<agent>.perjury.eth`), with Enhanced Access Control restricting reputation writes to the tribunal alone, scoped to one record. |
| **The Graph** — Best AI Tooling/Use Case (From Scratch) | The witness's only source of truth. LLM agents drive the Subgraph MCP against live standardized subgraphs; provenance failures reject rather than degrade. |

## AI usage

This project was designed by a human and implemented with AI assistance (Claude Code). The mechanism,
threat model, sponsor strategy, and demo scenarios are human-authored — see
[docs/prompts/01-project-brief.md](docs/prompts/01-project-brief.md), which predates any AI
involvement. Per-file provenance, the decision log, and an honest account of where human authorship
sits are in [docs/ai-usage.md](docs/ai-usage.md). Every directing prompt is committed verbatim in
[docs/prompts/](docs/prompts/).

## License

MIT
