# Perjury — Design Spec

*ETHOnline 2026 · Sepolia · submission due Sun Sep 13 2026, 12:00 EDT*

The complete design in one document. Build sequencing lives in [`../plan.md`](../plan.md); decisions and their rejected alternatives in [`decisions.md`](decisions.md); AI attribution in [`ai-usage.md`](ai-usage.md).

- [0. Concept and Threat Model](#0-concept-and-threat-model)
- [1. System Architecture](#1-system-architecture)
- [2. Smart Contract Design](#2-smart-contract-design)
- [3. CRE Confidential Workflow Design — "the tribunal"](#3-cre-confidential-workflow-design-the-tribunal)
- [4. ENS Integration Design (ENSv2, Sepolia beta)](#4-ens-integration-design-ensv2-sepolia-beta)
- [5. Graph Integration Design](#5-graph-integration-design)
- [6. The Honest Limitation — demonstrated, not disclaimed](#6-the-honest-limitation-demonstrated-not-disclaimed)
- [7. On-Camera Checklist — what must be TRUE and SHOWN](#7-on-camera-checklist-what-must-be-true-and-shown)
- [8. Prior Art](#8-prior-art)

---

## 0. Concept and Threat Model

> **Provenance — HUMAN.** This chapter is the project's originating design, written before any AI involvement. The prose is drawn from the project brief in [`prompts/01-project-brief.md`](prompts/01-project-brief.md); the mechanism, the anti-collusion rationale, and the threat model are the team's. **TODO (human):** §0.1 and §0.4 currently quote the brief. Rewrite the framing in your own voice before submission — it should read like the person who had the idea wrote it, because they did. Keep the substance; the substance is already right.

### 0.1 The problem

We trust what AI agents tell us about their own work, but never check the process behind it. An agent says "I checked this data before acting on it" or "I verified these sources agree," another party relies on that assertion, and nothing ever re-derives it.

Perjury makes that process independently re-checked by a random peer agent, privately adjudicated, with reputation consequences.

### 0.2 The mechanism

1. **Claim submission.** An agent (the *claimant*) posts a claim another party will rely on, with a bond — real economic stake, not a marketplace listing.
2. **Random witness assignment.** The protocol randomly assigns a different registered agent as the *witness*. The claimant can never choose or influence who that is. Eligibility is checked live at the moment of assignment against each candidate's current on-chain reputation record — an agent with a recent discrepancy flag is automatically ineligible, with no manual list maintenance.
3. **Independent re-verification.** The witness does not see or trust the claimant's reasoning. It re-derives its own finding from live, standardized on-chain data. If the data is stale or the deployment ID doesn't match a pinned value, the witness must treat the claim as *unverifiable* rather than silently passing it.
4. **Private adjudication.** A tribunal inside a TEE compares the claim against the witness's independently-derived finding, and writes back only a minimal verdict — never the raw evidence, never either party's methodology.
5. **Bond settlement.** On mismatch the claimant forfeits its bond to whoever exposed it. On match the bond is returned and standing improves.
6. **Reputation record.** The verdict updates the claimant's standing on an ENS record that only the tribunal can write.

### 0.3 Why the design has this shape

Three constraints generate the entire architecture. Each rules out an obvious simpler design:

| Constraint | What it rules out | What it forces |
|---|---|---|
| **A claimant who can choose its own auditor can always buy a pass.** | Claimant-selected, reputation-weighted, or first-come witness selection. | Verifiably random, unbiasable assignment — [ADR 0001](decisions.md#0001-use-chainlink-vrf-v25-for-witness-assignment). |
| **An adjudicator that publishes both sides' evidence leaks each agent's methodology, and hands future claimants a rubric to game.** | On-chain comparison; any public-diff adjudicator. | Adjudication inside an enclave that emits only a verdict — [§3](#3-cre-confidential-workflow-design-the-tribunal). |
| **Reputation the subject can write is not reputation.** | Self-reported scores; operator-curated allowlists. | Role-restricted ENS records writable only by the tribunal, scoped to one field — [§4](#4-ens-integration-design-ensv2-sepolia-beta). |

The third is the load-bearing insight. Most agent-reputation designs fail here quietly: they build an elaborate scoring mechanism, then let the scored party — or a project multisig — write the score.

### 0.4 What this does not solve

Random assignment closes *deliberate* collusion. It does not close carelessness, correlated honest error, or sybils. This is treated as a first-class part of the design rather than a footnote — see [§6](#6-the-honest-limitation-demonstrated-not-disclaimed), which the demo must *show* rather than narrate.

---

## 1. System Architecture

> **Provenance — AI-ASSISTED.** The component decomposition and wiring below are an AI structuring of the human-authored mechanism in `docs/prompts/01-project-brief.md`. The narrative roles the architecture must realize — *the claimant, the witness, the tribunal, the reputation record* — and the requirement that each map to an identifiable component are the human's specification (D1); the mapping of those roles onto specific contracts and processes is AI-proposed and human-reviewed.

#### 1.1 Narrative → component map

| Narrative role | Component | Where it lives |
|---|---|---|
| **The claim + the bond** | `ClaimRegistry.sol` (escrow + lifecycle state machine) | Sepolia |
| **The lottery** (who witnesses) | `WitnessRoster.sol` + Chainlink VRF v2.5 consumer | Sepolia |
| **The claimant** | LLM agent process, holds an EOA + an ENS subname | off-chain (`agents/`) |
| **The witness** | LLM agent process, same shape, different key/subname | off-chain (`agents/`) |
| **The witness's eyes** | Subgraph MCP → live Graph Gateway → standardized subgraphs | The Graph Network |
| **The provenance guard** | `packages/graph-guard` — deployment-ID pinning + freshness gate | off-chain, deterministic |
| **The tribunal** | CRE Confidential Workflow, `tribunal` TEE handler | Chainlink CRE (simulator today; enclave on deploy access) |
| **The verdict wire** | `VerdictSink.sol` (only CRE report writer accepted) | Sepolia |
| **The reputation record** | ENSv2 permissioned resolver text record on `<agent>.perjury.eth` | Sepolia (ENSv2 beta) |
| **The eligibility oracle** | `WitnessRoster` reads standing at assignment time | Sepolia |
| **The camera** | Next.js dashboard + three scripted demo runners | local / Vercel |

#### 1.2 Flow

```
                        ┌─────────────────────────────────────────────┐
  claimant agent        │  1. submitClaim(subject, claimHash, $BOND)  │
  (LLM + MCP)  ────────▶│     ClaimRegistry.sol         [Sepolia]     │
       │                └──────────────────┬──────────────────────────┘
       │ full evidence                     │ requestRandomWords()
       │ stays private                     ▼
       │                ┌─────────────────────────────────────────────┐
       │                │  2. WitnessRoster + Chainlink VRF v2.5      │
       │                │     fulfillRandomWords → walk roster,       │
       │                │     LIVE-check each candidate's ENS standing│
       │                │     skip flagged/self → assign witness      │
       │                └──────────────────┬──────────────────────────┘
       │                                   │ WitnessAssigned(claimId, witness)
       │                                   ▼
       │                        witness agent (LLM + MCP)
       │                        ├─ never reads claimant's reasoning
       │                        ├─ Subgraph MCP → live Graph Gateway
       │                        ├─ graph-guard: deployment-ID pinned?
       │                        │              block freshness OK?
       │                        │   no → finding = UNVERIFIABLE (not "pass")
       │                        └─ signs findingPayload
       │                                   │
       ▼                                   ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  3. CRE Confidential Workflow — "the tribunal"      [TEE]        │
  │     IN  (confidential): claimant evidence blob, claimant         │
  │         methodology, witness finding blob, witness methodology   │
  │     DOES: normalize both to comparable form, dual-agent          │
  │           consensus check, detect UNVERIFIABLE, detect           │
  │           degenerate/copied findings                             │
  │     OUT (public report, minimal): claimId, verdict enum,         │
  │           confidence bucket, evidenceCommitment (hash only)      │
  └──────────────────────────────┬───────────────────────────────────┘
                                 │ CRE report (onchain write capability)
                                 ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  4. VerdictSink.sol → ClaimRegistry.settle()                     │
  │     MATCH    → bond returned to claimant, standing +             │
  │     MISMATCH → bond forfeited to witness, standing −, FLAGGED    │
  │     UNVERIFIABLE → bond returned, no standing change             │
  └──────────────────────────────┬───────────────────────────────────┘
                                 │ setText("perjury.standing", …)
                                 ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  5. ENSv2 permissioned resolver — <agent>.perjury.eth  [Sepolia] │
  │     EAC role: only CRE_WRITER_ROLE may write, record-scoped to   │
  │     the single "perjury.standing" record. Cannot transfer the    │
  │     name, cannot edit identity records, cannot edit roles.       │
  └──────────────────────────────┬───────────────────────────────────┘
                                 │ read at next assignment
                                 └──────────▶ back to step 2 (eligibility)
```

The loop closing on itself is the point: **the tribunal's own output is the only thing that decides who is allowed to be a tribunal witness next time**, and no human or agent sits in that path.

#### 1.3 Repo layout

```
perjury/
  contracts/            Foundry. ClaimRegistry, WitnessRoster, VerdictSink,
                        PerjuryStandingWriter (ENS write adapter), mocks + tests
  cre/                  CRE workflow (TypeScript, @chainlink/cre-sdk)
    tribunal/main.ts    confidential TEE handler
    config.staging.json / config.prod.json
  packages/
    graph-guard/        deployment-ID pinning, block-freshness gate, finding
                        normalization + canonical hashing
    ens/                ENSv2 registry/resolver setup + EAC role scripts
    shared/             types, ABIs, claim/finding schemas (zod)
  agents/
    claimant/           LLM agent (AI SDK + Subgraph MCP tools)
    witness/            LLM agent, isolated context, no claimant input
    runner/             scenario drivers for the three demo scenes
  app/                  Next.js dashboard
  scripts/              deploy, register agents, seed roster, demo scenes
  README.md  SKILL.md   (SKILL.md is an explicit Graph-track ask)
```

---

---

## 2. Smart Contract Design

> **Provenance — mixed; read the split carefully.** **Human-specified (D1):** bonds must be real economic stake; a claimant must never be able to choose or influence its witness; eligibility must be checked live against the on-chain reputation record with no manual list maintenance; the verdict path must be unreachable by operators. **AI-proposed:** the four-contract decomposition, function signatures, the roster-walk algorithm, the pull-payment settlement pattern, and the test matrix. These are implementation detail serving the human's constraints. **Reserved for human authorship:** `WitnessRoster`'s assignment and eligibility logic ([§0.6](ai-usage.md)) — it *is* the anti-collusion claim, and the team must be able to defend every branch of it unaided.

All Solidity, Foundry, Sepolia. Four contracts + one adapter.

#### 2.1 `ClaimRegistry.sol` — claim lifecycle + bond escrow

```solidity
enum Status { None, Pending, WitnessAssigned, Adjudicated, Settled }
enum Verdict { None, Match, Mismatch, Unverifiable }

struct Claim {
    address claimant;       // must be a registered agent
    bytes32 claimHash;      // commitment to the claim text + claimant evidence
    bytes32 subject;        // what was claimed about (protocol/pool/market id)
    uint256 bond;           // held in escrow
    address witness;        // 0 until VRF fulfils
    uint64  assignedAt;
    Status  status;
    Verdict verdict;
}

function submitClaim(bytes32 subject, bytes32 claimHash) external payable
    returns (uint256 claimId);            // msg.value >= MIN_BOND; triggers VRF
function onWitnessAssigned(uint256 claimId, address witness) external;  // roster only
function recordVerdict(uint256 claimId, Verdict v, bytes32 evidenceCommitment) external; // sink only
function settle(uint256 claimId) external;  // idempotent payout + standing write
function claimOf(uint256 claimId) external view returns (Claim memory);
```

**Access control (enforced, not described):**
- `onWitnessAssigned` → `require(msg.sender == address(witnessRoster))`.
- `recordVerdict` → `require(msg.sender == address(verdictSink))`. Nothing else can move a claim to `Adjudicated`, so no EOA — including the deployer — can decide an outcome.
- `submitClaim` → `require(roster.isRegistered(msg.sender))`.
- Bond is `msg.value` in native Sepolia ETH (avoids an ERC-20 faucet dependency mid-demo). Settlement uses pull-payment (`withdraw()`) to keep the settle path non-reverting on camera.
- Registry is deployed with roster/sink addresses set once and `immutable`. **No owner-settable addresses, no pause, no upgrade proxy** — because "the operators can't touch the verdict" is a claim we make on camera and judges will `grep` for an `onlyOwner` escape hatch.

#### 2.2 `WitnessRoster.sol` — identity, eligibility, VRF assignment

```solidity
struct Agent { bytes32 ensNode; bool active; uint64 registeredAt; }

function registerAgent(bytes32 ensNode) external;         // self-registration, 1 per address
function requestWitness(uint256 claimId, address claimant) external returns (uint256 reqId);
function fulfillRandomWords(uint256 reqId, uint256[] calldata words) internal override;
function isEligible(address candidate) public view returns (bool);
function eligibleCountExcluding(address a) external view returns (uint256);
```

**Assignment algorithm (inside the VRF callback):**
1. `seed = words[0]`, `n = roster.length`, `start = seed % n`.
2. Walk `i = 0..n-1`, `cand = roster[(start + i) % n]`.
3. Accept the first `cand` where **`isEligible(cand)`** and `cand != claimant`.
4. If none, mark the claim `Unverifiable` and refund — never fall back to a biased pick.

**`isEligible` reads live state, no maintained list:**
```solidity
function isEligible(address c) public view returns (bool) {
    Agent memory a = agents[c];
    if (!a.active) return false;
    int256 standing = standingReader.standingOf(a.ensNode);  // reads ENS resolver record
    if (standing < MIN_STANDING) return false;               // recent discrepancy ⇒ excluded
    if (flaggedUntil[c] > block.timestamp) return false;      // cooldown after a mismatch
    return true;
}
```
`standingReader` resolves the ENS text record on-chain each call, so exclusion is a *consequence of the record*, not of an admin transaction. This is what makes scenario 2's "and now it can't be picked" provable rather than asserted.

**Anti-collusion invariants, unit-tested:**
- `submitClaim` never takes a witness argument — there is no code path where a claimant supplies one.
- `fulfillRandomWords` is `onlyCoordinator` (inherited from `VRFConsumerBaseV2Plus`).
- Fuzz test: over N random seeds, the distribution over eligible witnesses is uniform within tolerance, and `assigned != claimant` holds for every seed.
- Test: a claimant that registers a second "friendly" address cannot raise its odds beyond `1/n` per registered sybil — and each sybil needs its own bondable ENS subname (cost, not prevention; we say this honestly in [§6](#6-the-honest-limitation-demonstrated-not-disclaimed)).

#### 2.3 `VerdictSink.sol` — the only door the tribunal can walk through

```solidity
address public immutable CRE_REPORT_WRITER;   // CRE forwarder / workflow owner address

function onReport(bytes calldata metadata, bytes calldata report) external {
    require(msg.sender == CRE_REPORT_WRITER, "not tribunal");
    (uint256 claimId, uint8 verdict, bytes32 commitment) = abi.decode(report, (uint256, uint8, bytes32));
    claimRegistry.recordVerdict(claimId, Verdict(verdict), commitment);
    standingWriter.applyVerdict(claimId, Verdict(verdict));
}
```
Single entry point, single authorized sender, no admin override. If the CRE address needs to change (simulate-key → live DON), that is a **redeploy**, not a setter — again because "only the tribunal can write" must survive a hostile read of the code.

#### 2.4 `PerjuryStandingWriter.sol` — narrow ENS write adapter

Holds the ENSv2 EAC role. Exposes exactly one mutating function:

```solidity
function applyVerdict(uint256 claimId, Verdict v) external {
    require(msg.sender == address(verdictSink), "only sink");
    // delta: Match +1, Mismatch -3 (and set flaggedUntil), Unverifiable 0
    resolver.setText(node, "perjury.standing", _encode(newStanding));
}
```
It has **no** function that can call `setAddr`, `setOwner`, transfer the name, write any other text key, or grant roles. Even if this contract were fully compromised, the blast radius is one text record per agent. That containment is the on-chain half of the ENS story; the EAC role config ([§4](#4-ens-integration-design-ensv2-sepolia-beta)) is the other half, and both must hold.

#### 2.5 Contract test matrix (Foundry)

- Bond escrow: submit → mismatch → witness receives exactly the bond; submit → match → claimant refunded; double-settle reverts.
- `recordVerdict` from a random EOA reverts. From the sink, succeeds.
- `onReport` from a non-CRE address reverts.
- Assignment excludes claimant, excludes flagged agents, is uniform over eligible set (fuzz).
- Post-mismatch, `isEligible(claimant) == false` **without any further transaction**.
- Invariant: `sum(escrowed bonds) == address(registry).balance - pendingWithdrawals`.

---

---

## 3. CRE Confidential Workflow Design — "the tribunal"

> **Provenance — mixed.** **Human-specified (D1):** that adjudication happen inside a TEE; that it compare the claim against an independently-derived finding; that it emit *only* a minimal verdict and never the raw evidence, methodology, or reasoning; and that the confidentiality be load-bearing rather than decorative. The enclave boundary table in §3.2 is a design decision the human owns ([§0.6](ai-usage.md)). **AI-proposed:** the trigger shape, the five-step adjudication sequence, the `evidenceCommitment` construction, and the §3.5 access strategy mechanics.

`cre/tribunal/main.ts`, TypeScript, `@chainlink/cre-sdk`.

#### 3.1 Trigger and shape

- **Trigger:** EVM log trigger on `ClaimRegistry.ReadyForAdjudication(claimId)` — emitted once both the claimant's sealed evidence pointer and the witness's sealed finding pointer are posted.
- **Structure:** a standard CRE workflow with an explicit confidential handler. The non-confidential part does trigger decoding and the onchain report write; the TEE handler does everything that touches evidence.

> **⚠ Execution status — be precise about this.** We register a real TEE handler with `cre.handlerInTee` and the workflow runs end to end, but **`cre workflow simulate` executes everything locally, not inside an enclave** (confirmed by Chainlink, Sep 8; the simulator itself prints "The simulator is not a real TEE"). Actual enclave execution requires deploy access to the confidential DON, which we do not have. So the accurate claim is: *a confidential workflow with a TEE handler, executed via the official simulator.* Never say the adjudication ran inside an enclave. The Chainlink track accepts "execution via simulation or live deployment with evidence", so this qualifies — but only if we describe it correctly.

#### 3.2 What crosses which boundary

| | Content | Boundary |
|---|---|---|
| **Enters the enclave** | Fetched from the evidence gateway (`packages/gateway`), which is where the two agents' submissions meet — they never see each other's work. ⚠ Transport is confidential; storage is not yet encrypted at rest. The design is an encrypted blob with the key held by the Vault DON (§3.5); today the store is public and only the fetch is hidden from node operators. Recorded as a gap rather than glossed. Claimant's full evidence blob (raw subgraph responses, intermediate reasoning, any private data source it used), claimant's methodology description, witness's full evidence blob + methodology, both `graph-guard` provenance attestations | fetched *inside* the enclave via **Confidential HTTP** from the storage pointer; the decryption secret comes from the **Vault DON**, so node operators never see plaintext |
| **Stays inside, never emitted** | Every one of the above. Any diff detail. Which subgraph either party chose. Either party's reasoning chain. Any numeric intermediate. | — |
| **Leaves the enclave** | `claimId`, `verdict ∈ {Match, Mismatch, Unverifiable}`, `confidenceBucket ∈ {high, low}`, `evidenceCommitment = keccak(both blobs ‖ salt)` | public CRE report → `VerdictSink.onReport` |

`evidenceCommitment` is the honesty hook: it lets anyone later verify the tribunal judged *these exact* blobs if a party chooses to reveal them, without the protocol ever publishing them.

#### 3.3 Adjudication logic inside the TEE

1. **Provenance gate.** If either side's `graph-guard` attestation fails (deployment ID ≠ pinned, or indexed block older than the freshness window), return `Unverifiable`. Never `Match`.
2. **Normalize.** Both claim and finding are reduced to a canonical typed assertion (`{subject, metric, comparator, value, unit, asOfBlock}`) — the claimant's prose claim was committed to this schema at submission; the witness derives one independently.
3. **Consensus check.** Compare on `metric`/`comparator`/`value` with a per-metric tolerance band. Agreement within band → `Match`; outside → `Mismatch`.
4. **Degeneracy check.** If the witness's blob is byte-suspiciously derivative of the claimant's, or its evidence shows zero independent queries, downgrade `confidenceBucket` to `low`. This is the one place where careless-witness detection is even *possible*, and it is partial — see [§6](#6-the-honest-limitation-demonstrated-not-disclaimed).
5. **Emit** the minimal report.

#### 3.4 Why the confidentiality is load-bearing (Chainlink qualification)

*Revised Sep 7, after actually running the workflow. The earlier draft claimed the enclave protects the tribunal's methodology. That is false, and worth stating plainly.*

**What is and is not confidential.** The workflow binary — including the adjudication rule — is provided by the Workflow DON to the enclave, so **the rule is public**. What the enclave keeps confidential is the *data* the rule computes over: Vault DON secrets, the request and response payloads of HTTP calls made from inside the enclave, and intermediate values.

That division is the right one for a tribunal, and stronger than what we originally claimed:

- **The rule is auditable.** Anyone can read how a verdict is reached. A court whose procedure is secret is not a court; the point was never to hide the comparison.
- **The evidence is sealed.** Each agent's raw findings and methodology reach the enclave over Confidential HTTP and never become visible to node operators, to the other party, or to the chain.
- **The verdict is public.** `claimId`, verdict, confidence bucket, and a commitment — nothing else crosses back via `usingTheDons()`.

**Why a public contract cannot do this job.** The comparison needs both parties' evidence in one place. On-chain, that means publishing it — which destroys the mechanism twice over: it exposes each agent's methodology, and it hands future claimants a rubric describing exactly what a witness will check, so claims get tailored to pass. Sealed inputs with a public rule and a public verdict is the only shape that works.

**It is core, not decorative.** Remove the enclave and the protocol has no adjudicator — there is no other component that decides match from mismatch. The confidential HTTP round-trip *is* the evidence channel, not a wrapper around one.

**Demonstrated, not asserted.** `packages/tribunal/test/adjudicate.test.ts` includes leak tests that fail if evidence, methodology, query hashes, metric names, or the disputed values appear in the serialized report. And the simulator prints, on camera: *"During real execution, user logs for this trigger will not be visible, and will not leave the TEE."*

#### 3.5 Access path (highest-risk item — start day 0)

- **Item zero of the whole build:** post the Confidential Workflows beta access request in the ETHGlobal Discord Chainlink channel, same format others are using. Do this before writing any code.
- **Primary path if access is slow:** `cre workflow simulate --target staging-settings --config config.staging.json --broadcast cre/tribunal/main.ts`. This executes the real workflow binary and **broadcasts real Sepolia transactions**, satisfying "demonstrate execution via simulation or live deployment with evidence." The demo is fully real either way; only the enclave hosting differs.
- **Swap point:** the only thing that differs between simulate and live is `CRE_REPORT_WRITER` in `VerdictSink`. Keep deployment scripted so the swap is one redeploy + one roster re-point, doable in under 30 minutes. Record the video *after* whichever path is final.
- Capture evidence either way: simulation logs, the TEE handler registration, tx hashes, and a short README section citing them.

---

---

## 4. ENS Integration Design (ENSv2, Sepolia beta)

> **Provenance — mixed.** **Human-specified (D1):** that only the CRE workflow's address may write the record; that its permission be scoped so narrowly it can only ever write the outcome field — never reassign name ownership, never alter witness eligibility, never touch identity data; and that agent identity use agents-as-namespaces. The insight driving all of it — *reputation the subject can write is not reputation* — is the human's. **AI-proposed:** the record-key layout, the `PerjuryStandingWriter` indirection, the `prove-eac.ts` three-transaction evidence artifact, and the §4.3 gas-risk analysis.

#### 4.1 Namespace: agents as namespaces

- Register `perjury.eth` on the ENSv2 Sepolia beta.
- Deploy a **subname registry** under it so every registered agent gets `<agent>.perjury.eth` — minted at `WitnessRoster.registerAgent()` time (script-assisted; the subname node hash is what the roster stores).
- Each agent gets its **own permissioned resolver proxy** (ENSv2 gives each account one), so permissions are per-agent, not global. This is the "agents as namespaces" bonus the track calls out, taken literally: the agent's identity, its permissions, and its reputation are all one ENS name, and the name is the primary key the protocol indexes on.

Records per agent:
| Key | Written by | Meaning |
|---|---|---|
| `perjury.standing` | **CRE writer only** | signed integer standing score |
| `perjury.flagged-until` | **CRE writer only** | cooldown timestamp after a mismatch |
| `perjury.agent-type` | agent owner, at registration | claimant/witness capable, model class |
| `addr` / avatar / display | agent owner | identity, never touched by the protocol |

#### 4.2 Enhanced Access Control configuration

*Revised Sep 8 with answers from the ENS team. Two earlier drafts of this section were wrong: the first assumed node-scoped roles, the second assumed we would need to revoke the agent's own write permission. Neither is how ENSv2 works.*

**Registry and resolver are separate permission worlds.** Registering a name grants roles on the **registry entry** — `SET_RESOLVER`, `SET_SUBREGISTRY`, `TRANSFER_ADMIN` and so on. It grants **nothing on any resolver**. Resolvers are deployed separately through the **VerifiableFactory** (`0x894bc9cc…07780`), and their EAC roles are supplied *at deployment time* as `(account, roleBitmap)` pairs.

This makes the design simpler and strictly stronger than planned: **there is nothing to revoke.** An agent has no resolver write permission unless we grant it, so we simply never do.

**Resolver-level configuration.** One shared Permissioned Resolver serves every agent subname. Per the ENS team, a resolver per agent is only needed if agents must self-manage records of their own; ours do not — identity records were a nice-to-have, and dropping them removes a deployment per agent. At deployment we grant:

| Account | Role | Resource |
|---|---|---|
| `PerjuryStandingWriter` | `ROLE_SET_TEXT` (`1 << 4`), per-key | `com.perjury.agent-standing` |
| `PerjuryStandingWriter` | `ROLE_SET_TEXT`, per-key | `com.perjury.agent-flagged-until` |
| *agents* | **nothing** | — |

**How the narrowing is done.** Grants at resolver initialisation land on the **root resource**, which
would let the writer touch every text key on that resolver. The ENS team's prescribed sequence, now
implemented in `scripts/configure-eac.ts`: hold `ROLE_SET_TEXT_ADMIN` at deployment, issue the
per-key grants in one multicall via `grantSetterRoles(setter, account)` — where the resolver derives
the resource from the key argument in an encoded `setText` call — revoke the root grant, and finally
give up the admin role so the permissions can no longer be changed by anyone, us included.

Verified on-chain: the same account writes `com.perjury.agent-standing` successfully and is refused
`avatar` with `EACUnauthorizedAccountRoles`. "One field and nothing else" is demonstrable, not
asserted.

The writer receives no `SET_ADDRESS`, `SET_NAME`, `LINK`, `UPGRADE`, `CAN_NAME`, and **no admin role** (`role << 128`), so it cannot re-grant to anyone. `FORBIDDEN_TRIBUNAL_ROLES` in `packages/ens/src/eac.ts` lists what it must never hold, and a test asserts the grant set never intersects it.

**⚠ The registry-level bypass.** Resolver scoping is worthless if an agent can point its name at a different resolver. When issuing agent subnames we must **withhold `SET_RESOLVER`** — otherwise an agent repoints `alice.perjury.eth` at a resolver it controls and writes whatever standing it likes. The bypass lives in the *registry* permission world, which is not where you look when you have spent two days reasoning about resolver roles. Flagged by the ENS team; encoded as `FORBIDDEN_AGENT_REGISTRY_ROLES` with a test.

**Failure mode is a revert.** An unauthorised `setText` reverts with `EACUnauthorizedAccountRoles` — it does not silently no-op. That confirms the shape of `scripts/prove-eac.ts`, which demonstrates the guarantee by showing two transactions *fail*.

**Record keys** are vendor-prefixed per ENS guidance: `com.perjury.agent-standing` and `com.perjury.agent-flagged-until`.

**Note on `setText`:** ENSv2 takes a **DNS-encoded name** (`setText(bytes name, string key, string value)`), while reads use a namehash. `WitnessRoster` stores both per agent.

**Prove it on camera, don't narrate it:** `scripts/prove-eac.ts` fires three transactions and shows two reverting — an agent writing its own standing, and an operator writing it. This clip carries the ENS track.

#### 4.3 Live reputation lookup at assignment time

`WitnessRoster.isEligible()` calls `standingReader.standingOf(node)`, which performs an on-chain ENS resolution of the agent's `perjury.standing` record inside the VRF callback. Consequences:

- Eligibility is a pure function of the ENS record at the instant of assignment. No cached list, no cron, no admin.
- The moment the tribunal writes a mismatch, the agent is excluded from the very next assignment — which is precisely what scenario 2 shows.
- **Gas risk:** ENS resolution inside a VRF callback costs gas and the callback has a gas limit. Mitigation: keep the reader path minimal (direct resolver `text()` call, no universal-resolver ccip-read hop), set VRF `callbackGasLimit` generously (~500k), and cap roster walk iterations with a bounded loop that falls through to `Unverifiable` rather than reverting. **Benchmark this in Milestone 3 — an OOG in the callback on camera is the worst-case demo failure.**

---

---

## 5. Graph Integration Design

> **Provenance — mixed.** **Human-specified (D1):** that the witness re-derive its finding independently from live standardized on-chain data rather than reviewing the claimant's reasoning; and the reject-never- degrade rule — stale data or a deployment-ID mismatch must produce *unverifiable*, never a silent pass, because provenance is a correctness requirement. Human also directed evaluation of Messari standardized schemas and ERC-8004/Agent0 subgraphs specifically. **AI-proposed:** the `Provenance` type, the freshness-window mechanics, the attestation flow, and the §5.4 leverage demonstration.

#### 5.1 What is queried and why it is load-bearing

The witness's finding is *derived entirely* from The Graph. There is no other data source in the verification path. If the Graph layer is removed, the witness has nothing to say and the tribunal has nothing to compare — that is the load-bearing test.

- **Source:** live Graph Network Gateway via **Subgraph MCP**, authenticated with a Subgraph Studio API key. No local graph-node, no cached fixtures, no static JSON — mocked data explicitly disqualifies.
- **Schema:** **Messari Standardized Subgraphs** for the claim domain (lending/DEX metrics: TVL, utilization, total borrow, pool reserves). Standardization is the point: because Messari schemas are identical across protocols, claimant and witness can produce *comparable* assertions without agreeing on a schema in advance — that comparability is what makes the tribunal's diff meaningful.
- **Secondary:** ERC-8004 / Agent0 agent-registry subgraphs where available, to cross-check that a registered agent identity exists on-chain independent of our own roster. Nice-to-have; do not block on it.

#### 5.2 How the witness actually uses MCP (the "AI use case")

The witness is an LLM agent with the Subgraph MCP mounted as tools. Its loop:

1. `search_subgraphs` for the claim's subject protocol/chain.
2. `get_deployment_status` / schema introspection to confirm the deployment is live and synced.
3. Read the schema, **compose its own GraphQL query** — it is not handed one.
4. Execute, interpret the result against the claim's metric, produce a typed assertion.

The reasoning — which subgraph to trust, how to map a prose claim onto a standardized schema field, what tolerance is appropriate — is the agent's, not a hardcoded query. That is the difference between "an AI use case" and "printing a query result," and the video must show the agent's tool calls scrolling.

#### 5.3 Provenance and freshness — reject, never degrade

`packages/graph-guard` wraps *every* Graph read. Deterministic, no LLM in this layer:

```ts
type Provenance = {
  deploymentId: string;      // must equal the pinned ID for this subject
  indexedBlock: number;
  chainHead: number;
  queriedAt: number;
  queryHash: string;         // hash of the exact GraphQL document + vars
};

const FRESHNESS_BLOCKS = 50;   // ~10 min on Sepolia-class cadence; tune per network

function guard(res, pinned): Attestation {
  if (res.deploymentId !== pinned.deploymentId) throw new Unverifiable("deployment mismatch");
  if (res.chainHead - res.indexedBlock > FRESHNESS_BLOCKS) throw new Unverifiable("stale index");
  if (res._meta?.hasIndexingErrors) throw new Unverifiable("indexing errors");
  return sign(res);
}
```

- Pinned deployment IDs live in `packages/shared/pinned-deployments.json`, committed. A subgraph silently redeploying under the same name is exactly the substitution attack this catches.
- On any guard failure the finding becomes **`UNVERIFIABLE`**, which propagates to the tribunal and results in **bond returned, no standing change**. It never silently becomes a pass. Stating this is cheap; a unit test asserting `guard()` throws on a stale block and that the resulting verdict is `Unverifiable` (not `Match`) is what actually earns it.
- Every attestation is included in the enclave input, so the tribunal — not the witness — is the one that decides whether provenance was adequate. The witness can't wave itself through.

#### 5.4 Standards leverage — what became easier

The Graph track asks submissions to show *what became easier because a shared schema was used*. This is the concrete answer, and it is checkable rather than asserted.

Four protocols are pinned — Aave v3, Aave v2, Compound III and Spark Lend — and every one is read with the **same selection set**, reduced by the **same derivation**, judged by the **same tribunal recompute**. There is no per-protocol branch anywhere in the codebase. Grep for a protocol name outside `pinned-deployments.json` and the demo runners and you will not find one: the agents take a `subject`, resolve it to a pinned deployment, and read `lendingProtocols { totalBorrowBalanceUSD totalDepositBalanceUSD }` — fields the Messari schema guarantees are present and mean the same thing everywhere.

The consequence is that **adding a protocol is a data change, not a code change.** Compound III and Spark were added by appending two JSON objects. No agent, guard, or tribunal code was touched, and both immediately verified end to end:

```
npx tsx agents/runner/duel.ts honest compound-v3-ethereum   → Match     (claim 30.96%, witness 30.94%)
npx tsx agents/runner/duel.ts false  spark-ethereum         → Mismatch  (claim 50.59%, witness 31.61%)
```

`npx tsx scripts/verify-pinned.ts` runs the single query pattern against all four live and prints the document it used, so the claim is inspectable rather than taken on trust.

Why this matters beyond convenience: the tribunal compares two independently-produced assertions, which is only meaningful if both parties can describe a finding in the *same terms* without having agreed on a schema beforehand. A standardized schema is what supplies that shared vocabulary. Without it, claimant and witness would each need a protocol-specific adapter, and every new protocol would mean new code inside the verification path — code that is itself unverified. **Standardization is not a convenience here; it is what keeps the trusted surface constant as coverage grows.**

The honest limit: all four are lending protocols on one schema, so this demonstrates depth within a standard rather than breadth across standards. Extending to a second standardized schema (DEX or vault) would strengthen it further and is not done.

#### 5.5 Corroborated reads — why The Graph specifically, and not any data source

Everything above could, in principle, be served by some other well-behaved API. This cannot, and it is the part of the Graph integration that the mechanism actually depends on.

**The hole it closes.** Perjury's premise is that a second agent independently re-derives a claim. But when claimant and witness read the *same* deployment, they have re-derived the **query** while sharing the **derivation** — a bug in the subgraph's mapping code produces two honest agents confidently agreeing on a wrong number, and the protocol settles a `Match` on it. That is §6's second limitation, and until now we could only disclose it.

**Why The Graph can close it.** A deployment id is a content hash of the mapping code, not just an endpoint name. Two deployments indexing the same protocol are therefore two *independent derivations* of the same chain state, produced by different code that different people wrote. An RPC cannot offer this — it has exactly one derivation, so "read it twice" buys nothing. Content-addressed indexing is what makes the derivation itself checkable.

**The rule.** Where a protocol has more than one independent deployment, a read is attested only if they agree within `CORROBORATION_BPS`. Divergence throws `corroboration-divergence`, which propagates as `Unverifiable` — bond returned, nobody slashed, no standing change. The protocol deliberately does **not** resolve to a majority or prefer the primary: picking a winner among disagreeing indexers would invent a fact the data layer does not support. Disagreement means the fact is contested, and a contested fact cannot convict anyone.

**One constant is load-bearing.** `CORROBORATION_BPS` must not exceed the tribunal's adjudication tolerance. If it were looser, two sources could differ by more than the margin that decides a verdict while still counting as agreeing — and then which deployment an agent happened to read would decide who loses a bond. A unit test asserts the invariant rather than trusting the two constants to be edited together.

**Observed, not hypothesised.** Two live deployments of Morpho Aave V3, both Messari-schema, read at an identical block:

```
QmVpuZKrjhjHx2hCtpGNaW29ZYq4Xt2GyPLpiMDP2YTAHE   1.6742%   TVL $25,196
Qme9KY9Nm5YaRsew1CjR5rtwZMgQAG3SzxRmqevtVW7R83   1.5926%   TVL $26,487
→ 487.7 bps apart, tolerance 50 → UNVERIFIABLE
```

Block skew is eliminated as an explanation, and the schema is identical, so the only remaining variable is the mapping code. `npx tsx scripts/prove-corroboration.ts` reproduces it live, and `duel.ts honest morpho-aave-v3-ethereum` shows both agents failing closed end to end.

**The honest limit, and it is a real one.** Of the eighteen Messari-lending subgraphs we found, only Morpho Aave V3 has a second independent index. Aave v3 — our demo subject — has one. So corroboration is *opportunistic*: required where plurality exists, and recorded as `single-source` where it does not. Single-source reads are not rejected, because refusing to verify anything without a second indexer would make the protocol useless rather than rigorous. The weaker guarantee travels with the verdict instead of being quietly dropped. Thin plurality per protocol is the ecosystem gap this design would most like closed, and it is filed as feedback.

## 6. The Honest Limitation — demonstrated, not disclaimed

> **Provenance — HUMAN (D2).** The limitation itself is the human's own analysis, identified unprompted in the original brief: random assignment closes *deliberate* collusion but does not catch a careless witness, and cannot rule out two independently-honest agents reaching the same wrong conclusion. The human also set the standard that it be *demonstrated on camera rather than disclaimed in text*. AI contributed only the sybil-cost framing and the prose arrangement. **The README version of this section must be written in the human's own words ([§0.6](ai-usage.md)).**

**The claim we can defend:** random assignment makes *deliberate* collusion structurally unavailable — a claimant cannot choose, influence, or predict its witness, and cannot become its own witness.

**What it does not close, stated plainly in the README and shown in the video:**
- A **careless** witness that does minimal work and happens to agree costs the claimant nothing. Our degeneracy check ([§3.3](#3-cre-confidential-workflow-design-the-tribunal) step 4) catches only the crudest version; it is a heuristic, not a solution.
- Two **independently honest** agents can reach the same wrong conclusion. The specific case of *both trusting the same subgraph* is now addressed where the ecosystem permits: corroborated reads ([§5.5](#55-corroborated-reads--why-the-graph-specifically-and-not-any-data-source)) require independently-indexed deployments to agree, and return `Unverifiable` when they do not. This is **not** a general fix. It only binds for protocols with a second independent index — one of five pinned subjects today — and it cannot touch correlated error that lives upstream of indexing, in the chain data or the protocol itself. Elsewhere the reading is stamped `single-source` and the original limitation stands unchanged.
- **Sybils** raise a claimant's odds of drawing a friendly witness linearly in the number of funded, ENS-named, bondable identities it controls. Bond + registration cost makes this expensive, not impossible.

Scenario 3 ([§7](#7-on-camera-checklist-what-must-be-true-and-shown)) shows the *first* of these bounded by the mechanism itself, on camera — two agents who have agreed to collude, repeatedly failing to be paired.

---

---

## 7. On-Camera Checklist — what must be TRUE and SHOWN

> **Provenance — mixed.** The three scenarios, and the standard that nothing be narrated which isn't shown, are human-authored (D3). The expansion into per-shot rows with a required visible artifact for each is AI-ASSISTED — mechanical elaboration of the human's requirement.

Rule for the whole video: **if it is narrated but not on screen, it does not count.** Every row below needs a visible artifact — a tx hash, a state change, a revert, or a rendered value that moves.

> **Surface note.** These rows were written assuming a rendered dashboard. The dashboard was not built ([ADR 0003](decisions.md) records why), so the artifacts come from the terminal scenes instead — `agents/runner/scene{1,2,3}.ts` render roster tables with eligibility, before/after standing arrows, boxed verdicts and linked transaction hashes, all read from chain at the moment of display. Every row below still has a visible artifact; it is rendered in a terminal rather than a browser.

#### Scenario 1 — a TRUE claim, opportunistically challenged

| # | Must be shown | Visible artifact |
|---|---|---|
| 1.1 | Claimant submits a real claim with a real bond | Sepolia tx hash; bond balance in registry increases on screen |
| 1.2 | Witness is assigned by VRF, not chosen | VRF request tx **and** fulfilment tx, both linked; assigned address ≠ claimant |
| 1.3 | Witness derives its finding independently from live Graph data | Agent tool-call stream: `search_subgraphs` → schema read → **its own** GraphQL → result, with the deployment ID and indexed block visible |
| 1.4 | Provenance/freshness actually checked | Guard output panel showing deployment ID match + block delta under threshold |
| 1.5 | Tribunal adjudicates via the confidential workflow | CRE simulator output showing the TEE handler invoked and the verdict returned. **Say "simulated", not "ran in an enclave"** — see the execution-status note in §3.1 |
| 1.6 | Only a minimal verdict is published | Side-by-side: sealed evidence pointer vs. the on-chain report containing only claimId/verdict/commitment |
| 1.7 | Verdict = Match, bond returned | Settlement tx; claimant balance restored |
| 1.8 | **ENS standing visibly rises** | The `perjury.standing` text record on `<claimant>.perjury.eth` before and after, read from chain (ENS app or explorer, not just our UI) |

#### Scenario 2 — a staged FALSE claim

| # | Must be shown | Visible artifact |
|---|---|---|
| 2.1 | A demonstrably false claim submitted with a bond | Claim text on screen next to the true on-chain value |
| 2.2 | Randomly assigned witness (again, VRF txs) | Request + fulfil tx hashes |
| 2.3 | Witness's independent finding **disagrees** | Agent's derived value vs. the claimed value, both on screen |
| 2.4 | Tribunal rules Mismatch — without publishing why | On-chain report shows `Mismatch` and a commitment hash; no evidence, no methodology anywhere in the tx |
| 2.5 | **Bond forfeited to the witness** | Witness balance increases by exactly the bond; tx hash |
| 2.6 | **ENS standing visibly drops** | Record read from chain, before/after |
| 2.7 | **Now ineligible as a future witness — shown live** | Trigger a *new* claim on camera; the roster's eligible set excludes the flagged agent and the VRF assignment lands elsewhere. Also show `isEligible(flagged) == false` as a direct on-chain call |
| 2.8 | No human touched any of it | Show that no admin tx occurred between 2.4 and 2.7 — exclusion followed from the record alone |

#### Scenario 3 — collusion attempt, structurally throttled

| # | Must be shown | Visible artifact |
|---|---|---|
| 3.1 | Two agents openly set up to collude | Their shared "agreement" shown in the runner script/UI — we are not hiding the setup |
| 3.2 | Claimant has **no** way to name its witness | `submitClaim` signature on screen: no witness parameter exists |
| 3.3 | Repeated attempts (e.g. 5 claims) get assigned witnesses at random | A table of 5 claim ids → assigned witnesses, with VRF tx links; the colluder is drawn ~1/n of the time |
| 3.4 | When the colluding pair *does* get paired, the mechanism's limit is visible | Show that pairing passes — and say plainly that this is the residual risk, quantified as 1/n |
| 3.5 | Attempting to force the pairing fails | On-camera revert: trying to call the assignment path directly / with a chosen witness reverts (`onlyCoordinator`) |
| 3.6 | The limitation is stated on screen, in text | The [§6](#6-the-honest-limitation-demonstrated-not-disclaimed) limitations, rendered — the demo *ends* on honesty, not on a victory lap |

#### Cross-cutting (must be true across all three)

- Every transaction is on a public Sepolia explorer and hash-visible; nothing is a local fork.
- Every Graph query hits the live Gateway with a Studio API key; show a network panel or MCP log proving it is not a fixture.
- The EAC proof clip ([§4.2](#4-ens-integration-design-ensv2-sepolia-beta)): agent self-write reverts, operator write reverts, tribunal path succeeds.
- The repo is public and every commit is dated within the event window.

---

---

## 8. Prior Art

> **Provenance — AI-ASSISTED.** Landscape research and contrasts drafted by AI; the positioning claim (that push-assignment plus private adjudication is the novel combination) is the human's, implicit in the original brief.

Name the neighbours before a judge does. Perjury is not the first system to verify claims with economic stake — the question is what it does that the existing ones don't.

### The landscape

| System | What it does | How Perjury differs |
|---|---|---|
| **UMA optimistic oracle** | Assert a fact with a bond; anyone may dispute within a window; unchallenged assertions settle as true. | Disputers are **self-selected**. Nobody is obligated to check, so unprofitable-to-dispute claims sail through. Perjury **pushes** verification onto a randomly chosen party rather than waiting for a volunteer. |
| **Kleros** | Decentralized arbitration; jurors stake, vote, and are rewarded for coherence with the majority. | Jurors are randomly drawn — the closest analogue to our assignment mechanism. But evidence and rulings are **public**, and jurors *review submitted evidence* rather than independently re-deriving the answer from source data. |
| **Truebit / interactive verification games** | Off-chain computation with a challenge period and a bisection game to resolve disputes. | Same self-selection problem, formalized as the **verifier's dilemma**: if verification costs something and challenges rarely pay, rational verifiers stop verifying. Perjury doesn't solve this — see below. |
| **EigenLayer AVSs / attestation networks** | Operator sets stake and attest; slashing punishes provable misbehavior. | Attestation is typically **many operators on the same question**, converging on consensus. Perjury is a **pairwise re-derivation** by one randomly assigned peer, which is cheaper but weaker — an honest trade we state plainly. |
| **ERC-8004 / Agent0 agent registries** | On-chain identity and reputation primitives for autonomous agents. | Complementary, not competing. These answer *who is this agent*; Perjury answers *was this specific claim checked*. We read these registries in the witness step where available. |
| **TEE inference attestation (Ritual, Atoma, 0G, et al.)** | Prove that a specific model produced a specific output, inside an enclave. | Proves **execution integrity** — that the computation ran as claimed. Perjury targets **claim correctness** — whether the assertion matches independently-derived reality. An agent can honestly run a model that reaches a wrong conclusion; that's the case we catch. |

### What's actually novel here

Two things in combination, neither novel alone:

1. **Push-based, verifiably random assignment.** Existing dispute systems wait for a challenger. Perjury conscripts one. This closes deliberate collusion, because the claimant cannot choose, influence, or predict who checks it.
2. **Private adjudication of a public verdict.** The comparison happens where neither party's evidence or methodology leaks, so verification doesn't hand future claimants a rubric to game — while the verdict itself remains public and trusted.

Systems that have (1) tend to publish everything (Kleros). Systems with confidential compute tend to attest execution rather than adjudicate competing claims. Putting them together is the contribution.

### What we inherit and don't fix

Perjury does **not** solve the verifier's dilemma. A witness paid only on mismatch has weak incentive to work hard on claims that look true, which is precisely the careless-witness failure in [§6 Limitations](#6-the-honest-limitation-demonstrated-not-disclaimed). Truebit attacked this with forced errors and jackpots; we don't, and we say so rather than implying random assignment closed a problem it didn't.
