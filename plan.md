# Perjury — Implementation Plan

**Goal:** ship the three-scenario demo (true claim → false claim → collusion throttle) with real Sepolia transactions, by **Sun Sep 13 2026, 12:00 EDT**.

**Design lives in [`docs/`](docs/design.md)** — start at [docs/01-concept.md](docs/design.md). Decisions already made: [`docs/decisions/`](docs/decisions.md). This file is sequencing and constraints only.

**Stack:** Foundry (Solidity, Sepolia) · `@chainlink/cre-sdk` + CRE CLI (TypeScript) · Chainlink VRF v2.5 · ENSv2 Sepolia beta · The Graph Gateway + Subgraph MCP · Next.js 15 + viem/wagmi · Bun workspaces.

> **Provenance — AI-ASSISTED.** Sequencing, estimates, and cut order are AI-proposed against human constraints: tribunal-first ordering, nothing mocked. See [docs/ai-usage.md](docs/ai-usage.md).

---

## Status at a glance

*Updated Sep 9.* **The protocol is live on Sepolia and all three demo scenes have run end to end.** What remains is presentation, not mechanism.

| Task | State |
|---|---|
| T0 Unblock | ● wallet funded · VRF sub + consumer · Graph key · CRE CLI + login · Foundry + Bun |
| T1 CRE tribunal | ● workflow + TEE handler, report delivered on-chain by the Forwarder. Executed via the simulator, which runs **locally, not in an enclave** — [execution log](docs/cre-execution-log.md) |
| T2 Contracts | ● all deployed, wired, immutable. 55 Foundry tests |
| T3 Randomness | ● live VRF v2.5 rounds assigning witnesses and seating appeal panels, repeatedly |
| T4 ENSv2 | ● resolver deployed, per-key EAC, operator write revoked, standing written by the tribunal alone |
| T5 Graph | ● live Gateway + guard + MCP + LLM agents. Five protocols on one standardized query pattern; corroborated reads across independent deployments. 64 TS tests |
| T6 Dashboard | ○ not started — deliberately last, see D12 in [ai-usage.md](docs/ai-usage.md) |
| T7 Scenes | ● all three run on Sepolia: 3m46s, 6m46s, 4m53s |
| T8 Submit | ◐ evidence and docs ready; **video not recorded** |

### Live on-chain

Addresses, per-scene transaction trails and the full ledger: [docs/TX_HASHES.md](docs/TX_HASHES.md). Rebuild it from chain with `npx tsx scripts/collect-evidence.ts`.

Proven, each with a transaction: VRF assignment where the witness is never the claimant · settlement in both directions · a false claim caught, appealed, and upheld by a randomly seated panel of three · bond, appeal bond, stake and eligibility all forfeited · ENS standing written by the tribunal and by nobody else, with the operator itself reverting · automatic exclusion in the block after settlement.

### The protocol is deployed

The earlier hold — `VerdictSink.CRE_REPORT_WRITER` is immutable and the Forwarder address had only been observed once — was resolved by measuring it against a throwaway probe and then deploying against the measured value. Reports have arrived from `0x15fC6ae9…9F88` on every run since. Redeploying is a cascade because each contract holds the next immutably; `npx tsx scripts/deploy-all.ts` does the whole thing in one command.

### Nothing is blocked

All three previous blockers cleared. The agents run on `claude -p` rather than a raw API key; the ENS team answered the EAC questions and the resolver is configured and locked; the Forwarder address is measured and stable across runs.

CRE confidential-DON deploy access was requested and has not been granted. It is **not** a blocker — the Chainlink track explicitly accepts execution via the CLI simulator with evidence, and that is the shipping path.

### Resume here

In priority order:

1. **Record the demo video.** The only item on the critical path. Nothing on-chain is waiting on it and everything it needs to show already exists.
2. **Human line-by-line review of `WitnessRoster.sol`**, so its `⚠ NOT YET HUMAN-LED` label can move honestly. It is the anti-collusion core and the most likely thing a judge probes.
3. **T6 dashboard** — reads from chain and Graph, no credentials needed.
4. **ENS follow-up:** `revokeSetterRoles` has no working inverse once the admin role is given up. Not yet posted.

Open gap, documented rather than hidden: evidence reaches the enclave over Confidential HTTP, but the store itself is a secret gist and is not encrypted at rest.

## ⏱ Reality check

**4 days left, and every engineering gate has been met early.** The gates below are kept as a record; only the last one is still open.

| Gate | By | Met |
|---|---|---|
| CRE access form submitted | Mon Sep 7 | ✅ Sep 8 — and T1 never waited on it; the local simulator runs confidential workflows without approval |
| Tribunal emits a real Sepolia tx | Tue Sep 8 EOD | ✅ Sep 8 |
| Bond escrow + settlement E2E | Wed Sep 9 EOD | ✅ Sep 8, a day early |
| VRF assignment + live ENS eligibility | Thu Sep 10 EOD | ✅ Sep 8, two days early |
| All three scenes run E2E | Sat Sep 12, 18:00 | ✅ Sep 9, three days early |
| **Video recorded + submitted** | **Sun Sep 13, 09:00 EDT** | ⬜ **the only gate still open** |

The schedule risk has inverted. The original plan assumed the mechanism would consume the week and the video would be squeezed; instead the mechanism landed early and the video is now the single point of failure. Time freed by finishing early went into hardening — the appeal layer, timeouts, fail-closed reads, and corroborated reads all came after the original gates were met, none of them in the initial plan.

---

## Global constraints

Operational facts that constrain every task. Violating one of these fails the submission, not just the task.

**Submission rules (from the event details page — read these twice):**
- **Commit incrementally, starting today.** "Submissions with large single commits or missing histories may be disqualified." One giant end-of-week commit is a disqualification risk, not a style preference. Commit at every task boundary.
- **Exactly 3 partner prize slots** are selectable at submission. Ours: Chainlink, ENS, The Graph. This resolves the old open question about submitting to two Graph tracks — there is one Graph slot, so pick the track we're strongest in (AI Use Case, From Scratch) and mention the standardized-schema angle in the writeup.
- **Video: ≤4:00, ≥720p, no AI voiceover, no text-to-speech, no sped-up footage, no music-only narration, not recorded on a phone.** A real human voice must narrate. Violations force a re-submit.
- Everything must be built during the event window (Sep 4–16) — the Graph track is the "From Scratch" pool.

**Technical:**
- ENS: build against the **hackathon deployment addresses only** (`packages/ens/src/deployment.ts`), never production ENS addresses. Override the built-in Universal Resolver.
- CRE: `cre workflow simulate` needs no beta grant; **Vault DON secrets do**. The commitment salt falls back to a local env var under simulation.
- Bonds are native Sepolia ETH. No ERC-20 faucet dependency on the critical path.
- Every contract that matters has **no owner, no pause, no upgrade proxy, no address setters.** Judges will grep for an escape hatch; the CRE-only write claim must survive that.
- Graph reads are live Gateway only, authenticated with a Studio API key. **No fixtures, no local graph-node, no cached JSON** anywhere in the verification path — mocked data disqualifies the track.
- Provenance failure ⇒ `Unverifiable`. Never a silent pass. Enforced in `graph-guard`, re-checked in the enclave.
- Agents run as separate processes with separate keys and no shared memory or message channel. Isolation is structural, never a prompt instruction.
- LLM agents: pinned model, temperature 0, capped tool-call rounds.
- VRF `callbackGasLimit` ~500k; roster walk is a bounded loop that falls through to `Unverifiable` rather than reverting.
- **Every demo tx hash goes in [`docs/TX_HASHES.md`](docs/TX_HASHES.md) as it happens.** Reconstructing them the night before is how evidence goes missing.
- Attribution lives in [docs/ai-usage.md](docs/ai-usage.md), updated at each task boundary — not duplicated in source file headers.
- Env — root `.env` (gitignored): `SEPOLIA_RPC_URL`, `OPERATOR_PRIVATE_KEY` (no `0x` prefix — `cast` tolerates it, `vm.envUint` does not), `GRAPH_STUDIO_KEY`, `VRF_*`, the deployed contract addresses, and `AGENT_1..4_PK` / `AGENT_1..4_ADDR` written by `deploy-all.ts`. `cre/.env`: `CRE_ETH_PRIVATE_KEY`, `PERJURY_COMMITMENT_SALT`. No `ANTHROPIC_API_KEY` — the agents run on `claude -p`.

**Decided (Sep 7):** commits carry **no `Co-Authored-By` trailers** — every commit is authored by the team account. AI involvement is documented where it's actually legible to a reviewer ([docs/ai-usage.md](docs/ai-usage.md)) rather than as a bot contributor on the repo. Keep this consistent; a mixed history looks worse than either choice.

---

## Tasks

### T0 — Unblock *(Mon Sep 7, ~1h — do the first line before anything else)*

- [x] **Submit the CRE Confidential Workflows access form** — submitted Sep 8: <https://docs.google.com/forms/d/e/1FAIpQLSdk8mxDZAXpEX1PHgjzCoBeKxSoQysoO9sxOb-gpBrDrjOhtA/viewform> **Do not wait on it** — Chainlink's docs confirm the local simulator runs confidential workflows without approval, so T1 is unblocked today. [ADR 0002](docs/decisions.md)
- [x] `git init`, public GitHub repo, **first commit = the docs tree already written** (`README.md`, `plan.md`, `docs/`). Establishes commit history from day one.
- [x] Foundry scaffold and npm workspaces done. Next.js never scaffolded — the dashboard was deprioritised and remains unbuilt.
- [x] Provision, and **personally watch each one work before moving on**:
  - [ ] Sepolia RPC + 4 funded keys (deployer, claimant, witness-A, witness-B)
  - [ ] Subgraph Studio API key → one live query returns data
  - [ ] VRF v2.5 subscription funded with testnet LINK → one request fulfils
  - [ ] CRE CLI installed → `cre workflow simulate` runs on a hello-world
  - [ ] One ENSv2 name registers on Sepolia — **register directly against the contracts** (commit-reveal + MockUSDC). The hackathon app has been failing on "Deploy resolver" with a hardcoded 21M gas limit; ENS confirmed it's only a convenience layer.

**Exit:** every external dependency independently proven. No exceptions — an unproven dependency found broken on Friday is unrecoverable.

---

### T1 — The tribunal, standalone *(Tue Sep 8, ~4h — HIGHEST RISK, BUILD FIRST)*

**Files:** `cre/tribunal/main.ts`, `cre/config.staging.json`, `contracts/src/ScratchSink.sol`

- [x] Adjudication logic done and tested as a pure function (`packages/tribunal`, 28 tests). The CRE wrapper runs: `cre workflow simulate` executes the TEE handler and `--broadcast` delivers the signed report on-chain. No beta access needed to simulate.
- [x] `cre workflow simulate` green.
- [x] Deploy `ScratchSink.sol` (throwaway), then `cre workflow simulate --broadcast` writing to it.
- [x] **Record the broadcast tx's `msg.sender`** — this settles whether `CRE_REPORT_WRITER` is the workflow owner or a Chainlink Forwarder. Do not guess this into the contract.
- [x] Log tx hash → `docs/TX_HASHES.md`.

**Exit:** a real Sepolia tx whose calldata came out of a TEE handler. **If this fails, stop and re-plan** — every downstream decision assumes it.

---

### T2 — Contracts + settlement *(Wed Sep 9, ~5h)*

**Files:** `contracts/src/{ClaimRegistry,VerdictSink,PerjuryStandingWriter}.sol`, `contracts/test/**`

- [x] `ClaimRegistry` — bond escrow, lifecycle, pull-payment settlement. Immutable wiring.
- [x] `VerdictSink` — single authorized sender, no setter.
- [x] `PerjuryStandingWriter` — one mutating function, callable only by the sink.
- [x] Foundry test matrix ([docs/design.md](docs/design.md) §2.5) — 55 tests, 1024 fuzz runs, **including the negative cases**: `recordVerdict` from an EOA reverts; `onReport` from a non-CRE address reverts; double-settle reverts.
- [x] Point T1's workflow at the real `VerdictSink`. Bond in → verdict out → bond settled, witness address hardcoded.

**Exit:** `forge test` green; one E2E settlement on Sepolia with hashes logged.

---

### T3 — Randomness + live eligibility *(Thu Sep 10, ~5h — SECOND-HIGHEST RISK)*

**Files:** `contracts/src/WitnessRoster.sol` (**human-authored**, see [ai-usage §0.6](docs/ai-usage.md))

- [x] `WitnessRoster` written: registration, roster walk, `isEligible`, fail-closed. **Coordinator is a mock — swap in the Sepolia VRF v2.5 coordinator address for the live round.**
- [x] Benchmarked. The real callback measures ~90k, so `callbackGasLimit` came down 500k → 150k and the two-step fallback was never needed. Panel draws are sized `×(PANEL_SIZE + 1)` after an undersized limit let VRF mark a callback fulfilled while nothing happened.
- [x] Fuzz: assignment uniform over eligible set; `assigned != claimant` for every seed.
- [x] Live VRF round on Sepolia assigns a witness. Hashes → `TX_HASHES.md`.

**Exit:** assignment verifiably random, flagged agents skipped, proven by test *and* a live tx.

---

### T4 — ENSv2 + Enhanced Access Control *(Fri Sep 11 AM, ~4h)*

**Files:** `packages/ens/**`, `scripts/prove-eac.ts`

- [x] **Override the Universal Resolver** in viem/ethers with the hackathon address (`withHackathonResolver()` in `packages/ens`). Without this, resolution silently targets the wrong deployment and every ENS result in the demo is meaningless.
- [x] Register `perjury.eth` **directly via contracts** (commit-reveal, MockUSDC fee), deploy subname registry, mint 5 agent subnames.
- [ ] Add ENSIP-25 / -26 records alongside the reputation records (ENS team recommendation). **Not done** — optional, and nothing depends on it.
- [x] Record-scoped EAC role → `PerjuryStandingWriter` only, on `perjury.standing` + `perjury.flagged-until`.
- [x] **Revoke agent self-write on those records.** The single most important config line in the project.
- [x] `scripts/prove-eac.ts` — three txs, two must revert: agent writes own standing (revert), deployer writes (revert), tribunal path (succeeds). **This clip goes in the video verbatim.**
- [x] Wire `standingReader` into `isEligible`; confirm mismatch → record drops → next assignment excludes, with zero manual steps.

**Exit:** the EAC proof script prints two reverts and one success. Hashes logged.

> **Beta risk:** ENSv2 is a beta; the deployed contracts may differ from the docs. Read the actual ABIs on Sepolia, not just the documentation. Budget the whole morning.

---

### T5 — Graph layer + agents *(Fri Sep 11 PM, ~5h)*

**Files:** `packages/graph-guard/**`, `packages/shared/pinned-deployments.json`, `agents/{witness,claimant}/**`

- [x] `graph-guard`: deployment-ID pinning, freshness gate, attestation hashing, and cross-deployment corroboration. 21 tests incl. stale block → `Unverifiable`, never `Match`, and contested sources → `Unverifiable`, never a resolved winner.
- [x] Five deployments pinned across four protocols on one standardized schema, plus a second *independent* index of one protocol used for corroboration rather than as a fallback. `scripts/verify-pinned.ts` checks them all before a take.
- [x] Witness agent: LLM + Subgraph MCP, composes its own GraphQL against the standardized schema, output through the guard.
- [x] Jot sponsor-facing friction in the build log as you hit it (three betas: CRE, ENSv2, Subgraph MCP). If there's enough by T8, it becomes a `FEEDBACK.md` — sponsors reward it. Don't commit an empty template.
- [x] Claimant agent: separate process, separate key, no channel to the witness.

**Exit:** one live witness run derives a finding from the real Gateway with no fixtures anywhere.

---

### T6 — Dashboard *(Sat Sep 12 AM, ~4h)*

**Files:** `app/**`

- [ ] Claim feed + status; witness assignment with VRF request/fulfil tx links.
- [ ] **ENS standing bars that visibly move** on verdict.
- [ ] Eligibility roster: who's selectable, and why the flagged agent isn't.
- [ ] Agent tool-call stream (the witness's MCP reasoning, on camera).
- [ ] **"What the tribunal did NOT publish"** panel: sealed evidence pointer beside the minimal on-chain report. This is the only way to film confidentiality.

Renders from chain + Graph reads only. Never a place where behavior gets faked for the camera.

---

### T7 — Scenes + rehearsal *(Sat Sep 12 PM — gate: all three green by 18:00)*

**Files:** `agents/runner/scene-{1,2,3}-*.ts` (**human-authored**)

- [x] `scene1.ts`, `scene2.ts`, `scene3.ts` — re-runnable against fresh claim ids. Each takes a claimant argument, because scene 2 slashes its own.
- [ ] Run each **≥5×**. **Each has run once end to end.** Re-runs cost ~15 minutes of chain time for all three; do this before recording, not during.
- [ ] Walk [design.md §7](docs/design.md) row by row — every row needs its visible artifact or it doesn't go in the video. **Not done.**
- [x] All hashes → `TX_HASHES.md`.

---

### T8 — Submit *(Sun Sep 13, 06:00–09:00 EDT — HARD STOP 12:00)*

- [x] CRE beta access did not land. Shipping the simulate path, which the Chainlink track explicitly accepts with evidence — [execution log](docs/cre-execution-log.md).
- [x] Freeze addresses; `README.md` gets deployed addresses + demo tx hashes.
- [ ] `SKILL.md` (explicit Graph-track ask). **Not done.**
- [ ] **Record video** — human voice, ≤4:00, ≥720p, no TTS, no speed-up.
- [ ] Human writes the limitations section in their own words ([ai-usage §0.6](docs/ai-usage.md)). **Outstanding** — currently Claude's prose expressing the human's analysis.
- [x] **Final attribution audit:** `docs/ai-usage.md` §0.3 has no `planned` rows and no aspirational labels; every directing prompt is in `docs/prompts/`.
- [ ] Submit by 09:00. Three partner prizes: Chainlink, ENS, The Graph.

---

## T9 — Mechanism hardening *(before the dashboard)*

From [docs/threat-audit.md](docs/threat-audit.md). A loophole-free mechanism matters more than visualisation, so this precedes T6.

**Closed already ([ADR 0007](docs/decisions.md)):**
- [x] Witness earned the whole bond on Mismatch and staked nothing — dishonest disagreement was its dominant strategy. Now: flat fee regardless of verdict, forfeited bond held by the protocol and payable to nobody.
- [x] Tribunal judged on stated conclusions. Now recomputes each side's value from its own raw evidence; a conclusion its evidence does not reproduce returns `Unverifiable`.
- [x] Agents staked nothing. Now 0.05 ETH at registration, slashable, and gating eligibility — which also makes sybil resistance economic rather than rhetorical.

**Open:**
- [x] **Appeal layer.** A verdict now opens a challenge window rather than settling. Either party may appeal against a bond; a VRF panel of three is drawn excluding both parties and the appellant; the panel's finding stands, a contradicted party is slashed, and a failed appeal forfeits the bond. `finalize()` is permissionless, so settlement never waits on a particular party. Reputation is applied at settlement rather than adjudication, so an overturned verdict never reaches the record.
- [x] **Timeouts.** `timeoutWitness` replaces and slashes an unresponsive witness, then redraws so the claim still gets an answer; `timeoutClaimant` settles as Unverifiable after a second window and pays the witness, which made itself available. Both permissionless, so no party depends on the unresponsive one acting.
- [x] **Eligibility on submit.** `submitClaim` now requires `isEligible`, so a slashed agent cannot keep claiming from a position with nothing left to slash.
- [x] **Reputation reads fail closed.** `standingOfNameChecked` returns a readability flag alongside the score, so "no record yet" and "could not read" are no longer conflated. An unreadable record is ineligible.
- [x] **Block-skew guard.** Readings more than 25 blocks apart return Unverifiable, checked before values are compared so a wide gap can never become a Mismatch. Two honest parties reading different blocks have not disagreed about anything.
- [x] **Model diversity.** Panel seats run different models — `seatPanel()` assigns one per seat. With only Anthropic credentials this is intra-family diversity, which reduces correlated error without eliminating it; a second provider key would make it cross-family, and any `LlmClient` can be seated.
- [ ] **K-of-N corroboration** — optional. A single witness decides an outcome today; requiring K agreeing findings for high-value claims would remove that.

## Cut order (if behind)

Mostly spent. Items 2, 3 and 5 resolved themselves — the claimant stayed an LLM agent, scene 3 runs live, and shipping the simulator path turned out to carry zero track cost because Chainlink accepts simulation with evidence.

| Order | Cut | Cost |
|---|---|---|
| 1 | Dashboard entirely | Already the standing decision — the protocol had to be loophole-free first, and everything is verifiable from a block explorer and the terminal scenes without it |
| 2 | Roster size 5 → 3 agents | Weakens the 1/n collusion argument; do this only in extremis |

**Never cut:** the EAC proof (carries ENS), live Graph reads (mocking disqualifies), the confidential handler (it is the project), or the limitations section (it is the point).

---

## Risks & fallbacks

All six original risks are resolved. Kept as a record of what was actually feared versus what actually bit.

| # | Risk | Outcome |
|---|---|---|
| 1 | CRE SDK surface differs from the docs | **Happened.** The handler is synchronous, `btoa` does not exist in the WASM runtime, and §3.4's confidentiality claim was overstated. All three caught on the first simulator run. |
| 2 | ENS read blows the VRF callback gas limit | **Did not happen.** The real callback measured ~90k; `callbackGasLimit` was cut 500k → 150k. The two-step fallback was never needed. |
| 3 | ENSv2 beta API differs from docs | **Happened, twice.** `setText` takes a DNS-encoded name, and reads must go through ENSIP-10 `resolve()` — `text()` reverts on a Permissioned Resolver. The second bit us in two contracts, because the mock served `text()` happily and unit tests passed. The mock now reverts to match production. |
| 4 | LLM nondeterminism ruins a take | **Live.** Mitigated by pinned model, low temperature, and re-runnable scenes. Still the most likely thing to spoil a recording. |
| 5 | Subgraph lags during recording → `Unverifiable` | **Mitigated.** `npx tsx scripts/verify-pinned.ts` checks every pinned deployment for staleness, drift and indexing errors. Run it immediately before recording. |
| 6 | Attribution labels drift from reality | **Happened, and was corrected.** `agents/runner/**` was labelled HUMAN-LED in advance and Claude wrote it; the label was moved down rather than left standing. See [ai-usage.md](docs/ai-usage.md) §0.3. |

**Remaining risk is entirely presentational:** the video is unrecorded, and it is now the only thing that can lose the submission.

---

## Open questions — all closed

1. **Claim domain.** ✅ Messari standardized lending schema, mainnet-indexed, settlement on Sepolia. Now five protocols behind one query pattern.
2. **Where sealed evidence lives.** ✅ Published to a gateway and fetched into the enclave over Confidential HTTP. Known gap: the store is a secret gist and is not encrypted at rest.
3. **Bond size.** ✅ 0.01 bond, 0.002 witness fee, 0.02 appeal bond, 0.01 registration stake.
4. **Standing scale.** ✅ Match `+1`, Mismatch `−3`, ineligible below zero. One mismatch flips an agent ineligible, which is what makes scene 2 legible in under a minute. The aggression is intended.
5. **Roster size.** ✅ Five agents.

---

## Verification

Every gate below has been met. Commands are the ones that re-prove it.

- **T1:** ✅ TEE handler → signed report → Sepolia, delivered by the Forwarder. [Execution log](docs/cre-execution-log.md).
- **T2:** ✅ `forge test` — 55 tests, including every negative access-control case.
- **T3:** ✅ Fuzz shows assignment excludes the claimant; live VRF rounds assign witnesses and seat appeal panels within the gas limit.
- **T4:** ✅ ENS standing is written by the tribunal and by nobody else — the operator that deployed everything and owns the name reverts with `EACUnauthorizedAccountRoles`.
- **T5:** ✅ Guard tests prove stale, unpinned, erroring, empty and *contested* reads all produce `Unverifiable`; live agent runs with no fixtures anywhere. `npx vitest run` — 64 tests.
- **T7:** ✅ All three scenes run on Sepolia. Re-runnable against fresh claim ids; pass a different claimant per run, since scene 2 slashes its own.

**End-to-end acceptance — met by scene 2.** From clean state, with no intervention: bond escrowed → VRF assigns a witness that is not the claimant → the witness derives a contradicting finding from live Graph data → the tribunal returns `Mismatch` with no evidence in the report → the claimant appeals → a second VRF draw seats three agents excluding both parties → the panel upholds → bond, appeal bond and stake are forfeited, ENS standing drops, and the agent is ineligible in the next block.

Note what settlement does **not** do: the forfeited bond goes to **nobody**. It is not paid to the witness. Paying it to the witness is precisely what would make fabricating disagreement profitable, and correcting that was [ADR 0007](docs/decisions.md) — an earlier draft of this document specified the opposite.

**Submission acceptance.** A judge opening the repo cold can answer, unaided: what the human designed, what AI implemented, and how the AI was directed — [ai-usage.md](docs/ai-usage.md) §0.0 answers it in one page. Commit history shows incremental progress across the week.
