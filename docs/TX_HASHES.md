# Transaction Ledger

Every on-chain transaction that appears in the demo or backs a claim in the submission. Logged **as
it happens**, not reconstructed — a hash you can't find on Sunday morning is evidence you don't have.

Network: **Ethereum Sepolia** · Explorer: https://sepolia.etherscan.io/tx/`<hash>`

## Deployed contracts

| Contract | Address | Deploy tx | Date |
|---|---|---|---|
| `ClaimRegistry` | _pending_ | | |
| `WitnessRoster` | _pending_ | | |
| `VerdictSink` | _pending_ | | |
| `PerjuryStandingWriter` | _pending_ | | |

**CRE report writer** (the only address `VerdictSink` accepts): _pending T1_
**ENS root:** `perjury.eth` (ENSv2 Sepolia beta) — _pending T4_

## Milestone evidence

| Task | What it proves | Tx hash | Date |
|---|---|---|---|
| T1 | TEE handler → real Sepolia tx | _pending_ | |
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
