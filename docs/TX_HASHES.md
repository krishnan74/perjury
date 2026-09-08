# Transaction Ledger

Every on-chain transaction that appears in the demo or backs a claim in the submission. Logged **as it happens**, not reconstructed — a hash you can't find on Sunday morning is evidence you don't have.

Network: **Ethereum Sepolia** · Explorer: https://sepolia.etherscan.io/tx/`<hash>`

## Deployed contracts

Addresses below are the **final** deployment — the one the three demo scenes ran against. Earlier deploys were superseded when `ClaimRegistry` split settlement out of `recordPanelVerdict`; every contract here is immutable, so a change means a redeploy.

| Contract | Address | Deploy tx | Date |
|---|---|---|---|
| `ScratchSink` (probe, throwaway) | `0xA7355Ac345828Ea003ad6686Be6D9506F9Fb31cF` | deployed | Sep 8 |
| `ClaimRegistry` | `0xaa064d7E8557c19c785d0A0Ec6FC5ddaBf8C92f0` | deployed | Sep 8 |
| `WitnessRoster` | `0xe69A78a57aF3461172741D1f6913AFC71f65Ff4E` | deployed, callbackGasLimit 150k | Sep 8 |
| `PerjuryStandingWriter` | `0x0573F58500aF260117B5E4782e1b1832c06Afba1` | deployed, holds ENS SET_TEXT | Sep 8 |
| `ENSTextStandingReader` | `0xe8c5e05c478414f576558a26616D56b4929671a0` | deployed | Sep 8 |
| `PerjuryResolver` (ENSv2 Permissioned) | `0xcBd795d211Dd40dB392730034B5e68359c9E8534` | deployed, EAC configured | Sep 8 |
| `VerdictSink` | `0x4E1c9EccdcF3329CB80CD94A0268925D792AF015` | deployed, accepts only `0x15fC…9F88` (mock forwarder) | Sep 8 |

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
| T2 | Bond escrowed → verdict → settled | _pending_ | |
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
| T4 | EAC: operator write **reverts** | _pending_ | |
| T4 | EAC: tribunal write **succeeds** | _pending_ | |

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

Claim 1 · claimant `operator.perjury.eth` · run Sep 8, 3m46s end to end. The claimant asserted Aave v3 utilization of 40.43%; the drawn witness independently re-derived 40.43% from the live Gateway.

| Step | Tx |
|---|---|
| Claim submitted + bond escrowed (0.012 ETH = 0.01 bond + 0.002 witness fee) | [`0xf13d3ce4…d6969c70`](https://sepolia.etherscan.io/tx/0xf13d3ce4168cf23115de636e25270d4f177ce68e7eb052cfde6bdc9cd6969c70) |
| VRF request (same tx) | `WitnessRequested` |
| VRF fulfilment → witness `panel-3.perjury.eth` assigned | [`0x99c8504d…e2daac2b`](https://sepolia.etherscan.io/tx/0x99c8504d74aabae2e6cc2dad3e51a527ac250df3405cc831992ed5a3e2daac2b) |
| Verdict written (`Match`) by the CRE Forwarder | [`0x69b05552…8c673a50`](https://sepolia.etherscan.io/tx/0x69b05552ed4f573fcf100a44407fcded922b4d9aa5302f8073c0930b8c673a50) |
| Settled — bond returned, witness fee paid, ENS standing 1 → 2 | [`0x6e930d96…039f742c`](https://sepolia.etherscan.io/tx/0x6e930d965125f67b165cd85369dea61ad4aaa2af0cab0afaeb28a61c039f742c) |

The witness is paid its fee on **every** verdict, `Match` included — the fee cannot be a reward for finding fault.

### Scene 2 — false claim, appealed, upheld

Claim 2 · claimant `panel-1.perjury.eth` · run Sep 8, 6m46s end to end. The claimant asserted 64.70%; the drawn witness re-derived 40.43%. The claimant then appealed and lost.

| Step | Tx |
|---|---|
| Claim submitted + bond escrowed | [`0xf06fa188…8d738f06`](https://sepolia.etherscan.io/tx/0xf06fa18807cd39a5273ba716834e530e669199dbbb1311de5c20a3f88d738f06) |
| VRF fulfilment → witness `panel-2.perjury.eth` assigned | [`0xa44f1175…5280a35f`](https://sepolia.etherscan.io/tx/0xa44f1175557af6c04415b173cd647b26c109a1a8e13238a8dc0eb9815280a35f) |
| Verdict written (`Mismatch`) | [`0x08bd04a4…fd363aa3`](https://sepolia.etherscan.io/tx/0x08bd04a4c4e04dd2e0920f7170e6cbf94a201558ff9d38d0ee1e40f6fd363aa3) |
| Claimant appeals, posts 0.02 ETH appeal bond, second VRF request | [`0xae250d77…04c85a02`](https://sepolia.etherscan.io/tx/0xae250d77928732263ef79654060f3e6c0b6da57016540312fb5ec78604c85a02) |
| VRF fulfilment → panel of 3 seated, excluding both parties | [`0x5bfbc222…c75956a0`](https://sepolia.etherscan.io/tx/0x5bfbc2223b97c94fcfc70d3b7afcad8650e27516ce9e6598b23a4aa3c75956a0) |
| Panel upholds `Mismatch` | [`0xd86effaf…bfe6f2e2`](https://sepolia.etherscan.io/tx/0xd86effaf3a706f80df7c91e4e3404ca985a4921d72540ec87ed7d6e9bfe6f2e2) |
| Settled — bond + appeal bond forfeited, stake 0.01 → 0, ENS standing 0 → −3 | [`0x8e9cd2b3…d43486fe`](https://sepolia.etherscan.io/tx/0x8e9cd2b36a77606105827cb8ad4aee7b81a2218a1e9882d6b0997a01d43486fe) |

Panel seats drawn: `operator.perjury.eth`, `panel-3.perjury.eth`, `witness-a.perjury.eth` — neither the claimant nor the original witness. The forfeited 0.03 ETH is payable to **nobody**: paying it to the witness is what would make fabricating disagreement profitable.

**Exclusion, proven in the next block:** the roster snapshot taken immediately after settlement shows `panel-1.perjury.eth` at standing −3 and `eligible: no`, with zero manual steps between the verdict and the exclusion.

### Scene 3 — collusion throttle

Claims 3–6 · claimant `panel-2.perjury.eth`, accomplice `witness-a.perjury.eth` · run Sep 8. Four claims submitted with no witness parameter — `submitClaim` has no code path to request one.

| Round | Claim | Witness actually drawn | VRF fulfilment tx |
|---|---|---|---|
| 1 | 3 | `operator.perjury.eth` | [`0x5ec8a2f9…546de525`](https://sepolia.etherscan.io/tx/0x5ec8a2f9eb36e776cdf548ab680312cb309838652cad4ba4eccd09fe546de525) |
| 2 | 4 | `panel-3.perjury.eth` | [`0x115013c0…a5021711`](https://sepolia.etherscan.io/tx/0x115013c078c24f20a5a1d3625c5986644bd48a8dded135ade98c1ed5a5021711) |
| 3 | 5 | `witness-a.perjury.eth` ← **the accomplice** | [`0x7dee833a…b21b1a76`](https://sepolia.etherscan.io/tx/0x7dee833aed69f35d79aa97df0415da285774fe47ef85942585871befb21b1a76) |
| 4 | 6 | `witness-a.perjury.eth` ← **the accomplice** | [`0x34da6b87…e4162ab5`](https://sepolia.etherscan.io/tx/0x34da6b874112916bbc06ea60e05121c27f1e2270673edb0d71ca14c9e4162ab5) |

Colluding pair paired: **2 of 4**, against an expected 1 in 3 — scene 2 had just slashed `panel-1`, leaving only three eligible witnesses. This is the residual risk shown rather than described: random assignment closes *deliberate* collusion, because the pair cannot arrange to be matched, but it does not drive the pairing rate to zero. Four rounds is far too small a sample to read as a rate; `contracts/test/Assignment.t.sol` fuzzes the distribution properly and asserts the residual risk is real.

**Reproducing this table:** `npx tsx scripts/collect-evidence.ts` rebuilds it from Sepolia logs. The scene scripts print truncated hashes for readability, so the ledger is read back from chain rather than transcribed.
