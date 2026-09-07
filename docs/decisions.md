# Decision Records

Architectural decisions with the options that were rejected and why — the reasoning is the
interesting part. Append-only; superseded decisions get marked, not deleted.

Decisions still open are tracked in [`../plan.md`](../plan.md).

| # | Decision | Date | Status |
|---|---|---|---|
| [0001](#0001-use-chainlink-vrf-v25-for-witness-assignment) | Chainlink VRF v2.5 for witness assignment | 2026-09-07 | Accepted |
| [0002](#0002-pursue-cre-beta-access-build-simulate-first-regardless) | Pursue CRE beta access; build simulate-first | 2026-09-07 | Accepted |
| [0003](#0003-nextjs-dashboard-as-the-demo-surface) | Next.js dashboard as the demo surface | 2026-09-07 | Accepted |
| [0004](#0004-llm-agents-driving-subgraph-mcp-not-scripted-graphql) | LLM agents driving Subgraph MCP | 2026-09-07 | Accepted |
| [0005](#0005-living-attribution-log-with-committed-prompts) | Living attribution log + committed prompts | 2026-09-07 | Accepted |

---

## 0001. Use Chainlink VRF v2.5 for witness assignment

**Date:** 2026-09-07
**Status:** Accepted
**Decided by:** Project lead (human)

### Context

Random witness assignment is not a feature of Perjury — it *is* Perjury. The entire anti-collusion
claim reduces to "a claimant cannot choose, influence, or predict its witness." If the randomness is
weak, the protocol has no security property worth demonstrating, and a judge who pulls on that thread
finds nothing underneath.

So the question isn't "what's the cheapest randomness that works," it's "what randomness survives a
hostile reading."

### Options considered

| Option | Pros | Cons |
|---|---|---|
| **Chainlink VRF v2.5** | Verifiable, unbiasable, independently auditable. Request and fulfilment are both on-chain txs we can put on camera. Reinforces the Chainlink track. | Two-block latency. Testnet LINK dependency. Callback gas ceiling constrains what we can do inside `fulfillRandomWords`. |
| **CRE workflow generates the randomness** | Fewer moving parts; the tribunal is already in the stack. | Randomness provenance is weak on camera — "trust the enclave" is a worse story than "here's the VRF fulfilment tx." Also conflates assignment with adjudication, so one compromised component breaks both. |
| **Commit-reveal / future blockhash** | No external dependency, cheapest, no LINK. | Blockhash is weakly manipulable by proposers. Undercuts the central claim precisely where it needs to be strongest. |

### Decision

**Chainlink VRF v2.5.** The anti-collusion claim is the project's central assertion, so randomness
provenance must be independently verifiable rather than merely asserted. The latency and LINK costs
are real and accepted; weakening the claim to avoid them would have made the rest of the build
pointless.

### Consequences

- Assignment happens in a VRF callback, which introduces a **hard gas ceiling** on anything we do at
  assignment time. This directly collides with the requirement that eligibility be read live from ENS
  (see [`../05-ens.md`](design.md#4-ens-integration-design-ensv2-sepolia-beta) §4.3) — the two decisions are in tension and the tension is
  real, not theoretical.
- Tracked as risk #2 in [`../../plan.md`](../plan.md), with a designed fallback (two-step assign:
  VRF stores the seed, a permissionless `finalizeAssignment()` does the eligibility walk) to be
  decided at M3 rather than on demo day.
- Gives us two linkable transactions per assignment for the demo, which is worth more on camera than
  a single opaque one.

---

## 0002. Pursue CRE beta access; build simulate-first regardless

**Date:** 2026-09-07
**Status:** Accepted
**Decided by:** Project lead (human)

### Context

Chainlink Confidential Workflows — the tribunal, and the thing the whole protocol depends on — is
**invite-only private beta**. You request enrollment through a Chainlink account team. That is an
external gate on the single most important component in the project, which is an uncomfortable place
to start a hackathon build.

Observed in the ETHGlobal Discord Chainlink channel: other teams are posting access requests and a
Chainlink representative is responding to them. So the gate is passable, on a timeline we don't
control.

### Options considered

| Option | Pros | Cons |
|---|---|---|
| **Assume access will land; build for live deploy** | Cleanest end state. | If it doesn't land, the core component is vapor at demo time. Unacceptable risk on the critical path. |
| **Assume no access; design around the TEE** | No external dependency. | Abandons the Chainlink track and, more importantly, abandons the confidentiality property that makes the mechanism work at all. Not a real option. |
| **Request access now, build simulate-first with a scripted swap** | De-risked either way. `cre workflow simulate --broadcast` executes the real workflow binary and broadcasts real Sepolia transactions, so the demo is honest with or without the enclave. | Two deployment paths to keep working. Requires the swap point to be genuinely one line, not a refactor. |

### Update — Sep 7, after checking the docs

The access path is an **official Google Form**, not a Discord conversation:
<https://docs.google.com/forms/d/e/1FAIpQLSdk8mxDZAXpEX1PHgjzCoBeKxSoQysoO9sxOb-gpBrDrjOhtA/viewform>

More importantly, Chainlink's docs state plainly: *"After submitting your request, you don't need to
wait for early access. Your CRE organization can run Confidential Workflows using the local
simulator."*

**This removes the external gate from the critical path.** T1 is no longer blocked on anyone's
response — it needs the CRE CLI and an org, both self-serve. The decision below stands unchanged;
what changes is that the fallback was never really a fallback, and the risk ranking overstated this
item. Submit the form anyway (live deployment is still nicer for the video), but do not sequence
around waiting for it.

## Decision

**Submit the access form on day zero, then build simulate-first with a clean swap to live
deployment.**
Chainlink's own track requirements accept "execution via simulation or live deployment with
evidence," so the simulate path is not a degraded submission — it is a qualifying one.

The access request is item zero of M0, before any code. It costs one Discord message and everything
downstream is faster if it's granted early.

### Consequences

- The **only** thing that differs between the two paths is `CRE_REPORT_WRITER` in `VerdictSink`. That
  constraint is load-bearing and constrains the contract design: no setter, so the swap is a
  redeploy + roster re-point, scripted to take under 30 minutes.
- Evidence capture (simulation logs, TEE handler registration, tx hashes) is required either way, so
  it's built into M1's exit criteria rather than gathered at the end.
- The demo video is recorded *after* whichever path is final — not re-cut twice.
- Tracked as risk #1 in [`../../plan.md`](../plan.md).

---

## 0003. Next.js dashboard as the demo surface

**Date:** 2026-09-07
**Status:** Accepted
**Decided by:** Project lead (human)

### Context

Submission is a public repo plus a 2–4 minute video. No in-person judging, no live walkthrough, no
chance to explain something a judge misses. Whatever isn't legible on screen in those minutes does
not exist.

The hardest thing to convey is reputation *movement* — a number on an ENS text record going up and
down, and an agent silently dropping out of the eligible set as a consequence. That's the payoff of
the entire mechanism and it's invisible in a terminal.

### Options considered

| Option | Pros | Cons |
|---|---|---|
| **Next.js dashboard** | Reputation bars that visibly move; eligibility roster that visibly excludes; the agent's MCP tool calls streaming on screen. Can show the sealed-evidence-vs-published-verdict contrast side by side. | Real build time in M6, competing with getting the protocol working. |
| **CLI + block explorer only** | Fastest. All evidence is raw txs, which is maximally credible. | Reputation changes are invisible. A judge watches hex scroll past and takes our word for what it means. |
| **Thin read-only web view + CLI agents** | Middle cost. | Splits attention across two surfaces in a 4-minute video; neither ends up polished. |

### Decision

**Next.js dashboard.** Legibility in the video is worth the M6 build cost. The specific thing it buys
that a CLI cannot: showing that the on-chain verdict contains *only* a verdict while the evidence
stayed sealed — the confidentiality property is otherwise unfilmable.

### Consequences

- The dashboard is sequenced **last** (M6), after the protocol genuinely works. It presents state the
  protocol already produces; it must never become the place where behavior is faked for the camera.
- It renders from chain and Graph reads, not from an app database — so nothing on screen can drift
  from what actually happened on-chain.
- Attribution note: the dashboard is the one component intended as AI-GENERATED
  (see [`../ai-usage.md`](ai-usage.md) §0.3). It's presentation of state, with low design-ownership
  stakes — unlike the mechanism it displays.

---

## 0004. LLM agents driving Subgraph MCP, not scripted GraphQL

**Date:** 2026-09-07
**Status:** Accepted
**Decided by:** Project lead (human)

### Context

The witness has to independently re-derive a finding from live on-chain data. *How* it does that
determines whether this is an AI project or a cron job with a GraphQL string in it.

The Graph's AI track requires the Graph to be "load-bearing infrastructure" performing "meaningful
work (reasoning, decisions, automation)" — explicitly not printing a raw query result.

### Options considered

| Option | Pros | Cons |
|---|---|---|
| **LLM agents with Subgraph MCP as tools** | The agent picks the subgraph, reads the schema, and composes its own query. That's genuine reasoning over Graph data, and it's visible on camera as a tool-call stream. | Nondeterministic on camera. A bad roll during recording breaks a take. |
| **Deterministic TS + hardcoded GraphQL** | Reliable, reproducible, trivially testable. | The "witness" is then a script with a fixed query, and the independence claim gets thin — two agents running the same hardcoded query aren't independently deriving anything. Weak fit for the track. |
| **Hybrid: LLM selects, deterministic layer verifies** | Best of both. | Was effectively adopted anyway — see Decision. |

### Decision

**LLM agents driving the Subgraph MCP**, with a deterministic guard layer wrapping every read. In
practice this is the hybrid: the LLM does subgraph selection, schema interpretation, and query
composition; `packages/graph-guard` deterministically enforces deployment-ID pinning and freshness
and normalizes the output into a hashable typed assertion.

The split matters: **the reasoning is the agent's, the provenance guarantees are not.** An LLM cannot
be trusted to honestly report whether its own data was stale, so that check lives outside it.

### Consequences

- On-camera nondeterminism is a real risk (#4 in [`../../plan.md`](../plan.md)). Mitigated by
  pinned model, temperature 0, capped tool-call rounds, ≥5 rehearsals per scene, and a known-good
  fallback take.
- Claimant and witness must run as **separate processes with separate keys and no shared memory or
  message channel**, so "the witness never sees the claimant's reasoning" is true by construction
  rather than by prompt instruction. A prompt saying "don't look at this" is not an isolation
  boundary.
- The guard layer becomes the place where the reject-never-degrade rule is enforced
  (see [`../06-graph.md`](design.md#5-graph-integration-design) §5.3).

---

## 0005. Living attribution log with committed prompts

**Date:** 2026-09-07
**Status:** Accepted
**Decided by:** Project lead (human)

### Context

ETHGlobal's AI usage policy for ETHOnline 2026 has three clauses: attribution down to specific files,
meaningful human involvement (not merely AI output), and — if spec-driven workflows are used — every
spec file, prompt, and planning artifact committed to the repo.

The Involvement clause is the one with consequences: submissions relying entirely on AI "may not be
eligible for partner prizes or finalist consideration."

Attribution reconstructed at the end of a build is guesswork, and reads like guesswork.

### Options considered

| Option | Pros | Cons |
|---|---|---|
| **One-line AI disclosure in the README** | Minimal effort. | Satisfies none of the three clauses properly. Tells a judge nothing about who designed what. |
| **Reconstruct attribution before submission** | No overhead during the build. | Inaccurate by construction — nobody remembers which parts of a file they actually reviewed a week later. Risks labeling things aspirationally, which is worse than not labeling. |
| **Living log + per-file headers + committed prompts** | Accurate because it's recorded as it happens. Directly maps to all three clauses. | ~5 minutes of upkeep per milestone. Requires discipline when it's tempting to skip. |

### Decision

**Living attribution log, updated at every milestone exit.** Concretely:

- [`../ai-usage.md`](ai-usage.md) holds the component attribution table and the decision log.
- Attribution is recorded in one authoritative table rather than duplicated into source headers,
  which drift out of date the moment a file is edited.
- Every prompt that materially directs committed work is committed verbatim to
  [`../prompts/`](prompts/), including prompts that led to approaches later abandoned.
- Four components are reserved for direct human authorship, chosen because they're what a judge would
  probe: the witness assignment logic, the demo scene scripts, the limitations write-up, and the
  enclave boundary definition.

### Consequences

- Adds an attribution pass to every milestone's exit criteria.
- Establishes an explicit honesty rule: a file is only labeled AI-ASSISTED once the human has
  actually done the review and can defend the design unaided. Labeling aspirationally would fail the
  clause it's meant to satisfy, and would collapse in about two questions of conversation.
- The human's voice is required in specific places (concept framing, limitations). Those are marked
  as TODO stubs rather than ghost-written — a ghost-written "in my own words" section defeats the
  purpose of the exercise.
