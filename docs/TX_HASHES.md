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
**ENS root:** `perjury.eth` (ENSv2 Sepolia beta) — _pending T4_

## Milestone evidence

| Task | What it proves | Tx hash | Date |
|---|---|---|---|
| T1 | TEE handler → real Sepolia tx | [`0xbd50a73c…6ac4721d`](https://sepolia.etherscan.io/tx/0xbd50a73caf76f55092aa19614def76173a87c81a347f2c719a72a1fa6ac4721d) | Sep 8 |
| T1 | Report sender is a Forwarder, not the owner | same tx — `lastSender` on ScratchSink | Sep 8 |
| T2 | Bond escrowed → verdict → settled | _pending_ | |
| T3 | VRF request + fulfilment; witness assigned | _pending_ | |
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
