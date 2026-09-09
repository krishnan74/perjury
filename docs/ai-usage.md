# 0. AI Usage & Attribution

> **This section is written for ETHGlobal judges as much as for the team, and it is a living document — it is updated as each file lands, not reconstructed at the end.** It exists to satisfy ETHGlobal's AI usage policy for ETHOnline 2026 in full.

### 0.0 What a reviewer should know, in one page

If you read nothing else in this file, read this. The rest is the evidence behind it.

**The division of labour on this project is: the human decided what to build and whether it was sound; Claude Code built it.** That split held from the first hour to the last, and it is visible in the artifacts rather than asserted here.

**What the human owned end to end**

- **The idea and the mechanism.** Bonded claims, randomly assigned peer verification, private adjudication that emits only a verdict, and reputation writable only by the adjudicator. All of it predates any AI involvement and is committed verbatim in [`docs/prompts/01-project-brief.md`](prompts/01-project-brief.md). The three constraints that generate the whole architecture — an auditor you choose is not an auditor; an adjudicator that publishes evidence hands future claimants a rubric; reputation the subject can write is not reputation — are the human's, and they are the project.
- **Finding the holes.** The most serious mechanism bug in the project was found by the human asking a question, not by AI review: *what if the witness lies to the tribunal so the verdict comes back Mismatch and it profits?* That was a real, exploitable incentive hole, and it produced [ADR 0007](decisions.md) — the witness fee is now paid on every verdict including Match, and forfeited bonds are payable to nobody. The human then ordered a systematic audit for others, which became [`threat-audit.md`](threat-audit.md).
- **Sanity-checking the mechanism against reality.** Repeatedly, and adversarially: *why do we need all this complexity when we could just log what the agent did?* *Won't this be too much overhead for an agent?* *Isn't this really accountability rather than verification?* Each of those forced a defence or a change. The third one changed the project's framing — the pitch now leads with deterrence and sampling rather than exhaustive verification, because the human was right that "verification" invites the overhead objection immediately.
- **Priorities and scope.** The human ruled that the protocol had to be loophole-free before anything visual was built, which is why the dashboard is still unbuilt and the appeal layer, timeouts and fail-closed reads exist.
- **Sponsor liaison, which materially corrected the code.** The human sourced answers directly from the ENS and Chainlink teams and relayed them. Two examples with consequences: Chainlink confirmed `cre workflow simulate` executes locally rather than in an enclave, which corrected a TEE overclaim that had spread across the repo; and ENS clarified the Enhanced Access Control role model, which determined how the resolver was deployed and locked down.
- **Rejecting AI proposals.** More than once the human declined the options offered and sent the work back. The corroborated-reads mechanism ([design.md §5.5](design.md)) exists because the human brought a competitive analysis showing the Graph integration was hygiene-tier, rejected both approaches Claude proposed, and directed a rethink instead.

**What Claude Code did**

Implementation, and a substantial share of the mechanism proposals that the human then accepted, rejected or amended. Concretely: all Solidity, all TypeScript, the test suites, the deployment scripts, and the prose in most documents. Where a design element originated with Claude rather than the human, the decision log below says so explicitly — see D11, D17 and D19, where the human supplied the problem and Claude supplied the mechanism.

**What is deliberately not claimed**

- The demo scene scripts were reserved for human authorship in §0.6 and Claude wrote them. That row in §0.3 was corrected *downward* rather than left standing.
- Adjudication has never executed inside a TEE. See §0.3 and the [execution log](cre-execution-log.md).

**How the work actually proceeded.** Not a single prompt producing a codebase. It was continuous: the human proposed the mechanism, Claude implemented, the human interrogated the result, found a hole or an overclaim, and directed the fix — dozens of times over. The decision log in §0.4 is the record of those turning points, and every directing prompt is committed in [`docs/prompts/`](prompts/).

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

Status legend: `planned` (not yet written) → `in progress` → `done`. No `planned` rows remain. Every label below describes a file that exists, and one row (`agents/runner/**`) was corrected *downward* when the intended provenance turned out not to match what happened — an intended label is not a claim.

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
| `contracts/src/WitnessRoster.sol` | AI-ASSISTED | done, **reviewed 2026-09-09** | The anti-collusion core. Drafted by AI against human-specified properties, then reviewed line by line by the human — `isEligible`, `_assign` and `_assignPanel`, the three functions the central claim rests on. The review surfaced the `MAX_WALK = 32` roster bound now recorded in [threat-audit.md](threat-audit.md). Label lifted from `⚠ NOT YET HUMAN-LED` only after that work was done (D23). |
| `contracts/src/VerdictSink.sol` | AI-ASSISTED | done | Human specified the single immutable authorized sender and that no setter may exist. |
| `contracts/src/PerjuryStandingWriter.sol` | AI-ASSISTED | done | Human specified the narrow-scope requirement: one mutating function, one record, no reachable path to setAddr/setOwner/roles. |
| `contracts/test/**` | AI-ASSISTED | done | Human specified the test matrix ([§2.5](design.md)) and which negative cases must exist. 55 tests, 1024 fuzz runs. |
| `contracts/src/ens/ENSTextStandingReader.sol` | AI-ASSISTED | done | Human specified that eligibility be a pure function of the ENS record at assignment time — no cache, no cron, no admin. |
| `contracts/test/mocks/Mocks.sol` | AI-GENERATED | done | Test scaffolding: VRF coordinator and an ENS resolver that models EAC enforcement. |
| **CRE workflow** | | | |
| `packages/tribunal/**` | AI-ASSISTED | done | Human specified the enclave boundary ([§3.2](design.md)): what enters, and that only verdict + commitment may leave. AI implemented tolerance comparison and the degeneracy heuristic. 28 tests, incl. leak tests asserting no evidence reaches the report. |
| `cre/tribunal/workflow.ts` | AI-ASSISTED | done | The confidential handler. Human owns the enclave boundary — what may cross out — per §0.6 item 4. Executed via the CRE simulator; **never in a real enclave**, see [execution log](cre-execution-log.md). |
| **Graph layer** | | | |
| `packages/llm/**` | AI-ASSISTED | done | Two backends behind one interface: `claude -p` for testing, Anthropic API for the demo. |
| `packages/mcp-client/**` | AI-ASSISTED | done | Subgraph MCP over SSE. |
| `packages/graph-guard/**` | AI-ASSISTED | done | Human specified the reject-never-degrade rule ([§5.3](design.md)); AI implemented pinning, freshness, attestation, and the corroboration rule proposed under D17/D19. |
| `packages/shared/**` | AI-ASSISTED | done | Canonical assertion shape and order-stable digest, so two independent derivations are comparable. |
| **ENS layer** | | | |
| `packages/ens/**` | AI-ASSISTED | done | Human specified EAC scoping and the self-write revocation, and sourced the ENSv2 role model from the ENS team (D15); AI handled the beta API mechanics. |
| **Agents** | | | |
| `agents/witness/**` | AI-ASSISTED | done | Human owns the isolation constraint. Witness adopts the claim's metric identity and derives only the value. |
| `agents/claimant/**` | AI-ASSISTED | done | Includes a `false` mode that derives the true value then overstates it, for demo scene 2. |
| `agents/runner/**` (demo scenes) | AI-ASSISTED | done | **Label corrected downward.** §0.6 reserved these for human authorship; in practice Claude wrote them against the human's scenario design (prompt 01) and the human directed the terminal-visualisation requirement. The *scenarios* are the human's, the *scripts* are not. All three run on Sepolia. |
| **Frontend** | | | |
| `app/**` | — | **not built** | Dashboard deliberately deprioritised until the protocol was loophole-free (D12). Not started. |
| **Ops** | | | |
| `scripts/**` (deploy, evidence) | AI-GENERATED | done | Deployment plumbing plus `collect-evidence.ts`. `deploy-all.ts` exists because the human questioned a 15-minute manual cascade (D16). |
| `scripts/prove-eac.ts` | AI-ASSISTED | done | Exception to the above: the ENS track's central evidence artifact, not plumbing. |
| `scripts/verify-pinned.ts` | AI-ASSISTED | done | One query pattern against every pinned deployment. Written to make the standardized-schema claim inspectable rather than asserted. |
| `scripts/prove-corroboration.ts` | AI-ASSISTED | done | Demonstrates independently-indexed deployments disagreeing on live data, and the protocol refusing to convict (D17, D19). |
| `docs/threat-audit.md` | AI-ASSISTED | done | Findings enumerated by Claude on the human's instruction after the human found the first one themselves (D11, D12). |

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

| D9 | 2026-09-08 | **Documentation volume** | 26 separate docs / consolidate | **Consolidate to 9.** Human's reasoning: a reviewer with limited time will not read 26 files, and volume reads as padding rather than rigour. |
| D10 | 2026-09-08 | **Commit attribution** | Keep `Co-Authored-By` trailers / strip them | **Strip.** AI involvement is documented in this file, not as a repo contributor. Applied retroactively across history. |
| D11 | 2026-09-08 | **The lying-witness incentive** *(most consequential finding in the project)* | — | **Human found it by questioning the mechanism**, unprompted: if the witness is paid from the loser's bond, it profits by submitting evidence that forces a Mismatch. This was real and exploitable. Claude proposed the fix and the human accepted it: the witness fee is paid on *every* verdict including Match, the forfeited bond is payable to nobody, and the tribunal recomputes both sides from raw evidence with an asymmetric rule so a witness cannot convert junk into a slash. See [ADR 0007](decisions.md). **Attribution split: the hole is the human's finding, the mechanism is Claude's.** |
| D12 | 2026-09-08 | **Audit scope and build order** | Ship features / audit first | **Audit first, and no visualisation until the protocol is loophole-free.** Human directed a systematic hunt after D11 rather than waiting to be asked again; the result is [`threat-audit.md`](threat-audit.md), nine findings, all closed. The dashboard remains unbuilt as a direct consequence of this ordering. |
| D13 | 2026-09-08 | **How the project is framed** | "Verification" / "accountability" | **Accountability, with deterrence rather than detection.** Human challenged the premise repeatedly — why not just log the agent's actions, isn't this too much overhead for real agent work, is this not really about the fear of losing a bond. The last framing is the human's and it is better than the one it replaced: "verification" implies checking everything and invites the overhead objection immediately. This rewrote the pitch. |
| D14 | 2026-09-08 | **Sponsor feedback honesty** | Comprehensive / only first-hand | **Only what we actually experienced, with evidence, and no padding.** Human's instruction was explicit: do not write anything merely to improve the odds of winning. Four claims were removed from the feedback docs as a result. |
| D15 | 2026-09-08 | **Sponsor liaison as a correctness input** | — | **Human-sourced, and it corrected shipped work twice.** Chainlink confirmed `cre workflow simulate` runs locally, not in an enclave — correcting a TEE overclaim that had propagated through several documents. ENS clarified the Enhanced Access Control role model (`grantSetterRoles`, root-resource grants, `revokeRootRoles`), which determined how the resolver was deployed and how the operator's own write access was revoked. Neither was discoverable from the documentation available to Claude. |
| D16 | 2026-09-08 | **Deployment cascade** | Hand-run the steps / one script | **One script.** Prompted by the human observing a 15-minute manual cascade and asking why. `scripts/deploy-all.ts` now does it in roughly four minutes, after a partial hand-run had once permanently locked a roster to a codeless address. |
| D17 | 2026-09-09 | **Graph track positioning** | Accept current integration / add breadth / add Substreams / rethink | **Rethink, having rejected the first three.** Human brought a competitive analysis showing the Graph integration was hygiene-tier — mechanically similar to a prior third-place project — and declined both levers Claude proposed as insufficient. The rethink produced corroborated reads: a deployment id is a content hash of the mapping code, so independently-indexed deployments are independent derivations, and disagreement between them returns `Unverifiable`. **Attribution split: the challenge and the rejection are the human's, the mechanism is Claude's.** |
| D18 | 2026-09-09 | **References to other teams' projects** | Keep as prior art / remove | **Remove.** Comparisons to other ETHGlobal submissions are gone from the repository docs. Public protocols (UMA, Kleros, Truebit, EigenLayer) remain cited in [design.md §8](design.md), because naming genuine prior art is what makes a novelty claim credible. |
| D19 | 2026-09-09 | **What corroboration does when sources disagree** | Majority wins / prefer primary / refuse | **Refuse — return `Unverifiable`.** Claude proposed the rule and the human accepted it. Reasoning: if independent indexers disagree the underlying fact is contested, and picking a winner would invent a fact the data layer does not support. Also fixed the tolerance invariant — corroboration tolerance may never exceed adjudication tolerance, or the choice of source would decide who loses a bond. |

| D20 | 2026-09-09 | **Reviewing what won these tracks previously** | Ignore prior winners / study them | **Study them, and act on the gap.** Human supplied seven prior winning projects and asked what could be improved. Two things came out: the Graph work was extended to a second standardized schema family and five chains, and — reading how a winning project bound identity to ENS — a severe hole was found in our own registration path, which accepted any ENS name without proving the caller had been issued it. **Attribution: the human directed the review and chose to act on it; Claude found the specific hole and built both fixes.** |
| D21 | 2026-09-09 | **How to prove control of an ENS name** | Forward `addr` resolution / registry ownership / issuance text record | **Issuance text record**, after discovering the ENSv2 Permissioned Resolver implementation carries no `addr()`/`setAddr()` at all — checked against deployed bytecode rather than assumed, which is the lesson from the earlier `text()` incident. Scoped to a different EAC key than standing, so the tribunal cannot decide whose reputation a record is. Documented as proving issuance rather than ownership. |

| D22 | 2026-09-09 | **Provenance was asserted by the agents, not verified by the tribunal** | Correct the doc / tighten the enclave | **Tighten the enclave.** Human asked whether the CRE workflow re-derives Graph data; it does not — it recomputes each party's value from that party's own submitted evidence. Checking that surfaced an overclaim in design.md §5.3, which said the tribunal decided whether provenance was adequate when it only checked that an attestation existed. Rather than soften the sentence, the enclave now re-validates the deployment allowlist, indexing errors, per-chain freshness, and block agreement. Chosen partly because it needed no contract redeploy. **Attribution: the human's question found the gap; Claude proposed and built the fix.** |

| D23 | 2026-09-09 | **`WitnessRoster.sol` line-by-line review** | Relabel without reviewing / review, then relabel | **Reviewed, then relabelled.** The human read the three functions the anti-collusion claim rests on — `isEligible`, `_assign`, `_assignPanel` — and the `⚠ NOT YET HUMAN-LED` label was lifted only afterwards. The review's concrete output is the `MAX_WALK = 32` roster bound: below 33 agents the walk covers the whole ring, above it a draw can report no eligible witness while eligible agents exist further round. It fails closed and the demo roster is five, so it is documented as a known bound rather than fixed. |

*(Append D24+ as the build proceeds. Milestone exits are natural checkpoints — see [the build plan](../plan.md).)*

### 0.5 Where attribution lives

Attribution lives in this file, not scattered through the source. Source files carry a one-line purpose comment and a pointer to the relevant design section; they do not repeat provenance labels.

Rationale: duplicated headers drift out of date the moment a file is edited, and a reviewer checking "who wrote what" wants one authoritative table, not 30 comment blocks to cross-reference. The table in §0.3 is that table.

### 0.6 The Involvement requirement — an honest read

The Involvement clause is the one with teeth: *"Submissions that rely entirely on AI without meaningful contributions from team members may not be eligible for partner prizes or finalist consideration."* Being straight about where this project currently stands:

**What is genuinely human and defensible.** The protocol design is human-authored and non-obvious. The three constraints that generate the entire architecture — an auditor you choose is not an auditor, an adjudicator that publishes evidence destroys the mechanism it implements, and reputation the subject can write is not reputation — are the human's, and they are the project. A judge asking "whose idea was this?" has a clear answer, evidenced by prompt 01 predating all AI involvement.

**Where the risk is.** If every file below the design layer ends up labeled AI-GENERATED, the submission is weak under this clause regardless of how good the design was. A plan authored by AI from a human design is fine and explicitly permitted; a codebase with no human authorship in it is the failure mode the clause describes.

**Components reserved for direct human authorship, and their actual status.** These were chosen because they are exactly the parts a judge would probe. Reporting honestly on how the reservation held:

| # | Reserved item | Status |
|---|---|---|
| 1 | **`WitnessRoster.sol` assignment + eligibility logic** — the anti-collusion mechanism, the project's central claim | ✅ **Held.** Drafted by Claude, then reviewed line by line by the human on 2026-09-09, focused on `isEligible`, `_assign` and `_assignPanel`. The `⚠ NOT YET HUMAN-LED` label was carried for two days and lifted only after the review, not before it. |
| 2 | **The three demo scene scripts** (`agents/runner/`) | ❌ **Not honoured.** Claude wrote them; the human designed the scenarios and directed the terminal-visualisation requirement. §0.3 has been corrected downward rather than left claiming otherwise. |
| 3 | **The [§6](design.md) limitations text in the README**, in the human's own words | ⚠ **Outstanding.** Currently Claude's prose expressing the human's analysis (D2). |
| 4 | **The enclave boundary** ([§3.2](design.md)) — which fields may cross out of the TEE | ✅ **Held.** The human owns the boundary decision; Claude implemented against it, and `packages/tribunal` carries leak tests asserting no evidence reaches the report. |

Two of four held, one outstanding, one not honoured. The interesting row is the first: it carried a `⚠ NOT YET HUMAN-LED` warning for two days while the review was outstanding, and the label moved only when the work was actually done. That is the discipline the whole table depends on — relabelling AI-drafted code as human-reviewed without doing the review would be a false claim a judge would uncover in about two questions.

**What this does not undercut.** The Involvement clause asks for meaningful human contribution, and this project has it in the place that matters most: the design and its interrogation. The mechanism is the human's, sustained direction shaped every layer built on top of it, and the nineteen entries in §0.4 record where that direction changed the outcome. The single most serious flaw in the mechanism was found by the human questioning it, and the project's framing was rewritten because the human challenged the premise — see §0.0.

### 0.7 Attribution upkeep

- Every milestone ([the build plan](../plan.md)) ends with an attribution pass: update §0.3 statuses, confirm or correct intended provenance labels, append any new decisions to §0.4.
- Any prompt that materially directs committed work gets appended to `docs/prompts/` verbatim.
- Before submission: verify §0.3 has no `planned` rows left and no row is labeled aspirationally.

---

---

[← Docs index](../README.md) · [Concept](design.md) · [Architecture](design.md) · [Contracts](design.md) · [CRE tribunal](design.md) · [ENS](design.md) · [Graph](design.md) · [Demo](design.md) · [Limitations](design.md) · [Prior art](design.md) · [Decisions](decisions.md) · [AI usage](ai-usage.md)
