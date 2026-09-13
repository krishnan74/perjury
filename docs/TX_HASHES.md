# Transaction Ledger

Every on-chain transaction that appears in the demo or backs a claim in the submission. Logged **as it happens**, not reconstructed — a hash you can't find on Sunday morning is evidence you don't have.

Network: **Ethereum Sepolia** · Explorer: https://sepolia.etherscan.io/tx/`<hash>`

## Deployed contracts — live cascade (Sep 12)

The contracts a claim goes to now, and the first set whose verdicts are written by a workflow executing in an enclave on the Chainlink DON.

| Contract | Address | Notes |
|---|---|---|
| `ClaimRegistry` | `0x63cf47746B2181E2e64EB4349373c4f8B050c6c3` | |
| `WitnessRoster` | `0x841f3FD732C6740141FeAaFF10875A0F0f51c534` | VRF consumer, 10 agents |
| `PerjuryStandingWriter` | `0x8dd1D2f807A4B6F46EcD4994c4BAe0a44eBf9F8A` | |
| `ENSTextStandingReader` | `0x4a675089228B308564fd31501410d66c2631A071` | |
| `VerdictSink` | `0x8f74f7428E045c29F4aF571955CAD21e3a1a2BEe` | **answers ERC-165** — the reason this cascade exists |

**The verdict that proves it.** Claim 1, adjudicated in the enclave and delivered by a DON transmitter through the production Forwarder `0xF8344CFd…4482`:

`0xf8dd4d0219ccfd9a723409fbd8d19c88a87c91547c123805e6ff16f3d1c657c5`

One transaction carries both `ReportProcessed(result: true)` from the Forwarder and `VerdictRecorded(claim 1, Match)` from the registry.

**Why the previous cascade was replaced.** Its sink had no `supportsInterface`. The Forwarder staticcalls that before routing, a receiver without it reverts, and the Forwarder then records the report as failed while the workflow is told the write succeeded. The simulator's mock Forwarder never makes the call, so everything worked locally and nothing arrived on chain. The sink's authorised writer is immutable, so four lines cost a cascade.

## Deployed contracts — superseded cascade (Sep 11)

The contracts a claim submitted now goes to. Deployed because CRE deploy access arrived and `VerdictSink.CRE_REPORT_WRITER` is immutable: a sink built for the simulator's Forwarder can never accept a report from a workflow running on the DON, and `ClaimRegistry.verdictSink` locks on first wiring, so there was no way to point the old registry at a new sink. This sink accepts **both** Forwarders, so the simulator still works against the same contracts. See [ADR 0011](decisions.md).

| Contract | Address | Notes |
|---|---|---|
| `ClaimRegistry` | `0x398907AbE00070127780F24C05B629cb8fEC51eb` | adds `pendingForTribunal()` |
| `WitnessRoster` | `0xD083e7B5fB92389478D9213F431Ae4AE1D0007E3` | VRF consumer |
| `PerjuryStandingWriter` | `0x510035cCb2A7142fD127a52d950124d6B2a0BeE2` | holds ENS `SET_TEXT`, per key |
| `ENSTextStandingReader` | `0xB5A08B0885e221B1fb48EDF0E011c32f614176f5` | |
| `VerdictSink` | `0x572e7b912031267c4163d8F3c785e03b88AEb5b2` | accepts `0xF834…4482` (DON) **and** `0x15fC…9F88` (simulator) |
| `PerjuryResolver` (ENSv2 Permissioned) | `0xcBd795d211Dd40dB392730034B5e68359c9E8534` | reused — the operator still held `SET_TEXT_ADMIN`, so no ENS rebinding was needed |

ENS standing survived the cascade, because standing lives in ENS text records rather than in a contract we redeployed. The first claim on the new registry moved `operator.perjury.eth` from 9 to 10, continuing a history the old contracts wrote.

### Deployed CRE workflow

| | |
|---|---|
| Workflow | `perjury-tribunal-staging` |
| Workflow ID | `00797c26b0d625db84088eae919d9c14ed1971c4ec11f6ceeebdba6c8e307dcf` |
| Registry | private (Chainlink-hosted) · DON family `zone-a` |
| Owner | `0x168c1E12d38910994b77f549a60132FB1e9b5E76` |
| Binary | https://storage.cre.chain.link/artifacts/00797c26b0d625db84088eae919d9c14ed1971c4ec11f6ceeebdba6c8e307dcf/binary.wasm |
| Status | Active, executing on schedule |

This is the difference between registering a TEE handler and running one. Executions succeed every minute and return `idle` when the registry reports nothing outstanding; the enclave produces no logs, which is the expected behaviour rather than a missing feature.

## Deployed contracts — archived cascade (Sep 8)

Superseded on Sep 11 and still on chain. Every claim below really settled here, and the site reads them with `?d=sim`. Nothing new can settle here: this sink accepts only the simulator's Forwarder, and that address is immutable.

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

*Generated 2026-09-13 from Sepolia blocks 11680196–11695196. 11 claims, 62 events. Rebuild with `npx tsx scripts/collect-evidence.ts --write`.*

Claim ids restart with each deployment, so these are the claims of the deployment currently in `.env`.

#### Claim 1 — Match

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11683657 | `WitnessAssigned` | [`0x85decda25e7d…`](https://sepolia.etherscan.io/tx/0x85decda25e7d6c69dcd4630d396463e636b1abe7532ef4bcca38f87518ecaf6c) | witness=0x97A87d98B332916F1dF1D6BBaa430C09f64fCA1A |
| 11683657 | `WitnessDrawn` | [`0x85decda25e7d…`](https://sepolia.etherscan.io/tx/0x85decda25e7d6c69dcd4630d396463e636b1abe7532ef4bcca38f87518ecaf6c) | witness=0x97A87d98B332916F1dF1D6BBaa430C09f64fCA1A seed=49782583061802521949227264063673966717087872354719672434436627076322705950717 |
| 11683674 | `Settled` | [`0x30c2e160acfc…`](https://sepolia.etherscan.io/tx/0x30c2e160acfcba7a1556ecc57089a09245a8491ddbaf8ac31f9283da880b9bdb) | claimant=0x407E1437890E460c8027f4C94ebf05f6a7917e13 verdict=1 |

#### Claim 2 — Unverifiable

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11684070 | `WitnessAssigned` | [`0x133be5651ac9…`](https://sepolia.etherscan.io/tx/0x133be5651ac9f7188642c1e3f12dd4a1241228310ae3093e643e388866233ef1) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11684070 | `WitnessDrawn` | [`0x133be5651ac9…`](https://sepolia.etherscan.io/tx/0x133be5651ac9f7188642c1e3f12dd4a1241228310ae3093e643e388866233ef1) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f seed=54899514525132932570060123232000269223884215390088254624361762498033968025334 |
| 11684077 | `Appealed` | [`0xcb4cb4eac831…`](https://sepolia.etherscan.io/tx/0xcb4cb4eac83194b6302760142f933791259a5fc98570bf5d45ace7b32087a073) | appellant=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 bond=20000000000000000 |
| 11684077 | `PanelRequested` | [`0xcb4cb4eac831…`](https://sepolia.etherscan.io/tx/0xcb4cb4eac83194b6302760142f933791259a5fc98570bf5d45ace7b32087a073) | requestId=12570273961411574414276472176896969760341643095904769041376866968309770585424 |
| 11684082 | `PanelDrawn` | [`0x70cb08c13628…`](https://sepolia.etherscan.io/tx/0x70cb08c13628b8ac8b0026b2f5d0933ef972128bcc4dcdc6d7073d1e55738af6) | panel=0xDcbe075a907960951Cd4df379BB21461097eEa91 0x51F8F34bFbf77384C1b1273FA5E6567C21bD0EEc 0x97A87d98B332916F1dF1D6BBaa430C09f64fCA1A |
| 11684089 | `Settled` | [`0x4a0a0af697d0…`](https://sepolia.etherscan.io/tx/0x4a0a0af697d00c7bdd8377941f810b1a93960e7796091b286c4d0b6fce8e33a8) | claimant=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 verdict=3 |

#### Claim 3 — Mismatch

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11684115 | `WitnessAssigned` | [`0x1a1baf00f3c4…`](https://sepolia.etherscan.io/tx/0x1a1baf00f3c469ec560de6fe98e295d01d7b13d958f659b6e4897a7dbabcca3f) | witness=0x7cf07E8AC65bD3415364f5A41bF70b453Cb0192f |
| 11684115 | `WitnessDrawn` | [`0x1a1baf00f3c4…`](https://sepolia.etherscan.io/tx/0x1a1baf00f3c469ec560de6fe98e295d01d7b13d958f659b6e4897a7dbabcca3f) | witness=0x7cf07E8AC65bD3415364f5A41bF70b453Cb0192f seed=79595358789834079106163464839150483346982688819647179763036975132155569085069 |
| 11684124 | `Appealed` | [`0x978fcc83e0c7…`](https://sepolia.etherscan.io/tx/0x978fcc83e0c78f03f09493f41efc91b5d3ef1d9bedc7d7118188b92b21967c08) | appellant=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 bond=20000000000000000 |
| 11684124 | `PanelRequested` | [`0x978fcc83e0c7…`](https://sepolia.etherscan.io/tx/0x978fcc83e0c78f03f09493f41efc91b5d3ef1d9bedc7d7118188b92b21967c08) | requestId=107459801625565130414687553153232314232314462314528522288881534680987419674743 |
| 11684130 | `PanelDrawn` | [`0xae283ccb006c…`](https://sepolia.etherscan.io/tx/0xae283ccb006cf7b4f416f79ab4bb4c384ccf31947fcf23bfc16fcd2bf0f9be6e) | panel=0xDcB350AC72184BBE9528Dd3123f0e270887B203f 0x407E1437890E460c8027f4C94ebf05f6a7917e13 0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11684140 | `Settled` | [`0x50c17756bf02…`](https://sepolia.etherscan.io/tx/0x50c17756bf0270657a9377c0cc805626af954452c3f0d26fcb4fafe19adcafe4) | claimant=0x51Dce343aA4D470e2E6cAaDd781C60C1f1516eb9 verdict=2 |

#### Claim 4 — Unverifiable

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11684152 | `WitnessAssigned` | [`0x92ddff04fbb6…`](https://sepolia.etherscan.io/tx/0x92ddff04fbb6adfca09d0f4175e54ef98fbf21232619253272f15ecf822101d4) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11684152 | `WitnessDrawn` | [`0x92ddff04fbb6…`](https://sepolia.etherscan.io/tx/0x92ddff04fbb6adfca09d0f4175e54ef98fbf21232619253272f15ecf822101d4) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f seed=42625127326071731726486667673638314675398915150665071672985264744484751164033 |
| 11684251 | `Settled` | [`0x4f13c90d572d…`](https://sepolia.etherscan.io/tx/0x4f13c90d572d22f4e204c3ffc5d5637ca562df96bbe8f8909c93c3a182360e86) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 verdict=3 |
| 11684251 | `WitnessPaid` | [`0x4f13c90d572d…`](https://sepolia.etherscan.io/tx/0x4f13c90d572d22f4e204c3ffc5d5637ca562df96bbe8f8909c93c3a182360e86) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f fee=2000000000000000 |

#### Claim 5 — Unverifiable

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11684158 | `WitnessAssigned` | [`0xc36b8a02ca98…`](https://sepolia.etherscan.io/tx/0xc36b8a02ca989f871bbaa53819a20fe58f9405a24096bc6727b419c4d6164fb2) | witness=0x7cf07E8AC65bD3415364f5A41bF70b453Cb0192f |
| 11684158 | `WitnessDrawn` | [`0xc36b8a02ca98…`](https://sepolia.etherscan.io/tx/0xc36b8a02ca989f871bbaa53819a20fe58f9405a24096bc6727b419c4d6164fb2) | witness=0x7cf07E8AC65bD3415364f5A41bF70b453Cb0192f seed=103683072959333356536151879824806379328463481296100708644894867956446939373989 |
| 11684260 | `Settled` | [`0xc4e7c035c8da…`](https://sepolia.etherscan.io/tx/0xc4e7c035c8dadc41df32501c766383266d6ab8bf0b07d6947a7ba43ce54a6999) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 verdict=3 |
| 11684260 | `WitnessPaid` | [`0xc4e7c035c8da…`](https://sepolia.etherscan.io/tx/0xc4e7c035c8dadc41df32501c766383266d6ab8bf0b07d6947a7ba43ce54a6999) | witness=0x7cf07E8AC65bD3415364f5A41bF70b453Cb0192f fee=2000000000000000 |

#### Claim 6 — Unverifiable

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11684165 | `WitnessAssigned` | [`0x594ae9a313a0…`](https://sepolia.etherscan.io/tx/0x594ae9a313a007142e43d93221f5f02c0886921c061945492f943b5427402ea4) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11684165 | `WitnessDrawn` | [`0x594ae9a313a0…`](https://sepolia.etherscan.io/tx/0x594ae9a313a007142e43d93221f5f02c0886921c061945492f943b5427402ea4) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 seed=83349458290066298914036665928293780314611603308748461431742860636646471880121 |
| 11684264 | `Settled` | [`0x0d6299830532…`](https://sepolia.etherscan.io/tx/0x0d629983053269c60a10729e737cc4c768b3ac879892da096aa4086f320dbc03) | claimant=0xeEE49a2a6a8d352862C7283C0e31595780e67fb1 verdict=3 |
| 11684264 | `WitnessPaid` | [`0x0d6299830532…`](https://sepolia.etherscan.io/tx/0x0d629983053269c60a10729e737cc4c768b3ac879892da096aa4086f320dbc03) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 fee=2000000000000000 |

#### Claim 7 — Unverifiable

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11690706 | `ClaimSubmitted` | [`0xca930694aef7…`](https://sepolia.etherscan.io/tx/0xca930694aef7c091eadc9143a583c18f618a17014eb599b4313b85275f3d7d3f) | claimant=0x407E1437890E460c8027f4C94ebf05f6a7917e13 subject=0x04e817a09791e480d31fd4d0cbe7288855680ae0cf9cad600e4cfb274bfd6dd7 bond=12000000000000000 |
| 11690706 | `WitnessRequested` | [`0xca930694aef7…`](https://sepolia.etherscan.io/tx/0xca930694aef7c091eadc9143a583c18f618a17014eb599b4313b85275f3d7d3f) | requestId=75740496180233337960181270203862203880628625220506207817891278411974905200890 |
| 11690711 | `WitnessAssigned` | [`0x2d3479fe4494…`](https://sepolia.etherscan.io/tx/0x2d3479fe4494fffeea1f8c1905a32fab7564f345760ce01d8532adf0d9cf67af) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11690711 | `WitnessDrawn` | [`0x2d3479fe4494…`](https://sepolia.etherscan.io/tx/0x2d3479fe4494fffeea1f8c1905a32fab7564f345760ce01d8532adf0d9cf67af) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 seed=70561183118993906350023623600396839409168823916480799856274048055684155857181 |
| 11690853 | `VerdictRecorded` | [`0x86c3a686bc2d…`](https://sepolia.etherscan.io/tx/0x86c3a686bc2d5d7c0986f0e00e860dd79b3c62c11e91e7347d1b5da17993a466) | verdict=3 evidenceCommitment=0x86c6ac7e51d4611ed8e92e60c6263568bf2aa97afe8dfcfa38255e6ba60bb6fd |
| 11690861 | `Settled` | [`0x5d0e5c30f0ac…`](https://sepolia.etherscan.io/tx/0x5d0e5c30f0acd51e222205c5cf33b2a001dea95a111ee6b85eeb8976bf8c9d67) | claimant=0x407E1437890E460c8027f4C94ebf05f6a7917e13 verdict=3 |
| 11690861 | `WitnessPaid` | [`0x5d0e5c30f0ac…`](https://sepolia.etherscan.io/tx/0x5d0e5c30f0acd51e222205c5cf33b2a001dea95a111ee6b85eeb8976bf8c9d67) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 fee=2000000000000000 |

#### Claim 8 — Match

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11693490 | `ClaimSubmitted` | [`0xa5ae06e0e6af…`](https://sepolia.etherscan.io/tx/0xa5ae06e0e6af51d4e7dc4bc84cfbca6633bec37786cdfd22c09b8de2b50ecdfe) | claimant=0x71Fa1B3EC61Ce75DDF101fEc0F87D8df31a9F710 subject=0x12d66637bedea0b1be82c38be1c369db2c7467af95a47400a57b8f268fa56cb0 bond=12000000000000000 |
| 11693490 | `WitnessRequested` | [`0xa5ae06e0e6af…`](https://sepolia.etherscan.io/tx/0xa5ae06e0e6af51d4e7dc4bc84cfbca6633bec37786cdfd22c09b8de2b50ecdfe) | requestId=2264167158681372275547252316230737004172437918203324210476155447401580846715 |
| 11693495 | `WitnessAssigned` | [`0x6ab03bf3a6af…`](https://sepolia.etherscan.io/tx/0x6ab03bf3a6af14ca07218c8b5e8a67e2e796dc279c51cb34a9d248a21b963230) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11693495 | `WitnessDrawn` | [`0x6ab03bf3a6af…`](https://sepolia.etherscan.io/tx/0x6ab03bf3a6af14ca07218c8b5e8a67e2e796dc279c51cb34a9d248a21b963230) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 seed=12713103210991346410345611451505002945587699349814568268865916128410893690913 |
| 11693500 | `VerdictRecorded` | [`0xc875023d781e…`](https://sepolia.etherscan.io/tx/0xc875023d781e19cd2c53ea7635312cf3a29bba0bda34c2de976c734316c140a9) | verdict=1 evidenceCommitment=0x05d7aa87b5a409b515338cbe086a7ce40da7328f890e0bbe2b3276994809c5f8 |
| 11693525 | `Settled` | [`0x51b3d7b09324…`](https://sepolia.etherscan.io/tx/0x51b3d7b0932434032906852a786dc763ef99131a507e672dc66e1634faa829c3) | claimant=0x71Fa1B3EC61Ce75DDF101fEc0F87D8df31a9F710 verdict=1 |
| 11693525 | `WitnessPaid` | [`0x51b3d7b09324…`](https://sepolia.etherscan.io/tx/0x51b3d7b0932434032906852a786dc763ef99131a507e672dc66e1634faa829c3) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 fee=2000000000000000 |

#### Claim 9 — Unverifiable

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11693533 | `ClaimSubmitted` | [`0x125795a077c9…`](https://sepolia.etherscan.io/tx/0x125795a077c9e17c335d59b8b70918d52005a31e18156e21aa7116c2094b05bd) | claimant=0x51F8F34bFbf77384C1b1273FA5E6567C21bD0EEc subject=0x3423c27f35b955751942d3a322c1c5a46b77adceadb7fd1d0557bedcd89c8e76 bond=12000000000000000 |
| 11693533 | `WitnessRequested` | [`0x125795a077c9…`](https://sepolia.etherscan.io/tx/0x125795a077c9e17c335d59b8b70918d52005a31e18156e21aa7116c2094b05bd) | requestId=58315725060608971294894048826514386408169593763133707260798908933338571281966 |
| 11693537 | `WitnessAssigned` | [`0x6d1a6f701848…`](https://sepolia.etherscan.io/tx/0x6d1a6f70184847ca21f60bbc1e68ca64b2873514835a4ad1e43286fda57a7c64) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f |
| 11693537 | `WitnessDrawn` | [`0x6d1a6f701848…`](https://sepolia.etherscan.io/tx/0x6d1a6f70184847ca21f60bbc1e68ca64b2873514835a4ad1e43286fda57a7c64) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f seed=47777595716566983339121028647564150965811835253892272419421810399283806335476 |
| 11693588 | `VerdictRecorded` | [`0xe3886522a871…`](https://sepolia.etherscan.io/tx/0xe3886522a871153b841f5dd778685e520d8549393fdbfd2b2b5e97d2a49441ac) | verdict=3 evidenceCommitment=0xaea68a26637920de766cbb0aaa055cf3699471755e6e963d5a39ba8e27542890 |
| 11693598 | `Settled` | [`0x53645f4cde57…`](https://sepolia.etherscan.io/tx/0x53645f4cde57fe0d3736246dcad1a2bd80c56b57fe0f30597e5710ce1d25c91b) | claimant=0x51F8F34bFbf77384C1b1273FA5E6567C21bD0EEc verdict=3 |
| 11693598 | `WitnessPaid` | [`0x53645f4cde57…`](https://sepolia.etherscan.io/tx/0x53645f4cde57fe0d3736246dcad1a2bd80c56b57fe0f30597e5710ce1d25c91b) | witness=0xDcB350AC72184BBE9528Dd3123f0e270887B203f fee=2000000000000000 |

#### Claim 10 — Match

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11693605 | `ClaimSubmitted` | [`0x55c6f4d83a43…`](https://sepolia.etherscan.io/tx/0x55c6f4d83a430f6c1bc92809c82f313ae0fe2bbe9b0c4e6da832837c42481bae) | claimant=0x97A87d98B332916F1dF1D6BBaa430C09f64fCA1A subject=0xd7967c752d06f7323adebb0eb744d4c980aaa90097be1f39ce0aaa3202807bfa bond=12000000000000000 |
| 11693605 | `WitnessRequested` | [`0x55c6f4d83a43…`](https://sepolia.etherscan.io/tx/0x55c6f4d83a430f6c1bc92809c82f313ae0fe2bbe9b0c4e6da832837c42481bae) | requestId=55268674224559747469731541639064099456787280282916074122625177727098945319020 |
| 11693610 | `WitnessAssigned` | [`0x0a8a532daaca…`](https://sepolia.etherscan.io/tx/0x0a8a532daacac8a98134b9a4b3723c40b0ced136775bdcede20feea15cc4c4c5) | witness=0x8CB5d85183Aa8D24903dAC703E3Db7199eB49044 |
| 11693610 | `WitnessDrawn` | [`0x0a8a532daaca…`](https://sepolia.etherscan.io/tx/0x0a8a532daacac8a98134b9a4b3723c40b0ced136775bdcede20feea15cc4c4c5) | witness=0x8CB5d85183Aa8D24903dAC703E3Db7199eB49044 seed=114859620158130023098383118009382517042064694155163408439168794284192153540688 |
| 11693614 | `VerdictRecorded` | [`0xb0e03c8a1640…`](https://sepolia.etherscan.io/tx/0xb0e03c8a164002a974fa6e9bd14672d86647d817a13e288dceff560ba5ff7b1c) | verdict=1 evidenceCommitment=0x7da2b7dffee658ffc68253adf0949831a1317cf6f5cd75e2311175b01bd593ba |
| 11693624 | `Settled` | [`0x14564324f169…`](https://sepolia.etherscan.io/tx/0x14564324f169193d388622539c5c506a25edc263db78ddfe092740b3cc4f29d3) | claimant=0x97A87d98B332916F1dF1D6BBaa430C09f64fCA1A verdict=1 |
| 11693624 | `WitnessPaid` | [`0x14564324f169…`](https://sepolia.etherscan.io/tx/0x14564324f169193d388622539c5c506a25edc263db78ddfe092740b3cc4f29d3) | witness=0x8CB5d85183Aa8D24903dAC703E3Db7199eB49044 fee=2000000000000000 |

#### Claim 11 — Unverifiable

| Block | Event | Tx | Detail |
|---|---|---|---|
| 11693636 | `ClaimSubmitted` | [`0x7692f8792c40…`](https://sepolia.etherscan.io/tx/0x7692f8792c40e58602aa0d84e5a82bafd27f61011345b76dbbd94244c63cd70b) | claimant=0x8CB5d85183Aa8D24903dAC703E3Db7199eB49044 subject=0x7d8a2e79462fffdb98479e32f6492b35b3aa560d065fc4181f601c8c8e2bf4b4 bond=12000000000000000 |
| 11693636 | `WitnessRequested` | [`0x7692f8792c40…`](https://sepolia.etherscan.io/tx/0x7692f8792c40e58602aa0d84e5a82bafd27f61011345b76dbbd94244c63cd70b) | requestId=100445101248702201084939280505826834182497411466976256394797700268973149199858 |
| 11693641 | `WitnessAssigned` | [`0xc9e9c9a7e129…`](https://sepolia.etherscan.io/tx/0xc9e9c9a7e129ecccbe096e0df9cc6e244fa21e44f83b12b30622363689ba3f6d) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 |
| 11693641 | `WitnessDrawn` | [`0xc9e9c9a7e129…`](https://sepolia.etherscan.io/tx/0xc9e9c9a7e129ecccbe096e0df9cc6e244fa21e44f83b12b30622363689ba3f6d) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 seed=109830912034813551882425951821948632459816873145417309105868553979478912230428 |
| 11693648 | `VerdictRecorded` | [`0xce5a84bcd8c5…`](https://sepolia.etherscan.io/tx/0xce5a84bcd8c53f8d1d4038ce0783b343f9c119f82eadf4c78f632968e325c643) | verdict=3 evidenceCommitment=0x70eb58657e1b951a84005685d6d17b8b28fb522ba0af70aac85aa76395d4996e |
| 11693659 | `Settled` | [`0x73b699033ad5…`](https://sepolia.etherscan.io/tx/0x73b699033ad5604bcb10db3529078dc2fd31767f5b5d533e5fed6a3f2128051c) | claimant=0x8CB5d85183Aa8D24903dAC703E3Db7199eB49044 verdict=3 |
| 11693659 | `WitnessPaid` | [`0x73b699033ad5…`](https://sepolia.etherscan.io/tx/0x73b699033ad5604bcb10db3529078dc2fd31767f5b5d533e5fed6a3f2128051c) | witness=0xDcbe075a907960951Cd4df379BB21461097eEa91 fee=2000000000000000 |

<!-- END GENERATED LEDGER -->
