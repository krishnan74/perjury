# Transaction Ledger

Every on-chain transaction that appears in the demo or backs a claim in the submission. Logged **as it happens**, not reconstructed — a hash you can't find on Sunday morning is evidence you don't have.

Network: **Ethereum Sepolia** · Explorer: https://sepolia.etherscan.io/tx/`<hash>`

## Deployed contracts

Addresses below are the **final** deployment — the one the three demo scenes ran against. Earlier deploys were superseded when `ClaimRegistry` split settlement out of `recordPanelVerdict`; every contract here is immutable, so a change means a redeploy.

| Contract | Address | Deploy tx | Date |
|---|---|---|---|
| `ScratchSink` (probe, throwaway) | `0xA7355Ac345828Ea003ad6686Be6D9506F9Fb31cF` | deployed | Sep 8 |
| `ClaimRegistry` | `0x8CDa96E615E96f97073C19Cc2167E4D242487A88` | deployed | Sep 8 |
| `WitnessRoster` | `0x1b686Decd5fc0F5Bd2511E6B63809c340dec2252` | deployed, callbackGasLimit 150k | Sep 8 |
| `PerjuryStandingWriter` | `0x211C7ff47436D43f90f0d8D90e02bf76a6F70BAD` | deployed, holds ENS SET_TEXT | Sep 8 |
| `ENSTextStandingReader` | `0x366D0415347b3F996DbDC8549EdFf6f3Ee616C55` | deployed | Sep 8 |
| `PerjuryResolver` (ENSv2 Permissioned) | `0xcBd795d211Dd40dB392730034B5e68359c9E8534` | deployed, EAC configured | Sep 8 |
| `VerdictSink` | `0xedABb806dDFe7ACa46707713E2D649f2dd0d86D3` | deployed, accepts only `0x15fC…9F88` (mock forwarder) | Sep 8 |

**CRE report writer** (the only address `VerdictSink` accepts): `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` — ✅ **measured, not guessed.** Reports arrive from a Chainlink **Forwarder contract** (4,579 bytes of code), *not* from the workflow owner EOA (`0xDcbe075a907960951Cd4df379BB21461097eEa91`). Guessing the owner would have made `VerdictSink` reject every verdict, and `CRE_REPORT_WRITER` is immutable. **ENS root:** `perjury.eth` ✅ registered on the ENSv2 hackathon deployment, owned by `0xDcbe075a907960951Cd4df379BB21461097eEa91`. Cost 8.000021 MockUSDC, 1 year.

| Step | Tx |
|---|---|
| MockUSDC mint | [`0xa7dba37e…397b6e34`](https://sepolia.etherscan.io/tx/0xa7dba37e2faafeba353fa1f1d43660fdd4f9534e7400ccb1dc9766f2397b6e34) |
| approve registrar | [`0x9ea3de07…29138897`](https://sepolia.etherscan.io/tx/0x9ea3de075bad26e31441e490c1db0ba2beb16ae68c4d73592036e44829138897) |
| commit | [`0x3b003778…992e42917`](https://sepolia.etherscan.io/tx/0x3b0037781683e53300c423ac8ec79b0b5d1ccd6b1161b53b1d796e0992e42917) |
| register | [`0x7237cac5…2ef53a92`](https://sepolia.etherscan.io/tx/0x7237cac596c24e632ca537d13ab60240fb95cd5d9c419cacdfd34e6a2ef53a92) |

## Milestone evidence

| Task | What it proves | Tx hash | Date |
|---|---|---|---|
| T1 | TEE handler → real Sepolia tx | [`0xbd50a73c…6ac4721d`](https://sepolia.etherscan.io/tx/0xbd50a73caf76f55092aa19614def76173a87c81a347f2c719a72a1fa6ac4721d) | Sep 8 |
| T1 | Report sender is a Forwarder, not the owner | same tx — `lastSender` on ScratchSink | Sep 8 |
| T2 | Bond escrowed → verdict → settled | [`0x6e930d96…c039f742c`](https://sepolia.etherscan.io/tx/0x6e930d965125f67b165cd85369dea61ad4aaa2af0cab0afaeb28a61c039f742c) — claim 1, Match, bond returned | Sep 8 |
| T3 | Claim submitted, bond escrowed, VRF requested | [`0xcb2de714…82ceb237`](https://sepolia.etherscan.io/tx/0xcb2de714f0d6339e23c6673db792e0907a96e55ca2c2ad82bf2a389882ceb237) | Sep 8 |
| T3 | **VRF fulfilment → witness assigned ✅** | [`0x1d24be28…af1c89bd`](https://sepolia.etherscan.io/tx/0x1d24be28ecc37abf36fa91ff63c0eb06112df03528162045ae7e3435af1c89bd) — 206,455 gas, spent 0.065 LINK | Sep 8 |
| T3 | Witness drawn ≠ claimant, verified on-chain | claimant `0xDcbe…eA91`, witness `0xc38f…c4AF` | Sep 8 |
| T3 | Re-verified at 150k callbackGasLimit, assigned in ~100s | new roster `0x8412…E309` | Sep 8 |
| T4 | `perjury.eth` registered direct-to-contract | see above | Sep 8 |
| T5 | Live guarded Graph read (Aave v3, 0 blocks stale) | no tx — Gateway read | Sep 8 |
| T4 | Permissioned Resolver deployed via VerifiableFactory | `0x033ee97dde610f134a746f986fa60c54588a0a45` | Sep 8 |
| T4 | EAC: grant SET_TEXT → standing writer | [`0xf64174e9…48eb09bf`](https://sepolia.etherscan.io/tx/0xf64174e9da79b11d8aa99dbcb22c800ad3d34b7db9cb702cd2333ca748eb09bf) | Sep 8 |
| T4 | EAC: **revoke SET_TEXT ← operator** | [`0x99841f50…1dd27635`](https://sepolia.etherscan.io/tx/0x99841f50b55e45a3bb4d59f1c4f9edff7d690649f074cd34e8cf1d511dd27635) | Sep 8 |
| T4 | EAC: operator write **reverts** ✅ | `EACUnauthorizedAccountRoles(resource, 16, 0xDcbe…eA91)` — the deployer, name owner and role admin still cannot write reputation | Sep 8 |
| T4 | EAC: operator write **reverts** | `EACUnauthorizedAccountRoles` — the operator deployed every contract and owns `perjury.eth`, and still cannot write standing | Sep 8 |
| T4 | EAC: tribunal write **succeeds** | standing written at settlement, e.g. [`0x8e9cd2b3…d43486fe`](https://sepolia.etherscan.io/tx/0x8e9cd2b36a77606105827cb8ad4aee7b81a2218a1e9882d6b0997a01d43486fe) | Sep 8 |

## Demo scenes

### Current runs (Sep 10)

The scenes below were recorded on Sep 8 and Sep 9 and remain accurate for the claims they name — the contracts have not been redeployed since. They describe a **superseded runner**, though: at the time the scene bonded a hardcoded `claimHash` and the claimant agent drafted its claim *after* the bond was already posted, so what was staked committed to nothing the agent had derived.

That is fixed, and the claims worth looking at now are:

| Claim | What it shows |
|---|---|
| **24** | An honest claim, and the first run through the **sealed** evidence store — the gateway holds ciphertext only. Verify with `npx tsx scripts/prove-sealed.ts`. |
| **23** | A false claim caught, appealed, and upheld by a panel of three. Both agents were handed identical rows from the same pinned block and their conclusions differ by 24.25 points. |
| 21 | Settled `Unverifiable` because the claimant's model wrote a metric name the witness could not resolve. Kept as evidence that the protocol fails closed rather than guessing. |
| 22 | `Mismatch` with no appeal: the claimant ran out of funds mid-scene, which is why `preflight` now checks balance as well as eligibility. |

In every run from claim 19 onward the claimant reads, drafts, and only then bonds `keccak256` of its own sentence — recoverable from the archive and checkable against `claimOf(claimId).claimHash`.

### ✅ Appeal path verified end-to-end on-chain (Sep 8)

A lying claimant caught, appealing, and losing everything — deployed via `npx tsx scripts/deploy-all.ts --resolver --agents 5`.

| Step | Result |
|---|---|
| 5 agents registered and staked | 0.01 ETH each; eligibility gated on stake |
| Claim submitted | bond + witness fee |
| VRF draws witness | `0x689b…44aF` — not the claimant |
| Tribunal records **Mismatch** | status `3`, challenge window opens |
| Claimant appeals (0.02 ETH) | status `4` UnderAppeal |
| **VRF seats a panel of three** | `0x854a…30BE`, `0x20aa…101c`, `0x2ca9…4A6E` — neither party among them |
| Panel **upholds** the Mismatch | recorded only; settlement stays out of the Forwarder's gas allowance |
| Finalised | [`0x55c3e684…360030e0`](https://sepolia.etherscan.io/tx/0x55c3e68432628324ed1f555321bf38cb57c610041918b9b42958f467360030e0) |

Outcome: claimant receives **nothing**, 0.03 ETH forfeited and **payable to no one**, stake slashed to zero, eligibility lost, ENS standing **−3**.

The forfeited bond going to nobody is the point. Paying it to the witness is what made fabricating disagreement the witness's dominant strategy ([ADR 0007](decisions.md)).

### ✅ Hardened protocol verified end-to-end (Sep 8)

Redeployed after ADR 0007. Every mechanism fired: staked agents, flat witness fee, challenge window, permissionless finalisation, per-key ENS scoping.

| Step | Result |
|---|---|
| Agents staked and registered | 0.01 ETH each, eligibility gated on stake |
| Claim submitted (bond + fee) | [`0x61e5b394…4e65c972`](https://sepolia.etherscan.io/tx/0x61e5b394eb3de700bec5a219d31b4f836f7312d5b228732a4da2e58f4e65c972) |
| VRF assigns witness ≠ claimant | `0xc38f…c4AF` |
| Tribunal records verdict | status `3` Adjudicated — **deliberately not settled** while the window is open |
| Finalised after the window, permissionlessly | [`0xc5c590e8…d689542f`](https://sepolia.etherscan.io/tx/0xc5c590e8881636508f3f68049a620517268f87d9d4c2321c222b45e9d689542f) |
| Bond returned / witness fee paid | 0.01 ETH / 0.002 ETH — the fee is paid on **every** verdict |
| ENS standing written by the tribunal | `com.perjury.agent-standing` → 1 |

The writer holds `ROLE_SET_TEXT` for exactly two keys on this resolver; writing any other key reverts with `EACUnauthorizedAccountRoles`.

### Earlier full loop (superseded by the above)

Bonded claim → VRF-assigned witness → CRE tribunal → verdict on-chain → bond settled → ENS standing written.

| Step | Result |
|---|---|
| Claim submitted, 0.01 ETH escrowed | [`0xa9f75299…66813a92`](https://sepolia.etherscan.io/tx/0xa9f7529907bc5e6a40c9b21aee03a7468d253e669d2ee6b52bf6cbad66813a92) |
| VRF assigns witness ≠ claimant | claimant `0xDcbe…eA91` → witness `0xc38f…c4AF` |
| Tribunal adjudicates (CRE, TEE handler) | `verdict=1 confidence=high` |
| Verdict delivered via Forwarder | claim status `4` (Settled), verdict `1` (Match) |
| Bond returned to claimant | `withdrawable = 0.01 ETH` |
| **ENS standing written by the tribunal** | `com.perjury.agent-standing` 7 → 8 |

The operator that deployed every contract, owns `perjury.eth` and holds the role admin still cannot write that record — `EACUnauthorizedAccountRoles`.

### Scene 1 — true claim, challenged anyway

Claim 9 · claimant `operator.perjury.eth` · run Sep 9, 5m23s. The claimant asserted an Aave v3 utilization figure; the drawn witness independently re-derived it and agreed.

| Step | Tx |
|---|---|
| Claim submitted + bond escrowed (0.012 ETH = 0.01 bond + 0.002 witness fee) | [`0xecaeaa2a…d517860b`](https://sepolia.etherscan.io/tx/0xecaeaa2a00fb2b87b6f0c467ec245db53bd565d3f4a6329ad0a5a326d517860b) |
| VRF fulfilment → witness assigned | [`0x3fa50fc1…b7f00330`](https://sepolia.etherscan.io/tx/0x3fa50fc142b72e4b996b54c2c4b2e46db383085a6999c97d5b555192b7f00330) |
| Verdict written (`Match`) by the CRE Forwarder | [`0xc999341b…df85584f`](https://sepolia.etherscan.io/tx/0xc999341bf17b5ea0318431bc80308b3a3d8b3f6c6799aad07cc2166edf85584f) |
| Settled — bond returned, witness fee paid, ENS standing 3 → 4 | [`0xdb8ef70f…a33157aa`](https://sepolia.etherscan.io/tx/0xdb8ef70f15b9f994cd51a933215718aa9a6388a6443b12c27e16ecf3a33157aa) |

The witness is paid its fee on **every** verdict, `Match` included — the fee cannot be a reward for finding fault.

**Reputation outlived the contracts.** Standing went 3 → 4, not 0 → 1, because it lives in an ENS text record rather than in protocol storage. The contracts were redeployed three times during development and every agent's history survived intact. That is a property of putting reputation in ENS, not a demo artifact.

### Scene 2 — false claim, appealed, upheld

Claim 1 · claimant `panel-1.perjury.eth` · run Sep 9, 6m19s. The claimant asserted a utilization far above reality; the drawn witness re-derived the true figure. The claimant then appealed and lost.

| Step | Tx |
|---|---|
| Claim submitted + bond escrowed | [`0xb69b2da0…44a92bbf`](https://sepolia.etherscan.io/tx/0xb69b2da05e9aeb51c5c7908d882a5ad1396fa92d298103d95b16e5da44a92bbf) |
| VRF fulfilment → witness assigned | [`0xab55a4a4…46f35dc2`](https://sepolia.etherscan.io/tx/0xab55a4a48ceffe51a5f361de1610fcdeab89971532a57fbae90fe7db46f35dc2) |
| Verdict written (`Mismatch`) | [`0xab65aff3…a86ec18e`](https://sepolia.etherscan.io/tx/0xab65aff367f38b0a82f9c0035a9d9494ebd0fa128d54f1e258f55c68a86ec18e) |
| Claimant appeals, posts 0.02 ETH appeal bond, second VRF request | [`0xbc356969…22935269`](https://sepolia.etherscan.io/tx/0xbc356969abe0d1ff5997000260381f649a6364a0e573f2671bc5570e22935269) |
| VRF fulfilment → panel of 3 seated, excluding both parties | [`0xcb21e9c0…8a5ee9af`](https://sepolia.etherscan.io/tx/0xcb21e9c082cbcef0481e92ec13f50a0b91e860ce689aa550e38809798a5ee9af) |
| Panel upholds `Mismatch` | [`0xeaeb74b3…f5881029`](https://sepolia.etherscan.io/tx/0xeaeb74b39f5b108e9abc95cf04eed893194b463d0754744342a196aef5881029) |
| Settled — bond + appeal bond forfeited, stake 0.01 → 0, ENS standing −3 → −6 | [`0x5b47b4de…eac7c53f`](https://sepolia.etherscan.io/tx/0x5b47b4de1a60c39a907c5b105c6decfe9ea79ffae82e8088fa4212fdeac7c53f) |

Panel seats drawn: `witness-a`, `panel-2`, `operator` — neither the claimant nor the original witness. The forfeited 0.03 ETH is payable to **nobody**: paying it to the witness is what would make fabricating disagreement profitable.

**Exclusion, proven in the next block:** the roster snapshot taken immediately after settlement shows `panel-1.perjury.eth` ineligible, with zero manual steps between the verdict and the exclusion.

### Scene 3 — collusion throttle

Claims 5–8 · claimant `panel-2.perjury.eth`, accomplice `witness-a.perjury.eth` · run Sep 9, 5m02s. Four claims submitted with no witness parameter — `submitClaim` has no code path to request one.

| Round | Claim | Witness actually drawn | VRF fulfilment tx |
|---|---|---|---|
| 1 | 5 | `operator.perjury.eth` | [`0xf010c37a…29922350`](https://sepolia.etherscan.io/tx/0xf010c37a70cce34d60f9b28b7015f653f3f25d0ed4a6b7dfc87ab25729922350) |
| 2 | 6 | `operator.perjury.eth` | [`0xeb88bf85…f1e60d37`](https://sepolia.etherscan.io/tx/0xeb88bf8554f280ce8592ebc77603d31fa0a1aeb26669fae2cd16098df1e60d37) |
| 3 | 7 | `panel-3.perjury.eth` | [`0x15814172…aba90c1c`](https://sepolia.etherscan.io/tx/0x1581417229de7bdcced4da3b11bdc8f0c12f5d39df9a248eb9dfeb84aba90c1c) |
| 4 | 8 | `panel-3.perjury.eth` | [`0x639d515f…0e45be8e`](https://sepolia.etherscan.io/tx/0x639d515f94c78088199d4b793415d3608b1e4334b4ff56ef65f53eea0e45be8e) |

Colluding pair paired: **0 of 4**, against an expected 1 in 3 — scene 2 had just slashed `panel-1`, leaving three eligible witnesses. Four rounds is far too small a sample to read as a rate, and an earlier run of the same scene drew the accomplice 2 of 4. Both results are recorded rather than the flattering one being kept: random assignment closes *deliberate* collusion because the pair cannot arrange to be matched, but it does not drive the pairing rate to zero. `contracts/test/Assignment.t.sol` fuzzes the distribution properly and asserts the residual risk is real.

### ENS name binding — two refusals and one success

`npx tsx scripts/prove-name-binding.ts`. Registration requires the name to have been issued to the caller, so reputation cannot be attached to a name you were not given.

| Attempt | Result |
|---|---|
| A stranger claims a name issued to someone else | reverts `NameNotControlled` |
| A stranger claims a name nobody was issued | reverts `NameNotResolvable` |
| The holder registers the name it was issued | succeeds |

The issuance record is a different EAC key from the standing record, and the tribunal holds no grant on it — so the contract that lowers an agent's standing cannot also decide whose standing it is.

**Reproducing this table:** `npx tsx scripts/collect-evidence.ts` rebuilds it from Sepolia logs. The scene scripts print truncated hashes for readability, so the ledger is read back from chain rather than transcribed.

## Full ledger, generated

<!-- BEGIN GENERATED LEDGER — npx tsx scripts/collect-evidence.ts --write -->

*Generated 2026-09-10 from Sepolia blocks 11665414–11674414. 25 claims, 181 events. Rebuild with `npx tsx scripts/collect-evidence.ts --write`.*

Claim ids restart with each deployment, so these are the claims of the deployment currently in `.env`.

#### Claim 1 — Mismatch

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11667347 | `ClaimSubmitted` | [`0xb69b2da05e9a…`](https://sepolia.etherscan.io/tx/0xb69b2da05e9aeb51c5c7908d882a5ad1396fa92d298103d95b16e5da44a92bbf) | claimant=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11667347 | `WitnessRequested` | [`0xb69b2da05e9a…`](https://sepolia.etherscan.io/tx/0xb69b2da05e9aeb51c5c7908d882a5ad1396fa92d298103d95b16e5da44a92bbf) | requestId=11443275233404247872220009627619923351700674628642859833660343434387624340886 |
| 11667351 | `WitnessAssigned` | [`0xab55a4a48cef…`](https://sepolia.etherscan.io/tx/0xab55a4a48ceffe51a5f361de1610fcdeab89971532a57fbae90fe7db46f35dc2) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11667351 | `WitnessDrawn` | [`0xab55a4a48cef…`](https://sepolia.etherscan.io/tx/0xab55a4a48ceffe51a5f361de1610fcdeab89971532a57fbae90fe7db46f35dc2) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f seed=61990186189850149925904432491353108545268488035237755597806245055113926192022 |
| 11667359 | `VerdictRecorded` | [`0xab65aff367f3…`](https://sepolia.etherscan.io/tx/0xab65aff367f38b0a82f9c0035a9d9494ebd0fa128d54f1e258f55c68a86ec18e) | verdict=2 evidenceCommitment=0x69eb7d8e467e60b801062a5cb033d6007aed54a35633a4bad14e4a00490016ac |
| 11667360 | `Appealed` | [`0xbc356969abe0…`](https://sepolia.etherscan.io/tx/0xbc356969abe0d1ff5997000260381f649a6364a0e573f2671bc5570e22935269) | appellant=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 bond=20000000000000000 |
| 11667360 | `PanelRequested` | [`0xbc356969abe0…`](https://sepolia.etherscan.io/tx/0xbc356969abe0d1ff5997000260381f649a6364a0e573f2671bc5570e22935269) | requestId=87739390728919261921441816180582822940329431485135925008614865319549053792730 |
| 11667365 | `PanelSeated` | [`0xcb21e9c082cb…`](https://sepolia.etherscan.io/tx/0xcb21e9c082cbcef0481e92ec13f50a0b91e860ce689aa550e38809798a5ee9af) | panel=0x407E1437890E460c8027f4C94ebf05f6a7917e13 0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11667365 | `PanelDrawn` | [`0xcb21e9c082cb…`](https://sepolia.etherscan.io/tx/0xcb21e9c082cbcef0481e92ec13f50a0b91e860ce689aa550e38809798a5ee9af) | panel=0x407E1437890E460c8027f4C94ebf05f6a7917e13 0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11667374 | `PanelUpheld` | [`0xeaeb74b39f5b…`](https://sepolia.etherscan.io/tx/0xeaeb74b39f5b108e9abc95cf04eed893194b463d0754744342a196aef5881029) | verdict=2 |
| 11667375 | `Settled` | [`0x5b47b4de1a60…`](https://sepolia.etherscan.io/tx/0x5b47b4de1a60c39a907c5b105c6decfe9ea79ffae82e8088fa4212fdeac7c53f) | claimant=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 verdict=2 |
| 11667375 | `ClaimantSlashed` | [`0x5b47b4de1a60…`](https://sepolia.etherscan.io/tx/0x5b47b4de1a60c39a907c5b105c6decfe9ea79ffae82e8088fa4212fdeac7c53f) | claimant=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 bond=10000000000000000 stakeSlashed=10000000000000000 |
| 11667375 | `WitnessPaid` | [`0x5b47b4de1a60…`](https://sepolia.etherscan.io/tx/0x5b47b4de1a60c39a907c5b105c6decfe9ea79ffae82e8088fa4212fdeac7c53f) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f fee=2000000000000000 |
| 11667375 | `AgentSlashed` | [`0x5b47b4de1a60…`](https://sepolia.etherscan.io/tx/0x5b47b4de1a60c39a907c5b105c6decfe9ea79ffae82e8088fa4212fdeac7c53f) | agent=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 amount=10000000000000000 remainingStake=0 |

#### Claim 2 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11667378 | `ClaimSubmitted` | [`0x450c21ba3be9…`](https://sepolia.etherscan.io/tx/0x450c21ba3be9be53e92ded65ee78648334ed881c83f308be818671fb7d1e2d89) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 subject=0x9e6610f6d942d7925b207dbbab3d18ad7028a40cb4465b30962746b20dda4d95 bond=12000000000000000 |
| 11667378 | `WitnessRequested` | [`0x450c21ba3be9…`](https://sepolia.etherscan.io/tx/0x450c21ba3be9be53e92ded65ee78648334ed881c83f308be818671fb7d1e2d89) | requestId=13404068502935417538622907809179059956214304237604385326400404096731127678254 |
| 11667383 | `WitnessAssigned` | [`0x76bbe4971bf4…`](https://sepolia.etherscan.io/tx/0x76bbe4971bf47897425707709a81de3c582554ee01e73655309164b4acf39cf5) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11667383 | `WitnessDrawn` | [`0x76bbe4971bf4…`](https://sepolia.etherscan.io/tx/0x76bbe4971bf47897425707709a81de3c582554ee01e73655309164b4acf39cf5) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f seed=104245561999469159052589080403190708064502669284167849686840336171697437235672 |

#### Claim 3 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11667385 | `ClaimSubmitted` | [`0x712b76fec0a2…`](https://sepolia.etherscan.io/tx/0x712b76fec0a20f586184646972bfb5200f399469f4861bafb48ef9674023a1d4) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 subject=0x477e1e33fef270086de2a73d4a5531d1c06b0a4334cd5e4f8c740097578efdc5 bond=12000000000000000 |
| 11667385 | `WitnessRequested` | [`0x712b76fec0a2…`](https://sepolia.etherscan.io/tx/0x712b76fec0a20f586184646972bfb5200f399469f4861bafb48ef9674023a1d4) | requestId=96072875882651914338680121493067292356273029133136811846728121305223894597032 |
| 11667389 | `WitnessAssigned` | [`0x523313ff3b29…`](https://sepolia.etherscan.io/tx/0x523313ff3b29774c9e9b5f2cdbaa9d9e4a86aa64507d4548b61c1070885025a5) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11667389 | `WitnessDrawn` | [`0x523313ff3b29…`](https://sepolia.etherscan.io/tx/0x523313ff3b29774c9e9b5f2cdbaa9d9e4a86aa64507d4548b61c1070885025a5) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 seed=1672827060090938017893308052912639900054135466970257121971868473353057207845 |

#### Claim 4 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11667390 | `ClaimSubmitted` | [`0xe5266458eeaa…`](https://sepolia.etherscan.io/tx/0xe5266458eeaa79fc12a2fbcfa48088c08e927a534e5acf71d8d02a6081583db0) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 subject=0x1af2612bcb9122863f6f56dac72e11ae012b8c713564d71753c8b8a426673d2f bond=12000000000000000 |
| 11667390 | `WitnessRequested` | [`0xe5266458eeaa…`](https://sepolia.etherscan.io/tx/0xe5266458eeaa79fc12a2fbcfa48088c08e927a534e5acf71d8d02a6081583db0) | requestId=43453866956558848034400622330791080813670051800543858001627278194046527824607 |
| 11667396 | `WitnessAssigned` | [`0xcdc2882e745d…`](https://sepolia.etherscan.io/tx/0xcdc2882e745d736d21972785c1207a32bc09ee02a51532d4f6b552adb2303fbf) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11667396 | `WitnessDrawn` | [`0xcdc2882e745d…`](https://sepolia.etherscan.io/tx/0xcdc2882e745d736d21972785c1207a32bc09ee02a51532d4f6b552adb2303fbf) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f seed=81441576708891137592372672096807208219939303219836090745745821399167709912148 |

#### Claim 5 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11667400 | `ClaimSubmitted` | [`0xf123af2dc732…`](https://sepolia.etherscan.io/tx/0xf123af2dc732ef2f3f1c39989f4f564c17d7789d3c0c0f20eea99fcedb7c83ae) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 subject=0x9e6610f6d942d7925b207dbbab3d18ad7028a40cb4465b30962746b20dda4d95 bond=12000000000000000 |
| 11667400 | `WitnessRequested` | [`0xf123af2dc732…`](https://sepolia.etherscan.io/tx/0xf123af2dc732ef2f3f1c39989f4f564c17d7789d3c0c0f20eea99fcedb7c83ae) | requestId=113092003856145787749017929476147691638511065282183116106733472784494538805531 |
| 11667405 | `WitnessAssigned` | [`0xf010c37a70cc…`](https://sepolia.etherscan.io/tx/0xf010c37a70cce34d60f9b28b7015f653f3f25d0ed4a6b7dfc87ab25729922350) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11667405 | `WitnessDrawn` | [`0xf010c37a70cc…`](https://sepolia.etherscan.io/tx/0xf010c37a70cce34d60f9b28b7015f653f3f25d0ed4a6b7dfc87ab25729922350) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 seed=81781571697944488524399905883491295557675304806366278942308123153782835277644 |

#### Claim 6 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11667407 | `ClaimSubmitted` | [`0x8b4728cb5cd6…`](https://sepolia.etherscan.io/tx/0x8b4728cb5cd62de50593c5264bd1f413f8838a963419987a53bd79863bc733d2) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 subject=0x477e1e33fef270086de2a73d4a5531d1c06b0a4334cd5e4f8c740097578efdc5 bond=12000000000000000 |
| 11667407 | `WitnessRequested` | [`0x8b4728cb5cd6…`](https://sepolia.etherscan.io/tx/0x8b4728cb5cd62de50593c5264bd1f413f8838a963419987a53bd79863bc733d2) | requestId=75034304624119072345492485305355123388023599101131613814200602033879418038062 |
| 11667412 | `WitnessAssigned` | [`0xeb88bf8554f2…`](https://sepolia.etherscan.io/tx/0xeb88bf8554f280ce8592ebc77603d31fa0a1aeb26669fae2cd16098df1e60d37) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11667412 | `WitnessDrawn` | [`0xeb88bf8554f2…`](https://sepolia.etherscan.io/tx/0xeb88bf8554f280ce8592ebc77603d31fa0a1aeb26669fae2cd16098df1e60d37) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 seed=14187417828162826656528060096600512864061493263822720349180381076618610390725 |

#### Claim 7 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11667413 | `ClaimSubmitted` | [`0x9a2a89055f8d…`](https://sepolia.etherscan.io/tx/0x9a2a89055f8d6d00112ecd5b054ec3532cc9eacb5302eb268411f5146348d8a2) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 subject=0x1af2612bcb9122863f6f56dac72e11ae012b8c713564d71753c8b8a426673d2f bond=12000000000000000 |
| 11667413 | `WitnessRequested` | [`0x9a2a89055f8d…`](https://sepolia.etherscan.io/tx/0x9a2a89055f8d6d00112ecd5b054ec3532cc9eacb5302eb268411f5146348d8a2) | requestId=22898092429067459025768903964984727419766528499527848591877469970127903753023 |
| 11667418 | `WitnessAssigned` | [`0x1581417229de…`](https://sepolia.etherscan.io/tx/0x1581417229de7bdcced4da3b11bdc8f0c12f5d39df9a248eb9dfeb84aba90c1c) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11667418 | `WitnessDrawn` | [`0x1581417229de…`](https://sepolia.etherscan.io/tx/0x1581417229de7bdcced4da3b11bdc8f0c12f5d39df9a248eb9dfeb84aba90c1c) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f seed=94399055677461358380211755669509436966001885740566044603872041227880815156108 |

#### Claim 8 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11667419 | `ClaimSubmitted` | [`0xcb32d9d80543…`](https://sepolia.etherscan.io/tx/0xcb32d9d80543f41eab90cb78384bd06412f9e05a2caccc8fe712770ca5cb2f74) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 subject=0xa168eaf3ff387965630a8b1fa8e496fb3f681484474b0cc7ce5ee27a55020253 bond=12000000000000000 |
| 11667419 | `WitnessRequested` | [`0xcb32d9d80543…`](https://sepolia.etherscan.io/tx/0xcb32d9d80543f41eab90cb78384bd06412f9e05a2caccc8fe712770ca5cb2f74) | requestId=14332527096964596166793500137765724186724918561947277935937047493952821512861 |
| 11667423 | `WitnessAssigned` | [`0x639d515f94c7…`](https://sepolia.etherscan.io/tx/0x639d515f94c78088199d4b793415d3608b1e4334b4ff56ef65f53eea0e45be8e) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11667423 | `WitnessDrawn` | [`0x639d515f94c7…`](https://sepolia.etherscan.io/tx/0x639d515f94c78088199d4b793415d3608b1e4334b4ff56ef65f53eea0e45be8e) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f seed=65362929046341150561029557072998681659895835280275022962666247617529020790887 |

#### Claim 9 — Match

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11667428 | `ClaimSubmitted` | [`0xecaeaa2a00fb…`](https://sepolia.etherscan.io/tx/0xecaeaa2a00fb2b87b6f0c467ec245db53bd565d3f4a6329ad0a5a326d517860b) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11667428 | `WitnessRequested` | [`0xecaeaa2a00fb…`](https://sepolia.etherscan.io/tx/0xecaeaa2a00fb2b87b6f0c467ec245db53bd565d3f4a6329ad0a5a326d517860b) | requestId=85946628411140726327919755211396179744979162930617856255799588637708437028457 |
| 11667433 | `WitnessAssigned` | [`0x3fa50fc142b7…`](https://sepolia.etherscan.io/tx/0x3fa50fc142b72e4b996b54c2c4b2e46db383085a6999c97d5b555192b7f00330) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 |
| 11667433 | `WitnessDrawn` | [`0x3fa50fc142b7…`](https://sepolia.etherscan.io/tx/0x3fa50fc142b72e4b996b54c2c4b2e46db383085a6999c97d5b555192b7f00330) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 seed=35607286021039008487066090199266466904452589193660031290286634060386447511209 |
| 11667442 | `VerdictRecorded` | [`0xc999341bf17b…`](https://sepolia.etherscan.io/tx/0xc999341bf17b5ea0318431bc80308b3a3d8b3f6c6799aad07cc2166edf85584f) | verdict=1 evidenceCommitment=0x994cfe3186525dec8c13e375d59b2b288dc7055c9d268a1c9d821367defe8f7d |
| 11667451 | `Settled` | [`0xdb8ef70f15b9…`](https://sepolia.etherscan.io/tx/0xdb8ef70f15b9f994cd51a933215718aa9a6388a6443b12c27e16ecf3a33157aa) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 verdict=1 |
| 11667451 | `WitnessPaid` | [`0xdb8ef70f15b9…`](https://sepolia.etherscan.io/tx/0xdb8ef70f15b9f994cd51a933215718aa9a6388a6443b12c27e16ecf3a33157aa) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 fee=2000000000000000 |

#### Claim 10 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11667881 | `ClaimSubmitted` | [`0xca014ac76f0b…`](https://sepolia.etherscan.io/tx/0xca014ac76f0b32413c50ab09debafcda71ee746a119107fa0fa1ff72c8416dff) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11667881 | `WitnessRequested` | [`0xca014ac76f0b…`](https://sepolia.etherscan.io/tx/0xca014ac76f0b32413c50ab09debafcda71ee746a119107fa0fa1ff72c8416dff) | requestId=58314379145724717853541319531147571792735699909163514077417288930556691939807 |
| 11667885 | `WitnessAssigned` | [`0xa213ca43cd08…`](https://sepolia.etherscan.io/tx/0xa213ca43cd085513f7ebe781ab5368ba1a3d463bf29051d5ba85d0313233e905) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11667885 | `WitnessDrawn` | [`0xa213ca43cd08…`](https://sepolia.etherscan.io/tx/0xa213ca43cd085513f7ebe781ab5368ba1a3d463bf29051d5ba85d0313233e905) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f seed=34422654808281019894545945367946756021346757874289141999012170702229170931742 |

#### Claim 11 — Match

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11667891 | `ClaimSubmitted` | [`0xa4bbbc73f577…`](https://sepolia.etherscan.io/tx/0xa4bbbc73f5770b3d5692e55dbbf19718d7d6cedf5f2bca2573a92b6d40b9f371) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11667891 | `WitnessRequested` | [`0xa4bbbc73f577…`](https://sepolia.etherscan.io/tx/0xa4bbbc73f5770b3d5692e55dbbf19718d7d6cedf5f2bca2573a92b6d40b9f371) | requestId=28630014156443679215553646926969809503092967706566671798682059283138089931619 |
| 11667896 | `WitnessAssigned` | [`0xb914c1d5a252…`](https://sepolia.etherscan.io/tx/0xb914c1d5a2521958db7eed423be80848a29663dc1abf3b0f6d618e4df853cf8e) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 |
| 11667896 | `WitnessDrawn` | [`0xb914c1d5a252…`](https://sepolia.etherscan.io/tx/0xb914c1d5a2521958db7eed423be80848a29663dc1abf3b0f6d618e4df853cf8e) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 seed=51902806878438332117141829704637731713746311820744718947551702203150904489174 |
| 11667904 | `VerdictRecorded` | [`0x941b0956272f…`](https://sepolia.etherscan.io/tx/0x941b0956272f6ff11d8a5e0750895dc14eee07f9a9bb06b5b2b4cdf52f4686f0) | verdict=1 evidenceCommitment=0xb6dc27e0debf9117fad7e83afac4479395ae8c0586c4a0b9696736b88dca76f8 |
| 11667914 | `Settled` | [`0xf3282baea86d…`](https://sepolia.etherscan.io/tx/0xf3282baea86df0e4b0fedd99325a71662f7f00026a2377acbc420a12ab55f60b) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 verdict=1 |
| 11667914 | `WitnessPaid` | [`0xf3282baea86d…`](https://sepolia.etherscan.io/tx/0xf3282baea86df0e4b0fedd99325a71662f7f00026a2377acbc420a12ab55f60b) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 fee=2000000000000000 |

#### Claim 12 — Match

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11672885 | `ClaimSubmitted` | [`0x42f486cebb79…`](https://sepolia.etherscan.io/tx/0x42f486cebb7962d4397e2e6b050415a8a85b539b826f03973f8d4d553fab48f3) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11672885 | `WitnessRequested` | [`0x42f486cebb79…`](https://sepolia.etherscan.io/tx/0x42f486cebb7962d4397e2e6b050415a8a85b539b826f03973f8d4d553fab48f3) | requestId=9171792797704233378004424705966592411660856181637570858126523983893147633997 |
| 11672889 | `WitnessAssigned` | [`0x5727ae5466e7…`](https://sepolia.etherscan.io/tx/0x5727ae5466e77e7c5175c2791b1bb03d2d121363fe6ae396ba6070d4aea49a85) | witness=0x407E1437890E460c8027f4C94ebf05f6a7917e13 |
| 11672889 | `WitnessDrawn` | [`0x5727ae5466e7…`](https://sepolia.etherscan.io/tx/0x5727ae5466e77e7c5175c2791b1bb03d2d121363fe6ae396ba6070d4aea49a85) | witness=0x407E1437890E460c8027f4C94ebf05f6a7917e13 seed=63114434192268506392332275652286470288114560399136581327907514975988072454765 |
| 11673002 | `VerdictRecorded` | [`0xd7ee722f011f…`](https://sepolia.etherscan.io/tx/0xd7ee722f011f68a78b3f1273ef5be825966316c8776baa3ab8d59489595851d5) | verdict=1 evidenceCommitment=0x6e1b5e1f42d60a62115727327b93381370825f1ce58c1ed770e725e46caf6fb2 |
| 11673010 | `Settled` | [`0x67c68394bd71…`](https://sepolia.etherscan.io/tx/0x67c68394bd71015493e58393dfc0c0fe24df267e2092421a96d890ea48fcc663) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 verdict=1 |
| 11673010 | `WitnessPaid` | [`0x67c68394bd71…`](https://sepolia.etherscan.io/tx/0x67c68394bd71015493e58393dfc0c0fe24df267e2092421a96d890ea48fcc663) | witness=0x407E1437890E460c8027f4C94ebf05f6a7917e13 fee=2000000000000000 |

#### Claim 13 — Mismatch

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11673013 | `ClaimSubmitted` | [`0xe262fa661f7b…`](https://sepolia.etherscan.io/tx/0xe262fa661f7b2cb7119f5bcf9741a6728a852b7bdf83854669563eb45f6251cc) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11673013 | `WitnessRequested` | [`0xe262fa661f7b…`](https://sepolia.etherscan.io/tx/0xe262fa661f7b2cb7119f5bcf9741a6728a852b7bdf83854669563eb45f6251cc) | requestId=100746720266992141181375337721851284752457739575781611552925978212238544467851 |
| 11673018 | `WitnessAssigned` | [`0x49a434c5a623…`](https://sepolia.etherscan.io/tx/0x49a434c5a623d306eb52e780dbb3031dae04583c294c081131587a6f3c62e1e8) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 |
| 11673018 | `WitnessDrawn` | [`0x49a434c5a623…`](https://sepolia.etherscan.io/tx/0x49a434c5a623d306eb52e780dbb3031dae04583c294c081131587a6f3c62e1e8) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 seed=56146235870382753795463967671988087128014904992702836628750105159949677050572 |
| 11673022 | `VerdictRecorded` | [`0x5e9193ddee5b…`](https://sepolia.etherscan.io/tx/0x5e9193ddee5bf0ef5a12a7ca9c3949dd891e5ebb4e6068876e9e83a80bf772a1) | verdict=2 evidenceCommitment=0xd6547691a13a4d63b902dab0ec55212e73a4a7e709d1381c136836a78925230d |
| 11673023 | `Appealed` | [`0x961a68950d53…`](https://sepolia.etherscan.io/tx/0x961a68950d5314d4f28321d24c1bb8a14ad392e2d692d064ba992338fce17673) | appellant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 bond=20000000000000000 |
| 11673023 | `PanelRequested` | [`0x961a68950d53…`](https://sepolia.etherscan.io/tx/0x961a68950d5314d4f28321d24c1bb8a14ad392e2d692d064ba992338fce17673) | requestId=59128238832745386760407067131089873684400783698102793296356156484368121948767 |
| 11673029 | `PanelSeated` | [`0x70db937b7caf…`](https://sepolia.etherscan.io/tx/0x70db937b7cafd53c184a2168f6ff4a5cb9fcaabebef347c8b7420c77225d8938) | panel=0xDcbe075a907960951Cd4df379BB21461097eEa91 0x407E1437890E460c8027f4C94ebf05f6a7917e13 0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11673029 | `PanelDrawn` | [`0x70db937b7caf…`](https://sepolia.etherscan.io/tx/0x70db937b7cafd53c184a2168f6ff4a5cb9fcaabebef347c8b7420c77225d8938) | panel=0xDcbe075a907960951Cd4df379BB21461097eEa91 0x407E1437890E460c8027f4C94ebf05f6a7917e13 0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11673036 | `PanelUpheld` | [`0xec3f574ba68a…`](https://sepolia.etherscan.io/tx/0xec3f574ba68a8c55e99b87e0cb2d98f233ae625d92e8a25a6780caea2b82549d) | verdict=2 |
| 11673038 | `Settled` | [`0x0cf77c0785ab…`](https://sepolia.etherscan.io/tx/0x0cf77c0785ab6c301ab95e0a276dfbd38d10a4ce7684af919d7bd98b54dfcf2b) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 verdict=2 |
| 11673038 | `ClaimantSlashed` | [`0x0cf77c0785ab…`](https://sepolia.etherscan.io/tx/0x0cf77c0785ab6c301ab95e0a276dfbd38d10a4ce7684af919d7bd98b54dfcf2b) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 bond=10000000000000000 stakeSlashed=10000000000000000 |
| 11673038 | `WitnessPaid` | [`0x0cf77c0785ab…`](https://sepolia.etherscan.io/tx/0x0cf77c0785ab6c301ab95e0a276dfbd38d10a4ce7684af919d7bd98b54dfcf2b) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 fee=2000000000000000 |
| 11673038 | `AgentSlashed` | [`0x0cf77c0785ab…`](https://sepolia.etherscan.io/tx/0x0cf77c0785ab6c301ab95e0a276dfbd38d10a4ce7684af919d7bd98b54dfcf2b) | agent=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 amount=10000000000000000 remainingStake=0 |

#### Claim 14 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11673041 | `ClaimSubmitted` | [`0xa20cbd2be83a…`](https://sepolia.etherscan.io/tx/0xa20cbd2be83a41e0a1d9f45cea4a9a8fea6a0e9bd7ec51a4cfd9f3d8b4fca12f) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f subject=0x9e6610f6d942d7925b207dbbab3d18ad7028a40cb4465b30962746b20dda4d95 bond=12000000000000000 |
| 11673041 | `WitnessRequested` | [`0xa20cbd2be83a…`](https://sepolia.etherscan.io/tx/0xa20cbd2be83a41e0a1d9f45cea4a9a8fea6a0e9bd7ec51a4cfd9f3d8b4fca12f) | requestId=73149017483616232777362927093267545072215634845593499817365190445065990336172 |
| 11673046 | `WitnessAssigned` | [`0xe0f808c7c5e7…`](https://sepolia.etherscan.io/tx/0xe0f808c7c5e78924f0d4e02f4c697a58722e828ad110e29e5804562e1a5bfb15) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 |
| 11673046 | `WitnessDrawn` | [`0xe0f808c7c5e7…`](https://sepolia.etherscan.io/tx/0xe0f808c7c5e78924f0d4e02f4c697a58722e828ad110e29e5804562e1a5bfb15) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 seed=753298878543309780923708115044457848730970909473973760151011278020938926472 |

#### Claim 15 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11673047 | `ClaimSubmitted` | [`0xf03038c00a5e…`](https://sepolia.etherscan.io/tx/0xf03038c00a5efe56396bafcb585546247b9502985de2b2e6f34905510d4e74ee) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f subject=0x477e1e33fef270086de2a73d4a5531d1c06b0a4334cd5e4f8c740097578efdc5 bond=12000000000000000 |
| 11673047 | `WitnessRequested` | [`0xf03038c00a5e…`](https://sepolia.etherscan.io/tx/0xf03038c00a5efe56396bafcb585546247b9502985de2b2e6f34905510d4e74ee) | requestId=29891347560362904250959965287769271712805267867848069958373735262401993724942 |
| 11673052 | `WitnessAssigned` | [`0x93c25d95923b…`](https://sepolia.etherscan.io/tx/0x93c25d95923b244e2cc8639ab3b10faa8fb1d28f9a60afdf47d861e78da92913) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 |
| 11673052 | `WitnessDrawn` | [`0x93c25d95923b…`](https://sepolia.etherscan.io/tx/0x93c25d95923b244e2cc8639ab3b10faa8fb1d28f9a60afdf47d861e78da92913) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 seed=98356604173122989071375869345083076751267229338842048151648128324022224793787 |

#### Claim 16 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11673053 | `ClaimSubmitted` | [`0xe350e01c2145…`](https://sepolia.etherscan.io/tx/0xe350e01c2145d439b0009a6194f509a77a7a71e1db393f2864244734f99bd0ff) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f subject=0x1af2612bcb9122863f6f56dac72e11ae012b8c713564d71753c8b8a426673d2f bond=12000000000000000 |
| 11673053 | `WitnessRequested` | [`0xe350e01c2145…`](https://sepolia.etherscan.io/tx/0xe350e01c2145d439b0009a6194f509a77a7a71e1db393f2864244734f99bd0ff) | requestId=12090294208985365659772398445899347028403947380817946343391658092078658918390 |
| 11673058 | `WitnessAssigned` | [`0x431f89e261cb…`](https://sepolia.etherscan.io/tx/0x431f89e261cb1467be6080f798b3cd251b40ba7d5935b7671bc4be81ca7d3722) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11673058 | `WitnessDrawn` | [`0x431f89e261cb…`](https://sepolia.etherscan.io/tx/0x431f89e261cb1467be6080f798b3cd251b40ba7d5935b7671bc4be81ca7d3722) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 seed=50814599090376567803801887329878502694939998434767902884004064535777036101713 |

#### Claim 17 — not settled

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11673059 | `ClaimSubmitted` | [`0xff0bd9ec3457…`](https://sepolia.etherscan.io/tx/0xff0bd9ec34570b854fa4b66f984dbed12e3e77920c20802fbe1a45ddf232d3ef) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f subject=0xa168eaf3ff387965630a8b1fa8e496fb3f681484474b0cc7ce5ee27a55020253 bond=12000000000000000 |
| 11673059 | `WitnessRequested` | [`0xff0bd9ec3457…`](https://sepolia.etherscan.io/tx/0xff0bd9ec34570b854fa4b66f984dbed12e3e77920c20802fbe1a45ddf232d3ef) | requestId=94482553153048139353508541814129361549003794250942931364338632441337842234788 |
| 11673064 | `WitnessAssigned` | [`0x5bc987edab61…`](https://sepolia.etherscan.io/tx/0x5bc987edab618ea0dc9828c284f0caef70ce2e7326da2a92739809e62aec9f76) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11673064 | `WitnessDrawn` | [`0x5bc987edab61…`](https://sepolia.etherscan.io/tx/0x5bc987edab618ea0dc9828c284f0caef70ce2e7326da2a92739809e62aec9f76) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 seed=14239303687454220013180899237781958429337278499298042528605162148028216514958 |

#### Claim 18 — Match

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11673080 | `ClaimSubmitted` | [`0x0cce378f7fb8…`](https://sepolia.etherscan.io/tx/0x0cce378f7fb8e26c8e0048da3cf484d452dbb1ddadff3c617d073529b88ef336) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11673080 | `WitnessRequested` | [`0x0cce378f7fb8…`](https://sepolia.etherscan.io/tx/0x0cce378f7fb8e26c8e0048da3cf484d452dbb1ddadff3c617d073529b88ef336) | requestId=49191357186833154647126867593945892150051638246356329186733437361150710712585 |
| 11673085 | `WitnessAssigned` | [`0x43e52fbb74d7…`](https://sepolia.etherscan.io/tx/0x43e52fbb74d74aa9a35345bea0cd9a19e0392481cebcd46084d9233dbcf39f3c) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11673085 | `WitnessDrawn` | [`0x43e52fbb74d7…`](https://sepolia.etherscan.io/tx/0x43e52fbb74d74aa9a35345bea0cd9a19e0392481cebcd46084d9233dbcf39f3c) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f seed=113069319673038106600536888296347698340143649554025940977574698502805963574928 |
| 11673091 | `VerdictRecorded` | [`0x51a5a6eec976…`](https://sepolia.etherscan.io/tx/0x51a5a6eec9760356bbf7d2281b9bf2ff07954aedecd654d07b0a410ab195f2eb) | verdict=1 evidenceCommitment=0x4c539629352e22f25b18f4a99325a92d7dca1c15e671f4313072d620a52463e7 |
| 11673101 | `Settled` | [`0xaaa0375a4a13…`](https://sepolia.etherscan.io/tx/0xaaa0375a4a1337ddcb15fffea2e4ae532773216bff0a2e1c0a01209577728434) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 verdict=1 |
| 11673101 | `WitnessPaid` | [`0xaaa0375a4a13…`](https://sepolia.etherscan.io/tx/0xaaa0375a4a1337ddcb15fffea2e4ae532773216bff0a2e1c0a01209577728434) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f fee=2000000000000000 |

#### Claim 19 — Mismatch

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11673107 | `ClaimSubmitted` | [`0x33acc7ac8a6f…`](https://sepolia.etherscan.io/tx/0x33acc7ac8a6f9c5f6687f5faad17aaf7c487dfe1f446d20aad6dd0f152437a7c) | claimant=0x407E1437890E460c8027f4C94ebf05f6a7917e13 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11673107 | `WitnessRequested` | [`0x33acc7ac8a6f…`](https://sepolia.etherscan.io/tx/0x33acc7ac8a6f9c5f6687f5faad17aaf7c487dfe1f446d20aad6dd0f152437a7c) | requestId=64422460542734575296091980410164258264795682189177585331632127399102652147415 |
| 11673111 | `WitnessAssigned` | [`0x594c45ed0eaf…`](https://sepolia.etherscan.io/tx/0x594c45ed0eafb3a4327a7a497d776d81b2c72a6035c7aebed0bf37825077ec8c) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 |
| 11673111 | `WitnessDrawn` | [`0x594c45ed0eaf…`](https://sepolia.etherscan.io/tx/0x594c45ed0eafb3a4327a7a497d776d81b2c72a6035c7aebed0bf37825077ec8c) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 seed=52524558836426688489514565066185662387991828674807576064920485799848250980694 |
| 11673114 | `VerdictRecorded` | [`0xdda2db26e32a…`](https://sepolia.etherscan.io/tx/0xdda2db26e32a9810787dd292c7a92cb0c9d7a0a30b62e651121f6ce7146547bf) | verdict=2 evidenceCommitment=0x79ada80a6c2bac3f2889f7c625380ad2e7bdcb59ef0ff9773ee2ffd06635b529 |
| 11673115 | `Appealed` | [`0xca8ebcfd921d…`](https://sepolia.etherscan.io/tx/0xca8ebcfd921d635a37c8d7629a9cc72c0f470d57ad954fb297c4800e082b43a3) | appellant=0x407E1437890E460c8027f4C94ebf05f6a7917e13 bond=20000000000000000 |
| 11673115 | `PanelRequested` | [`0xca8ebcfd921d…`](https://sepolia.etherscan.io/tx/0xca8ebcfd921d635a37c8d7629a9cc72c0f470d57ad954fb297c4800e082b43a3) | requestId=28322376761853866423717131340323739288680952564646746116076289548460379604780 |
| 11673119 | `PanelSeated` | [`0xe16bbd362ded…`](https://sepolia.etherscan.io/tx/0xe16bbd362ded8d228536fd8893ae1debb485d47d1ec0923d74ceb05184c830f0) | panel=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 0xDcB350AC72184BBE9528Dd3123f0e270887B203f 0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11673119 | `PanelDrawn` | [`0xe16bbd362ded…`](https://sepolia.etherscan.io/tx/0xe16bbd362ded8d228536fd8893ae1debb485d47d1ec0923d74ceb05184c830f0) | panel=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 0xDcB350AC72184BBE9528Dd3123f0e270887B203f 0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11673129 | `PanelUpheld` | [`0x218e737a7607…`](https://sepolia.etherscan.io/tx/0x218e737a7607782a2f599f060ef3d9fe1449a113069c357f24a2766d6aa108c2) | verdict=2 |
| 11673130 | `Settled` | [`0x7e4cebec83c0…`](https://sepolia.etherscan.io/tx/0x7e4cebec83c0d94749209e68795b846c6baf30503d39c21a51918f1cc50bafd0) | claimant=0x407E1437890E460c8027f4C94ebf05f6a7917e13 verdict=2 |
| 11673130 | `ClaimantSlashed` | [`0x7e4cebec83c0…`](https://sepolia.etherscan.io/tx/0x7e4cebec83c0d94749209e68795b846c6baf30503d39c21a51918f1cc50bafd0) | claimant=0x407E1437890E460c8027f4C94ebf05f6a7917e13 bond=10000000000000000 stakeSlashed=10000000000000000 |
| 11673130 | `WitnessPaid` | [`0x7e4cebec83c0…`](https://sepolia.etherscan.io/tx/0x7e4cebec83c0d94749209e68795b846c6baf30503d39c21a51918f1cc50bafd0) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 fee=2000000000000000 |
| 11673130 | `AgentSlashed` | [`0x7e4cebec83c0…`](https://sepolia.etherscan.io/tx/0x7e4cebec83c0d94749209e68795b846c6baf30503d39c21a51918f1cc50bafd0) | agent=0x407E1437890E460c8027f4C94ebf05f6a7917e13 amount=10000000000000000 remainingStake=0 |

#### Claim 20 — Match

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11673145 | `ClaimSubmitted` | [`0xca9236fd0b3d…`](https://sepolia.etherscan.io/tx/0xca9236fd0b3dbb3e4e4b08c91a0bc9acd6b736ada21c50ea62049e81303e3a41) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11673145 | `WitnessRequested` | [`0xca9236fd0b3d…`](https://sepolia.etherscan.io/tx/0xca9236fd0b3dbb3e4e4b08c91a0bc9acd6b736ada21c50ea62049e81303e3a41) | requestId=33663737139378212615191615037065285655951278766519282456018490878312871061980 |
| 11673149 | `WitnessAssigned` | [`0x4c8739236d58…`](https://sepolia.etherscan.io/tx/0x4c8739236d58b129137f0757bb5d1ad9156a735ffd56fc1a495f821d5bd914a0) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 |
| 11673149 | `WitnessDrawn` | [`0x4c8739236d58…`](https://sepolia.etherscan.io/tx/0x4c8739236d58b129137f0757bb5d1ad9156a735ffd56fc1a495f821d5bd914a0) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 seed=67313144013187731192660525586400396944637644670996227456713141856020826802345 |
| 11673155 | `VerdictRecorded` | [`0xef79ec185c00…`](https://sepolia.etherscan.io/tx/0xef79ec185c00948b46a0e36c918082490ee147ff301c038510982dafa616b11e) | verdict=1 evidenceCommitment=0xa8ec5425107d6709fa0139c38fb0a7dbb0035a557bf900b7970e17fe05503d42 |
| 11673164 | `Settled` | [`0x3d8d1c2ad45a…`](https://sepolia.etherscan.io/tx/0x3d8d1c2ad45a5f730a1d4c28136eb03b26915da2095c8ce7ea69629ff7b73e27) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 verdict=1 |
| 11673164 | `WitnessPaid` | [`0x3d8d1c2ad45a…`](https://sepolia.etherscan.io/tx/0x3d8d1c2ad45a5f730a1d4c28136eb03b26915da2095c8ce7ea69629ff7b73e27) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 fee=2000000000000000 |

#### Claim 21 — Unverifiable

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11673572 | `ClaimSubmitted` | [`0x7a7a1fba8f88…`](https://sepolia.etherscan.io/tx/0x7a7a1fba8f88e54c490059bf2769d5907fd920963864ae683cda1c60b9e9602c) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11673572 | `WitnessRequested` | [`0x7a7a1fba8f88…`](https://sepolia.etherscan.io/tx/0x7a7a1fba8f88e54c490059bf2769d5907fd920963864ae683cda1c60b9e9602c) | requestId=81744772745439119336523650246620010724217504119612846633767746356032923577167 |
| 11673578 | `WitnessAssigned` | [`0xf2b66d4e1402…`](https://sepolia.etherscan.io/tx/0xf2b66d4e14023d7e467d2d0aa26d25bdc512cf623be221d3b6d9bfb6d0f87403) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 |
| 11673578 | `WitnessDrawn` | [`0xf2b66d4e1402…`](https://sepolia.etherscan.io/tx/0xf2b66d4e14023d7e467d2d0aa26d25bdc512cf623be221d3b6d9bfb6d0f87403) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 seed=80820143139306086161011533368906322063422213226218258727565509491296615501384 |
| 11673582 | `VerdictRecorded` | [`0x5c60a2f8dd42…`](https://sepolia.etherscan.io/tx/0x5c60a2f8dd42e2fb39393c7af8131a4f2355bfc41746050d27232af99cb5d2e1) | verdict=3 evidenceCommitment=0x8dac58b429a072a154bf95f4a93846a2f2c8445a4d9fc240e2332d177258c72e |
| 11673583 | `Appealed` | [`0x5f7ac37b845f…`](https://sepolia.etherscan.io/tx/0x5f7ac37b845f1c4f2cb495e1605731e6969bc3d6c2c015f7920c8255faff2a72) | appellant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f bond=20000000000000000 |
| 11673583 | `PanelRequested` | [`0x5f7ac37b845f…`](https://sepolia.etherscan.io/tx/0x5f7ac37b845f1c4f2cb495e1605731e6969bc3d6c2c015f7920c8255faff2a72) | requestId=56264183990668708452935609573133611264738900019524366807701886725400826595150 |
| 11673588 | `PanelSeated` | [`0xa23f94a1e03c…`](https://sepolia.etherscan.io/tx/0xa23f94a1e03ca60a6b06d830d16d82a6aa91929b581c430b6d20dfa8ff8fe480) | panel=0xDcbe075a907960951Cd4df379BB21461097eEa91 0x407E1437890E460c8027f4C94ebf05f6a7917e13 0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 |
| 11673588 | `PanelDrawn` | [`0xa23f94a1e03c…`](https://sepolia.etherscan.io/tx/0xa23f94a1e03ca60a6b06d830d16d82a6aa91929b581c430b6d20dfa8ff8fe480) | panel=0xDcbe075a907960951Cd4df379BB21461097eEa91 0x407E1437890E460c8027f4C94ebf05f6a7917e13 0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 |
| 11673595 | `PanelUpheld` | [`0x21ce8e68a4e5…`](https://sepolia.etherscan.io/tx/0x21ce8e68a4e51415fdd435d54709b3ef647bc3d99631170711c80e7386be1e5e) | verdict=3 |
| 11673596 | `Settled` | [`0xb9d7617aa520…`](https://sepolia.etherscan.io/tx/0xb9d7617aa52001e4cc3dbabe899dae2f04e76e4e19bca9dca656d1ac0549554e) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f verdict=3 |
| 11673596 | `WitnessPaid` | [`0xb9d7617aa520…`](https://sepolia.etherscan.io/tx/0xb9d7617aa52001e4cc3dbabe899dae2f04e76e4e19bca9dca656d1ac0549554e) | witness=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 fee=2000000000000000 |

#### Claim 22 — Mismatch

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11673604 | `ClaimSubmitted` | [`0x0ef9a0231aa1…`](https://sepolia.etherscan.io/tx/0x0ef9a0231aa144c4a29480aeb90d33b6f3c2da1564c77899d0b7fcce9539dc9c) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11673604 | `WitnessRequested` | [`0x0ef9a0231aa1…`](https://sepolia.etherscan.io/tx/0x0ef9a0231aa144c4a29480aeb90d33b6f3c2da1564c77899d0b7fcce9539dc9c) | requestId=11392634302387175451322432393816333526265522156509191705129712821422204149792 |
| 11673608 | `WitnessAssigned` | [`0xbabef01f82fc…`](https://sepolia.etherscan.io/tx/0xbabef01f82fc1d08d316141901a0f9864416880525054003292d1aa579182bdb) | witness=0x407E1437890E460c8027f4C94ebf05f6a7917e13 |
| 11673608 | `WitnessDrawn` | [`0xbabef01f82fc…`](https://sepolia.etherscan.io/tx/0xbabef01f82fc1d08d316141901a0f9864416880525054003292d1aa579182bdb) | witness=0x407E1437890E460c8027f4C94ebf05f6a7917e13 seed=95189681498174934354055329216067799804828932492705964263173295493487532848581 |
| 11673614 | `VerdictRecorded` | [`0xa7af59303ec4…`](https://sepolia.etherscan.io/tx/0xa7af59303ec416cb7f35b60be1642f544049f14c2644ec65e406a60d86f5b91b) | verdict=2 evidenceCommitment=0x81623ddc2b20b25263deb57291b654a2467e7b89f30fd23c3cae2e1ab61e272e |
| 11673624 | `Settled` | [`0xc5eda85d3b58…`](https://sepolia.etherscan.io/tx/0xc5eda85d3b5875cbcb519e66ce9ecc3afd48aa5dea36d2fbb313b194c597bd90) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f verdict=2 |
| 11673624 | `ClaimantSlashed` | [`0xc5eda85d3b58…`](https://sepolia.etherscan.io/tx/0xc5eda85d3b5875cbcb519e66ce9ecc3afd48aa5dea36d2fbb313b194c597bd90) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f bond=10000000000000000 stakeSlashed=10000000000000000 |
| 11673624 | `WitnessPaid` | [`0xc5eda85d3b58…`](https://sepolia.etherscan.io/tx/0xc5eda85d3b5875cbcb519e66ce9ecc3afd48aa5dea36d2fbb313b194c597bd90) | witness=0x407E1437890E460c8027f4C94ebf05f6a7917e13 fee=2000000000000000 |
| 11673624 | `AgentSlashed` | [`0xc5eda85d3b58…`](https://sepolia.etherscan.io/tx/0xc5eda85d3b5875cbcb519e66ce9ecc3afd48aa5dea36d2fbb313b194c597bd90) | agent=0xDcB350AC72184BBE9528Dd3123f0e270887B203f amount=10000000000000000 remainingStake=0 |

#### Claim 23 — Mismatch

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11673632 | `ClaimSubmitted` | [`0x17b833fc91d5…`](https://sepolia.etherscan.io/tx/0x17b833fc91d5603844607f50527cb7414e9de04cbb19cb3aef3dddd4f39316f4) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11673632 | `WitnessRequested` | [`0x17b833fc91d5…`](https://sepolia.etherscan.io/tx/0x17b833fc91d5603844607f50527cb7414e9de04cbb19cb3aef3dddd4f39316f4) | requestId=48991556776409421191081066302855735753113731775883593638950968363512690742354 |
| 11673637 | `WitnessAssigned` | [`0xa5ac109eaa0b…`](https://sepolia.etherscan.io/tx/0xa5ac109eaa0b7fdc7d8f92e25e491eaef6f21fea2ea0f484676c440ee9badaca) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 |
| 11673637 | `WitnessDrawn` | [`0xa5ac109eaa0b…`](https://sepolia.etherscan.io/tx/0xa5ac109eaa0b7fdc7d8f92e25e491eaef6f21fea2ea0f484676c440ee9badaca) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 seed=21606320852090089826104845117203178521064068422408713509760867962357772833452 |
| 11673643 | `VerdictRecorded` | [`0xdcf1d599877b…`](https://sepolia.etherscan.io/tx/0xdcf1d599877b0fe4da59d50707b2bb58b29b8cfad410c84edb1a895b49f06d24) | verdict=2 evidenceCommitment=0x4cbdb4e695356c8e9beaf65911d43b62680a3966051bd0b5c5cd15a09bd68d67 |
| 11673644 | `Appealed` | [`0x1c7c744c9ff8…`](https://sepolia.etherscan.io/tx/0x1c7c744c9ff8c42ecbb2ac0658824504ef7fbc862f8fb37077aede5401bbbffe) | appellant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f bond=20000000000000000 |
| 11673644 | `PanelRequested` | [`0x1c7c744c9ff8…`](https://sepolia.etherscan.io/tx/0x1c7c744c9ff8c42ecbb2ac0658824504ef7fbc862f8fb37077aede5401bbbffe) | requestId=90108780141110800891103065683910219593923837841838836925481382947466610207681 |
| 11673649 | `PanelSeated` | [`0x863dac5e9c1d…`](https://sepolia.etherscan.io/tx/0x863dac5e9c1d0d8d6e25853375df100b2c0a0209b106dc4edd7bcd339b2f2d4a) | panel=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 0x407E1437890E460c8027f4C94ebf05f6a7917e13 0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11673649 | `PanelDrawn` | [`0x863dac5e9c1d…`](https://sepolia.etherscan.io/tx/0x863dac5e9c1d0d8d6e25853375df100b2c0a0209b106dc4edd7bcd339b2f2d4a) | panel=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 0x407E1437890E460c8027f4C94ebf05f6a7917e13 0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11673657 | `PanelUpheld` | [`0xe130bc97905e…`](https://sepolia.etherscan.io/tx/0xe130bc97905e5db94fe379483d0b5499961503698eb47e1855be2d206604d64a) | verdict=2 |
| 11673658 | `Settled` | [`0xa8d4d44e93c0…`](https://sepolia.etherscan.io/tx/0xa8d4d44e93c0eefbd318e0706aeb90945274f640d73079b0cf86bad7847ba9f7) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f verdict=2 |
| 11673658 | `ClaimantSlashed` | [`0xa8d4d44e93c0…`](https://sepolia.etherscan.io/tx/0xa8d4d44e93c0eefbd318e0706aeb90945274f640d73079b0cf86bad7847ba9f7) | claimant=0xDcB350AC72184BBE9528Dd3123f0e270887B203f bond=10000000000000000 stakeSlashed=10000000000000000 |
| 11673658 | `WitnessPaid` | [`0xa8d4d44e93c0…`](https://sepolia.etherscan.io/tx/0xa8d4d44e93c0eefbd318e0706aeb90945274f640d73079b0cf86bad7847ba9f7) | witness=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 fee=2000000000000000 |
| 11673658 | `AgentSlashed` | [`0xa8d4d44e93c0…`](https://sepolia.etherscan.io/tx/0xa8d4d44e93c0eefbd318e0706aeb90945274f640d73079b0cf86bad7847ba9f7) | agent=0xDcB350AC72184BBE9528Dd3123f0e270887B203f amount=10000000000000000 remainingStake=0 |

#### Claim 24 — Match

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11674136 | `ClaimSubmitted` | [`0x4d90726e28f3…`](https://sepolia.etherscan.io/tx/0x4d90726e28f38632505c7362ab19e9cd76727910c8d2d7fb88d5c978e265976c) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11674136 | `WitnessRequested` | [`0x4d90726e28f3…`](https://sepolia.etherscan.io/tx/0x4d90726e28f38632505c7362ab19e9cd76727910c8d2d7fb88d5c978e265976c) | requestId=29984110499962420150954384869687936782512182643402162918067655223970080214267 |
| 11674141 | `WitnessAssigned` | [`0x43b247a6a095…`](https://sepolia.etherscan.io/tx/0x43b247a6a095ea21c4e4971eafcfe7ecc88297264afb3c5aa399d9645dea3018) | witness=0x407E1437890E460c8027f4C94ebf05f6a7917e13 |
| 11674141 | `WitnessDrawn` | [`0x43b247a6a095…`](https://sepolia.etherscan.io/tx/0x43b247a6a095ea21c4e4971eafcfe7ecc88297264afb3c5aa399d9645dea3018) | witness=0x407E1437890E460c8027f4C94ebf05f6a7917e13 seed=76266241981608056390566551526166065615583885007098948996153966630935017876690 |
| 11674145 | `VerdictRecorded` | [`0x108ebe2f1684…`](https://sepolia.etherscan.io/tx/0x108ebe2f16844e1cbd2e9dd81e2c1e39768a38586f01973f32dc5649fbf84286) | verdict=1 evidenceCommitment=0x0037fb4412ad84d0e51662bee20a6d721216118e4e9bbb107cbe4d007446498b |
| 11674154 | `Settled` | [`0x77acd4d3d625…`](https://sepolia.etherscan.io/tx/0x77acd4d3d6258ced0a7de16c53ceba9ad0483757e4620c97489521caa0e444e5) | claimant=0xDcbe075a907960951Cd4df379BB21461097eEa91 verdict=1 |
| 11674154 | `WitnessPaid` | [`0x77acd4d3d625…`](https://sepolia.etherscan.io/tx/0x77acd4d3d6258ced0a7de16c53ceba9ad0483757e4620c97489521caa0e444e5) | witness=0x407E1437890E460c8027f4C94ebf05f6a7917e13 fee=2000000000000000 |

#### Claim 25 — Mismatch

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11674381 | `ClaimSubmitted` | [`0x31410a2f1e57…`](https://sepolia.etherscan.io/tx/0x31410a2f1e57b8fb0d70a992a6a62eace9a7038461ac8e9448c2e0aa79d804b9) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11674381 | `WitnessRequested` | [`0x31410a2f1e57…`](https://sepolia.etherscan.io/tx/0x31410a2f1e57b8fb0d70a992a6a62eace9a7038461ac8e9448c2e0aa79d804b9) | requestId=32713716843014205240958746561256619572242314247699372814552490519077811462808 |
| 11674386 | `WitnessAssigned` | [`0x1b0ec1be12c2…`](https://sepolia.etherscan.io/tx/0x1b0ec1be12c23d52daa036e310f0e28399213fd984ee16617ec233fe91a07b51) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11674386 | `WitnessDrawn` | [`0x1b0ec1be12c2…`](https://sepolia.etherscan.io/tx/0x1b0ec1be12c23d52daa036e310f0e28399213fd984ee16617ec233fe91a07b51) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f seed=36469139057195790325796589636163128227113367793316177469880717774972756413083 |
| 11674393 | `VerdictRecorded` | [`0x14b736482d9a…`](https://sepolia.etherscan.io/tx/0x14b736482d9a873a81c8e9ae80fd96ae5745dee9594c10dcb004625fc5e542a4) | verdict=2 evidenceCommitment=0x0471c4aeb5eb1eeed4468b319560e3369e069b8fd1110bf77ab79c68924bf152 |
| 11674394 | `Appealed` | [`0x3586efd77727…`](https://sepolia.etherscan.io/tx/0x3586efd7772738b5d9ac96e91a38168148f884ccd1edce2cf534800b6a4df92e) | appellant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 bond=20000000000000000 |
| 11674394 | `PanelRequested` | [`0x3586efd77727…`](https://sepolia.etherscan.io/tx/0x3586efd7772738b5d9ac96e91a38168148f884ccd1edce2cf534800b6a4df92e) | requestId=115589252505674553077330623706158705816789096195863599314650189452604198189023 |
| 11674399 | `PanelSeated` | [`0xcb7124d0d4c0…`](https://sepolia.etherscan.io/tx/0xcb7124d0d4c04bf9cceecdcbdfc4b0906d855eda958141ef53eb966872b2bda3) | panel=0xDcbe075a907960951Cd4df379BB21461097eEa91 0x407E1437890E460c8027f4C94ebf05f6a7917e13 0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 |
| 11674399 | `PanelDrawn` | [`0xcb7124d0d4c0…`](https://sepolia.etherscan.io/tx/0xcb7124d0d4c04bf9cceecdcbdfc4b0906d855eda958141ef53eb966872b2bda3) | panel=0xDcbe075a907960951Cd4df379BB21461097eEa91 0x407E1437890E460c8027f4C94ebf05f6a7917e13 0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 |
| 11674407 | `PanelUpheld` | [`0x2a9e78c2b506…`](https://sepolia.etherscan.io/tx/0x2a9e78c2b506936356b0f08135d1ab21ad85f4292d6801accdf0aedee56a76a1) | verdict=2 |
| 11674409 | `Settled` | [`0x621415186b7f…`](https://sepolia.etherscan.io/tx/0x621415186b7ffb83fa96eb3278f795ec8c557c4b90ee41724f9a5ca41605ecde) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 verdict=2 |
| 11674409 | `ClaimantSlashed` | [`0x621415186b7f…`](https://sepolia.etherscan.io/tx/0x621415186b7ffb83fa96eb3278f795ec8c557c4b90ee41724f9a5ca41605ecde) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 bond=10000000000000000 stakeSlashed=10000000000000000 |
| 11674409 | `WitnessPaid` | [`0x621415186b7f…`](https://sepolia.etherscan.io/tx/0x621415186b7ffb83fa96eb3278f795ec8c557c4b90ee41724f9a5ca41605ecde) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f fee=2000000000000000 |
| 11674409 | `AgentSlashed` | [`0x621415186b7f…`](https://sepolia.etherscan.io/tx/0x621415186b7ffb83fa96eb3278f795ec8c557c4b90ee41724f9a5ca41605ecde) | agent=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 amount=10000000000000000 remainingStake=0 |

<!-- END GENERATED LEDGER -->
