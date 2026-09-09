# Transaction Ledger

Every on-chain transaction that appears in the demo or backs a claim in the submission. Logged **as it happens**, not reconstructed — a hash you can't find on Sunday morning is evidence you don't have.

Network: **Ethereum Sepolia** · Explorer: https://sepolia.etherscan.io/tx/`<hash>`

## Deployed contracts

Addresses below are the **final** deployment — the one the three demo scenes ran against. Earlier deploys were superseded when `ClaimRegistry` split settlement out of `recordPanelVerdict`; every contract here is immutable, so a change means a redeploy.

| Contract | Address | Deploy tx | Date |
|---|---|---|---|
| `ScratchSink` (probe, throwaway) | `0xA7355Ac345828Ea003ad6686Be6D9506F9Fb31cF` | deployed | Sep 8 |
| `ClaimRegistry` | `0x9C8A1c6a68517564d76D3Ea88F84EDEe39421F5b` | deployed | Sep 8 |
| `WitnessRoster` | `0xf9B2dB4cC8AD419D20E9B54a33fB5DEc16ea5712` | deployed, callbackGasLimit 150k | Sep 8 |
| `PerjuryStandingWriter` | `0x19b0992DEee48129dA2321362831b7eB07b261e8` | deployed, holds ENS SET_TEXT | Sep 8 |
| `ENSTextStandingReader` | `0xB48F3Bcd32755855763a350a35586d40d328b958` | deployed | Sep 8 |
| `PerjuryResolver` (ENSv2 Permissioned) | `0xcBd795d211Dd40dB392730034B5e68359c9E8534` | deployed, EAC configured | Sep 8 |
| `VerdictSink` | `0x68aFcEb7aB079C4c2D61E2F8BE029CF73D387fbd` | deployed, accepts only `0x15fC…9F88` (mock forwarder) | Sep 8 |

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
