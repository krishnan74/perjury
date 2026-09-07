# Perjury — Implementation Plan

**Goal:** ship the three-scenario demo (true claim → false claim → collusion throttle) with real
Sepolia transactions, by **Sun Sep 13 2026, 12:00 EDT**.

**Design lives in [`docs/`](docs/design.md)** — start at [docs/01-concept.md](docs/design.md). Decisions
already made: [`docs/decisions/`](docs/decisions.md). This file is sequencing and constraints only.

**Stack:** Foundry (Solidity, Sepolia) · `@chainlink/cre-sdk` + CRE CLI (TypeScript) · Chainlink VRF
v2.5 · ENSv2 Sepolia beta · The Graph Gateway + Subgraph MCP · Next.js 15 + viem/wagmi · Bun
workspaces.

> **Provenance — AI-ASSISTED.** Sequencing, estimates, and cut order are AI-proposed against human
> constraints: tribunal-first ordering, nothing mocked. See [docs/ai-usage.md](docs/ai-usage.md).

---

## Status at a glance

*Updated Sep 7.* Contracts are built and tested offline; everything remaining needs live
credentials or a running service.

| Task | State |
|---|---|
| T0 Unblock | ◐ repo + Foundry done · **CRE access request, provisioning, Next.js scaffold outstanding** |
| T1 CRE tribunal | ○ not started — **highest risk, gated on beta access** |
| T2 Contracts | ● done — 4 contracts, 28 tests, 1024 fuzz runs (CRE wiring pending T1) |
| T3 Randomness | ◐ roster + fuzz done · **live VRF round and callback gas benchmark outstanding** |
| T4 ENSv2 + EAC | ○ not started |
| T5 Graph + agents | ○ not started |
| T6 Dashboard | ○ not started |
| T7 Scenes | ○ not started |
| T8 Submit | ○ not started |

## ⏱ Reality check

**6 days.** The original brief assumed time was available; it isn't. Deadline gates below are hard,
and the [cut order](#cut-order-if-behind) exists because something will slip.

| Gate | By | Non-negotiable because |
|---|---|---|
| CRE beta access **requested** | Mon Sep 7, today | External gate, days of latency, blocks nothing else if done now |
| Tribunal emits a real Sepolia tx | **Tue Sep 8, EOD** | If this fails, the whole architecture changes — must know early |
| Bond escrow + settlement E2E | Wed Sep 9, EOD | |
| VRF assignment + live ENS eligibility | Thu Sep 10, EOD | The two riskiest integrations, both need slack |
| All three scenes run E2E | **Sat Sep 12, 18:00** | Leaves the evening for re-takes |
| Video recorded + submitted | **Sun Sep 13, 09:00 EDT** | 3h buffer before the 12:00 hard stop |

---

## Global constraints

Operational facts that constrain every task. Violating one of these fails the submission, not just
the task.

**Submission rules (from the event details page — read these twice):**
- **Commit incrementally, starting today.** "Submissions with large single commits or missing
  histories may be disqualified." One giant end-of-week commit is a disqualification risk, not a
  style preference. Commit at every task boundary.
- **Exactly 3 partner prize slots** are selectable at submission. Ours: Chainlink, ENS, The Graph.
  This resolves the old open question about submitting to two Graph tracks — there is one Graph slot,
  so pick the track we're strongest in (AI Use Case, From Scratch) and mention the standardized-schema
  angle in the writeup.
- **Video: ≤4:00, ≥720p, no AI voiceover, no text-to-speech, no sped-up footage, no music-only
  narration, not recorded on a phone.** A real human voice must narrate. Violations force a re-submit.
- Everything must be built during the event window (Sep 4–16) — the Graph track is the "From Scratch"
  pool.

**Technical:**
- Bonds are native Sepolia ETH. No ERC-20 faucet dependency on the critical path.
- Every contract that matters has **no owner, no pause, no upgrade proxy, no address setters.** Judges
  will grep for an escape hatch; the CRE-only write claim must survive that.
- Graph reads are live Gateway only, authenticated with a Studio API key. **No fixtures, no local
  graph-node, no cached JSON** anywhere in the verification path — mocked data disqualifies the track.
- Provenance failure ⇒ `Unverifiable`. Never a silent pass. Enforced in `graph-guard`, re-checked in
  the enclave.
- Agents run as separate processes with separate keys and no shared memory or message channel.
  Isolation is structural, never a prompt instruction.
- LLM agents: pinned model, temperature 0, capped tool-call rounds.
- VRF `callbackGasLimit` ~500k; roster walk is a bounded loop that falls through to `Unverifiable`
  rather than reverting.
- **Every demo tx hash goes in [`docs/TX_HASHES.md`](docs/TX_HASHES.md) as it happens.** Reconstructing
  them the night before is how evidence goes missing.
- Attribution lives in [docs/ai-usage.md](docs/ai-usage.md), updated at each task boundary — not
  duplicated in source file headers.
- Env (`.env.local`): `SEPOLIA_RPC_URL`, `DEPLOYER_PK`, `CLAIMANT_PK`, `WITNESS_A_PK`, `WITNESS_B_PK`,
  `GRAPH_STUDIO_KEY`, `VRF_SUBSCRIPTION_ID`, `ANTHROPIC_API_KEY`.

**Decided (Sep 7):** commits carry **no `Co-Authored-By` trailers** — every commit is authored by the
team account. AI involvement is documented where it's actually legible to a reviewer
([docs/ai-usage.md](docs/ai-usage.md)) rather than as a bot contributor on the repo. Keep this
consistent; a mixed history looks worse than either choice.

---

## Tasks

### T0 — Unblock *(Mon Sep 7, ~1h — do the first line before anything else)*

- [ ] **Post the CRE Confidential Workflows beta access request** in the ETHGlobal Discord Chainlink
      channel. Days of latency; costs one message. [ADR 0002](docs/decisions.md)
- [x] `git init`, public GitHub repo, **first commit = the docs tree already written** (`README.md`,
      `plan.md`, `docs/`). Establishes commit history from day one.
- [~] Foundry scaffold done (`foundry.toml`, `remappings.txt`, forge-std). **Bun workspaces + Next.js still to do.**
- [ ] Provision, and **personally watch each one work before moving on**:
  - [ ] Sepolia RPC + 4 funded keys (deployer, claimant, witness-A, witness-B)
  - [ ] Subgraph Studio API key → one live query returns data
  - [ ] VRF v2.5 subscription funded with testnet LINK → one request fulfils
  - [ ] CRE CLI installed → `cre workflow simulate` runs on a hello-world
  - [ ] One ENSv2 name registers on Sepolia

**Exit:** every external dependency independently proven. No exceptions — an unproven dependency
found broken on Friday is unrecoverable.

---

### T1 — The tribunal, standalone *(Tue Sep 8, ~4h — HIGHEST RISK, BUILD FIRST)*

**Files:** `cre/tribunal/main.ts`, `cre/config.staging.json`, `contracts/src/ScratchSink.sol`

- [ ] CRE workflow with a confidential TEE handler: two hardcoded blobs in → verdict out. No
      contracts, no agents, no ENS.
- [ ] `cre workflow simulate` green.
- [ ] Deploy `ScratchSink.sol` (throwaway), then `cre workflow simulate --broadcast` writing to it.
- [ ] **Record the broadcast tx's `msg.sender`** — this settles whether `CRE_REPORT_WRITER` is the
      workflow owner or a Chainlink Forwarder. Do not guess this into the contract.
- [ ] Log tx hash → `docs/TX_HASHES.md`.

**Exit:** a real Sepolia tx whose calldata came out of a TEE handler. **If this fails, stop and
re-plan** — every downstream decision assumes it.

---

### T2 — Contracts + settlement *(Wed Sep 9, ~5h)*

**Files:** `contracts/src/{ClaimRegistry,VerdictSink,PerjuryStandingWriter}.sol`, `contracts/test/**`

- [x] `ClaimRegistry` — bond escrow, lifecycle, pull-payment settlement. Immutable wiring.
- [x] `VerdictSink` — single authorized sender, no setter.
- [x] `PerjuryStandingWriter` — one mutating function, callable only by the sink.
- [x] Foundry test matrix ([docs/design.md](docs/design.md) §2.5) — 28 tests, 1024 fuzz runs, **including the negative
      cases**: `recordVerdict` from an EOA reverts; `onReport` from a non-CRE address reverts;
      double-settle reverts.
- [ ] Point T1's workflow at the real `VerdictSink`. Bond in → verdict out → bond settled, witness
      address hardcoded.

**Exit:** `forge test` green; one E2E settlement on Sepolia with hashes logged.

---

### T3 — Randomness + live eligibility *(Thu Sep 10, ~5h — SECOND-HIGHEST RISK)*

**Files:** `contracts/src/WitnessRoster.sol` (**human-authored**, see [ai-usage §0.6](docs/ai-usage.md))

- [x] `WitnessRoster` written: registration, roster walk, `isEligible`, fail-closed. **Coordinator is a
      mock — swap in the Sepolia VRF v2.5 coordinator address for the live round.**
- [ ] **Benchmark the ENS-read-inside-the-callback gas FIRST**, before building on it
      ([docs/05-ens.md](docs/design.md) §4.3). If it doesn't fit under `callbackGasLimit`:
      → fall back to two-step assign (VRF stores seed; permissionless `finalizeAssignment()` walks
      eligibility). **Decide today, not Saturday.**
- [x] Fuzz: assignment uniform over eligible set; `assigned != claimant` for every seed.
- [ ] Live VRF round on Sepolia assigns a witness. Hashes → `TX_HASHES.md`.

**Exit:** assignment verifiably random, flagged agents skipped, proven by test *and* a live tx.

---

### T4 — ENSv2 + Enhanced Access Control *(Fri Sep 11 AM, ~4h)*

**Files:** `packages/ens/**`, `scripts/prove-eac.ts`

- [ ] Register `perjury.eth` (Sepolia beta), deploy subname registry, mint 5 agent subnames.
- [ ] Record-scoped EAC role → `PerjuryStandingWriter` only, on `perjury.standing` +
      `perjury.flagged-until`.
- [ ] **Revoke agent self-write on those records.** The single most important config line in the
      project.
- [ ] `scripts/prove-eac.ts` — three txs, two must revert: agent writes own standing (revert),
      deployer writes (revert), tribunal path (succeeds). **This clip goes in the video verbatim.**
- [ ] Wire `standingReader` into `isEligible`; confirm mismatch → record drops → next assignment
      excludes, with zero manual steps.

**Exit:** the EAC proof script prints two reverts and one success. Hashes logged.

> **Beta risk:** ENSv2 is a beta; the deployed contracts may differ from the docs. Read the actual
> ABIs on Sepolia, not just the documentation. Budget the whole morning.

---

### T5 — Graph layer + agents *(Fri Sep 11 PM, ~5h)*

**Files:** `packages/graph-guard/**`, `packages/shared/pinned-deployments.json`,
`agents/{witness,claimant}/**`

- [ ] `graph-guard`: deployment-ID pinning, freshness gate, attestation hashing. Unit test proving
      stale block → `Unverifiable`, **never** `Match`.
- [ ] Pin deployment IDs for the chosen claim domain. Pin a **second, backup** deployment — a lagging
      subgraph during recording correctly produces `Unverifiable` and kills the take.
- [ ] Witness agent: LLM + Subgraph MCP, composes its own GraphQL against the standardized schema,
      output through the guard.
- [ ] Jot sponsor-facing friction in the build log as you hit it (three betas: CRE, ENSv2, Subgraph
      MCP). If there's enough by T8, it becomes a `FEEDBACK.md` — sponsors reward it. Don't commit an
      empty template.
- [ ] Claimant agent: separate process, separate key, no channel to the witness.

**Exit:** one live witness run derives a finding from the real Gateway with no fixtures anywhere.

---

### T6 — Dashboard *(Sat Sep 12 AM, ~4h)*

**Files:** `app/**`

- [ ] Claim feed + status; witness assignment with VRF request/fulfil tx links.
- [ ] **ENS standing bars that visibly move** on verdict.
- [ ] Eligibility roster: who's selectable, and why the flagged agent isn't.
- [ ] Agent tool-call stream (the witness's MCP reasoning, on camera).
- [ ] **"What the tribunal did NOT publish"** panel: sealed evidence pointer beside the minimal
      on-chain report. This is the only way to film confidentiality.

Renders from chain + Graph reads only. Never a place where behavior gets faked for the camera.

---

### T7 — Scenes + rehearsal *(Sat Sep 12 PM — gate: all three green by 18:00)*

**Files:** `agents/runner/scene-{1,2,3}-*.ts` (**human-authored**)

- [ ] `scene-1-true-claim.ts`, `scene-2-false-claim.ts`, `scene-3-collusion.ts` — idempotent,
      re-runnable against fresh claim ids.
- [ ] Run each **≥5×**. Fix flakiness. Keep a known-good recorded take as fallback.
- [ ] Walk [docs/07-demo-script.md](docs/design.md) row by row — every row needs its visible
      artifact or it doesn't go in the video.
- [ ] All hashes → `TX_HASHES.md`.

---

### T8 — Submit *(Sun Sep 13, 06:00–09:00 EDT — HARD STOP 12:00)*

- [ ] If CRE beta access landed: redeploy `VerdictSink` with the live writer address, re-point roster,
      re-run all three scenes. **If it landed after Saturday, don't — ship the simulate path.**
- [ ] Freeze addresses; `README.md` gets deployed addresses + demo tx hashes.
- [ ] `SKILL.md` (explicit Graph-track ask).
- [ ] **Record video** — human voice, ≤4:00, ≥720p, no TTS, no speed-up.
- [ ] Human writes the limitations section in their own words ([ai-usage §0.6](docs/ai-usage.md)).
- [ ] **Final attribution audit:** `docs/ai-usage.md` §0.3 has no `planned` rows and no aspirational
      labels; every directing prompt is in `docs/prompts/`.
- [ ] Submit by 09:00. Three partner prizes: Chainlink, ENS, The Graph.

---

## Cut order (if behind)

Cut from the bottom. Each line states what's lost, so the trade is explicit rather than panicked.

| Order | Cut | Cost |
|---|---|---|
| 1 | Dashboard polish → plain tables, no animation | Video is uglier, still complete |
| 2 | Claimant as LLM agent → scripted claim submission | Witness stays an LLM agent, so the Graph AI track is intact |
| 3 | Scene 3 (collusion) → run it as a repeated-assignment table, not a live scene | Limitation still shown, less cinematically |
| 4 | ERC-8004 / Agent0 secondary subgraph | Was always nice-to-have |
| 5 | Live CRE deploy → ship simulate-with-broadcast | **Zero track cost** — Chainlink accepts simulation with evidence |
| 6 | Roster size 5 → 3 agents | Weakens the 1/n collusion argument; do this only in extremis |

**Never cut:** the EAC proof script (carries ENS), live Graph reads (mocking disqualifies), the
confidential handler (it is the project), or the limitations section (it is the point).

---

## Risks & fallbacks

| # | Risk | Fallback | Decided by |
|---|---|---|---|
| 1 | CRE beta access doesn't land | `cre workflow simulate --broadcast` — real txs, qualifies | Already the primary path |
| 2 | ENS read blows the VRF callback gas limit | Two-step assign: VRF stores seed, `finalizeAssignment()` walks eligibility | **T3, Thu** |
| 3 | ENSv2 beta API differs from docs | Read deployed ABIs directly; budget the full Friday morning | T4 |
| 4 | LLM nondeterminism ruins a take | Temp 0, pinned model, ≥5 rehearsals, known-good fallback take | T7 |
| 5 | Subgraph lags during recording → `Unverifiable` | Second pinned deployment ready; freshness pre-check immediately before recording | T5 |
| 6 | Attribution labels drift from reality | Per-task attribution pass; four components reserved for human authorship | Every task |

---

## Open questions

Decided ones move to [`docs/decisions/`](docs/decisions.md).

1. **Claim domain.** Which protocol/metric? Recommend a Messari lending schema (Aave-style
   `totalBorrowBalanceUSD` / utilization) on a mainnet-indexed subgraph, with Perjury's contracts on
   Sepolia. Splits data chain from settlement chain — confirm that's acceptable. **Blocks T5.**
2. **Where sealed evidence blobs live.** Recommend encrypted blob on IPFS, key in the CRE Vault DON.
   **Blocks T1's interface freeze — decide today.**
3. **Bond size.** Big enough to look consequential on camera, small enough to fund 4 agents.
4. **Standing scale.** Proposed: start 0, Match `+1`, Mismatch `-3`, eligible at `>= 0`, 24h cooldown.
   One mismatch flips an agent ineligible — which is what makes scene 2 legible in 40 seconds.
   Confirm the aggression is intended.
5. **Roster size.** Recommend 5.

---

## Verification

Per task, before moving on:

- **T1:** `cre workflow simulate --broadcast` produced a Sepolia tx from the TEE handler. Hash logged.
- **T2:** `forge test` green including every negative access-control case.
- **T3:** fuzz shows uniform assignment + claimant exclusion; a live VRF round assigns within the gas
  limit.
- **T4:** `prove-eac.ts` prints two reverts, one success.
- **T5:** guard unit tests prove stale/mismatched deployment → `Unverifiable`; one live witness run
  with no fixtures on the path.
- **T7:** each scene 5× end-to-end, zero manual intervention.

**End-to-end acceptance.** Run `scene-2-false-claim.ts` from clean state; confirm without touching
anything: bond escrowed → VRF assigns a non-claimant witness → witness derives a contradicting
finding from live Graph data → tribunal emits `Mismatch` with no evidence in the report → bond lands
with the witness → `perjury.standing` decreases on-chain → the claimant can no longer be selected.
Every step verifiable from a block explorer alone, from a fresh checkout.

**Submission acceptance.** A judge opening the repo cold can answer, unaided: what did the humans
design, what did AI implement, how was the AI directed. Commit history shows incremental progress
across the week.
