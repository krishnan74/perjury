# Transaction Ledger

Every on-chain transaction that appears in the demo or backs a claim in the submission. Logged **as it happens**, not reconstructed — a hash you can't find on Sunday morning is evidence you don't have.

Network: **Ethereum Sepolia** · Explorer: https://sepolia.etherscan.io/tx/`<hash>`

## Deployed contracts

| Contract | Address | Deploy tx | Date |
|---|---|---|---|
| `ScratchSink` (probe, throwaway) | `0xA7355Ac345828Ea003ad6686Be6D9506F9Fb31cF` | deployed | Sep 8 |
| `ClaimRegistry` | `0xf0DF23897BFc4b9A9b76ab9f6737cCe3E20Ee2E4` | deployed | Sep 8 |
| `WitnessRoster` | `0x6c2e1DDEb4dd35990136880eC362AFB46fbd044f` | deployed, callbackGasLimit 150k | Sep 8 |
| `PerjuryStandingWriter` | `0x13FF77218C76e8DA972DF7bA3B9079dDe300D162` | deployed, holds ENS SET_TEXT | Sep 8 |
| `ENSTextStandingReader` | `0x1A71eEcdB679632C5a241F2f5466d434e1759FC5` | deployed | Sep 8 |
| `PerjuryResolver` (ENSv2 Permissioned) | `0xe2f6562f45f69e2849fedc31371195f2247223ad` | deployed, EAC configured | Sep 8 |
| `VerdictSink` | `0x70D9723c3342B16421C8390cEF0a84763f959bB5` | deployed, accepts only `0x15fC…9F88` (mock forwarder) | Sep 8 |

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
| Step | Tx hash |
|---|---|
| Claim submitted + bond escrowed | |
| VRF request | |
| VRF fulfilment → witness assigned | |
| Verdict written (`Match`) | |
| Bond returned | |
| ENS standing raised | |

### Scene 2 — false claim
| Step | Tx hash |
|---|---|
| Claim submitted + bond escrowed | |
| VRF request | |
| VRF fulfilment → witness assigned | |
| Verdict written (`Mismatch`) | |
| Bond forfeited to witness | |
| ENS standing dropped | |
| **New claim: flagged agent excluded from assignment** | |

### Scene 3 — collusion throttle
| Attempt | Claim id | Assigned witness | VRF fulfilment tx |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

Colluding pair paired: _n_ of 5 — the residual 1/n risk, shown rather than described.
