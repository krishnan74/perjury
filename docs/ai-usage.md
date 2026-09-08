# 0. AI Usage & Attribution

> **This section is written for ETHGlobal judges as much as for the team, and it is a living document — it is updated as each file lands, not reconstructed at the end.** It exists to satisfy ETHGlobal's AI usage policy for ETHOnline 2026 in full.

### 0.1 Policy compliance map

| Policy clause | How this project satisfies it | Where |
|---|---|---|
| **Attribution** — document where and how AI tools were used, down to specific files/assets | The component attribution table (§0.3) records provenance per file, and is the single authoritative record. Spec chapters in [`design.md`](design.md) carry their own human-specified vs. AI-proposed split. | §0.3 |
| **Involvement** — AI assists, does not create the entire project; meaningful human contribution required | The protocol design, threat model, sponsor-integration strategy, and demo scenarios are human-authored (§0.4). Specific components are reserved for direct human authorship (§0.6). | §0.4, §0.6 |
| **Spec-Driven Development** — all spec files, prompts, and planning artifacts must be in the repo | Every directing prompt is committed verbatim in `docs/prompts/`. This plan is committed at repo root and its revision history is preserved in git. | `docs/prompts/`, `plan.md` |

**Tools used:** Claude Opus 5 via Claude Code (architecture planning, implementation, documentation). Any additional tool adopted later gets added to this line and to the affected file headers.

### 0.2 Provenance taxonomy

Three labels, used consistently across the docs, in per-file headers, and in the table below. The distinction that matters to the Involvement clause is *who made the decisions*, not who typed:

| Label | Meaning |
|---|---|
| **HUMAN** | Authored by a team member. Design intent, mechanism, and text are the human's. AI may have been used for spell-check-grade assistance or not at all. |
| **AI-ASSISTED** | The human specified the behavior, constraints, and acceptance criteria; AI produced a draft; the human reviewed, corrected, and owns the result. The human can explain every line and chose the trade-offs. |
| **AI-GENERATED** | AI produced this substantially independently from a short instruction. Human reviewed it for correctness but did not drive its structure. Reserved for boilerplate, scaffolding, and mechanical work. |

**Honesty rule for this table:** a file is only downgraded from AI-GENERATED to AI-ASSISTED when the human has actually done the review and can defend the design. We do not label aspirationally.

### 0.3 Component attribution table (living — update as each file lands)

Status legend: `planned` (not yet written) → `in progress` → `done`. This table is currently pre-populated with *intended* provenance for planned files. Each entry must be confirmed or corrected when the file is actually written; an intended label is not a claim.

| Component / file | Provenance | Status | Notes |
|---|---|---|---|
| **Design & planning** | | | |
| `docs/prompts/01-project-brief.md` | **HUMAN** | done | The originating design document. Core mechanism, anti-collusion rationale, demo scenarios, sponsor targeting — all human-authored before any AI involvement. |
| `docs/prompts/02-ai-usage-policy-directive.md` | **HUMAN** | done | Human directive establishing this attribution regime. |
| `docs/design.md` §1 (concept) | **HUMAN** | done | Assembled from the human's own brief text. Framing prose still to be rewritten in the human's voice before submission (§0.6). |
| `docs/design.md` | **AI-ASSISTED** | done | Human authored the concept, constraints, and requirements (prompt 01); AI researched sponsor requirements and structured them into architecture, contracts, workflow, and checklists. Each chapter opens with its own human-specified vs. AI-proposed split. |
| `docs/design.md` §6 (limitations) | **HUMAN** | done | The human's own analysis (D2), identified unprompted. README version to be written in their words (§0.6). |
| `docs/decisions.md` | **AI-ASSISTED** | done | The decisions and their reasoning are the human's (D4–D8); AI wrote them up in ADR form. |
| `docs/build-log.md` | **HUMAN** *(ongoing)* | in progress | Human-maintained running log. |
| `plan.md` | **AI-ASSISTED** | done | Milestone sequencing, risk ranking, verification criteria — AI-proposed against human constraints (tribunal-first ordering, nothing mocked). |
| `README.md` | AI-ASSISTED | done | Human's framing and mechanism; AI drafted the prose. |
| **Contracts** | | | |
| `contracts/src/ClaimRegistry.sol` | AI-ASSISTED | done | Human specified bond escrow semantics, the no-admin-override constraint, and that no witness parameter may exist on its external surface. AI implemented the lifecycle machine and pull-payment settlement. **Human review outstanding.** |
| `contracts/src/WitnessRoster.sol` | **AI-ASSISTED — ⚠ NOT YET HUMAN-LED** | done, **review required** | The anti-collusion core. Written by AI against human-specified properties. The file header and §0.6 both keep it labelled AI-ASSISTED until the team rewrites or line-by-line reviews it; `contracts/test/Assignment.t.sol` states the properties to defend. **Do not relabel without doing that work.** |
| `contracts/src/VerdictSink.sol` | AI-ASSISTED | done | Human specified the single immutable authorized sender and that no setter may exist. |
| `contracts/src/PerjuryStandingWriter.sol` | AI-ASSISTED | done | Human specified the narrow-scope requirement: one mutating function, one record, no reachable path to setAddr/setOwner/roles. |
| `contracts/test/**` | AI-ASSISTED | done | Human specified the test matrix ([§2.5](design.md)) and which negative cases must exist. 28 tests, 1024 fuzz runs. |
| `contracts/src/ens/ENSTextStandingReader.sol` | AI-ASSISTED | done | Human specified that eligibility be a pure function of the ENS record at assignment time — no cache, no cron, no admin. |
| `contracts/test/mocks/Mocks.sol` | AI-GENERATED | done | Test scaffolding: VRF coordinator and an ENS resolver that models EAC enforcement. |
| **CRE workflow** | | | |
| `packages/tribunal/**` | AI-ASSISTED | done | Human specified the enclave boundary ([§3.2](design.md)): what enters, and that only verdict + commitment may leave. AI implemented tolerance comparison and the degeneracy heuristic. 14 tests, incl. leak tests asserting no evidence reaches the report. |
| `cre/tribunal/main.ts` | AI-ASSISTED | **written, not run** | Thin wrapper over the above. SDK registration API unconfirmed until T1 — marked TODO in the file rather than assumed. |
| **Graph layer** | | | |
| `packages/llm/**` | AI-ASSISTED | done | Two backends behind one interface: `claude -p` for testing, Anthropic API for the demo. |
| `packages/mcp-client/**` | AI-ASSISTED | done | Subgraph MCP over SSE. |
| `packages/graph-guard/**` | AI-ASSISTED | done | Human specified the reject-never-degrade rule ([§5.3](design.md)); AI implemented pinning, freshness, and attestation mechanics. 13 tests. |
| `packages/shared/**` | AI-ASSISTED | done | Canonical assertion shape and order-stable digest, so two independent derivations are comparable. |
| **ENS layer** | | | |
| `packages/ens/**` | AI-ASSISTED *(intended)* | planned | Human specifies EAC scoping and the self-write revocation; AI handles ENSv2 beta API mechanics. |
| **Agents** | | | |
| `agents/witness/**` | AI-ASSISTED | done | Human owns the isolation constraint. Witness adopts the claim's metric identity and derives only the value. |
| `agents/claimant/**` | AI-ASSISTED | done | Includes a `false` mode that derives the true value then overstates it, for demo scene 2. |
| `agents/runner/**` (demo scenes) | **HUMAN-LED** *(intended)* | planned | The three scenarios are the human's design (prompt 01) — scene scripts should be human-driven, see §0.6. |
| **Frontend** | | | |
| `app/**` | AI-GENERATED *(intended)* | planned | Dashboard UI is presentation of state the protocol already produces. Mechanically assisted; low design-ownership stakes. |
| **Ops** | | | |
| `scripts/**` (deploy, seed) | AI-GENERATED *(intended)* | planned | Boilerplate deployment plumbing. |
| `scripts/prove-eac.ts` | AI-ASSISTED *(intended)* | planned | Exception to the above: this is the ENS track's central evidence artifact, not plumbing. |
| `README.md` | AI-ASSISTED *(intended)* | planned | Human writes the limitations section ([§6](design.md)) in their own words. |

### 0.4 Decision log — how the human directed the work

Running log of decision points. Each entry records the options that were on the table, what the human chose, and the reasoning — because *the reasoning* is what evidences meaningful involvement, not the choice alone.

| # | Date | Decision point | Options considered | Human decision & reasoning |
|---|---|---|---|---|
| D1 | 2026-09-07 | **The entire core mechanism** | — | Human-authored from scratch, pre-AI: bonded claims, random witness assignment as the anti-collusion primitive, independent re-derivation rather than review-of-reasoning, private TEE adjudication emitting only a verdict, ENS-recorded reputation with writes restricted to the adjudicator. The insight that *reputation the reputed party can write is not reputation* is the human's and drives the ENS design. See `docs/prompts/01-project-brief.md`. |
| D2 | 2026-09-07 | **The honest limitation** | — | Human-authored. Human identified unprompted that random assignment closes *deliberate* collusion but not carelessness or correlated honest error, and required that this be demonstrated on camera rather than disclaimed in text. This constraint shapes demo scenario 3 and [§6](design.md). |
| D3 | 2026-09-07 | **Demo scenario design** | — | Human-authored: the three scenarios (true-claim-challenged, false-claim-punished-and-excluded, collusion-throttled) and the requirement that nothing be narrated that isn't shown. [§7](design.md) is an AI expansion of the human's scenario list into a per-shot checklist. |
| D4 | 2026-09-07 | **Witness randomness source** | Chainlink VRF v2.5 / CRE-internal randomness / commit-reveal + blockhash | **VRF v2.5.** Human reasoning: the anti-collusion claim is the project's central assertion, so randomness provenance must be independently verifiable and unbiasable. Accepted the costs (callback latency, LINK dependency, callback gas ceiling) rather than weaken the claim. This decision directly caused the [§4.3](design.md) gas risk. |
| D5 | 2026-09-07 | **CRE access strategy** | Assume access / assume no access / pursue beta access | **Pursue beta access via the ETHGlobal Discord Chainlink channel**, having observed other teams' requests being granted there, while building simulate-first with a scripted swap to live deployment. Human-sourced intelligence about the access path; AI would have defaulted to the pessimistic branch. |
| D6 | 2026-09-07 | **Demo surface** | Next.js dashboard / CLI + explorer / hybrid | **Next.js dashboard**, for legibility in a 2–4 minute video. Judged that reputation movement is the hardest thing to convey and needs a visual. |
| D7 | 2026-09-07 | **Agent implementation** | LLM agents + Subgraph MCP / deterministic scripted GraphQL / hybrid | **LLM agents driving Subgraph MCP as tools.** Accepted on-camera nondeterminism risk in exchange for a genuine AI use case for The Graph track. |
| D8 | 2026-09-07 | **Attribution regime** | — | Human directed that AI usage be documented as a living log with per-file provenance, that prompts be committed verbatim, and that design ownership be distinguished from implementation assistance throughout. See `docs/prompts/02-ai-usage-policy-directive.md`. |

*(Append D9+ as the build proceeds. Milestone exits are natural checkpoints — see [the build plan](../plan.md).)*

### 0.5 Where attribution lives

Attribution lives in this file, not scattered through the source. Source files carry a one-line purpose comment and a pointer to the relevant design section; they do not repeat provenance labels.

Rationale: duplicated headers drift out of date the moment a file is edited, and a reviewer checking "who wrote what" wants one authoritative table, not 30 comment blocks to cross-reference. The table in §0.3 is that table.

### 0.6 The Involvement requirement — an honest read

The Involvement clause is the one with teeth: *"Submissions that rely entirely on AI without meaningful contributions from team members may not be eligible for partner prizes or finalist consideration."* Being straight about where this project currently stands:

**What is genuinely human and defensible.** The protocol design is human-authored and non-obvious. The three constraints that generate the entire architecture — an auditor you choose is not an auditor, an adjudicator that publishes evidence destroys the mechanism it implements, and reputation the subject can write is not reputation — are the human's, and they are the project. A judge asking "whose idea was this?" has a clear answer, evidenced by prompt 01 predating all AI involvement.

**Where the risk is.** If every file below the design layer ends up labeled AI-GENERATED, the submission is weak under this clause regardless of how good the design was. A plan authored by AI from a human design is fine and explicitly permitted; a codebase with no human authorship in it is the failure mode the clause describes.

**Therefore — components reserved for direct human authorship**, chosen because they are exactly the parts a judge would probe:

1. **`WitnessRoster.sol` assignment + eligibility logic.** This is the anti-collusion mechanism — the project's central claim. The human should write it, or rewrite an AI draft line by line until they can defend every branch without reference to notes.
2. **The three demo scene scripts** (`agents/runner/`). The scenarios are the human's design; the staging is where design meets reality, and the human should feel the friction directly.
3. **The [§6](design.md) limitations text in the README**, written in the human's own words. This is the most intellectually honest part of the submission and should read like a person wrote it.
4. **The enclave boundary decision** ([§3.2](design.md)) — which specific fields may cross out of the TEE. The human owns this table; AI implements against it.

**Anti-pattern to avoid:** accepting AI-drafted code for the four items above and relabeling it AI-ASSISTED without doing the review. The label would be false, and a judge in conversation would find out in about two questions.

### 0.7 Attribution upkeep

- Every milestone ([the build plan](../plan.md)) ends with an attribution pass: update §0.3 statuses, confirm or correct intended provenance labels, append any new decisions to §0.4.
- Any prompt that materially directs committed work gets appended to `docs/prompts/` verbatim.
- Before submission: verify §0.3 has no `planned` rows left and no row is labeled aspirationally.

---

---

[← Docs index](../README.md) · [Concept](design.md) · [Architecture](design.md) · [Contracts](design.md) · [CRE tribunal](design.md) · [ENS](design.md) · [Graph](design.md) · [Demo](design.md) · [Limitations](design.md) · [Prior art](design.md) · [Decisions](decisions.md) · [AI usage](ai-usage.md)
