# Transaction Ledger

Every on-chain transaction that appears in the demo or backs a claim in the submission. Logged **as
it happens**, not reconstructed — a hash you can't find on Sunday morning is evidence you don't have.

Network: **Ethereum Sepolia** · Explorer: https://sepolia.etherscan.io/tx/`<hash>`

## Deployed contracts

| Contract | Address | Deploy tx | Date |
|---|---|---|---|
| `ScratchSink` (probe, throwaway) | `0xA7355Ac345828Ea003ad6686Be6D9506F9Fb31cF` | deployed | Sep 8 |
| `ClaimRegistry` | _pending_ | | |
| `WitnessRoster` | _pending_ | | |
| `VerdictSink` | _pending_ | | |
| `PerjuryStandingWriter` | _pending_ | | |

**CRE report writer** (the only address `VerdictSink` accepts):
`0x15fC6ae953E024d975e77382eEeC56A9101f9F88` — ✅ **measured, not guessed.** Reports arrive from a
Chainlink **Forwarder contract** (4,579 bytes of code), *not* from the workflow owner EOA
(`0xDcbe075a907960951Cd4df379BB21461097eEa91`). Guessing the owner would have made `VerdictSink`
reject every verdict, and `CRE_REPORT_WRITER` is immutable.
**ENS root:** `perjury.eth` ✅ registered on the ENSv2 hackathon deployment, owned by
`0xDcbe075a907960951Cd4df379BB21461097eEa91`. Cost 8.000021 MockUSDC, 1 year.

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
| T3 | VRF request + fulfilment; witness assigned | _pending_ | |
| T4 | `perjury.eth` registered direct-to-contract | see above | Sep 8 |
| T5 | Live guarded Graph read (Aave v3, 0 blocks stale) | no tx — Gateway read | Sep 8 |
| T4 | EAC: agent self-write **reverts** | _pending_ | |
| T4 | EAC: operator write **reverts** | _pending_ | |
| T4 | EAC: tribunal write **succeeds** | _pending_ | |

## Demo scenes

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
