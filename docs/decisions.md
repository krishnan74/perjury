# Decision Records

Architectural decisions with the options that were rejected and why — the reasoning is the interesting part. Append-only; superseded decisions get marked, not deleted.

Decisions still open are tracked in [`../plan.md`](../plan.md).

| # | Decision | Date | Status |
|---|---|---|---|
| [0001](#0001-use-chainlink-vrf-v25-for-witness-assignment) | Chainlink VRF v2.5 for witness assignment | 2026-09-07 | Accepted |
| [0002](#0002-pursue-cre-beta-access-build-simulate-first-regardless) | Pursue CRE beta access; build simulate-first | 2026-09-07 | Accepted |
| [0003](#0003-nextjs-dashboard-as-the-demo-surface) | Next.js dashboard as the demo surface | 2026-09-07 | ⚠️ Superseded — terminal scenes instead |
| [0004](#0004-llm-agents-driving-subgraph-mcp-not-scripted-graphql) | LLM agents driving Subgraph MCP | 2026-09-07 | Accepted |
| [0005](#0005-living-attribution-log-with-committed-prompts) | Living attribution log + committed prompts | 2026-09-07 | Accepted |
| [0006](#0006-keep-cre_report_writer-immutable-despite-chainlinks-advice) | Keep CRE_REPORT_WRITER immutable | 2026-09-08 | Accepted |
| [0007](#0007-close-the-lying-witness-incentive) | Close the lying-witness incentive | 2026-09-08 | Accepted |
| [0008](#0008-refuse-to-adjudicate-when-independent-indexers-disagree) | Refuse to adjudicate when independent indexers disagree | 2026-09-09 | Accepted |

---

## 0001. Use Chainlink VRF v2.5 for witness assignment

**Date:** 2026-09-07 **Status:** Accepted **Decided by:** Project lead (human)

### Context

Random witness assignment is not a feature of Perjury — it *is* Perjury. The entire anti-collusion claim reduces to "a claimant cannot choose, influence, or predict its witness." If the randomness is weak, the protocol has no security property worth demonstrating, and a judge who pulls on that thread finds nothing underneath.

So the question isn't "what's the cheapest randomness that works," it's "what randomness survives a hostile reading."

### Options considered

| Option | Pros | Cons |
|---|---|---|
| **Chainlink VRF v2.5** | Verifiable, unbiasable, independently auditable. Request and fulfilment are both on-chain txs we can put on camera. Reinforces the Chainlink track. | Two-block latency. Testnet LINK dependency. Callback gas ceiling constrains what we can do inside `fulfillRandomWords`. |
| **CRE workflow generates the randomness** | Fewer moving parts; the tribunal is already in the stack. | Randomness provenance is weak on camera — "trust the enclave" is a worse story than "here's the VRF fulfilment tx." Also conflates assignment with adjudication, so one compromised component breaks both. |
| **Commit-reveal / future blockhash** | No external dependency, cheapest, no LINK. | Blockhash is weakly manipulable by proposers. Undercuts the central claim precisely where it needs to be strongest. |

### Decision

**Chainlink VRF v2.5.** The anti-collusion claim is the project's central assertion, so randomness provenance must be independently verifiable rather than merely asserted. The latency and LINK costs are real and accepted; weakening the claim to avoid them would have made the rest of the build pointless.

### Consequences

- Assignment happens in a VRF callback, which introduces a **hard gas ceiling** on anything we do at assignment time. This directly collides with the requirement that eligibility be read live from ENS (see [`../05-ens.md`](design.md#4-ens-integration-design-ensv2-sepolia-beta) §4.3) — the two decisions are in tension and the tension is real, not theoretical.
- Tracked as risk #2 in [`../../plan.md`](../plan.md), with a designed fallback (two-step assign: VRF stores the seed, a permissionless `finalizeAssignment()` does the eligibility walk) to be decided at M3 rather than on demo day.
- Gives us two linkable transactions per assignment for the demo, which is worth more on camera than a single opaque one.

---

## 0002. Pursue CRE beta access; build simulate-first regardless

**Date:** 2026-09-07 **Status:** Accepted **Decided by:** Project lead (human)

### Context

Chainlink Confidential Workflows — the tribunal, and the thing the whole protocol depends on — is **invite-only private beta**. You request enrollment through a Chainlink account team. That is an external gate on the single most important component in the project, which is an uncomfortable place to start a hackathon build.

Observed in the ETHGlobal Discord Chainlink channel: other teams are posting access requests and a Chainlink representative is responding to them. So the gate is passable, on a timeline we don't control.

### Options considered

| Option | Pros | Cons |
|---|---|---|
| **Assume access will land; build for live deploy** | Cleanest end state. | If it doesn't land, the core component is vapor at demo time. Unacceptable risk on the critical path. |
| **Assume no access; design around the TEE** | No external dependency. | Abandons the Chainlink track and, more importantly, abandons the confidentiality property that makes the mechanism work at all. Not a real option. |
| **Request access now, build simulate-first with a scripted swap** | De-risked either way. `cre workflow simulate --broadcast` executes the real workflow binary and broadcasts real Sepolia transactions, so the demo is honest with or without the enclave. | Two deployment paths to keep working. Requires the swap point to be genuinely one line, not a refactor. |

### Update — Sep 7, after checking the docs

The access path is an **official Google Form**, not a Discord conversation: <https://docs.google.com/forms/d/e/1FAIpQLSdk8mxDZAXpEX1PHgjzCoBeKxSoQysoO9sxOb-gpBrDrjOhtA/viewform>

More importantly, Chainlink's docs state plainly: *"After submitting your request, you don't need to wait for early access. Your CRE organization can run Confidential Workflows using the local simulator."*

**This removes the external gate from the critical path.** T1 is no longer blocked on anyone's response — it needs the CRE CLI and an org, both self-serve. The decision below stands unchanged; what changes is that the fallback was never really a fallback, and the risk ranking overstated this item. Submit the form anyway (live deployment is still nicer for the video), but do not sequence around waiting for it.

## Decision

**Submit the access form on day zero, then build simulate-first with a clean swap to live deployment.** Chainlink's own track requirements accept "execution via simulation or live deployment with evidence," so the simulate path is not a degraded submission — it is a qualifying one.

The access request is item zero of M0, before any code. It costs one Discord message and everything downstream is faster if it's granted early.

### Consequences

- The **only** thing that differs between the two paths is `CRE_REPORT_WRITER` in `VerdictSink`. That constraint is load-bearing and constrains the contract design: no setter, so the swap is a redeploy + roster re-point, scripted to take under 30 minutes.
- Evidence capture (simulation logs, TEE handler registration, tx hashes) is required either way, so it's built into M1's exit criteria rather than gathered at the end.
- The demo video is recorded *after* whichever path is final — not re-cut twice.
- Tracked as risk #1 in [`../../plan.md`](../plan.md).

---

## 0003. Next.js dashboard as the demo surface

**Date:** 2026-09-07 **Status:** ⚠️ **Superseded in practice — not built** (see note below) **Decided by:** Project lead (human)

> **What actually happened.** The dashboard was never built. After the lying-witness incentive surfaced ([0007](#0007-close-the-lying-witness-incentive)), the human ruled that the protocol had to be loophole-free before anything visual, and the time went into the appeal layer, timeouts, fail-closed reads and corroborated reads instead. The demo surface became **ANSI-rendered terminal scenes** (`agents/runner/scene{1,2,3}.ts`) that read live chain state — roster tables with eligibility, before/after standing arrows, boxed verdicts, linked tx hashes.
>
> The reasoning below still holds, and the cost is real: reputation *movement* is less vivid in a terminal than it would be in a rendered bar. What the terminal buys back is that every number on screen is read from chain at that moment, with nothing between the viewer and the source. The decision is recorded as superseded rather than deleted, per this file's own rule.

### Context

Submission is a public repo plus a 2–4 minute video. No in-person judging, no live walkthrough, no chance to explain something a judge misses. Whatever isn't legible on screen in those minutes does not exist.

The hardest thing to convey is reputation *movement* — a number on an ENS text record going up and down, and an agent silently dropping out of the eligible set as a consequence. That's the payoff of the entire mechanism and it's invisible in a terminal.

### Options considered

| Option | Pros | Cons |
|---|---|---|
| **Next.js dashboard** | Reputation bars that visibly move; eligibility roster that visibly excludes; the agent's MCP tool calls streaming on screen. Can show the sealed-evidence-vs-published-verdict contrast side by side. | Real build time in M6, competing with getting the protocol working. |
| **CLI + block explorer only** | Fastest. All evidence is raw txs, which is maximally credible. | Reputation changes are invisible. A judge watches hex scroll past and takes our word for what it means. |
| **Thin read-only web view + CLI agents** | Middle cost. | Splits attention across two surfaces in a 4-minute video; neither ends up polished. |

### Decision

**Next.js dashboard.** Legibility in the video is worth the M6 build cost. The specific thing it buys that a CLI cannot: showing that the on-chain verdict contains *only* a verdict while the evidence stayed sealed — the confidentiality property is otherwise unfilmable.

### Consequences

- The dashboard is sequenced **last** (M6), after the protocol genuinely works. It presents state the protocol already produces; it must never become the place where behavior is faked for the camera.
- It renders from chain and Graph reads, not from an app database — so nothing on screen can drift from what actually happened on-chain.
- Attribution note: the dashboard is the one component intended as AI-GENERATED (see [`../ai-usage.md`](ai-usage.md) §0.3). It's presentation of state, with low design-ownership stakes — unlike the mechanism it displays.

---

## 0004. LLM agents driving Subgraph MCP, not scripted GraphQL

**Date:** 2026-09-07 **Status:** Accepted **Decided by:** Project lead (human)

### Context

The witness has to independently re-derive a finding from live on-chain data. *How* it does that determines whether this is an AI project or a cron job with a GraphQL string in it.

The Graph's AI track requires the Graph to be "load-bearing infrastructure" performing "meaningful work (reasoning, decisions, automation)" — explicitly not printing a raw query result.

### Options considered

| Option | Pros | Cons |
|---|---|---|
| **LLM agents with Subgraph MCP as tools** | The agent picks the subgraph, reads the schema, and composes its own query. That's genuine reasoning over Graph data, and it's visible on camera as a tool-call stream. | Nondeterministic on camera. A bad roll during recording breaks a take. |
| **Deterministic TS + hardcoded GraphQL** | Reliable, reproducible, trivially testable. | The "witness" is then a script with a fixed query, and the independence claim gets thin — two agents running the same hardcoded query aren't independently deriving anything. Weak fit for the track. |
| **Hybrid: LLM selects, deterministic layer verifies** | Best of both. | Was effectively adopted anyway — see Decision. |

### Decision

**LLM agents driving the Subgraph MCP**, with a deterministic guard layer wrapping every read. In practice this is the hybrid: the LLM does subgraph selection, schema interpretation, and query composition; `packages/graph-guard` deterministically enforces deployment-ID pinning and freshness and normalizes the output into a hashable typed assertion.

The split matters: **the reasoning is the agent's, the provenance guarantees are not.** An LLM cannot be trusted to honestly report whether its own data was stale, so that check lives outside it.

### Consequences

- On-camera nondeterminism is a real risk (#4 in [`../../plan.md`](../plan.md)). Mitigated by pinned model, temperature 0, capped tool-call rounds, ≥5 rehearsals per scene, and a known-good fallback take.
- Claimant and witness must run as **separate processes with separate keys and no shared memory or message channel**, so "the witness never sees the claimant's reasoning" is true by construction rather than by prompt instruction. A prompt saying "don't look at this" is not an isolation boundary.
- The guard layer becomes the place where the reject-never-degrade rule is enforced (see [`../06-graph.md`](design.md#5-graph-integration-design) §5.3).

---

## 0005. Living attribution log with committed prompts

**Date:** 2026-09-07 **Status:** Accepted **Decided by:** Project lead (human)

### Context

ETHGlobal's AI usage policy for ETHOnline 2026 has three clauses: attribution down to specific files, meaningful human involvement (not merely AI output), and — if spec-driven workflows are used — every spec file, prompt, and planning artifact committed to the repo.

The Involvement clause is the one with consequences: submissions relying entirely on AI "may not be eligible for partner prizes or finalist consideration."

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
- Attribution is recorded in one authoritative table rather than duplicated into source headers, which drift out of date the moment a file is edited.
- Every prompt that materially directs committed work is committed verbatim to [`../prompts/`](prompts/), including prompts that led to approaches later abandoned.
- Four components are reserved for direct human authorship, chosen because they're what a judge would probe: the witness assignment logic, the demo scene scripts, the limitations write-up, and the enclave boundary definition.

### Consequences

- Adds an attribution pass to every milestone's exit criteria.
- Establishes an explicit honesty rule: a file is only labeled AI-ASSISTED once the human has actually done the review and can defend the design unaided. Labeling aspirationally would fail the clause it's meant to satisfy, and would collapse in about two questions of conversation.
- The human's voice is required in specific places (concept framing, limitations). Those are marked as TODO stubs rather than ghost-written — a ghost-written "in my own words" section defeats the purpose of the exercise.


---

## 0006. Keep CRE_REPORT_WRITER immutable, despite Chainlink's advice

**Date:** 2026-09-08
**Status:** Accepted
**Decided by:** Project lead (human), on a recommendation we declined

### Context

`VerdictSink` accepts reports from exactly one address, set at construction with no setter. That is the mechanical expression of the project's central claim: nobody — not the operators, not the deployer — can change who is allowed to write a verdict.

Asked in the Chainlink channel whether the Forwarder address is stable, we got a clear answer plus a recommendation:

> "The Forwarder contract is stable, and you can find the address here [forwarder directory]. `--broadcast` might use a different mock forwarder from the deployed ones. I recommend you make this variable editable in your contract."

The factual part resolved our blocker. Two forwarders exist on Sepolia, both documented and stable:

| | Address |
|---|---|
| Mock (simulation) | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
| Production (deployed workflows) | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

Our probe had measured the mock — correctly, since we were running `simulate --broadcast`.

### Options considered

| Option | Pros | Cons |
|---|---|---|
| **Editable address with an owner** (as recommended) | One deployment survives the move from simulation to production. Standard, sensible engineering. | An owner who can repoint the sink can forge any verdict. It reintroduces exactly the trusted party the protocol exists to remove. |
| **Immutable, redeploy per environment** | The claim "no one can change who writes verdicts" stays literally true and greppable. | One redeploy when moving simulation → production. |
| **Immutable, accept either forwarder** | No redeploy. | Two addresses can write verdicts, and one of them is a *mock* — strictly worse than either alternative. |

### Decision

**Keep it immutable.** Deploy `VerdictSink` with the forwarder matching how the workflow actually executes: the mock while we are on `simulate --broadcast`, production if deploy access lands.

The recommendation is good general advice and we're declining it for a specific reason. A judge reading our contracts will look for an escape hatch, because we claim there isn't one. A setter — even an owner-only one used honestly — turns "cannot" into "chose not to", and that is the entire difference between this protocol and a scoreboard someone maintains.

Now that both addresses are documented and stable, the cost of immutability is one redeploy of one contract. That is a small price for a claim that survives inspection.

### Consequences

- `VerdictSink` is deployed **last**, after the environment is known. `DeployCore.s.sol` already excludes it for this reason.
- Moving to production means redeploying `VerdictSink` and calling `wireSink` on the registry and writer — both one-time and currently unset, so no redeploy of the other contracts.
- `.env.example` documents both addresses so the wrong one can't be picked by accident.

---

## 0007. Close the lying-witness incentive

**Date:** 2026-09-08
**Status:** Accepted
**Decided by:** Project lead (human), from a review question

### Context

The original settlement paid the entire claimant bond to the witness on Mismatch, and the witness staked nothing:

```solidity
address beneficiary = c.verdict == Verdict.Mismatch ? c.witness : c.claimant;
```

A rational witness therefore always reports disagreement. It captures the bond when it lies and earns nothing when it is honest, with no downside either way. **Lying was not a temptation, it was the dominant strategy.**

We missed this because both demo scenarios modelled a lying *claimant* and an honest witness. The entire design was built around the wrong adversary — the party we were watching was not the party with the incentive.

The tribunal could not catch it either. It compared two *stated* findings; when the witness stated a false value the tribunal saw genuine disagreement and ruled Mismatch correctly on its inputs. Provenance checks confirm data was fresh and pinned, not that the conclusion drawn from it was honest.

### Decision

Four changes, each closing a different part of the hole.

**1. The tribunal derives values from raw evidence, not from stated conclusions.** Both parties already submit their raw query results alongside a derived assertion. The tribunal now recomputes from the evidence and ignores what either party claimed the answer was. A lying witness must fabricate an internally consistent subgraph response that still carries a pinned deployment ID and a fresh block — a far higher bar than changing a number.

**2. Agents stake at registration.** A registration bond makes an agent eligible to be drawn, and is slashable when the agent is shown to have lied. This also converts sybil resistance from rhetorical to economic: each additional identity costs real money rather than a gas fee.

**3. The witness is paid the same regardless of verdict.** A flat fee funded by a claim-submission fee, paid on Match, Mismatch and Unverifiable alike. The witness becomes financially indifferent to the outcome, which removes the incentive at its root rather than policing it after the fact.

**4. Verdicts can be appealed.** Within a challenge window either party may appeal by posting an appeal bond. The appeal draws a panel of additional witnesses by VRF, excluding the claimant, the original witness and the appellant. The panel's majority finding stands; whoever is contradicted is slashed from their registration stake, and a failed appeal forfeits the appeal bond.

### Consequences

- Settlement is no longer a single transfer of the bond. `ClaimRegistry` gains fee accounting and slashing.
- `WitnessRoster` gains staking, and assignment must exclude more parties during an appeal.
- An appeal costs several VRF rounds — roughly 9 LINK reserved per draw at our callback limit, so a three-witness panel needs ~27 LINK available.
- The demo needs more registered agents: claimant, original witness, and a panel of three is five minimum.
- What remains open: a panel can still be wrong, and appeals could in principle recurse. We cap escalation at one round and say so.

### Parameters (defaults, tunable)

| | Value | Why |
|---|---|---|
| Registration stake | 0.05 ETH proposed · **0.01 ETH deployed** | Several times the claim bond, so lying to win one bond is unprofitable. Lowered on testnet so five agents could be funded from one faucet balance; the ratio to the bond is what matters and it is preserved |
| Claim bond | 0.01 ETH | Visible on camera, cheap enough to fund several agents |
| Witness fee | 0.002 ETH | Paid regardless of verdict, funded by the claimant's submission fee |
| Appeal bond | 0.02 ETH | Higher than the claim bond, to deter nuisance appeals |
| Appeal panel | 3 witnesses | Smallest odd number that yields a majority |
| Challenge window | 1 hour proposed · **90s deployed** | Long enough to appeal, short enough to demo. At 30s the appeal in scene 2 raced the window and intermittently reverted `WindowClosed`: the gap between a verdict landing and an appeal being mined is one confirmation. An hour is right for production and unfilmable — a scene would take an hour to settle. Response window is 600s. Both are constructor parameters, not constants, precisely so this is a deployment choice rather than a code change |

---

## 0008. Refuse to adjudicate when independent indexers disagree

**Date:** 2026-09-09 · **Status:** Accepted

### Context

Perjury's premise is that a second agent independently re-derives a claim. But claimant and witness were reading the *same* pinned deployment, so they re-derived the **query** while sharing the **derivation**. A bug in that subgraph's mapping code yields two honest agents agreeing on a wrong number, and the protocol settles a `Match` on it — paying out and raising both parties' standing.

We had documented this as an unfixable limitation ([design.md §6](design.md)). It turned out to be fixable, because of a property specific to The Graph: a deployment id is a content hash of the mapping code, not merely an endpoint name. Two deployments indexing one protocol are two independent derivations of the same chain state, written by different people. An RPC offers nothing equivalent — it has exactly one derivation, so reading it twice buys nothing.

### Options considered

**Majority wins.** Read N deployments, take the modal value. Rejected: with two sources there is no majority, and with three it manufactures a decision. Worse, it means the protocol asserts a fact that its own inputs contradict.

**Prefer the primary, log the divergence.** Simple, and preserves liveness. Rejected for the same reason in weaker form — a claimant would be convicted on a number that a second independent index says is wrong, and the disagreement would sit in a log nobody reads.

**Widen the tolerance until they agree.** Rejected outright. This hides the problem and, if the corroboration tolerance ever exceeded the adjudication tolerance, the choice of source would silently decide who loses a bond.

**Refuse — return `Unverifiable`.** Chosen.

### Decision

Where a protocol has more than one independent deployment, a read is attested only if they agree within `CORROBORATION_BPS`. Divergence raises `corroboration-divergence`, which the agents already convert into `Unverifiable`: bond returned, no slash, no standing change.

Two supporting constraints:

1. **`CORROBORATION_BPS` may never exceed the tribunal's adjudication tolerance.** Otherwise two sources could differ by more than the margin that decides a verdict while still counting as agreeing. A unit test asserts the invariant rather than trusting the constants to be edited together.
2. **The reduction applied to each source is deterministic and LLM-free.** An LLM interpreting each source separately could paper over a real divergence, or manufacture one.

Single-source reads are recorded as such, not rejected. Plurality is thin across the ecosystem, and refusing to verify without it would make the protocol useless rather than rigorous.

### Consequences

- The protocol can now decline to adjudicate because the *data layer* is contested, which is a new verdict cause and a genuinely new class of outcome.
- Liveness drops where plurality exists and sources disagree — by design. Morpho Aave V3 is currently unverifiable through Perjury, and that is the correct answer rather than a bug.
- The guarantee is uneven across protocols. Only one of five pinned subjects has a second independent index, so for the rest the original limitation stands and travels with the verdict as `single-source`.
- It does not touch correlated error upstream of indexing. If the chain data or the protocol itself is misleading, every indexer inherits it.
- Observed live on the day it shipped: two Morpho Aave V3 deployments, same Messari schema, identical block, 488 bps apart. `npx tsx scripts/prove-corroboration.ts`.

---

## 0009. Archive the agents' evidence after settlement, on testnet only

**Date:** 2026-09-10 · **Status:** Accepted

### Context

Nothing about an agent's work survived a run. `publish-evidence.ts` built an `EvidenceBundle` — each side's query, deployment id, pinned block, raw result, derived value and methodology — published it to a fresh gist, and kept only the newest URL in the CRE config. The chain keeps `claimHash` and `evidenceCommitment`, which are hashes: they prove the evidence existed and show none of it.

So a settled verdict could be proven to have happened and never inspected. `/replay` could say *that* the tribunal ruled and never *how* it was reached, which is the part worth watching and the part that carries the whole thesis: two agents, no channel between them, working the same question.

Two facts made this less of a new disclosure than it first appeared. The gist was already world-readable, and its URL is committed to a public repo in `cre/tribunal/config.staging.json` — so the evidence had been reachable by anyone since the first run, while two pages of the site said it was withheld. And `cre/tribunal/workflow.ts` builds the commitment specifically so a party may later reveal its inputs and have anyone verify the tribunal judged those exact bytes. Disclosure was always an anticipated move; it just had no record.

### Options considered

**Archive nothing; draw the flow as structure.** The replay names the steps and marks every value unavailable. Honest, and communicates roughly what the bullet list it replaces did. Rejected: it fails the only test that matters, which is whether somebody who has never heard of Perjury can explain the mechanism back to you afterwards.

**Archive a redacted subset.** Keep the query, deployment, block and derived value; drop the raw result and the methodology string, preserving the "never emitted" comment on `SealedSubmission.methodology`. Rejected: the methodology *is* the agent's reasoning, and a card that shows a number without it invites the reader to trust the number.

**Archive the full bundle after settlement.** Chosen, for testnet.

### Decision

After settlement the runner writes `evidence-archive/<claimId>.json` and it is committed. This is **demo and testnet tooling**: it lives in `agents/runner/`, no contract knows it exists, and it is not part of the protocol.

Production is unchanged and is specified in [design.md §3.5](design.md): the bundle is stored as an encrypted blob with the key held by the Vault DON, decryptable only inside the confidential workflow. Under that design the evidence stays confidential indefinitely, neither party ever sees the other's work, and any later disclosure is a party's own choice — checkable against the on-chain commitment.

Runs made before this existed were recovered by `scripts/archive-evidence.ts`, which recomputes the tribunal's commitment over each candidate bundle and keeps only exact matches against `VerdictRecorded`. Claim ids reset on every redeploy, so several bundles share an id and the description cannot identify which one a claim was judged against. It verified three settled claims and rejected seven decoys. Nothing is archived on the strength of a matching filename.

### Consequences

- The replay can show what each agent asked, got and concluded, and can state the strongest thing available: on claim 23 both parties were handed identical rows and their conclusions differ by 24.25 points, so the disagreement cannot be blamed on the data.
- **Two pages of site copy had to change**, because both described withholding as present fact. The claim detail page said publishing would hand the next claimant a rubric; the replay's seal panel briefly justified the archive by inventing a principle — that confidentiality "was never meant to be permanent" — which is not this design. Both now separate what is true on this build from what is designed.
- The demo therefore discloses more than production will, and that has to be labelled everywhere it is visible rather than explained once in a doc.
- It did not close the gateway gap, which was a separate matter and is now closed by [ADR 0010](#0010-seal-the-evidence-store-so-only-the-enclave-can-read-it). Writing this decision down is what made that gap impossible to keep deferring: two pages of copy had to be corrected twice in one day, once to admit the store was plaintext and again once it no longer was.
- Archives are only meaningful next to the deployment that produced them, since claim ids restart. The commitment is the join, not the id.

---

## 0010. Seal the evidence store, so only the enclave can read it

**Date:** 2026-09-10 · **Status:** Accepted

### Context

The gateway was the last plaintext in the system. Transport was already confidential — the enclave fetches over Confidential HTTP, so node operators see neither the request nor the response — but the store itself was a GitHub gist, and a URL is not an access control. Worse, *this repo publishes that URL*: `cre/tribunal/config.staging.json` is committed, so anyone cloning the project could read both parties' evidence for the most recent claim.

[design.md §3.2](design.md) recorded this as a gap and §3.5 specified the fix. It sat unbuilt because it was filed as a nice-to-have. Writing [ADR 0009](#0009-archive-the-agents-evidence-after-settlement-on-testnet-only) is what made it undeferrable: once the disclosure was written down, two pages of site copy had to be corrected to stop claiming the evidence was withheld, and the corrected copy read badly precisely because the underlying claim was weaker than the design.

### Options considered

**Move the store somewhere private.** An authenticated endpoint the enclave has credentials for. Rejected: it replaces a cryptographic property with an operational one, and the credential becomes a thing that leaks. It also does nothing about the operator of the store.

**Encrypt with a symmetric key held in the Vault DON.** Simpler, and the agents would need that key to encrypt. Rejected: every agent holding the decryption key means every agent can read every other agent's evidence, which is the exact property the two-lane design exists to prevent.

**Asymmetric: seal to a public key, open with a Vault-held private key.** Chosen. An agent can seal and cannot open — including its own submission once published.

### Decision

Bundles are sealed with ECIES over secp256k1: ephemeral ECDH, `sha256` as the KDF, XChaCha20-Poly1305 as the AEAD. secp256k1 because the recipient key is then an ordinary 32-byte hex string that a Vault DON secret already knows how to hold and an operator can rotate without new tooling. XChaCha for its 24-byte random nonce, so there is no counter to manage and no reuse to reason about.

Three properties beyond "it is encrypted":

1. **The envelope is bound to its claim id** as the AEAD's associated data. The gateway URL comes from config, which is not a commitment, so without this an attacker able to swap that URL could hand the tribunal a perfectly valid envelope belonging to a different claim. It now fails to open.
2. **The workflow refuses plaintext** once `envelopeSecretId` is configured, so a downgrade cannot be forced by simply serving an unsealed body.
3. **The enclave can only open, never seal.** `cre/tribunal/envelope.ts` exports `open` alone. Code that cannot encrypt cannot accidentally publish something it believed it had protected.

`open` is duplicated there because the workflow is a separate project compiled to WASM and cannot resolve `@perjury/*`. Duplication is a drift risk and this repo has been bitten by exactly that — an agent recomposed a GraphQL document instead of recording the one it sent, and archived queries stopped hashing to their own hashes. So a test seals with the shared package and opens with the enclave's copy; divergence fails a test rather than every verdict in production.

### Consequences

- The store can stay a public gist and hold nothing readable. The confidentiality no longer rests on a URL remaining obscure.
- **Losing the key makes past evidence permanently unreadable.** That is the intended behaviour of an encrypted store rather than a bug to work around, and `scripts/new-envelope-key.ts` refuses to rotate without `--force`.
- The demo archive is now the *only* reason any evidence is legible, which makes it far easier to label honestly than when the gist was also readable.
- `scripts/prove-sealed.ts` demonstrates the property against the live gateway instead of asserting it: the body is an envelope, none of the evidence's own field names survive in it, a wrong key fails, another claim's id fails, and the enclave's key opens exactly what was archived locally.
- Proven end to end on claim 24, which settled `Match` with the gist holding 3831 bytes of ciphertext and nothing else.
- It does not hide that a claim exists, hide the envelope's size, or stop a party publishing its own plaintext elsewhere. It closes the store, not the world.

---

## 0011. Redeploy so the sink accepts both Forwarders, and let the workflow find its own claim

**Sep 11.** CRE deploy access was granted, which turned the weakest sentence in the submission — the workflow registers a TEE handler but executes in a local simulator — into something fixable. Acting on it broke three assumptions the protocol had been built on.

**The sink could not be reused.** Chainlink runs two Forwarders per chain per tenant: one a DON-deployed workflow reports through, one the CLI simulator reports through. Ours were read from `cre workflow supported-chains`, not guessed. `VerdictSink.CRE_REPORT_WRITER` is immutable and `ClaimRegistry.verdictSink` locks on its first wiring call, so a sink built for the simulator can never accept a DON report and no setter exists to change that. Real enclave execution therefore meant redeploying everything.

**So the sink now has two doors.** Committing to one Forwarder would have staked the entire demo on DON deployment working, which was unproven at the time the choice had to be made. Both addresses are Chainlink-operated and scoped to this organisation, so accepting either is the same party arriving by a different door rather than a wider trust assumption. Passing zero for the second collapses back to one. This is the only place the protocol trades a little purity for the ability to fail safely, and it is worth it.

**A deployed workflow cannot be told anything.** Its config is fixed at deploy time, and three of the values in it were per-claim: the claim id, the evidence URL, and whether the report was a verdict or an appeal panel. That was survivable while a human edited the file between scenes and fatal for a claim submitted a minute ago. `ClaimRegistry.pendingForTribunal()` now returns the oldest outstanding claim and its kind, the evidence URL is a configured base plus that id, and one deployment serves every claim there will ever be.

Taking the kind from chain also closed a live hazard rather than only enabling a feature. It had been configured as `panel`; pointing that workflow at a claim nobody appealed would have judged it by the wrong rule and produced a confident wrong verdict.

The registry read crosses to the DON runtime, because the EVM capability takes a `Runtime` and `TeeRuntime` is not one. Nothing is lost — a claim id and a status are public values on a public chain — and the secret and the evidence fetch still go through the TEE. It is stated here so the confidentiality claim stays exactly as narrow as it actually is.

**The consequences we accepted.**

- Claim ids restart at 1 with every cascade, so the archive and the gateway index are filed under the registry address, and the site addresses the old contracts with `?d=sim`. The flat layout overwrote a settled claim's evidence the first time this happened, before the namespacing landed. Everything that settled before Sep 11 is still on chain and still replayable.
- The site is now load-bearing infrastructure rather than a dashboard. The enclave fetches evidence from `/api/evidence/<claimId>`, so deploying it moved from the nice-to-have list onto the critical path.
- That route proxies the store the agent published to rather than holding the bytes. Holding them would put the only copy of both agents' work on the same machine that runs the agents, and "you could have fed the tribunal a fixture" deserves a better answer than a shrug.
- `/submit` spawns the agents, so it needs a real Node process with the repository on disk. Every other route is serverless-friendly; that one is not, and a host has to be chosen with it in mind.

---

## 0012. Run a live claim as short steps the browser drives

**Sep 12.** The submit route spawned the runner and streamed its output for four minutes. That needs the repository on disk and a process that outlives a request, and a serverless function has neither — so the deployed site could explain the protocol and replay a settled claim, but a judge had to take the recording's word that anything ran.

The fix is not a workaround for the platform. A claim is roughly twenty seconds of work and three and a half minutes of waiting, and the waiting is the VRF draw and the challenge window. Neither needs a process sitting on it. Six short steps the browser drives puts the waiting between requests instead of inside one, and removes a failure mode the streaming version had: a four-minute request dying at minute three and leaving a claim half-posted. Each step checks the phase it expects and returns unchanged otherwise, so a retry after a dropped response cannot post a second claim.

The agents run in the server process rather than as spawned commands. They were already plain async functions; nothing about them had to change.

**What this costs.** Publishing evidence went from the GitHub CLI to the API, because no serverless runtime has the CLI. State moved out of `/tmp`, which is private to one instance — a write and a later read could land on different machines, and the failure looked like evidence that had never been published.

**What it deliberately does not do.** Adjudicate. The tribunal is the confidential workflow and `VerdictSink` accepts Chainlink Forwarders alone, so the verdict step watches the chain rather than producing anything. If no verdict lands, the page says so.

**The gate.** Every other route here is read-only and public, which is the right default for a project asking to be checked. This one moves a bond out of a funded wallet on every call and cannot be undone, so an open version of it is a faucet and the damage would look exactly like the protocol working. A shared password, compared in constant time, plus one claim in flight at a time. Not an identity system and not claimed as one. The specific credential a deployment is missing is told only to someone holding the password, because naming it to a stranger is a free leak.

**A live claim is archived like a scripted one.** Otherwise it replays as a row of transactions with no agent reads — the page that exists to show how a verdict was reached showing everything except that. Same deliberate disclosure as ADR 0009, and best effort: losing the archive costs a thinner replay, failing the claim over it would cost the claim.

---

## 0013. A report receiver must answer ERC-165

**Sep 12.** The production Forwarder staticcalls `supportsInterface` on a receiver before routing a report. `VerdictSink` did not implement it and has no fallback, so the call reverted, the Forwarder recorded the report as failed, and the workflow was told its write succeeded — because the Forwarder's own transaction did succeed. The only trace anywhere is `ReportProcessed(receiver, …, result: false)` in the Forwarder's own logs.

The simulator's mock Forwarder never makes that call. A receiver can therefore pass `simulate --broadcast` perfectly and never receive a single report on the DON, with nothing warning you.

Finding it meant disbelieving a success. Everything plausible was eliminated first and all of it was fine: the report bytes were correct in the calldata, authorisation was correct, simulating the exact call from the production Forwarder succeeded, and gas was not the constraint. It surfaced only by tracing the Forwarder's own transaction and reading the staticcall two frames down.

**The fix is four lines and cost a cascade**, because `CRE_REPORT_WRITER` is immutable and the registry's pointer at its sink locks on first wiring. Third deployment of the protocol. Worth it: adjudication now happens in an enclave and the verdict is written on chain from there.

**Two habits this leaves behind.** Check what a capability returned rather than assuming, and note that `TX_STATUS_SUCCESS` only means the Forwarder's transaction landed — not that the receiver call inside it succeeded. And when a local path and a deployed path disagree, suspect the thing the local path does not do.
