# Developer feedback — Chainlink CRE & VRF

From building Perjury (ETHOnline 2026). A CRE Confidential Workflow is the project's adjudicator, and VRF v2.5 supplies the randomness that makes its anti-collusion property work. Both are load-bearing, so we hit these surfaces hard across the build, including after deploy access to the confidential DON arrived.

Written to be useful rather than polite — the things that worked are recorded alongside the things that cost us time.

---

## What worked well

- **`cre init` templates are genuinely educational.** The `hello-confidential-workflows-ts` template's inline comments taught us more than the docs did — particularly the paragraph explaining that the workflow binary is revealed to the enclave while the *data* stays confidential. That is the single most important sentence for anyone reasoning about the trust model.
- **`cre login` browser flow worked first try**, and `cre whoami` clearly showed org and deploy-access status.
- **The simulator's TEE banner is excellent UX.** Printing *"During real execution, user logs for this trigger will not be visible, and will not leave the TEE"* right in the output does more to teach the boundary than a docs paragraph would.
- **`--broadcast` from simulation is a great affordance.** Being able to produce a real on-chain transaction from a simulated workflow let us verify our consumer contract against reality before committing to an immutable design.

---

## 1. A receiver failing ERC-165 makes `writeReport` report success anyway *(highest impact — cost a day and a redeploy)*

**What happened.** We deployed the workflow to the confidential DON once deploy access arrived, and every step succeeded: it found its own pending claim, fetched the sealed evidence, opened it with the Vault DON key, adjudicated, and called `writeReport`. `.result()` came back `txStatus: 2` — success. No transaction ever reached our contract.

The production Forwarder staticcalls `supportsInterface` on the receiver before routing a report. Our sink didn't implement ERC-165, so that call reverted, the Forwarder recorded the report as failed, and the workflow was told the write **succeeded** — because the Forwarder's own transaction did succeed; only the internal call to our contract did not. The only trace of the real outcome was `ReportProcessed(receiver, …, result: false)` in the Forwarder's own event log, which nothing in the workflow-side tooling surfaces. We spent the better part of a day treating this as a platform-side delivery problem before a Chainlink engineer pointed us at that log.

**What made it worse.** The CLI simulator's mock Forwarder never makes the `supportsInterface` call at all. Our receiver passed `simulate --broadcast` perfectly, over and over, and could not receive a single report once deployed to the real DON — with no warning from either side that the two paths disagreed.

**Fix, once found:**
```solidity
function supportsInterface(bytes4 id) external pure returns (bool) {
    return id == 0x01ffc9a7 || id == 0x805f2132;
}
```
Four lines. Verdicts have settled from the DON since: `0xf8dd4d0219ccfd9a723409fbd8d19c88a87c91547c123805e6ff16f3d1c657c5`.

**Suggestions.**
- Have the mock Forwarder used by `simulate --broadcast` perform the same `supportsInterface` check the production Forwarder does. That alone would have turned a day-long silent divergence into an immediate, local, obvious failure.
- State the ERC-165 requirement directly in the "writing reports on-chain" guide, next to whatever example receiver the docs already show — ours matched that example in every way except this one.
- Consider having `writeReport`'s result distinguish "the Forwarder's transaction succeeded" from "the receiver accepted the report" — right now `txStatus` conflates the two, which is exactly what cost us the day.

## 2. Report delivery: which address does a consumer see?

**What happened.** Our consumer contract pins the authorized report sender as `immutable` — the whole security model is "only the tribunal can write verdicts", so a setter would undermine it. We could not find documentation stating whether `msg.sender` at the consumer is the workflow owner or a Forwarder.

We resolved it by deploying a throwaway probe contract that records `msg.sender`, running `simulate --broadcast` at it, and reading the result: a **Forwarder contract** (`0x15fC6ae953E024d975e77382eEeC56A9101f9F88`, 4,579 bytes), *not* the workflow owner EOA. Once we had real deploy access, the production Forwarder turned out to be a second, different address from the simulator's mock — worth stating alongside the answer above, since both facts are easy to learn only by finding out the hard way.

**Why it matters.** The intuitive assumption is the workflow owner. Any consumer that pins that address — which is the natural design for an access-controlled sink — would silently reject every report. With an immutable field, discovering this after deploy means redeploying the protocol.

**Suggestion.** State plainly in the "writing reports on-chain" guide which address the consumer sees, whether it is stable across runs, and whether it differs between `simulate --broadcast` and live DON deployment. A one-line "your consumer will see a Forwarder, not your workflow address, and it is a different Forwarder in simulation than in production" would have saved us a probe contract and a real risk of a late-stage redeploy.

## 3. The beta-access boundary is unclear in the docs

**What happened.** The Confidential Workflows prerequisites say "Beta access required through your Chainlink account team", which reads as gating everything. We planned an entire fallback architecture around not having access. A Chainlink engineer clarified in Discord that `cre workflow simulate` works for confidential workflows without a grant, and that access is needed only to *deploy* to the confidential DON and to write secrets to the Vault DON.

**Why it matters.** We nearly sequenced our whole build around a blocker that did not exist. For a hackathon that difference is decisive.

**Suggestion.** Split the prerequisite explicitly: "Simulation: no access required. Deployment to the confidential DON and Vault DON secrets: access required." The docs page on requesting access does say you needn't wait, but the template's own prerequisites line contradicts it.

## 4. Secrets under simulation

Because Vault DON writes need the grant, a confidential workflow that calls `runtime.getSecret()` cannot be fully exercised end-to-end without access. We fall back to a local env var under simulation and treat the Vault DON as the production path.

**Suggestion.** Document the sanctioned pattern for supplying a secret during simulation. Right now every team invents its own, and the shapes will differ.

## 5. Two `getSecret` calls in one execution, and a namespace mismatch — neither reproduces in simulation

**What happened, once we had real Vault DON access.** Our handler needs two secrets — the commitment salt and the envelope private key — and we called `runtime.getSecret({ id })` twice in the same execution. The first call succeeded; the second failed with a relay quorum error. Batching both into one `runtime.getSecrets([{ id: a }, { id: b }])` call fixed it outright.

Separately, `cre secrets create` files a secret under the namespace `main` by default, while `runtime.getSecret` reads from `default` unless told otherwise. The mismatch surfaces as `relay quorum unreachable`, which reads exactly like a network or DON-availability problem rather than a one-word configuration mismatch — we spent real time suspecting the Vault DON itself before checking the namespace.

**Why it matters, and why it's easy to miss.** The simulator reads secrets from a local env file, so it cannot reproduce either failure — both only exist once a team has real deploy access, which by definition is the point at which they can least afford a new class of bug. A team hitting this reads "relay quorum unreachable" and reasonably starts debugging infrastructure.

**Suggestions.** Document that multiple secrets in one execution must go through `getSecrets`, not repeated `getSecret` calls. And have `cre secrets create` default to the same namespace `getSecret` reads from, or make the CLI's success message state the namespace it wrote to, so the mismatch is visible at creation time rather than at first failed read.

## 6. Runtime surface of the WASM environment

`btoa` does not exist in the workflow runtime; we hit `TypeError: not a function` at runtime rather than at compile time. The fix (`hexToBase64(toHex(...))` from the SDK) is fine once known.

**Suggestion.** A short "what's available in the workflow runtime" page — which Web APIs exist, which don't, and the SDK helpers that replace them. Compile-time errors would be better still.

## 7. `EVMClient` constructor takes a chain selector, not a chain name

Minor, but the type error (`string` not assignable to `bigint`) doesn't hint that the value wanted is a **CCIP chain selector**. We had a `chainName` in config and had to find the selector separately.

**Suggestion.** Name the parameter `chainSelector` in the docs example, or accept a chain name.

## 8. VRF v2.5: the v2 → v2.5 migration trap

**What happened.** We wrote our consumer against the VRF **v2** interface — `uint64 subId` and positional `requestRandomWords(keyHash, subId, confirmations, gasLimit, numWords)`. It compiled, it tested green against our mock, and it would have failed against the real coordinator. What surfaced it was a subscription id that didn't fit: **v2.5 ids are 252-bit `uint256`**, and the request is a struct with `ExtraArgsV1` encoding.

**Suggestion.** A prominent callout at the top of the v2.5 consumer docs: "v2.5 subscription IDs are `uint256`, not `uint64`, and `requestRandomWords` takes a struct. Code written for v2 will compile and fail." Search results still surface v2 examples readily.

## 9. A VRF request that cannot be paid for is invisible on-chain

**What happened.** Our request sat unfulfilled for over 30 minutes. Everything we could check from on-chain state looked correct: `getSubscription` reported a 10 LINK balance, the consumer was added before the request, and the coordinator had emitted `RandomWordsRequested` with the right keyHash, gas limit and confirmations. We scanned the coordinator's recent logs, saw no fulfilments for any consumer, and concluded the service was down. **We were wrong.**

The VRF web UI showed the real answer immediately: *"You have a pending transaction due to low balance."* Max cost **71.8 LINK** against a 10 LINK balance, projected balance −61.8 LINK, and the request fails after 24 hours if unfunded.

**Why it matters.** The failure is entirely invisible from on-chain state. `getSubscription` returns a balance that looks healthy in isolation; nothing in the request receipt or the coordinator's events indicates the request can never be paid for. A contract or script has no way to distinguish "waiting for fulfilment" from "will never be fulfilled". We spent well over an hour debugging a correct integration, and drafted a support question asserting a service outage that did not exist.

**Suggestions.**
- Make the shortfall observable on-chain — a view like `pendingRequestCost(subId)` or an event when a request is parked for insufficient balance would let integrators detect this programmatically.
- Better still, surface it at request time: `requestRandomWords` could revert when the subscription demonstrably cannot cover `maxGasPrice × callbackGasLimit`. Failing loudly at the call site would have saved us the entire investigation.
- Document the arithmetic prominently. On Sepolia the only gas lane is 500 gwei, so a 500k `callbackGasLimit` reserves ~72 LINK — far more than a testnet faucet dispenses in one go. That relationship between `callbackGasLimit`, the lane's gas price, and the LINK you must hold is the single most useful thing to state on the v2.5 page, and we didn't find it.

**Related, and worth connecting in the docs.** We had separately asked whether 500k `callbackGasLimit` was reasonable for our callback. The answer we needed wasn't about gas correctness at all — it was that the choice of `callbackGasLimit` directly sets the LINK you must hold. Those two facts live far apart in the documentation.
