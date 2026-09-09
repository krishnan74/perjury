# Threat audit

Written after a review question exposed the lying-witness incentive (ADR 0007). That one was severe enough to warrant looking for others systematically rather than waiting to be asked again.

Each finding: what the attack is, whether the code currently allows it, and what closes it.

---

## Confirmed open

### 1. No timeout anywhere — either party can freeze a claim forever *(severe)*

`grep timeout|deadline|expire contracts/src/ClaimRegistry.sol` returns nothing. A claim in `WitnessAssigned` can only leave that state via `recordVerdict`, which only fires when the tribunal runs, which only happens when both parties have submitted sealed evidence.

**So a witness that simply does nothing locks the claimant's bond permanently.** No slashing applies, because slashing only triggers on a Mismatch verdict that never arrives. It costs the witness nothing and it is not even detectable as misbehaviour — it is indistinguishable from being slow.

The mirror also holds: a claimant that never submits its evidence denies the witness its fee.

**Fix.** A response deadline on each side. If the witness misses it, reassign and slash its stake for non-response. If the claimant misses it, settle as `Unverifiable`, pay the witness its fee from the claimant's bond, and return the remainder. Non-response has to cost something, or it becomes the cheapest attack in the system.

### 2. A slashed agent can keep making claims *(moderate)*

```solidity
if (!roster.isRegistered(msg.sender)) revert NotRegistered();
```

`submitClaim` checks registration, not eligibility. An agent slashed to zero stake can no longer be *drawn as a witness* — `isEligible` checks the stake floor — but it can keep submitting claims indefinitely, with only the per-claim bond at risk and no collateral left to slash.

**Fix.** Require `isEligible(msg.sender)`, or at minimum a stake at or above the floor, to submit a claim.

### 3. Reputation reads fail open *(moderate)*

`ENSTextStandingReader.standingOfName` returns `0` on any failure — resolver reverting, empty return, unparseable value. Since `MIN_STANDING` is `0`, an unreadable record reads as *eligible*.

A resolver outage therefore makes every agent eligible and, worse, erases negative standing rather than preserving it. The `flaggedUntil` cooldown partially covers this, since it is stored on the roster rather than in ENS — but the standing signal itself fails in the permissive direction, which is the opposite of every other decision in this protocol.

**Fix.** Distinguish "record absent" (genuinely zero, a new agent) from "read failed" (unknown). Treat unknown as ineligible. Everything else here fails closed; this should too.

### 4. Block skew can slash an honest claimant *(moderate, and unfair)*

The claimant and witness query at different times and therefore different blocks. `adjudicate` compares subject, metric and unit — it does **not** compare `asOfBlock`, even though both assertions carry it.

On a metric that moves faster than the 50bps tolerance, two perfectly honest parties reading blocks apart produce a Mismatch. The claimant then forfeits its bond, is slashed, and drops below the eligibility floor — punished for telling the truth about a different moment.

**Fix.** Reject as `Unverifiable` when the two `asOfBlock` values differ by more than a small window, or scale tolerance with the block gap. A protocol that punishes honesty under normal operation is worse than one that occasionally misses a lie.

### 5. A witness can still fabricate *consistent* evidence *(known, needs the appeal layer)*

The tribunal now recomputes from raw evidence, so a witness cannot simply state a false number. It can still fabricate a query result that internally reproduces its false conclusion. The provenance guard checks the deployment id, block and indexing errors it is *told* about — it does not re-fetch.

**Fix.** The appeal layer (ADR 0007 item 4): a VRF-drawn panel re-derives independently, majority stands, the contradicted party is slashed. This is the remaining piece.

---

### 6. Found by running it: a panel draw can fail silently *(fixed)*

Filing an appeal on Sepolia produced `PanelRequested`, VRF fulfilled, and then **nothing**. No `PanelDrawn`, no `PanelUnavailable`, no state change — the appeal sat open with the bond locked and no event to react to.

Cause: the panel callback does `PANEL_SIZE` roster walks, each roughly the cost of a single assignment, and we had sized the limit at `callbackGasLimit * 2`. It ran out of gas. VRF marks the request fulfilled regardless, so from on-chain state the failure is invisible — the same class of problem as the unpayable request earlier, and the same lesson: a failure you cannot observe is worse than one that reverts.

Two fixes, because sizing alone would have left the underlying fragility:
- The limit is now `callbackGasLimit * (PANEL_SIZE + 1)`, derived from the measured per-walk cost.
- `timeoutAppeal` lets anyone abandon an appeal whose panel never seated, refunding the appellant, which did nothing wrong.

### 7. Stakes could not be recovered *(fixed)*

Agents staked to register but had no way out, so every superseded deployment stranded its stakes permanently. `withdrawStake` deregisters and returns the balance; an agent that leaves is no longer drawable.

---

### 8. Registration did not prove control of the ENS name *(severe, fixed)*

`registerAgent(ensNode, dnsName)` accepted **any** name. `nodeTaken` stopped a *second* agent claiming a name, but nothing stopped the first one claiming a name it had never been given.

Standing is written to the agent's ENS record, and that record decides whether the agent may witness for anyone else. So an attacker could bind its own misbehaviour to somebody else's name — poisoning a reputation it does not own — or squat names to deny their holders registration entirely.

Found while reading how other projects bind identity to ENS, not by reading our own code, which is worth noting: the audit above was written by looking for attacks on the mechanism and missed an attack on the *identity binding* underneath it.

**Closed.** Registration now reads an issuance record from ENS and refuses unless it names the caller. An unreadable binding is a refusal, not a pass. `scripts/prove-name-binding.ts` demonstrates both refusals and the control on-chain.

**What it does and does not prove.** It proves *issuance* — that whoever controls `perjury.eth` bound this subname to this address — not self-sovereign ownership. For a namespace whose subnames it issues, that is the right trust model. It is also a permission rather than a policy: the issuance key is a different EAC resource from the standing key, and the tribunal holds no grant on it, so the contract that can lower an agent's standing cannot decide whose standing it is.

The honest limit: this was going to be a forward-resolution check against the name's `addr` record, which would have been stronger. The ENSv2 Permissioned Resolver implementation carries no `addr()`/`setAddr()` at all — verified against the deployed bytecode — so forward resolution is unavailable on this deployment and a text record is the substitute.

---

## Considered and currently acceptable

- **Sybils.** Still linear in the number of identities, but each now costs a 0.05 ETH stake rather than a gas fee. Economic, not cryptographic — stated openly.
- **Tolerance gaming.** A claimant can state a value 49bps off and get a Match. Inherent to having any tolerance at all.
- **Unverifiable spam.** A claimant can make claims that are never verifiable. It pays the fee and gains no standing, so it is self-limiting.
- **Roster larger than 32 agents.** `_assign` and `_assignPanel` walk at most `MAX_WALK = 32` slots from a random start, bounded so the VRF callback cannot run out of gas on a large roster. Below 33 agents the walk covers the whole ring and selection is uniform. Above it, a draw examines only 32 consecutive slots, so with sparse eligibility it can report `NoEligibleWitness` while eligible agents exist further round. It fails closed, so it is not exploitable — but it is a real cliff, it is untested above 16 agents, and raising the roster past 32 would need the bound revisited rather than assumed.
- **Reentrancy.** `withdraw` zeroes before transferring; `_settle` sets `Settled` before any external call. The one external call (`roster.slash`) touches only roster state.
- **Whether an adversarial mechanism is needed at all.** A fair challenge to the whole design: where ground truth is objectively observable, you can score an outcome directly and skip the verifier entirely. Our demo metrics are partly of that kind — an on-chain utilization ratio is observable by anyone. The answer is that the *claim* under test is about an agent's process rather than the metric, and the demo claims are deliberately re-derivable so the mechanism stays legible on camera. It is a real limit on where this design earns its complexity.

---

## Priority

1. **Timeouts** — the only finding that is exploitable for free, today, by doing nothing.
2. **Eligibility on submit** and **fail-closed reputation reads** — small changes, both close a hole.
3. **Block-skew tolerance** — protects honest agents, which matters more than catching one more liar.
4. **Appeal layer** — the remaining structural piece.
5. **Model diversity** — cheap, and converts a disclosed limitation into a partial mitigation.
