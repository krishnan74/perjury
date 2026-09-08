# Prompt 01 — Original Project Brief

**Date:** 2026-09-07 **Author:** Human (project lead) **Directed:** Creation of `plan.md` — the full system architecture and build plan. **Verbatim, unedited.**

---

I'm building a project called "Perjury" for ETHOnline 2026 (an async ETHGlobal hackathon — submission is a public GitHub repo + a 2-4 minute demo video, no in-person judging). I need you to create a detailed plan.md file that breaks this down into a buildable architecture and a realistic milestone-by-milestone build order. Do not start writing application code yet — just produce the plan.

## Project concept

Perjury is a verification system for AI agent claims. The core insight: we trust what AI agents tell us about their own work, but never check the process behind it. Perjury makes that process independently re-checked by a random peer agent, privately adjudicated, with reputation consequences.

## Core mechanism

1. **Claim submission**: An agent (the "claimant") posts a claim that another party will rely on — e.g. "I checked this data before acting on it," "I verified these sources agree." The claim is posted with a bond (real economic stake, not a marketplace listing).

2. **Random witness assignment**: The protocol randomly assigns a different registered agent as the "witness." The claimant must never be able to choose or influence who the witness is — this is the core anti-collusion mechanism. Witness eligibility must be checked LIVE at the moment of assignment against each candidate's current on-chain reputation record (an agent with a recent discrepancy flag should be automatically ineligible — no manual list maintenance).

3. **Independent re-verification**: The witness does not see or trust the claimant's reasoning. It independently re-derives its own finding by querying live, standardized on-chain data via The Graph (Subgraph MCP / standardized subgraphs, e.g. Messari Standardized Subgraphs or Agent0/ERC-8004 agent schemas where applicable). If the data needed is stale or the deployment ID doesn't match a pinned/expected value, the witness must treat the claim as unverifiable rather than silently passing it — provenance and freshness checks are a correctness requirement, not an optional nicety.

4. **Private adjudication**: A Chainlink CRE (Chainlink Runtime Environment) Confidential Workflow acts as the tribunal. It runs inside a TEE, privately compares the claimant's claim against the witness's independently-derived finding (a "dual-agent consensus check"), and writes back ONLY a minimal verdict (match / mismatch) — never the raw evidence, never either party's methodology or reasoning. This needs to be genuinely load-bearing: the confidentiality must be doing real work (protecting private evidence/methodology), not just wrapping a public check in a TEE for its own sake.

5. **Bond settlement**: On mismatch, the claimant forfeits its bond to whoever exposed it as false (in the honest case, the witness). On match (claim holds up), the claimant's bond is returned and its standing improves.

6. **ENS reputation record**: The verdict updates the claimant's standing on an ENS (ENSv2, Sepolia) record. This record must be write-restricted via Enhanced Access Control so that ONLY the CRE workflow's own address can write to it — not the claimant, not the protocol operators, nobody else. Additionally, that address's write permission must be scoped narrowly: it can only ever write the corroboration/discrepancy outcome field, never reassign name ownership, never alter who's eligible to be a witness, never touch claimant identity data. Agent identity should use ENS agents-as-namespaces (each registered agent gets a subname).

## Honest, structural limitation (must be demonstrable, not just described)

Random witness assignment closes DELIBERATE collusion (a claimant can't pick a friendly witness). It does NOT catch a witness that is simply careless/low-effort rather than colluding, and it cannot fully rule out two independently-honest agents who both happen to reach the same wrong conclusion. The demo needs to show this limitation directly (e.g. a staged collusion attempt between two agents that gets throttled by the random-assignment mechanism itself, not just a written caveat).

## Live demo requirements (this is critical — plan the build so all of this is genuinely working, not mocked)

The demo video must show, on camera, with real testnet transactions:
1. A TRUE claim that gets opportunistically challenged anyway — the witness's independent Graph query confirms it, the claimant's ENS standing visibly rises.
2. A staged FALSE claim — the randomly-assigned witness's independent finding disagrees with the claim, the CRE tribunal rules against the claimant, its ENS standing visibly drops on-screen, and it becomes ineligible to be selected as a future witness (shown live, e.g. by attempting a new assignment and showing it's excluded).
3. A collusion attempt between two agents, shown being structurally throttled by random assignment (not just narrated as a limitation).

## Sponsor tracks being targeted (ETHOnline 2026) — qualification requirements to satisfy

**Chainlink — Best Confidential Workflow ($2,000, up to 2 teams get $1,000 each)**
- Must build/simulate/deploy a CRE Workflow used as an orchestration layer within the project, using Chainlink Confidential Compute and/or Confidential HTTP.
- The confidential portion MUST process at least one genuinely sensitive input inside the enclave (in our case: the claim + witness finding comparison) and must be meaningfully load-bearing to the project's core functionality, not an isolated/decorative example.

**ENS — Best Use of ENSv2 ($4,500: $1,500 / $1,500 / $1,000 / $500 runner-up)**
- Must build on ENSv2 beta (Sepolia).
- Should use Enhanced Access Control (role-based permissions on registries/resolvers) — in our case, restricting record writes to the CRE address only, scoped narrowly.
- Bonus points explicitly called out for "agents as namespaces" — each agent having its own ENS identity and permissions. We should lean into this hard.

**The Graph — Best AI Tooling or AI Use Case with The Graph, From Scratch ($5,000: $2,500 / $1,500 / $1,000)**
- The Graph must be load-bearing: the agent/app must use Subgraphs, the Subgraph MCP, or Substreams as its actual source of blockchain data for reasoning/decisions, not just printing a raw query result.
- Must consume LIVE data from a real Graph provider (Subgraph Studio API key, or The Graph Market for Substreams) — mocked/local/static datasets do not qualify.
- This is explicitly the "From Scratch" pool — the project must be built net-new during the event, not framed as extending prior work.
- Consider whether Standardized Subgraphs (Messari schemas) or the Agent0/ERC-8004 agent-specific subgraphs are relevant to the witness's independent verification step.

## What I need from the plan.md

1. **System architecture** — a clear breakdown of components (contracts, CRE workflow, ENS registry/resolver setup, Graph query layer, any frontend/CLI needed for the demo) and how they connect. Call out explicitly which component is "the tribunal," which is "the witness," which is "the ENS record," etc., matching the narrative above.
2. **Smart contract design** — what contracts are needed (claim/bond escrow, witness assignment/randomness source, ENS record writer restrictions), their key functions, and how access control is enforced on-chain (not just described).
3. **CRE workflow design** — what the workflow receives as input, what stays inside the TEE, what gets written out, and how to keep this genuinely load-bearing per Chainlink's qualification requirement.
4. **ENS integration design** — registry/resolver setup, Enhanced Access Control configuration, subname structure for agent identity, and how live reputation lookups work at witness-assignment time.
5. **Graph integration design** — what's queried, which schema/subgraph source, and how staleness/provenance is checked and enforced (reject vs. silently degrade).
6. **A realistic, ordered build plan / milestones** — sequenced so the riskiest, most novel piece (the CRE tribunal) gets built and de-risked early, not last. Assume time is available but flag which pieces are highest-risk to get "genuinely working, not mocked" by demo time.
7. **A section explicitly listing what needs to be TRUE and DEMONSTRABLE on camera for each of the three live-demo scenarios above** — treat this as a checklist so nothing in the final video ends up being narrated instead of shown.
8. **Open questions / decisions I still need to make**, if any come up while you're planning this out.

Write the plan.md now.

---

## Decisions the human made in response to this prompt

The AI came back with four architectural questions before writing the plan. The human's answers, which are load-bearing for the whole design:

1. **Witness randomness → Chainlink VRF v2.5.** Chosen over a CRE-internal source or commit-reveal/blockhash, on the reasoning that the anti-collusion claim is the project's central assertion and therefore needs the strongest verifiable-randomness provenance available, even at the cost of callback latency and a LINK dependency.
2. **CRE Confidential Workflows access → pursue beta access via the ETHGlobal Discord Chainlink channel.** The human observed other teams' access requests being granted there in real time and directed that the build proceed simulate-first with a clean swap to live deployment.
3. **Demo surface → Next.js dashboard**, over a CLI-only demo, for legibility in a 2–4 minute video.
4. **Agent implementation → LLM agents driving the Subgraph MCP as tools**, over deterministic scripted GraphQL, accepting on-camera nondeterminism risk in exchange for a genuine "AI use case" for The Graph track.
